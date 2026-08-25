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

const FOOD_ITEM_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    mealType: { type: "string", enum: ["ontbijt", "lunch", "snack"] },
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
    ingredients: {
      type: "string",
      description:
        "Komma-gescheiden lijst, elk ingrediënt MET een concrete hoeveelheid en eenheid, bijv. 'kwark 250g, havermout 40g, banaan 1 stuk'",
    },
    workday: {
      type: "boolean",
      description: "true als het zonder bereiding of met heel weinig moeite klaar te maken/mee te nemen is",
    },
  },
  required: ["name", "mealType", "calories", "protein", "carbs", "fat", "ingredients", "workday"],
};

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
    ? pool.map((p) => `- "${p.name}" (${p.mealType}, ${p.calories}kcal)`).join("\n")
    : "(nog leeg)";

  const prompt = `Je helpt met het aanvullen van een lijst voedingsopties (ontbijt/lunch/snack) in een voedings-app, door de "add_food_options" tool aan te roepen.

Dit staat er AL in de lijst — dit exact overnemen of een lichte variant ervan (zelfde hoofdingrediënt + vergelijkbare bereiding) telt als duplicaat en mag NIET:
${poolSummary}

Verzoek van de gebruiker: "${userRequest}"

Voeg 6 tot 10 NIEUWE opties toe die aansluiten bij dit verzoek en mealType-categorie. Belangrijke eisen:
- Echt iets anders dan wat al in de lijst staat, ook conceptueel (niet alleen de naam net iets anders)
- Duidelijke spreiding in calorieën binnen wat je toevoegt: minstens één kleinere optie, een paar gemiddelde, en minstens één grotere optie — niet allemaal rond hetzelfde aantal kcal
- Veel eiwit, gevarieerd qua voedingsstoffen/vitamines
- Budgetvriendelijk, gangbare Nederlandse supermarkt-ingrediënten
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
        tools: [
          {
            name: "add_food_options",
            description: "Voeg nieuwe voedingsopties toe aan de pool van de gebruiker",
            input_schema: {
              type: "object",
              properties: {
                items: { type: "array", items: FOOD_ITEM_SCHEMA },
              },
              required: ["items"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "add_food_options" },
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
    const blocks: { type: string; name?: string; input?: { items?: unknown } }[] = Array.isArray(
      data.content
    )
      ? data.content
      : [];
    const toolBlock = blocks.find((b) => b.type === "tool_use" && b.name === "add_food_options");

    if (!toolBlock || !Array.isArray(toolBlock.input?.items)) {
      return NextResponse.json(
        { error: "Geen geldig antwoord van Claude ontvangen (geen tool-aanroep gevonden)" },
        { status: 502 }
      );
    }

    return NextResponse.json({ items: toolBlock.input.items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
