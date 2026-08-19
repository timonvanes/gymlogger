export function buildGymAppHtml(email: string): string {
  return `
<div id="timer-bar">
  <div><div class="timer-label">Workout tijd</div><div class="timer-display" id="timer-display">00:00</div></div>
  <div style="flex:1"></div>
  <button onclick="stopTimer()" style="background:none;border:none;cursor:pointer;padding:6px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></button>
</div>
<nav>
  <button class="active" onclick="goScreen('workout')" id="nav-workout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="9" width="4" height="6" rx="1.2"/><rect x="17" y="9" width="4" height="6" rx="1.2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>Workout</button>
  <button onclick="goScreen('nutrition')" id="nav-nutrition"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="14" r="6"/><line x1="12" y1="8" x2="12" y2="5"/><ellipse cx="14.5" cy="6" rx="2" ry="1" transform="rotate(-30 14.5 6)"/></svg>Voeding</button>
  <button onclick="goScreen('history')" id="nav-history"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Historie</button>
  <button onclick="goScreen('progress')" id="nav-progress"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Progressie</button>
  <button onclick="goScreen('programs')" id="nav-programs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>Schema</button>
  <button onclick="goScreen('planner')" id="nav-planner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Planner</button>
  <button onclick="goScreen('settings')" id="nav-settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>Instel.</button>
</nav>

<!-- WORKOUT -->
<div class="screen active" id="screen-workout">
  <div class="page-header"><h1>Workout</h1><span class="date-badge" id="today-date"></span></div>
  <div id="day-banner"></div>
  <div id="last-training-card"></div>
  <div class="schema-row">
    <div style="flex:1"><label>Schema laden</label><select id="wk-schema-sel"><option value="">Kies schema...</option></select></div>
    <button class="btn btn-primary btn-sm" onclick="loadSchema()" style="margin-bottom:1px">Start</button>
  </div>
  <div class="action-row">
    <button class="btn btn-ghost btn-sm" onclick="openAddEx()">+ Oefening</button>
    <button class="btn btn-ghost btn-sm" onclick="saveWorkout()">Voltooi training</button>
    <button class="btn btn-ghost btn-sm" onclick="clearWorkout()">Verwijder training</button>
  </div>
  <div id="wk-warmup"></div>
  <div id="wk-exercises"></div>
  <div id="wk-empty" class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="9" width="4" height="6" rx="1.2"/><rect x="17" y="9" width="4" height="6" rx="1.2"/><line x1="7" y1="12" x2="17" y2="12"/></svg><p>Kies een schema of voeg een oefening toe</p></div>
</div>

<!-- VOEDING -->
<div class="screen" id="screen-nutrition">
  <div class="page-header"><h1>Voeding</h1><span class="date-badge" id="nutrition-date"></span></div>
  <div id="nutrition-progress"></div>
  <label class="card" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:13px">
    <span style="font-size:13px;font-weight:600">Vandaag is een werkdag</span>
    <input type="checkbox" id="workday-toggle" class="checklist-cb" onchange="toggleTodayWorkday(this.checked)">
  </label>
  <div id="nutrition-meals"></div>
  <div class="sdiv"><hr><span>Boodschappenlijst</span><hr></div>
  <div id="shopping-list"></div>
</div>

<!-- HISTORIE -->
<div class="screen" id="screen-history">
  <div class="page-header"><h1>Historie</h1></div>
  <div id="hist-list"></div>
  <div id="hist-empty" class="empty-state" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><p>Nog geen workouts opgeslagen</p></div>
</div>

<!-- PROGRESSIE -->
<div class="screen" id="screen-progress">
  <div class="page-header"><h1>Progressie</h1></div>
  <div id="activity-stats"></div>
  <div class="fg"><label>Krachtoefening</label><select id="prog-sel" onchange="renderProgress()"><option value="">Kies een oefening...</option></select></div>
  <div id="prog-content"></div>
</div>

<!-- SCHEMA -->
<div class="screen" id="screen-programs">
  <div class="page-header"><h1>Schema's</h1></div>
  <div class="action-row">
    <button class="btn btn-primary btn-sm" onclick="openCreateProg()">+ Nieuw</button>
    <button class="btn btn-ghost btn-sm" onclick="openImportSchema()">Import schema</button>
  </div>
  <div class="card" style="margin-bottom:13px">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px">🤖 Schema laten maken door AI</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">Kopieer de prompt hieronder, plak 'm in ChatGPT/Claude en vul in wat voor schema je wilt. Kopieer daarna het antwoord en plak het via "Import schema" hierboven — geen bestand nodig.</div>
    <button class="btn btn-ghost btn-sm" onclick="copyAiPrompt()">📋 Kopieer AI-prompt</button>
  </div>
  <div id="prog-list"></div>
  <div id="prog-empty" class="empty-state" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>Nog geen schema's</p></div>
</div>

<!-- PLANNER -->
<div class="screen" id="screen-planner">
  <div class="page-header"><h1>Planner</h1></div>

  <div id="activity-sections"></div>

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="font-weight:700;font-size:14px" id="week-label">Deze week</div>
    <div style="display:flex;align-items:center;gap:8px">
      <button class="btn-icon" onclick="changeWeek(-1)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <button class="btn btn-ghost btn-sm" id="week-now-btn" style="padding:5px 10px;font-size:11px" onclick="changeWeek(0)">Nu</button>
      <button class="btn-icon" onclick="changeWeek(1)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>
  </div>
  <div class="week-progress" id="week-summary"></div>
  <div class="card" id="week-checklist" style="margin-bottom:13px"><p style="font-size:13px;color:var(--muted)">Nog geen dagen ingepland.</p></div>

  <div class="card">
    <div style="font-weight:700;font-size:14px;margin-bottom:10px;display:flex;align-items:center;gap:6px">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      Google Agenda
    </div>
    <div style="font-size:12px;margin-bottom:10px" id="gcal-status-txt"></div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" id="gcal-connect-btn" onclick="connectGoogle()">Verbinden met Google</button>
      <button class="btn btn-ghost btn-sm" id="gcal-sync-btn" style="display:none" onclick="syncGoogleCalendar()">Sync naar agenda</button>
      <button class="btn btn-danger btn-sm" id="gcal-delete-btn" style="display:none" onclick="deleteGoogleCalendarEvents()">Verwijder uit agenda</button>
      <button class="btn btn-ghost btn-sm" id="gcal-disconnect-btn" style="display:none" onclick="disconnectGoogle()">Loskoppelen</button>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--muted);line-height:1.6">Synchroniseert je geplande dagen naar je Google Agenda voor de komende 4 weken.</div>
  </div>
</div>

<!-- INSTELLINGEN -->
<div class="screen" id="screen-settings">
  <div class="page-header"><h1>Instellingen</h1></div>

  <div class="card" style="margin-bottom:13px">
    <div class="account-row" style="margin-bottom:13px">
      <div>
        <div style="font-weight:700;font-size:14px">Account</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${email}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="doLogout()">Uitloggen</button>
    </div>
    <div class="fg" style="margin-bottom:8px"><label>Nieuw wachtwoord</label><input type="password" id="new-password-in" placeholder="Minimaal 6 tekens" autocomplete="new-password"></div>
    <button class="btn btn-ghost btn-sm" onclick="changePassword()">Wachtwoord wijzigen</button>
  </div>

  <div class="card" style="margin-bottom:13px">
    <div style="font-weight:700;font-size:14px;margin-bottom:12px">Sporten</div>
    <div id="activity-manage-list"></div>
    <div style="display:flex;gap:7px;margin-top:9px">
      <input type="text" id="new-activity-name" placeholder="Naam nieuwe sport">
      <button class="btn btn-primary btn-sm" onclick="addActivity()" style="flex-shrink:0">+ Toevoegen</button>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">Streefdagen worden getoond als doel in de progressietab. Gym kan niet verwijderd worden.</div>
  </div>

  <div class="card" style="margin-bottom:13px">
    <div style="font-weight:700;font-size:14px;margin-bottom:12px">Voedingsdoelen (per dag)</div>
    <div class="fg"><label>Kcal</label><input type="number" id="set-cal-target" min="0" onchange="setNutritionTarget('calories',this.value)"></div>
    <div style="font-size:11px;color:var(--muted);margin:12px 0 8px">Macroverdeling — samen altijd 100%</div>
    <div class="fr3">
      <div class="fg"><label>Eiwit %</label><input type="number" id="set-protein-pct" min="0" max="100" onchange="setMacroPct('protein',this.value)"></div>
      <div class="fg"><label>Koolh. %</label><input type="number" id="set-carbs-pct" min="0" max="100" onchange="setMacroPct('carbs',this.value)"></div>
      <div class="fg"><label>Vet % (rest)</label><input type="number" id="set-fat-pct" disabled style="opacity:.6"></div>
    </div>
    <div id="macro-grams-preview" style="font-size:11px;color:var(--muted)"></div>
  </div>

  <div class="card" style="margin-bottom:13px">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px">Avondeten (vaste schatting)</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Telt elke dag automatisch mee, hoef je niet los te loggen.</div>
    <div class="fg"><label>Kcal</label><input type="number" id="set-dinner-cal" min="0" onchange="setDinnerDefault('calories',this.value)"></div>
    <div style="font-size:11px;color:var(--muted);margin:12px 0 8px">Macroverdeling — samen altijd 100%</div>
    <div class="fr3">
      <div class="fg"><label>Eiwit %</label><input type="number" id="set-dinner-protein-pct" min="0" max="100" onchange="setDinnerMacroPct('protein',this.value)"></div>
      <div class="fg"><label>Koolh. %</label><input type="number" id="set-dinner-carbs-pct" min="0" max="100" onchange="setDinnerMacroPct('carbs',this.value)"></div>
      <div class="fg"><label>Vet % (rest)</label><input type="number" id="set-dinner-fat-pct" disabled style="opacity:.6"></div>
    </div>
    <div id="dinner-grams-preview" style="font-size:11px;color:var(--muted)"></div>
  </div>

  <div class="card" style="margin-bottom:13px">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px">🤖 Voedingsopties laten maken door AI</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">De prompt rekent zelf uit hoeveel calorieën/eiwit je ontbijt+lunch+snacks moeten vullen (je dagdoel min avondeten). Kopieer 'm, plak in ChatGPT/Claude, en importeer het antwoord hieronder.</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="copyNutritionAiPrompt()">📋 Kopieer AI-prompt</button>
      <button class="btn btn-ghost btn-sm" onclick="openImportFood()">Import voeding</button>
    </div>
  </div>

  <div class="card">
    <div style="font-weight:700;font-size:14px;margin-bottom:12px">Voedingsopties (ontbijt/lunch/snacks)</div>
    <div id="food-pool-list"></div>
    <button class="btn btn-primary btn-sm" onclick="openAddFood()" style="margin-top:9px">+ Optie toevoegen</button>
  </div>
</div>

<!-- MODALS -->
<div class="modal-overlay hidden" id="m-add-ex">
  <div class="modal">
    <div class="modal-title">Oefening toevoegen</div>
    <div class="fg"><label>Naam</label><input type="text" id="ex-name" placeholder="bijv. Bench Press" autocomplete="off"><div id="ex-sug" style="display:none;background:var(--surface3);border:1px solid var(--border);border-radius:8px;margin-top:4px;overflow:hidden;max-height:170px;overflow-y:auto"></div></div>
    <div class="fr"><div class="fg"><label>Sets</label><input type="number" id="ex-sets" value="3" min="1" max="30"></div><div class="fg"><label>Reps</label><input type="number" id="ex-reps" value="10" min="1" max="200"></div></div>
    <div class="fg"><label>Type</label><select id="ex-type" onchange="onTypeChange()"><option value="normal">Normaal</option><option value="warmup">Warm-up</option><option value="superset">Superset</option></select></div>
    <div id="ss-fields" style="display:none">
      <div class="sdiv"><hr><span>Superset partner</span><hr></div>
      <div class="fg"><label>Tweede oefening</label><input type="text" id="ex-pair-name" placeholder="bijv. Dips"></div>
      <div class="fr"><div class="fg"><label>Sets</label><input type="number" id="ex-pair-sets" value="3" min="1" max="30"></div><div class="fg"><label>Reps</label><input type="number" id="ex-pair-reps" value="10" min="1" max="200"></div></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px"><button class="btn btn-primary" style="flex:1" onclick="addExercise()">Toevoegen</button><button class="btn btn-ghost" onclick="closeModal('m-add-ex')">Annuleren</button></div>
  </div>
</div>
<div class="modal-overlay hidden" id="m-ex-note">
  <div class="modal">
    <div class="modal-title" id="ex-note-title">Notitie</div>
    <div class="fg"><textarea id="ex-note-text" placeholder="Hoe ging het? Techniek, vermoeidheid, PR?"></textarea></div>
    <div style="display:flex;gap:8px"><button class="btn btn-primary" style="flex:1" onclick="saveExNote()">Opslaan</button><button class="btn btn-ghost" onclick="closeModal('m-ex-note')">Annuleren</button></div>
  </div>
</div>
<div class="modal-overlay hidden" id="m-create-prog">
  <div class="modal">
    <div class="modal-title">Nieuw schema</div>
    <div class="fg"><label>Naam</label><input type="text" id="prog-name" placeholder="bijv. Push Day A"></div>
    <div id="prog-ex-list" style="margin-bottom:9px"></div>
    <button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:13px" onclick="addProgEx()">+ Oefening</button>
    <div style="display:flex;gap:8px"><button class="btn btn-primary" style="flex:1" onclick="saveProg()">Opslaan</button><button class="btn btn-ghost" onclick="closeModal('m-create-prog')">Annuleren</button></div>
  </div>
</div>
<div class="modal-overlay hidden" id="m-prog-detail">
  <div class="modal">
    <div class="modal-title" id="pd-title"></div>
    <div id="pd-body" style="margin-bottom:15px;font-size:13px;color:var(--muted)"></div>
    <div style="display:flex;gap:8px"><button class="btn btn-danger btn-sm" onclick="delProg()">Verwijderen</button><button class="btn btn-ghost" style="flex:1" onclick="closeModal('m-prog-detail')">Sluiten</button></div>
  </div>
</div>
<div class="modal-overlay hidden" id="m-add-food">
  <div class="modal">
    <div class="modal-title">Voedingsoptie toevoegen</div>
    <div class="fg"><label>Naam</label><input type="text" id="food-name" placeholder="bijv. Kwark met bessen"></div>
    <div class="fg"><label>Maaltijd</label><select id="food-mealtype"><option value="ontbijt">Ontbijt</option><option value="lunch">Lunch</option><option value="snack">Snack</option></select></div>
    <div class="fr3">
      <div class="fg"><label>Kcal</label><input type="number" id="food-cal" value="0" min="0"></div>
      <div class="fg"><label>Eiwit (g)</label><input type="number" id="food-protein" value="0" min="0"></div>
      <div class="fg"><label>Koolh. (g)</label><input type="number" id="food-carbs" value="0" min="0"></div>
    </div>
    <div class="fg"><label>Vet (g)</label><input type="number" id="food-fat" value="0" min="0"></div>
    <div class="fg"><label>Ingrediënten (voor boodschappenlijst)</label><input type="text" id="food-ingredients" placeholder="bijv. kwark 250g, blauwe bessen 100g"></div>
    <div class="fg"><label>Winkel (optioneel)</label><input type="text" id="food-store" placeholder="bijv. AH, Jumbo, Lidl"></div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:13px;cursor:pointer"><input type="checkbox" id="food-workday" style="width:18px;height:18px"><span style="font-size:12px;color:var(--muted)">Werkdag-geschikt (makkelijk mee te nemen)</span></label>
    <div style="display:flex;gap:8px"><button class="btn btn-primary" style="flex:1" onclick="addFoodItem()">Toevoegen</button><button class="btn btn-ghost" onclick="closeModal('m-add-food')">Annuleren</button></div>
  </div>
</div>
<div class="modal-overlay hidden" id="m-import-text">
  <div class="modal">
    <div class="modal-title" id="import-text-title">Importeren</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">Plak hier het antwoord dat je van ChatGPT/Claude hebt gekopieerd.</div>
    <div class="fg"><textarea id="import-text-area" placeholder="Plak hier de JSON..." style="min-height:160px;font-family:var(--mono);font-size:12px"></textarea></div>
    <div style="display:flex;gap:8px"><button class="btn btn-primary" style="flex:1" onclick="confirmImportText()">Importeren</button><button class="btn btn-ghost" onclick="closeModal('m-import-text')">Annuleren</button></div>
  </div>
</div>
<div class="toast" id="toast"></div>
`;
}
