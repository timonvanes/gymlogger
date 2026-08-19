import { NextRequest, NextResponse } from "next/server";

interface PoolSummaryItem {
  name: string;
  mealType: string;
  calories: number;
  protein: number;
}

interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is niet ingesteld op de server" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const userRequest: string = body.request;
  const pool: PoolSummaryItem[] = Array.isArray(body.pool) ? body.pool : [];
  const targets: Targets = body.targets || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const dinnerDefault: Targets = body.dinnerDefault || { calories: 0, protein: 0, carbs: 0, fat: 0 };

  if (!userRequest || typeof userRequest !== "string" || !userRequest.trim()) {
    return NextResponse.json({ error: "Geen verzoek meegegeven" }, { status: 400 });
  }

  const remCal = Math.max(0, (targets.calories || 0) - (dinnerDefault.calories || 0));
  const remProtein = Math.max(0, (targets.protein || 0) - (dinnerDefault.protein || 0));
  const remCarbs = Math.max(0, (targets.carbs || 0) - (dinnerDefault.carbs || 0));
  const remFat = Math.max(0, (targets.fat || 0) - (dinnerDefault.fat || 0));

  const poolSummary = pool.length
    ? pool.map((p) => `- ${p.name} (${p.mealType}, ${p.calories}kcal, ${p.protein}g eiwit)`).join("\n")
    : "(nog leeg)";

  const prompt = `Je helpt met het aanvullen van een lijst voedingsopties (ontbijt/lunch/snack) in een voedings-app.

Dit staat er al in de lijst:
${poolSummary}

Verzoek van de gebruiker: "${userRequest}"

Voeg NIEUWE opties toe die aansluiten bij dit verzoek. Vermijd duplicaten met wat er al in de lijst staat. Geef ALLEEN JSON terug, geen uitleg, geen markdown code-block, in dit formaat:

[
  { "name": "Naam van het gerecht", "mealType": "ontbijt", "calories": 380, "protein": 32, "carbs": 40, "fat": 8, "ingredients": "kwark 250g, havermout 40g", "workday": true }
]

Regels:
- "mealType" is altijd een van: "ontbijt", "lunch", "snack" — kies wat past bij het verzoek
- "calories", "protein", "carbs", "fat" zijn getallen (kcal/gram), geen tekst
- "ingredients" MOET voor elk ingrediënt een concrete hoeveelheid met eenheid bevatten (bijv. "250g", "1 stuk"), nooit zonder hoeveelheid
- "workday" is true als het zonder bereiding of met heel weinig moeite klaar te maken/mee te nemen is
- Budgetvriendelijk, gangbare Nederlandse supermarkt-ingrediënten, gevarieerd qua voedingsstoffen
- Context (hoeft niet exact): avondeten is al vast ${dinnerDefault.calories || 0} kcal; ontbijt+lunch+snacks moeten per dag samen ongeveer ${remCal} kcal, ${remProtein}g eiwit, ${remCarbs}g koolhydraten, ${remFat}g vet leveren`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Anthropic API fout (${res.status}): ${errText.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const blocks: { type: string; text?: string }[] = Array.isArray(data.content) ? data.content : [];
    const text: string = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");

    let jsonText = text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) jsonText = fenceMatch[1].trim();
    const start = jsonText.search(/[[{]/);
    const end = Math.max(jsonText.lastIndexOf("]"), jsonText.lastIndexOf("}"));
    if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);

    const parsed = JSON.parse(jsonText);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
