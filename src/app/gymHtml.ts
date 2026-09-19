export function buildGymAppHtml(email: string): string {
  return `
<div id="timer-bar">
  <div><div class="timer-label">Workout tijd</div><div class="timer-display" id="timer-display">00:00</div></div>
  <div style="flex:1"></div>
  <button onclick="stopTimer()" style="background:none;border:none;cursor:pointer;padding:6px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></button>
</div>
<nav>
  <button class="active" onclick="goScreen('workout')" id="nav-workout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg><span>Training</span></button>
  <button onclick="goScreen('history')" id="nav-history"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg><span>Historie</span></button>
  <button onclick="goScreen('programs')" id="nav-programs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 13h6M9 17h4"/></svg><span>Schema's</span></button>
  <button onclick="goScreen('planner')" id="nav-planner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><span>Planner</span></button>
  <button onclick="goScreen('settings')" id="nav-settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg><span>Profiel</span></button>
</nav>

<!-- WORKOUT -->
<div class="screen active" id="screen-workout">
  <div class="page-header"><h1>Vandaag</h1><span class="date-badge" id="today-date"></span></div>
  <div id="day-banner"></div>
  <div id="last-training-card"></div>
  <div class="start-card">
    <label>Kies je training</label>
    <select id="wk-schema-sel"><option value="">Kies een schema...</option></select>
    <button class="btn btn-primary btn-lg" onclick="loadSchema()">Start training</button>
    <button class="btn btn-ghost btn-lg" onclick="openAddEx()">+ Oefening toevoegen</button>
  </div>
  <div id="wk-warmup"></div>
  <div id="wk-exercises"></div>
  <div id="wk-empty" class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg><p>Nog niks gepland voor nu.<br>Kies een schema of voeg een oefening toe.</p></div>
  <div id="wk-finish" style="display:none">
    <button class="btn btn-primary btn-lg" onclick="saveWorkout()">Training afronden</button>
    <button class="btn btn-danger btn-lg" onclick="clearWorkout()">Training wissen</button>
  </div>
</div>

<!-- HISTORIE -->
<div class="screen" id="screen-history">
  <div class="page-header"><h1>Historie</h1></div>
  <div class="seg" id="hist-seg"></div>
  <div id="hist-list"></div>
  <div id="hist-empty" class="empty-state" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><p>Je afgeronde trainingen verschijnen hier</p></div>
</div>

<!-- SCHEMA -->
<div class="screen" id="screen-programs">
  <div class="page-header"><h1>Schema's</h1></div>
  <div class="action-row two">
    <button class="btn btn-primary btn-lg" onclick="openCreateProg()">+ Nieuw schema</button>
    <button class="btn btn-ghost btn-lg" onclick="openImportSchema()">Plak schema</button>
  </div>
  <div class="card" style="margin-bottom:13px">
    <div class="card-title">Laat een AI je schema maken</div>
    <div class="card-sub">Kopieer de opdracht, plak hem in ChatGPT of Claude en vertel wat voor schema je wilt. Plak het antwoord daarna via "Plak schema".</div>
    <button class="btn btn-ghost btn-lg" onclick="copyAiPrompt()">Kopieer opdracht</button>
  </div>
  <div id="prog-list"></div>
  <div id="prog-empty" class="empty-state" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>Je hebt nog geen schema's</p></div>
</div>

<!-- PLANNER -->
<div class="screen" id="screen-planner">
  <div class="page-header"><h1>Planner</h1></div>

  <div id="activity-sections"></div>

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="font-weight:700;font-size:14px" id="week-label">Deze week</div>
    <div style="display:flex;align-items:center;gap:8px">
      <button class="btn-icon" onclick="changeWeek(-1)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <button class="btn btn-ghost btn-sm" id="week-now-btn" style="padding:0 14px;min-height:40px;font-size:13px" onclick="changeWeek(0)">Nu</button>
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
    <div class="stack">
      <button class="btn btn-primary btn-lg" id="gcal-connect-btn" onclick="connectGoogle()">Verbind met Google</button>
      <button class="btn btn-ghost btn-lg" id="gcal-sync-btn" style="display:none" onclick="syncGoogleCalendar()">Zet in agenda</button>
      <button class="btn btn-danger btn-lg" id="gcal-delete-btn" style="display:none" onclick="deleteGoogleCalendarEvents()">Verwijder uit agenda</button>
      <button class="btn btn-ghost btn-lg" id="gcal-disconnect-btn" style="display:none" onclick="disconnectGoogle()">Loskoppelen</button>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--muted);line-height:1.6">Zet je geplande trainingsdagen van deze week in je Google Agenda.</div>
  </div>
</div>

<!-- INSTELLINGEN -->
<div class="screen" id="screen-settings">
  <div class="page-header"><h1>Profiel</h1></div>

  <div class="card" style="margin-bottom:13px">
    <div class="account-row" style="margin-bottom:13px">
      <div>
        <div style="font-weight:700;font-size:14px">Account</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${email}</div>
      </div>
      <button class="btn btn-ghost" style="min-height:44px" onclick="doLogout()">Uitloggen</button>
    </div>
    <div class="fg" style="margin-bottom:8px"><label>Nieuw wachtwoord</label><input type="password" id="new-password-in" placeholder="Minimaal 6 tekens" autocomplete="new-password"></div>
    <button class="btn btn-ghost btn-lg" onclick="changePassword()">Wachtwoord wijzigen</button>
  </div>

  <div class="card" style="margin-bottom:13px">
    <div class="card-title" style="margin-bottom:12px">Jouw sporten</div>
    <div id="activity-manage-list"></div>
    <div style="display:flex;gap:7px;margin-top:9px">
      <input type="text" id="new-activity-name" placeholder="Naam nieuwe sport">
      <button class="btn btn-primary" onclick="addActivity()" style="flex-shrink:0;min-height:48px">Toevoegen</button>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">Het getal is hoe vaak per week je deze sport wilt doen. Gym kan niet verwijderd worden.</div>
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
    <div class="modal-title" id="prog-modal-title">Nieuw schema</div>
    <div class="fg"><label>Naam</label><input type="text" id="prog-name" placeholder="bijv. Push Day A"></div>
    <div id="prog-ex-list" style="margin-bottom:9px"></div>
    <button class="btn btn-ghost" style="width:100%;margin-bottom:13px" onclick="addProgEx()">+ Oefening toevoegen</button>
    <div style="display:flex;gap:8px"><button class="btn btn-primary" style="flex:1" onclick="saveProg()">Opslaan</button><button class="btn btn-ghost" onclick="closeModal('m-create-prog')">Annuleren</button></div>
  </div>
</div>
<div class="modal-overlay hidden" id="m-prog-detail">
  <div class="modal">
    <div class="modal-title" id="pd-title"></div>
    <div id="pd-body" style="margin-bottom:16px;font-size:14px;color:var(--muted)"></div>
    <div class="stack"><button class="btn btn-primary btn-lg" onclick="editProg()">Schema bewerken</button><div class="action-row two" style="margin:0"><button class="btn btn-danger" onclick="delProg()">Verwijderen</button><button class="btn btn-ghost" onclick="closeModal('m-prog-detail')">Sluiten</button></div></div>
  </div>
</div>
<div class="modal-overlay hidden" id="m-confirm">
  <div class="modal">
    <div class="modal-title">Weet je het zeker?</div>
    <div id="confirm-msg" style="font-size:15px;color:var(--muted);line-height:1.5;margin-bottom:20px"></div>
    <div class="stack"><button class="btn btn-danger-solid btn-lg" id="confirm-yes" onclick="confirmYes()">Ja</button><button class="btn btn-ghost btn-lg" onclick="confirmNo()">Annuleren</button></div>
  </div>
</div>
<div class="toast" id="toast"></div>
`;
}
