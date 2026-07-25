export const GYM_APP_SCRIPT = `
/* ─── STATE ─── */
var DEFAULT_ACTIVITIES=[
  {key:'gym',name:'Gym',emoji:'🏋️',color:'var(--accent)',removable:false},
  {key:'hardlopen',name:'Hardlopen',emoji:'🏃',color:'var(--info)',removable:true},
  {key:'zwemmen',name:'Zwemmen',emoji:'🏊',color:'var(--purple)',removable:true}
];
var ACTIVITY_COLOR_PALETTE=['#ffb340','#ff5c5c','#5cd6ff','#ff8a5c','#8aff6e','#ff6ec7'];
var S={today:{exercises:[],note:''},history:[],programs:[],weekPlan:{},activitySchedule:{gym:[],hardlopen:[],zwemmen:[]},activityDone:[],activityTargets:{gym:3,hardlopen:1,zwemmen:1},activities:DEFAULT_ACTIVITIES.map(function(a){return Object.assign({},a);}),exerciseNotes:{},gcalNeedsSync:false};
var curNoteTarget=null,curProgId=null,tempProgEx=[];
var timerIv=null,timerStart=null;

/* Bij focus op een gewicht/reps-veld: cursor achteraan zetten zodat je direct kan verwijderen */
document.addEventListener('focus',function(e){
  var el=e.target;
  if(el&&el.tagName==='INPUT'&&(el.classList.contains('wi')||el.classList.contains('ri'))){
    var len=el.value.length;
    try{el.setSelectionRange(len,len);}catch(err){}
  }
},true);

/* ─── AUTH ─── */
function doLogout(){window.supabase.auth.signOut().then(function(){window.location.href='/login';});}
function changePassword(){
  var inp=document.getElementById('new-password-in');
  var pw=inp.value;
  if(pw.length<6){showToast('Minimaal 6 tekens');return;}
  window.supabase.auth.updateUser({password:pw}).then(function(res){
    if(res.error){showToast('Fout: '+res.error.message);return;}
    inp.value='';
    showToast('Wachtwoord gewijzigd!');
  });
}

/* ─── GOOGLE CALENDAR ─── */
var gcalToken=localStorage.getItem('gymtracker_gcal_token')||'';
var tokenClient=null;
var GCAL_CLIENT_ID='632168775632-045st8isen155snrd3223tq2nr88iued.apps.googleusercontent.com';

if(document.readyState==='complete'){setTimeout(initGoogleAuth,1500);}
else{window.addEventListener('load',function(){setTimeout(initGoogleAuth,1500);});}
function initGoogleAuth(){
  if(typeof google==='undefined'||!google.accounts)return;
  tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:GCAL_CLIENT_ID,
    scope:'https://www.googleapis.com/auth/calendar.events',
    callback:function(response){
      if(response.error){showToast('Google fout: '+response.error);return;}
      gcalToken=response.access_token;
      localStorage.setItem('gymtracker_gcal_token',gcalToken);
      updateGcalUI();
      syncGoogleCalendar();
    }
  });
  updateGcalUI();
}
function connectGoogle(){
  if(!tokenClient){showToast('Google nog niet geladen, probeer opnieuw');setTimeout(initGoogleAuth,500);return;}
  tokenClient.requestAccessToken({prompt:gcalToken?'':'consent'});
}
function disconnectGoogle(){
  if(!confirm('Google Agenda loskoppelen?'))return;
  gcalToken='';localStorage.removeItem('gymtracker_gcal_token');updateGcalUI();showToast('Losgekoppeld');
}
function updateGcalUI(){
  var st=document.getElementById('gcal-status-txt');
  var cb=document.getElementById('gcal-connect-btn');
  var sb=document.getElementById('gcal-sync-btn');
  var db=document.getElementById('gcal-disconnect-btn');
  if(!st)return;
  if(gcalToken){
    st.innerHTML='<span style="color:var(--accent)">✓ Verbonden met Google Agenda</span>';
    if(cb)cb.style.display='none';if(sb)sb.style.display='';if(db)db.style.display='';
  }else{
    st.innerHTML='<span style="color:var(--muted)">Niet verbonden</span>';
    if(cb)cb.style.display='';if(sb)sb.style.display='none';if(db)db.style.display='none';
  }
  if(sb){
    ensureNewFields();
    if(S.gcalNeedsSync){sb.classList.remove('btn-ghost');sb.classList.add('btn-primary');sb.textContent='Agenda bijwerken!';}
    else{sb.classList.remove('btn-primary');sb.classList.add('btn-ghost');sb.textContent='Sync naar agenda';}
  }
  updateGcalDeleteBtn();
}
/* gcalStore: { 'weekKey': ['eventId', ...], ... } — per week bijhouden */
var gcalStore=JSON.parse(localStorage.getItem('gymtracker_gcal_store')||'{}');
function saveGcalStore(){localStorage.setItem('gymtracker_gcal_store',JSON.stringify(gcalStore));}
function gcalAllIds(){var all=[];Object.values(gcalStore).forEach(function(ids){all=all.concat(ids);});return all;}

async function deleteEventIds(ids){
  var deleted=0,failed=0;
  for(var i=0;i<ids.length;i++){
    try{
      var res=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+ids[i],{method:'DELETE',headers:{'Authorization':'Bearer '+gcalToken}});
      if(res.ok||res.status===410){deleted++;}
      else if(res.status===401){gcalToken='';localStorage.removeItem('gymtracker_gcal_token');updateGcalUI();connectGoogle();return -1;}
      else{failed++;}
    }catch(err){failed++;}
  }
  return{deleted:deleted,failed:failed};
}

async function syncGoogleCalendar(){
  if(!gcalToken){connectGoogle();return;}
  ensureNewFields();
  var actByKey={};S.activities.forEach(function(a,i){actByKey[a.key]={name:(a.emoji?a.emoji+' ':'')+a.name,colorId:String((i%11)+1)};});
  var mon=getWeekMon(plannerWeekOffset);
  var weekKey=mon.toISOString().slice(0,10);
  var weekDates=getWeekDates(mon);
  var events=[];
  weekDates.forEach(function(ds,di){
    S.activities.forEach(function(act){
      if((S.activitySchedule[act.key]||[]).includes(di))events.push({act:act.key,date:ds});
    });
  });
  if(!events.length){showToast('Geen activiteiten ingepland');return;}
  var btn=document.getElementById('gcal-sync-btn');
  if(btn){btn.disabled=true;btn.textContent='Bezig...';}
  // Verwijder eventueel al bestaande events voor deze week eerst
  if(gcalStore[weekKey]&&gcalStore[weekKey].length){
    var r=await deleteEventIds(gcalStore[weekKey]);
    if(r===-1){if(btn)btn.disabled=false;updateGcalUI();return;}
    delete gcalStore[weekKey];saveGcalStore();
  }
  // Maak nieuwe events aan
  var createdIds=[];var failed=0;
  for(var i=0;i<events.length;i++){
    var e=events[i];var info=actByKey[e.act];if(!info)continue;
    try{
      var res=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{
        method:'POST',
        headers:{'Authorization':'Bearer '+gcalToken,'Content-Type':'application/json'},
        body:JSON.stringify({summary:info.name,start:{dateTime:e.date+'T09:00:00',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},end:{dateTime:e.date+'T10:00:00',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},colorId:info.colorId})
      });
      if(res.ok){var d=await res.json();createdIds.push(d.id);}
      else if(res.status===401){gcalToken='';localStorage.removeItem('gymtracker_gcal_token');if(btn)btn.disabled=false;updateGcalUI();connectGoogle();return;}
      else{failed++;}
    }catch(err){failed++;}
  }
  gcalStore[weekKey]=createdIds;saveGcalStore();
  if(btn)btn.disabled=false;
  S.gcalNeedsSync=false;saveS();
  updateGcalUI();updateGcalDeleteBtn();
  showToast(createdIds.length+' events aangemaakt'+(failed?', '+failed+' mislukt':'')+'!');
}
async function deleteGoogleCalendarEvents(){
  if(!gcalToken){connectGoogle();return;}
  var allIds=gcalAllIds();
  if(!allIds.length){showToast('Geen events om te verwijderen');return;}
  if(!confirm('Verwijder alle '+allIds.length+' events uit je Google Agenda?'))return;
  var btn=document.getElementById('gcal-delete-btn');
  if(btn){btn.disabled=true;btn.textContent='Bezig...';}
  var deleted=0,failed=0;
  for(var i=0;i<allIds.length;i++){
    try{
      var res=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+allIds[i],{
        method:'DELETE',
        headers:{'Authorization':'Bearer '+gcalToken}
      });
      if(res.ok||res.status===410){deleted++;}
      else if(res.status===401){gcalToken='';localStorage.removeItem('gymtracker_gcal_token');updateGcalUI();connectGoogle();if(btn){btn.disabled=false;btn.textContent='Verwijder uit agenda';}return;}
      else{failed++;}
    }catch(err){failed++;}
  }
  gcalStore={};saveGcalStore();
  if(btn){btn.disabled=false;btn.textContent='Verwijder uit agenda';}
  updateGcalDeleteBtn();
  showToast(deleted+' events verwijderd'+(failed?', '+failed+' mislukt':'')+'!');
}
function updateGcalDeleteBtn(){
  var btn=document.getElementById('gcal-delete-btn');if(!btn)return;
  var total=gcalAllIds().length;
  btn.style.display=total?'':'none';
  if(total)btn.textContent='Verwijder alle events ('+total+')';
}

/* ─── HELPERS ─── */
function jsDayToIndex(jsDay){return(jsDay+6)%7;}   // JS 0(Sun)→6, 1(Mon)→0 ...
function indexToJsDay(idx){return(idx+1)%7;}        // 0(Mon)→1, 6(Sun)→0
function ensureNewFields(){
  if(!S.activitySchedule)S.activitySchedule={};
  if(!S.activityDone)S.activityDone=[];
  if(!S.activityTargets)S.activityTargets={};
  if(!S.activities)S.activities=DEFAULT_ACTIVITIES.map(function(a){return Object.assign({},a);});
  if(S.gcalNeedsSync==null)S.gcalNeedsSync=false;
  S.activities.forEach(function(a){
    if(!S.activitySchedule[a.key])S.activitySchedule[a.key]=[];
    if(S.activityTargets[a.key]==null)S.activityTargets[a.key]=1;
  });
  if(!S.exerciseNotes)S.exerciseNotes={};
}
function noteKey(name){return name.trim().toLowerCase();}
function attachStoredNote(exObj){
  ensureNewFields();
  var stored=S.exerciseNotes[noteKey(exObj.name)];
  if(!stored)return;
  if(stored.pinned||stored.pendingShow){
    exObj.note=stored.text;
    if(!stored.pinned)stored.pendingShow=false;
  }
}
function pinExNote(bi,ei){
  ensureNewFields();
  var ex=S.today.exercises[bi].exercises[ei];
  var key=noteKey(ex.name);
  if(!S.exerciseNotes[key])S.exerciseNotes[key]={text:ex.note,pinned:false,pendingShow:false};
  S.exerciseNotes[key].pinned=!S.exerciseNotes[key].pinned;
  S.exerciseNotes[key].text=ex.note;
  saveS();renderWorkout();
  showToast(S.exerciseNotes[key].pinned?'Notitie gepind':'Pin verwijderd');
}
var __saveTimer=null;
function saveS(){
  clearTimeout(__saveTimer);
  __saveTimer=setTimeout(function(){
    window.supabase.from('gym_state').update({data:S,updated_at:new Date().toISOString()}).eq('user_id',window.currentUserId).then(function(res){
      if(res.error)console.error('Opslaan mislukt:',res.error.message);
    });
  },350);
}
async function loadS(){
  try{
    var res=await window.supabase.from('gym_state').select('data').eq('user_id',window.currentUserId).maybeSingle();
    if(res.error)throw res.error;
    if(res.data&&res.data.data){S=res.data.data;}
    else{await window.supabase.from('gym_state').insert({user_id:window.currentUserId,data:S});}
  }catch(e){console.error('Laden mislukt:',e.message);showToast('Laden mislukt: '+e.message);}
  ensureNewFields();
  document.getElementById('today-date').textContent=fmtDate(todayStr());
}
function todayStr(){return new Date().toISOString().slice(0,10);}
function fmtDate(s){return new Date(s+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short',year:'numeric'});}
function fmtShort(s){return new Date(s+'T12:00:00').toLocaleDateString('nl-NL',{day:'numeric',month:'short'});}
function getWeekMon(offsetWeeks){
  var today=new Date();var dow=today.getDay();var mo=new Date(today);
  mo.setDate(today.getDate()+(dow===0?-6:1-dow)+offsetWeeks*7);mo.setHours(0,0,0,0);return mo;
}
function localDateStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function getWeekDates(mon){
  var dates=[];for(var i=0;i<7;i++){var d=new Date(mon);d.setDate(mon.getDate()+i);dates.push(localDateStr(d));}return dates;
}

/* ─── NAVIGATION ─── */
function goScreen(n){
  document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');});
  document.querySelectorAll('nav button').forEach(function(b){b.classList.remove('active');});
  document.getElementById('screen-'+n).classList.add('active');
  document.getElementById('nav-'+n).classList.add('active');
  if(n==='history')renderHistory();
  if(n==='progress'){renderProgressExList();renderActivityStats();}
  if(n==='programs'){renderPrograms();}
  if(n==='planner')renderPlanner();
  if(n==='settings')renderSettings();
  if(n==='workout'){renderWkSchemaSelect();renderWorkout();}
}
function closeModal(id){document.getElementById(id).classList.add('hidden');}
function openModal(id){document.getElementById(id).classList.remove('hidden');}

/* ─── TIMER ─── */
function startTimer(){if(timerIv)return;timerStart=timerStart||Date.now();timerIv=setInterval(tickTimer,1000);document.getElementById('timer-bar').classList.add('vis');tickTimer();}
function tickTimer(){var e=Math.floor((Date.now()-timerStart)/1000);document.getElementById('timer-display').textContent=String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');}
function stopTimer(){if(!confirm('Timer stoppen?'))return;clearInterval(timerIv);timerIv=null;timerStart=null;document.getElementById('timer-bar').classList.remove('vis');}

/* ─── WORKOUT ─── */
function isWarmupBlock(block){return block.type==='normal'&&block.exercises[0].type==='warmup';}
function renderWorkout(){
  var warmupWrap=document.getElementById('wk-warmup');
  var wrap=document.getElementById('wk-exercises');var empty=document.getElementById('wk-empty');
  renderDayBanner();renderLastTraining();
  empty.style.display=S.today.exercises.length?'none':'';
  var warmupBlocks=S.today.exercises.filter(isWarmupBlock);
  var restBlocks=S.today.exercises.filter(function(b){return !isWarmupBlock(b);});
  warmupWrap.innerHTML='';
  if(warmupBlocks.length){
    var hdr=document.createElement('div');
    hdr.style.cssText='font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px';
    hdr.textContent='Warming-up';
    warmupWrap.appendChild(hdr);
    warmupBlocks.forEach(function(block){
      warmupWrap.appendChild(makeWarmupCard(block.exercises[0],S.today.exercises.indexOf(block)));
    });
  }
  wrap.innerHTML='';
  restBlocks.forEach(function(block){
    var bi=S.today.exercises.indexOf(block);
    if(block.type==='superset'){wrap.appendChild(makeSupersetBlock(block,bi));}
    else{wrap.appendChild(makeExCard(block.exercises[0],bi,0,false));}
  });
}
function makeWarmupCard(ex,bi){
  var div=document.createElement('div');div.className='card';
  div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><div><span class="badge badge-warmup" style="margin-right:6px">Warm-up</span><span style="font-weight:700;font-size:14px">'+ex.name+'</span></div><button class="btn-icon" onclick="remBlock('+bi+')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button></div><div style="font-size:12px;color:var(--muted);margin-top:5px;font-family:var(--mono)">'+ex.sets+' sets x '+ex.reps+' reps</div>';
  return div;
}
function renderDayBanner(){
  var b=document.getElementById('day-banner');
  ensureNewFields();
  var todayIdx=jsDayToIndex(new Date().getDay());
  var acts=S.activities.filter(function(a){return (S.activitySchedule[a.key]||[]).includes(todayIdx);});
  if(acts.length){
    var labels=acts.map(function(a){return'<span style="color:'+a.color+';font-weight:700">'+(a.emoji?a.emoji+' ':'')+a.name+'</span>';}).join('<span style="color:var(--muted)"> · </span>');
    b.innerHTML='<div class="train-banner"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><div><div style="font-size:13px">Trainingsdag &mdash; '+labels+'</div></div></div>';
  }else{
    b.innerHTML='<div class="rest-banner"><div style="font-size:13px;color:var(--muted)">Rustdag 😴</div></div>';
  }
}
function renderLastTraining(){
  var wrap=document.getElementById('last-training-card');if(!wrap)return;
  if(!S.history.length){wrap.innerHTML='';return;}
  var last=S.history.slice().sort(function(a,b){return b.date.localeCompare(a.date);})[0];
  var names=last.exercises.flatMap(function(b){return b.exercises.map(function(e){return e.name;});});
  var label=last.schemaName?last.schemaName:(names.slice(0,3).join(', ')+(names.length>3?'...':''));
  wrap.innerHTML='<div class="card" style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Vorige training</div><div style="font-weight:700;font-size:14px">'+label+'</div></div><div class="date-badge">'+fmtShort(last.date)+'</div></div>';
}
function makeExCard(ex,bi,ei,inSS){
  var prev=getLastSets(ex.name);var pr=getPR(ex.name);
  var typeLabel=ex.type==='warmup'?'Warm-up':'';var rows='';
  for(var si=0;si<ex.sets;si++){
    var p=prev[si];var prevStr=p&&p.weight?(p.weight+'kg x '+(p.reps||'?')):'--';
    var cw=(ex.setData&&ex.setData[si])?ex.setData[si].weight:'';var cr=(ex.setData&&ex.setData[si])?ex.setData[si].reps:ex.reps;
    var delta='';if(p&&p.weight&&cw!==''){var d=parseFloat(cw)-p.weight;if(d>0)delta='<br><span class="dp-pos">+'+d+'kg</span>';else if(d<0)delta='<br><span class="dp-neg">'+d+'kg</span>';}
    var copyBtn=si>0?'<button style="background:none;border:none;cursor:pointer;color:var(--muted);padding:8px" onclick="copyPrevSet('+bi+','+ei+','+si+')" title="Kopieer vorige set"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16V4h9M8 8h12v12H8z"/></svg></button>':'';
    rows+='<tr><td style="color:var(--muted);font-family:var(--mono);font-size:11px;width:20px">'+(si+1)+'</td><td><input class="wi" type="text" inputmode="decimal" value="'+cw+'" placeholder="kg" onchange="updSet('+bi+','+ei+','+si+',\\'weight\\',this.value)"></td><td><input class="ri" type="text" inputmode="numeric" pattern="[0-9]*" value="'+cr+'" onchange="updSet('+bi+','+ei+','+si+',\\'reps\\',this.value)"></td><td class="prev-cell">'+prevStr+delta+'</td><td style="display:flex;align-items:center">'+copyBtn+'<button style="background:none;border:none;cursor:pointer;color:var(--danger);padding:8px" onclick="remSet('+bi+','+ei+','+si+')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button></td></tr>';
  }
  var prHtml=pr?'<span class="pr-chip">PR: '+pr.weight+'kg x '+pr.reps+'</span>':'';
  var storedNote=S.exerciseNotes&&S.exerciseNotes[noteKey(ex.name)];
  var isPinned=!!(storedNote&&storedNote.pinned);
  var noteHtml=ex.note?'<div class="inline-note" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="flex:1">'+ex.note+'</div><button style="background:none;border:none;cursor:pointer;padding:4px;flex-shrink:0;color:'+(isPinned?'var(--accent)':'var(--muted)')+'" onclick="pinExNote('+bi+','+ei+')" title="'+(isPinned?'Gepind - altijd tonen':'Voor altijd tonen')+'"><svg width="14" height="14" viewBox="0 0 24 24" fill="'+(isPinned?'currentColor':'none')+'" stroke="currentColor" stroke-width="2"><path d="M12 17v5M8 3h8l-1 7 3 2.5V14H6v-1.5L9 10z"/></svg></button></div>':'';
  var div=document.createElement('div');div.className=inSS?'superset-ex':'card';
  div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9px"><div><div style="font-weight:700;font-size:15px">'+ex.name+'</div><div style="margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">'+(typeLabel?'<span class="badge badge-warmup">'+typeLabel+'</span>':'')+'<span style="font-size:11px;color:var(--muted)">'+ex.sets+' sets x '+ex.reps+' reps</span>'+prHtml+'</div></div>'+(inSS?'':'<button class="btn-icon" onclick="remBlock('+bi+')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>')+'</div><table class="sets-table"><thead><tr><th>#</th><th>Gewicht</th><th>Reps</th><th>Vorige keer</th><th></th></tr></thead><tbody>'+rows+'</tbody></table><div class="ex-actions"><button class="btn btn-ghost btn-sm" onclick="addSet('+bi+','+ei+')">+ Set</button><button class="btn btn-ghost btn-sm" onclick="openExNote('+bi+','+ei+')">Notitie</button></div>'+noteHtml;
  return div;
}
function makeSupersetBlock(block,bi){
  var wrap=document.createElement('div');wrap.className='superset-block';
  wrap.innerHTML='<div class="superset-header"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c4a8ff" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>Superset<button style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--danger)" onclick="remBlock('+bi+')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/></svg></button></div>';
  block.exercises.forEach(function(ex,ei){wrap.appendChild(makeExCard(ex,bi,ei,true));});
  return wrap;
}
function updSet(bi,ei,si,f,v){var ex=S.today.exercises[bi].exercises[ei];if(!ex.setData)ex.setData=[];if(!ex.setData[si])ex.setData[si]={weight:'',reps:ex.reps};ex.setData[si][f]=v;saveS();}
function copyPrevSet(bi,ei,si){
  var ex=S.today.exercises[bi].exercises[ei];if(!ex.setData)ex.setData=[];
  var prevData=ex.setData[si-1];
  if(!prevData||!prevData.weight){showToast('Geen vorige set om te kopieren');return;}
  ex.setData[si]={weight:prevData.weight,reps:prevData.reps};
  saveS();renderWorkout();
}
function addSet(bi,ei){S.today.exercises[bi].exercises[ei].sets++;saveS();renderWorkout();}
function remSet(bi,ei,si){var ex=S.today.exercises[bi].exercises[ei];ex.sets--;if(ex.setData)ex.setData.splice(si,1);if(ex.sets<1){remBlock(bi);return;}saveS();renderWorkout();}
function remBlock(bi){S.today.exercises.splice(bi,1);saveS();renderWorkout();}
function getLastSets(name){
  var sorted=S.history.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  for(var i=0;i<sorted.length;i++){for(var j=0;j<sorted[i].exercises.length;j++){var ex=sorted[i].exercises[j].exercises.find(function(e){return e.name.toLowerCase()===name.toLowerCase();});if(ex&&ex.setData&&ex.setData.length)return ex.setData;}}
  return[];
}
function getPR(name){
  var best=null;
  S.history.forEach(function(d){d.exercises.forEach(function(b){b.exercises.filter(function(e){return e.name.toLowerCase()===name.toLowerCase();}).forEach(function(ex){(ex.setData||[]).forEach(function(s){if(s&&s.weight){if(!best||parseFloat(s.weight)>best.weight)best={weight:parseFloat(s.weight),reps:s.reps||'?'};}});});});});
  return best;
}
function openAddEx(){
  document.getElementById('ex-name').value='';document.getElementById('ex-sets').value='3';document.getElementById('ex-reps').value='10';
  document.getElementById('ex-type').value='normal';document.getElementById('ss-fields').style.display='none';
  document.getElementById('ex-pair-name').value='';document.getElementById('ex-sug').style.display='none';
  openModal('m-add-ex');setTimeout(function(){document.getElementById('ex-name').focus();},150);
}
function onTypeChange(){document.getElementById('ss-fields').style.display=document.getElementById('ex-type').value==='superset'?'':'none';}
document.getElementById('ex-name').addEventListener('input',function(){
  var q=this.value.toLowerCase();var ns=getAllExNames().filter(function(n){return n.toLowerCase().includes(q)&&q.length>0;});
  var sg=document.getElementById('ex-sug');if(!ns.length){sg.style.display='none';return;}sg.style.display='';
  sg.innerHTML=ns.slice(0,6).map(function(n){return'<div onclick="document.getElementById(\\'ex-name\\').value=this.textContent;document.getElementById(\\'ex-sug\\').style.display=\\'none\\'" style="padding:9px 11px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)" onmouseover="this.style.background=\\'var(--surface3)\\'" onmouseout="this.style.background=\\'\\'">'+n+'</div>';}).join('');
});
function getAllExNames(){
  var ns=new Set();
  S.history.forEach(function(d){d.exercises.forEach(function(b){b.exercises.forEach(function(e){ns.add(e.name);});});});
  S.today.exercises.forEach(function(b){b.exercises.forEach(function(e){ns.add(e.name);});});
  S.programs.forEach(function(p){p.exercises.forEach(function(e){ns.add(e.name);if(e.supersetPair)ns.add(e.supersetPair);});});
  return Array.from(ns).sort();
}
function addExercise(){
  var name=document.getElementById('ex-name').value.trim();if(!name){showToast('Vul een naam in');return;}
  var type=document.getElementById('ex-type').value;var sets=parseInt(document.getElementById('ex-sets').value)||3;var reps=parseInt(document.getElementById('ex-reps').value)||10;
  if(type==='superset'){
    var pn=document.getElementById('ex-pair-name').value.trim();if(!pn){showToast('Vul de tweede oefening in');return;}
    var ps=parseInt(document.getElementById('ex-pair-sets').value)||3;var pr2=parseInt(document.getElementById('ex-pair-reps').value)||10;
    var exA={name:name,sets:sets,reps:reps,type:'superset',setData:[],note:''};
    var exB={name:pn,sets:ps,reps:pr2,type:'superset',setData:[],note:''};
    attachStoredNote(exA);attachStoredNote(exB);
    S.today.exercises.push({type:'superset',exercises:[exA,exB]});
  }
  else{var newEx={name:name,sets:sets,reps:reps,type:type,setData:[],note:''};attachStoredNote(newEx);S.today.exercises.push({type:'normal',exercises:[newEx]});}
  saveS();closeModal('m-add-ex');renderWorkout();showToast('Toegevoegd');
  if(!timerIv)startTimer();
}
function openExNote(bi,ei){curNoteTarget={bi:bi,ei:ei};var ex=S.today.exercises[bi].exercises[ei];document.getElementById('ex-note-title').textContent=ex.name+' notitie';document.getElementById('ex-note-text').value=ex.note||'';openModal('m-ex-note');}
function saveExNote(){
  if(!curNoteTarget)return;
  var ex=S.today.exercises[curNoteTarget.bi].exercises[curNoteTarget.ei];
  var text=document.getElementById('ex-note-text').value.trim();
  ex.note=text;
  ensureNewFields();
  var key=noteKey(ex.name);
  if(text){
    var existing=S.exerciseNotes[key];
    S.exerciseNotes[key]={text:text,pinned:existing?existing.pinned:false,pendingShow:true};
  }else{
    delete S.exerciseNotes[key];
  }
  saveS();closeModal('m-ex-note');renderWorkout();
}
function saveWorkout(){
  if(!S.today.exercises.length){showToast('Geen oefeningen');return;}
  var ts=todayStr();
  var entry={date:ts,exercises:JSON.parse(JSON.stringify(S.today.exercises)),note:S.today.note,schemaName:S.today.schemaName||''};
  var idx=S.history.findIndex(function(h){return h.date===ts;});if(idx>=0)S.history[idx]=entry;else S.history.push(entry);
  S.today={exercises:[],note:''};
  if(timerIv){clearInterval(timerIv);timerIv=null;timerStart=null;document.getElementById('timer-bar').classList.remove('vis');}
  saveS();showToast('Workout opgeslagen!');
  renderWorkout();
}
function clearWorkout(){if(S.today.exercises.length&&!confirm('Huidige workout wissen?'))return;S.today={exercises:[],note:''};if(timerIv){clearInterval(timerIv);timerIv=null;timerStart=null;document.getElementById('timer-bar').classList.remove('vis');}saveS();renderWorkout();}
function renderWkSchemaSelect(){var sel=document.getElementById('wk-schema-sel');sel.innerHTML='<option value="">Kies schema...</option>'+S.programs.map(function(p){return'<option value="'+p.id+'">'+p.name+'</option>';}).join('');}
function loadSchema(){
  var id=document.getElementById('wk-schema-sel').value;if(!id){showToast('Kies eerst een schema');return;}
  var prog=S.programs.find(function(p){return p.id===id;});if(!prog)return;
  S.today.schemaName=prog.name;
  var existing=new Set(S.today.exercises.flatMap(function(b){return b.exercises.map(function(e){return e.name.toLowerCase();});}));
  var added=new Set();
  prog.exercises.forEach(function(ex){
    if(added.has(ex.name.toLowerCase()))return;
    if(ex.type==='superset'&&ex.supersetPair&&!existing.has(ex.name.toLowerCase())&&!existing.has((ex.supersetPair||'').toLowerCase())){
      var pair=prog.exercises.find(function(e){return e.name===ex.supersetPair;});
      var exA={name:ex.name,sets:ex.sets,reps:ex.reps,type:'superset',setData:[],note:''};
      var exB={name:ex.supersetPair,sets:pair?pair.sets:ex.sets,reps:pair?pair.reps:ex.reps,type:'superset',setData:[],note:''};
      attachStoredNote(exA);attachStoredNote(exB);
      S.today.exercises.push({type:'superset',exercises:[exA,exB]});
      added.add(ex.name.toLowerCase());added.add((ex.supersetPair||'').toLowerCase());
    }else if(!existing.has(ex.name.toLowerCase())){
      var newEx={name:ex.name,sets:ex.sets,reps:ex.reps,type:ex.type||'normal',setData:[],note:''};
      attachStoredNote(newEx);
      S.today.exercises.push({type:'normal',exercises:[newEx]});added.add(ex.name.toLowerCase());
    }
  });
  saveS();startTimer();renderWorkout();showToast(prog.name+' geladen - timer gestart');
}

/* ─── HISTORIE ─── */
function renderHistory(){
  var list=document.getElementById('hist-list');var empty=document.getElementById('hist-empty');
  if(!S.history.length){list.innerHTML='';empty.style.display='';return;}empty.style.display='none';
  var sorted=S.history.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  list.innerHTML=sorted.map(function(day){
    var blocks=day.exercises.map(function(block){return block.exercises.map(function(ex){
      var chips=(ex.setData||[]).filter(function(s){return s&&s.weight;}).map(function(s){return'<span class="chip">'+s.weight+'kg x '+(s.reps||'?')+'</span>';}).join('');
      var tl=block.type==='superset'?'<span class="badge badge-superset" style="font-size:9px">superset</span>':ex.type==='warmup'?'<span class="badge badge-warmup" style="font-size:9px">warmup</span>':'';
      var nl=ex.note?'<div style="font-size:11px;color:var(--muted);margin-top:3px;font-style:italic">"'+ex.note+'"</div>':'';
      return'<div class="hd-ex"><div class="hd-ex-name">'+ex.name+tl+'</div><div class="hd-chips">'+(chips||'<span style="font-size:11px;color:var(--muted)">'+ex.sets+'x'+ex.reps+'</span>')+'</div>'+nl+'</div>';
    }).join('');}).join('');
    var nl=day.note?'<div style="margin-top:6px;padding:7px 10px;background:var(--surface2);border-radius:7px;font-size:12px;color:var(--muted)">'+day.note+'</div>':'';
    return'<div class="history-day"><div class="hd-header"><span>'+fmtDate(day.date)+'</span><span style="display:flex;align-items:center;gap:8px"><span>'+day.exercises.length+' blokken</span><button style="background:none;border:none;cursor:pointer;color:var(--danger);padding:4px" onclick="deleteHistoryDay(\\''+day.date+'\\')" title="Training verwijderen"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button></span></div>'+blocks+nl+'</div>';
  }).join('');
}
function deleteHistoryDay(date){
  if(!confirm('Deze training verwijderen uit je historie?'))return;
  S.history=S.history.filter(function(h){return h.date!==date;});
  saveS();renderHistory();showToast('Training verwijderd');
}

/* ─── PROGRESSIE ─── */
function renderProgressExList(){
  var sel=document.getElementById('prog-sel');var cur=sel.value;var ns=new Set();
  S.history.forEach(function(d){d.exercises.forEach(function(b){b.exercises.forEach(function(e){ns.add(e.name);});});});
  sel.innerHTML='<option value="">Kies een oefening...</option>'+Array.from(ns).sort().map(function(n){return'<option value="'+n+'"'+(n===cur?' selected':'')+'>'+n+'</option>';}).join('');
  if(cur)renderProgress();
}
function renderProgress(){
  var name=document.getElementById('prog-sel').value;var cont=document.getElementById('prog-content');if(!name){cont.innerHTML='';return;}
  var entries=S.history.filter(function(d){return d.exercises.some(function(b){return b.exercises.some(function(e){return e.name.toLowerCase()===name.toLowerCase();});});})
    .sort(function(a,b){return a.date.localeCompare(b.date);})
    .map(function(d){
      var block=d.exercises.find(function(b){return b.exercises.some(function(e){return e.name.toLowerCase()===name.toLowerCase();});});
      var ex=block.exercises.find(function(e){return e.name.toLowerCase()===name.toLowerCase();});
      var wts=(ex.setData||[]).filter(function(s){return s&&s.weight;}).map(function(s){return parseFloat(s.weight);});
      var maxW=wts.length?Math.max.apply(null,wts):null;var vol=wts.reduce(function(a,b){return a+b;},0);
      var bestSet=(ex.setData||[]).filter(function(s){return s&&s.weight;}).reduce(function(b,s){return(!b||parseFloat(s.weight)>b.weight)?{weight:parseFloat(s.weight),reps:s.reps||'?'}:b;},null);
      return{date:d.date,max:maxW,vol:vol,bestSet:bestSet};
    });
  if(!entries.length){cont.innerHTML='<p style="color:var(--muted);font-size:13px">Geen data.</p>';return;}
  var maxAll=Math.max.apply(null,entries.map(function(e){return e.max||0;}));
  var prEntry=entries.reduce(function(b,e){return(!b||(e.max||0)>(b.max||0))?e:b;},null);
  var first=entries[0],last=entries[entries.length-1];
  var delta=(last.max&&first.max)?(last.max-first.max).toFixed(1):null;
  cont.innerHTML='<div class="stat-grid"><div class="stat-card"><div class="stat-label">Max gewicht</div><div class="stat-value pos">'+(maxAll?maxAll+'kg':'--')+'</div></div><div class="stat-card"><div class="stat-label">Hoogste set ooit</div><div class="stat-value" style="font-size:16px">'+(prEntry&&prEntry.bestSet?prEntry.bestSet.weight+'kg x '+prEntry.bestSet.reps:'--')+'</div></div><div class="stat-card"><div class="stat-label">Progressie</div><div class="stat-value '+(delta>0?'pos':delta<0?'neg':'')+'">'+(delta!==null?(delta>0?'+':'')+delta+'kg':'--')+'</div></div><div class="stat-card"><div class="stat-label">Sessies</div><div class="stat-value">'+entries.length+'</div></div></div><div class="chart-wrap"><div class="chart-title">Max gewicht per sessie</div>'+lineChart(entries)+'</div><div class="chart-wrap"><div class="chart-title">Volume per sessie</div>'+barChart(entries)+'</div>';
}
function renderActivityStats(){
  ensureNewFields();
  var wrap=document.getElementById('activity-stats');if(!wrap)return;
  var acts=S.activities;
  // Build 8-week data
  var weeklyData=[];
  for(var w=7;w>=0;w--){
    var mon=getWeekMon(-w);var dates=getWeekDates(mon);
    var wd={label:fmtShort(dates[0]),dates:dates,counts:{}};
    acts.forEach(function(a){
      var planned=0,done=0;
      dates.forEach(function(ds,di){
        if((S.activitySchedule[a.key]||[]).includes(di)){planned++;if((S.activityDone||[]).includes(ds+'_'+a.key))done++;}
      });
      wd.counts[a.key]={planned:planned,done:done};
    });
    weeklyData.push(wd);
  }
  var thisWeek=weeklyData[weeklyData.length-1];
  var html='<div style="font-weight:700;font-size:14px;margin-bottom:9px">Activiteiten — deze week</div>';
  html+='<div class="stat-grid">';
  acts.forEach(function(a){
    var target=S.activityTargets[a.key]||0;var done=thisWeek.counts[a.key].done;
    var ontrack=done>=target;
    html+='<div class="stat-card"><div class="stat-label">'+(a.emoji?a.emoji+' ':'')+a.name+'</div><div class="stat-value" style="color:'+(ontrack?a.color:'var(--danger)')+'">'+done+'/'+target+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">streefdoel per week</div></div>';
  });
  html+='</div>';
  acts.forEach(function(a){
    var target=S.activityTargets[a.key]||1;
    html+='<div class="chart-wrap"><div class="chart-title">'+(a.emoji?a.emoji+' ':'')+a.name+' &mdash; 8 weken</div>'+activityChart(weeklyData,a.key,target,a.color)+'</div>';
  });
  html+='<div style="border-top:1px solid var(--border);margin:16px 0"></div>';
  wrap.innerHTML=html;
}
function activityChart(weeklyData,actKey,target,color){
  var w=560,h=100,pl=24,pr=8,pt=8,pb=20;
  var maxV=Math.max(target,1,Math.max.apply(null,weeklyData.map(function(wd){return wd.counts[actKey].done;})));
  var bw=Math.max(4,(w-pl-pr)/weeklyData.length-4);
  var bars=weeklyData.map(function(wd,i){
    var done=wd.counts[actKey].done;var planned=wd.counts[actKey].planned;
    var bh=done>0?(h-pt-pb)*done/maxV:0;
    var x=pl+i*(w-pl-pr)/weeklyData.length;
    var fc=planned===0?'var(--border)':done>=target?color:'var(--danger)';
    return'<rect x="'+x.toFixed(1)+'" y="'+(h-pb-bh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(bh,0).toFixed(1)+'" rx="2" fill="'+fc+'"/>';
  }).join('');
  var ty=(h-pt-pb)*(1-target/maxV)+pt;
  var tline='<line x1="'+pl+'" y1="'+ty.toFixed(1)+'" x2="'+(w-pr)+'" y2="'+ty.toFixed(1)+'" stroke="'+color+'" stroke-width="1.5" stroke-dasharray="5,3" opacity=".35"/>';
  var lbls=weeklyData.map(function(wd,i){
    if(i%2!==0)return'';
    var x=pl+i*(w-pl-pr)/weeklyData.length+bw/2;
    return'<text x="'+x.toFixed(1)+'" y="'+(h-4)+'" text-anchor="middle" font-size="8" fill="var(--muted)">'+wd.label+'</text>';
  }).join('');
  return'<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;display:block">'+bars+tline+lbls+'</svg>';
}
function lineChart(entries){
  var w=560,h=145,pl=38,pr=8,pt=10,pb=24;
  var data=entries.filter(function(e){return e.max!=null;});if(data.length<2)return'<p style="font-size:12px;color:var(--muted)">Onvoldoende data</p>';
  var minV=Math.min.apply(null,data.map(function(e){return e.max;})),maxV=Math.max.apply(null,data.map(function(e){return e.max;})),range=maxV-minV||1;
  var xs=(w-pl-pr)/(data.length-1);var ys=function(v){return pt+(h-pt-pb)*(1-(v-minV)/range);};
  var pts=data.map(function(e,i){return(pl+i*xs).toFixed(1)+','+ys(e.max).toFixed(1);}).join(' ');
  var dots=data.map(function(e,i){return'<circle cx="'+(pl+i*xs).toFixed(1)+'" cy="'+ys(e.max).toFixed(1)+'" r="3.5" fill="var(--accent)"/>';}).join('');
  var lbls=data.map(function(e,i){if(data.length<=7||i===0||i===data.length-1||i%Math.ceil(data.length/5)===0)return'<text x="'+(pl+i*xs).toFixed(1)+'" y="'+(h-4)+'" text-anchor="middle" font-size="9" fill="var(--muted)">'+fmtShort(e.date)+'</text>';return'';}).join('');
  var yls=[minV,minV+range/2,maxV].map(function(v){return'<text x="'+(pl-3)+'" y="'+(ys(v)+4).toFixed(1)+'" text-anchor="end" font-size="9" fill="var(--muted)">'+Math.round(v)+'</text>';}).join('');
  return'<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;display:block"><polyline points="'+pts+'" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>'+dots+lbls+yls+'</svg>';
}
function barChart(entries){
  var w=560,h=115,pl=40,pr=8,pt=8,pb=24;
  var data=entries.filter(function(e){return e.vol>0;});if(!data.length)return'<p style="font-size:12px;color:var(--muted)">Onvoldoende data</p>';
  var maxV=Math.max.apply(null,data.map(function(e){return e.vol;}));var bw=Math.max(4,(w-pl-pr)/data.length-3);
  var bars=data.map(function(e,i){var bh=(h-pt-pb)*e.vol/maxV;var x=pl+i*(w-pl-pr)/data.length;return'<rect x="'+x.toFixed(1)+'" y="'+(h-pb-bh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="2" fill="var(--accent)" opacity=".65"/>';}).join('');
  var yls=[0,maxV/2,maxV].map(function(v){var y=h-pb-(h-pt-pb)*v/maxV;return'<text x="'+(pl-3)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="9" fill="var(--muted)">'+Math.round(v)+'</text>';}).join('');
  return'<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;display:block">'+bars+yls+'</svg>';
}

/* ─── SCHEMA'S ─── */
function renderPrograms(){
  var list=document.getElementById('prog-list');var empty=document.getElementById('prog-empty');
  if(!S.programs.length){list.innerHTML='';empty.style.display='';return;}empty.style.display='none';
  list.innerHTML=S.programs.map(function(p){return'<div class="prog-card" onclick="openProgDetail(\\''+p.id+'\\')"><div class="prog-card-title">'+p.name+'</div><div class="prog-card-meta">'+p.exercises.length+' oefen. - '+p.exercises.map(function(e){return e.name;}).slice(0,3).join(', ')+(p.exercises.length>3?'...':'')+'</div></div>';}).join('');
}
function openCreateProg(){tempProgEx=[];document.getElementById('prog-name').value='';renderProgExList();openModal('m-create-prog');}
function addProgEx(){tempProgEx.push({name:'',sets:3,reps:10,type:'normal',supersetPair:''});renderProgExList();}
function renderProgExList(){
  var w=document.getElementById('prog-ex-list');if(!tempProgEx.length){w.innerHTML='';return;}
  w.innerHTML=tempProgEx.map(function(ex,i){return'<div style="background:var(--surface2);border-radius:8px;padding:11px;margin-bottom:7px"><div style="display:flex;gap:7px;margin-bottom:7px"><input type="text" value="'+ex.name+'" placeholder="Oefening naam" style="flex:1" onchange="tempProgEx['+i+'].name=this.value"><button class="btn-icon" onclick="tempProgEx.splice('+i+',1);renderProgExList()"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><div class="fr3"><div><label style="font-size:10px">Sets</label><input type="number" value="'+ex.sets+'" min="1" onchange="tempProgEx['+i+'].sets=+this.value||3"></div><div><label style="font-size:10px">Reps</label><input type="number" value="'+ex.reps+'" min="1" onchange="tempProgEx['+i+'].reps=+this.value||10"></div><div><label style="font-size:10px">Type</label><select onchange="tempProgEx['+i+'].type=this.value;renderProgExList()"><option value="normal"'+(ex.type==='normal'?' selected':'')+'>Normaal</option><option value="warmup"'+(ex.type==='warmup'?' selected':'')+'>Warm-up</option><option value="superset"'+(ex.type==='superset'?' selected':'')+'>Superset</option></select></div></div>'+(ex.type==='superset'?'<div style="margin-top:7px"><label style="font-size:10px">Superset met</label><input type="text" value="'+(ex.supersetPair||'')+'" placeholder="Tweede oefening" onchange="tempProgEx['+i+'].supersetPair=this.value"></div>':'')+'</div>';}).join('');
}
function saveProg(){var name=document.getElementById('prog-name').value.trim();if(!name){showToast('Vul een naam in');return;}var exs=tempProgEx.filter(function(e){return e.name.trim();});S.programs.push({id:Date.now().toString(),name:name,exercises:exs});saveS();closeModal('m-create-prog');renderPrograms();renderWkSchemaSelect();showToast('Schema opgeslagen');}
function openProgDetail(id){curProgId=id;var p=S.programs.find(function(x){return x.id===id;});document.getElementById('pd-title').textContent=p.name;document.getElementById('pd-body').innerHTML=p.exercises.map(function(e){return'<div style="padding:5px 0;border-bottom:1px solid var(--surface3)">'+e.name+' - '+e.sets+'x'+e.reps+' <span style="color:var(--muted);font-size:11px">'+(e.type||'normaal')+(e.supersetPair?' + '+e.supersetPair:'')+'</span></div>';}).join('');openModal('m-prog-detail');}
function delProg(){if(!confirm('Schema verwijderen?'))return;S.programs=S.programs.filter(function(p){return p.id!==curProgId;});saveS();closeModal('m-prog-detail');renderPrograms();renderWkSchemaSelect();showToast('Schema verwijderd');}
function importProgram(event){var file=event.target.files[0];if(!file)return;var r=new FileReader();r.onload=function(e){try{var data=JSON.parse(e.target.result);var ps=Array.isArray(data)?data:[data];ps.forEach(function(p){if(!p.name||!p.exercises)throw new Error('Ongeldig formaat');S.programs.push({id:Date.now().toString()+Math.random(),name:p.name,exercises:p.exercises});});saveS();renderPrograms();renderWkSchemaSelect();showToast(ps.length+" schema's geimporteerd");}catch(err){showToast('Fout: '+err.message);}};r.readAsText(file);event.target.value='';}
var AI_SCHEMA_PROMPT='Maak een trainingsschema in dit exacte JSON-formaat. Geef ALLEEN de JSON terug, zonder uitleg en zonder markdown code-block eromheen:\\n\\n'
  +'{\\n'
  +'  "name": "Naam van het schema",\\n'
  +'  "exercises": [\\n'
  +'    { "name": "Oefening naam", "sets": 4, "reps": 8, "type": "normal" },\\n'
  +'    { "name": "Warm-up oefening", "sets": 2, "reps": 15, "type": "warmup" },\\n'
  +'    { "name": "Oefening A", "sets": 3, "reps": 10, "type": "superset", "supersetPair": "Oefening B" },\\n'
  +'    { "name": "Oefening B", "sets": 3, "reps": 10, "type": "superset", "supersetPair": "Oefening A" }\\n'
  +'  ]\\n'
  +'}\\n\\n'
  +'Regels:\\n'
  +'- "type" is altijd een van: "normal", "warmup", "superset"\\n'
  +'- Bij "superset" verwijzen twee oefeningen naar elkaar via "supersetPair" (exact de naam van de andere oefening)\\n'
  +'- "sets" en "reps" zijn getallen, geen tekst\\n'
  +'- Wil je meerdere schema\\'s tegelijk? Zet ze dan in een JSON-array: [ {...}, {...} ]\\n\\n'
  +'Mijn wensen voor het schema: [beschrijf hier wat voor schema je wilt \\u2014 bijv. spiergroepen, aantal dagen per week, ervaringsniveau, blessures, focus op kracht/hypertrofie, beschikbare apparatuur, etc.]';
function copyAiPrompt(){
  navigator.clipboard.writeText(AI_SCHEMA_PROMPT).then(function(){
    showToast('Prompt gekopieerd! Plak in ChatGPT/Claude');
  }).catch(function(){
    showToast('Kopieren mislukt, probeer opnieuw');
  });
}

/* ─── PLANNER ─── */
var plannerWeekOffset=0;
function changeWeek(abs){
  if(abs===0)plannerWeekOffset=0;
  else plannerWeekOffset+=abs;
  renderWeekChecklist();
}
var DAY_NAMES=['Ma','Di','Wo','Do','Vr','Za','Zo'];

function renderPlanner(){
  ensureNewFields();
  var wrap=document.getElementById('activity-sections');
  wrap.innerHTML='';
  S.activities.forEach(function(act){wrap.appendChild(makeActivitySection(act));});
  renderWeekChecklist();
  updateGcalUI();
}
function makeActivitySection(act){
  var schedule=S.activitySchedule[act.key]||[];
  var target=S.activityTargets[act.key]||1;
  var sec=document.createElement('div');sec.className='act-section';
  var grid=DAY_NAMES.map(function(d,i){
    var sel=schedule.includes(i);
    var style=sel?'background:'+act.color+';border-color:'+act.color+';color:#0e0e0f':'';
    return'<div class="day-pill" style="'+style+'" onclick="toggleActivityDay(\\''+act.key+'\\','+i+')"><div class="dp-name">'+d+'</div></div>';
  }).join('');
  sec.innerHTML='<div class="act-header"><div class="act-title" style="color:'+act.color+'">'+(act.emoji?act.emoji+' ':'')+act.name+'</div><div class="act-target-lbl">Doel: '+target+'x/week</div></div><div class="day-grid">'+grid+'</div>';
  return sec;
}
function toggleActivityDay(key,dayIdx){
  ensureNewFields();
  var schedule=S.activitySchedule[key];
  var pos=schedule.indexOf(dayIdx);
  if(pos>=0)schedule.splice(pos,1);else schedule.push(dayIdx);
  S.gcalNeedsSync=true;
  saveS();renderPlanner();renderDayBanner();
}
function renderWeekChecklist(){
  ensureNewFields();
  var mon=getWeekMon(plannerWeekOffset);var dates=getWeekDates(mon);
  var lbl=document.getElementById('week-label');
  if(lbl){
    if(plannerWeekOffset===0)lbl.textContent='Deze week';
    else if(plannerWeekOffset===1)lbl.textContent='Volgende week';
    else if(plannerWeekOffset===-1)lbl.textContent='Vorige week';
    else lbl.textContent=(plannerWeekOffset>0?'+':'')+plannerWeekOffset+' weken';
  }
  var nowBtn=document.getElementById('week-now-btn');
  if(nowBtn){
    nowBtn.disabled=plannerWeekOffset===0;
    nowBtn.style.opacity=plannerWeekOffset===0?'.4':'1';
    nowBtn.style.cursor=plannerWeekOffset===0?'default':'pointer';
  }
  var items=[];
  dates.forEach(function(ds,di){
    S.activities.forEach(function(act){
      if((S.activitySchedule[act.key]||[]).includes(di)){
        var key=ds+'_'+act.key;
        items.push({date:ds,act:act,key:key,done:(S.activityDone||[]).includes(key)});
      }
    });
  });

  // Week summary pills
  var summaryWrap=document.getElementById('week-summary');
  if(summaryWrap){
    summaryWrap.innerHTML=S.activities.map(function(act){
      var target=S.activityTargets[act.key]||0;
      var done=items.filter(function(it){return it.act.key===act.key&&it.done;}).length;
      var planned=items.filter(function(it){return it.act.key===act.key;}).length;
      if(!planned)return'';
      var col=done>=target?act.color:'var(--danger)';
      return'<div class="week-prog-pill"><div class="week-prog-val" style="color:'+col+'">'+done+'/'+target+'</div><div class="week-prog-lbl">'+act.name+'</div></div>';
    }).filter(Boolean).join('');
  }

  var wrap=document.getElementById('week-checklist');if(!wrap)return;
  if(!items.length){wrap.innerHTML='<p style="font-size:13px;color:var(--muted)">Nog geen dagen ingepland. Selecteer hierboven je trainingsdagen.</p>';return;}
  wrap.innerHTML=items.map(function(item){
    var doneClass=item.done?'done':'';
    return'<div class="checklist-item"><input type="checkbox" class="checklist-cb"'+(item.done?' checked':'')+' onchange="toggleDone(\\''+item.key+'\\',this.checked)"><div class="checklist-act '+doneClass+'" style="color:'+item.act.color+'">'+(item.act.emoji?item.act.emoji+' ':'')+item.act.name+'</div><div class="checklist-date">'+fmtShort(item.date)+'</div></div>';
  }).join('');
}
function toggleDone(key,checked){
  ensureNewFields();
  var idx=(S.activityDone||[]).indexOf(key);
  if(checked&&idx<0)S.activityDone.push(key);
  else if(!checked&&idx>=0)S.activityDone.splice(idx,1);
  saveS();renderWeekChecklist();
}

/* ─── INSTELLINGEN ─── */
function renderSettings(){
  ensureNewFields();
  renderActivityManageList();
}
function renderActivityManageList(){
  var wrap=document.getElementById('activity-manage-list');if(!wrap)return;
  wrap.innerHTML=S.activities.map(function(act){
    var delBtn=act.removable?'<button class="btn-icon" onclick="removeActivity(\\''+act.key+'\\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>':'<div style="width:32px"></div>';
    return'<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--surface2)"><div style="flex:1;font-weight:600;font-size:13px">'+(act.emoji?act.emoji+' ':'')+act.name+'</div><input type="number" min="1" max="7" value="'+(S.activityTargets[act.key]||1)+'" style="width:56px" onchange="setTarget(\\''+act.key+'\\',this.value)">'+delBtn+'</div>';
  }).join('');
}
function setTarget(key,val){
  ensureNewFields();
  S.activityTargets[key]=Math.max(1,parseInt(val)||1);
  saveS();renderPlanner();renderActivityStats();
}
function addActivity(){
  ensureNewFields();
  var inp=document.getElementById('new-activity-name');
  var name=inp.value.trim();
  if(!name){showToast('Vul een naam in');return;}
  var color=ACTIVITY_COLOR_PALETTE[S.activities.length%ACTIVITY_COLOR_PALETTE.length];
  var key=name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')+'_'+Date.now().toString(36);
  S.activities.push({key:key,name:name,emoji:'',color:color,removable:true});
  S.activityTargets[key]=1;S.activitySchedule[key]=[];
  inp.value='';
  saveS();renderSettings();renderPlanner();renderActivityStats();renderDayBanner();
  showToast('Sport toegevoegd');
}
function removeActivity(key){
  if(!confirm('Deze sport verwijderen? Geplande dagen en voortgang hiervoor gaan verloren.'))return;
  S.activities=S.activities.filter(function(a){return a.key!==key;});
  delete S.activityTargets[key];delete S.activitySchedule[key];
  S.activityDone=(S.activityDone||[]).filter(function(d){return !d.endsWith('_'+key);});
  S.gcalNeedsSync=true;
  saveS();renderSettings();renderPlanner();renderActivityStats();renderDayBanner();
  showToast('Sport verwijderd');
}

/* ─── TOAST ─── */
var toastT;
function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('show');},2500);}

/* ─── INIT ─── */
(async function initApp(){
  await loadS();
  if(!S.programs.length){
    S.programs.push({
      id:'fullbody_default',
      name:'Fullbody A',
      exercises:[
        {name:'Squat',sets:4,reps:8,type:'normal'},
        {name:'Bench Press',sets:4,reps:8,type:'normal'},
        {name:'Barbell Row',sets:4,reps:8,type:'normal'},
        {name:'Overhead Press',sets:3,reps:10,type:'normal'},
        {name:'Romanian Deadlift',sets:3,reps:10,type:'normal'},
        {name:'Lat Pulldown',sets:3,reps:10,type:'normal'}
      ]
    });
    S.programs.push({
      id:'fullbody_b',
      name:'Fullbody B',
      exercises:[
        {name:'Deadlift',sets:4,reps:5,type:'normal'},
        {name:'Incline Bench Press',sets:4,reps:8,type:'normal'},
        {name:'Cable Row',sets:4,reps:10,type:'normal'},
        {name:'Dumbbell Shoulder Press',sets:3,reps:10,type:'normal'},
        {name:'Leg Press',sets:3,reps:12,type:'normal'},
        {name:'Pull-up',sets:3,reps:8,type:'normal'}
      ]
    });
    saveS();
  }
  renderWkSchemaSelect();renderWorkout();
})();
`;
