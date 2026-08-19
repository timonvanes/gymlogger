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
  if(!S.nutrition)S.nutrition={};
  if(!S.nutrition.targets)S.nutrition.targets={calories:2200,protein:150,carbs:220,fat:70};
  if(!S.nutrition.macroPct){
    S.nutrition.macroPct={protein:30,carbs:40,fat:30};
    recalcMacroTargetsFromPct();
  }
  if(!S.nutrition.dinnerDefault)S.nutrition.dinnerDefault={calories:700,protein:35,carbs:60,fat:25};
  if(!S.nutrition.dinnerMacroPct){
    S.nutrition.dinnerMacroPct={protein:20,carbs:35,fat:45};
    recalcDinnerMacrosFromPct();
  }
  if(S.nutrition.beerCalories==null)S.nutrition.beerCalories=150;
  if(!S.nutrition.shoppingSelectedDates)S.nutrition.shoppingSelectedDates=[];
  if(!S.nutrition.pool)S.nutrition.pool=[];
  if(!S.nutrition.log)S.nutrition.log={};
  if(!S.nutrition.shoppingChecked)S.nutrition.shoppingChecked={};
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
  if(n==='nutrition')renderNutrition();
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
function markTodayActivityDone(actKey){
  ensureNewFields();
  var todayIdx=jsDayToIndex(new Date().getDay());
  if(!S.activitySchedule[actKey])S.activitySchedule[actKey]=[];
  if(!S.activitySchedule[actKey].includes(todayIdx))S.activitySchedule[actKey].push(todayIdx);
  var key=todayStr()+'_'+actKey;
  if(!(S.activityDone||[]).includes(key))S.activityDone.push(key);
}
function saveWorkout(){
  if(!S.today.exercises.length){showToast('Geen oefeningen');return;}
  var ts=todayStr();
  var entry={date:ts,exercises:JSON.parse(JSON.stringify(S.today.exercises)),note:S.today.note,schemaName:S.today.schemaName||''};
  var idx=S.history.findIndex(function(h){return h.date===ts;});if(idx>=0)S.history[idx]=entry;else S.history.push(entry);
  S.today={exercises:[],note:''};
  markTodayActivityDone('gym');
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

/* ─── VOEDING ─── */
var MEAL_LABELS={ontbijt:'Ontbijt',lunch:'Lunch',snack:'Snacks'};
function mealLogKey(mealType){return mealType==='snack'?'snacks':mealType;}
var nutritionViewDate=null;
function getNutritionLog(date){
  ensureNewFields();
  var ts=date||nutritionViewDate||todayStr();
  if(!S.nutrition.log[ts])S.nutrition.log[ts]={ontbijt:[],lunch:[],snacks:[],workday:false,beers:0,carryOverDecision:null};
  var entry=S.nutrition.log[ts];
  if(!Array.isArray(entry.ontbijt))entry.ontbijt=entry.ontbijt?[entry.ontbijt]:[];
  if(!Array.isArray(entry.lunch))entry.lunch=entry.lunch?[entry.lunch]:[];
  if(!Array.isArray(entry.snacks))entry.snacks=[];
  if(entry.workday==null)entry.workday=false;
  if(entry.beers==null)entry.beers=0;
  if(entry.carryOverDecision===undefined)entry.carryOverDecision=null;
  return entry;
}
function getPrevDateStr(date){
  var d=new Date(date+'T12:00:00');d.setDate(d.getDate()-1);return localDateStr(d);
}
function changeNutritionDay(delta){
  var d=new Date((nutritionViewDate||todayStr())+'T12:00:00');
  d.setDate(d.getDate()+delta);
  nutritionViewDate=localDateStr(d);
  renderNutrition();
}
function goToNutritionToday(){nutritionViewDate=todayStr();renderNutrition();}
function toggleTodayWorkday(checked){
  var log=getNutritionLog();
  log.workday=checked;
  saveS();renderNutritionMeals();
}
function setBeers(val){
  var log=getNutritionLog();
  log.beers=Math.max(0,parseInt(val)||0);
  saveS();renderNutrition();
}
function resolveMealEntry(idOrObj){
  if(!idOrObj)return null;
  if(typeof idOrObj==='object')return idOrObj;
  return S.nutrition.pool.find(function(p){return p.id===idOrObj;});
}
function calcNutritionTotals(date){
  ensureNewFields();
  var log=getNutritionLog(date);
  var totals={calories:0,protein:0,carbs:0,fat:0};
  function addItem(idOrObj){
    var item=resolveMealEntry(idOrObj);
    if(!item)return;
    totals.calories+=item.calories||0;totals.protein+=item.protein||0;totals.carbs+=item.carbs||0;totals.fat+=item.fat||0;
  }
  (log.ontbijt||[]).forEach(addItem);
  (log.lunch||[]).forEach(addItem);
  (log.snacks||[]).forEach(addItem);
  var d=S.nutrition.dinnerDefault;
  totals.calories+=d.calories||0;totals.protein+=d.protein||0;totals.carbs+=d.carbs||0;totals.fat+=d.fat||0;
  totals.calories+=(log.beers||0)*(S.nutrition.beerCalories||0);
  return totals;
}
function getDayCalorieDiff(date){
  var totals=calcNutritionTotals(date);
  return (S.nutrition.targets.calories||0)-totals.calories;
}
function getEffectiveCalorieTarget(date){
  ensureNewFields();
  var log=getNutritionLog(date);
  var base=S.nutrition.targets.calories||0;
  if(log.carryOverDecision===true){
    var prevDate=getPrevDateStr(date||nutritionViewDate||todayStr());
    if(S.nutrition.log[prevDate])base+=getDayCalorieDiff(prevDate);
  }
  return base;
}
function setCarryOverDecision(val){
  var log=getNutritionLog();
  log.carryOverDecision=val;
  saveS();renderNutrition();
}
function renderNutritionCarryOver(){
  var wrap=document.getElementById('nutrition-carryover');if(!wrap)return;
  var viewDate=nutritionViewDate||todayStr();
  var prevDate=getPrevDateStr(viewDate);
  if(!S.nutrition.log[prevDate]){wrap.innerHTML='';return;}
  var diff=getDayCalorieDiff(prevDate);
  if(Math.abs(diff)<5){wrap.innerHTML='';return;}
  var log=getNutritionLog(viewDate);
  var isOver=diff<0;
  var absAmt=Math.round(Math.abs(diff));
  var desc=absAmt+' kcal '+(isOver?'boven':'onder')+' doel op '+fmtShort(prevDate);
  if(log.carryOverDecision===null){
    wrap.innerHTML='<div class="card" style="border-color:var(--warn);margin-bottom:13px"><div style="font-size:12px;margin-bottom:8px">'+desc+'. Verrekenen met vandaag ('+(isOver?'doel wordt lager':'doel wordt hoger')+')?</div><div style="display:flex;gap:7px"><button class="btn btn-primary btn-sm" onclick="setCarryOverDecision(true)">Ja, verrekenen</button><button class="btn btn-ghost btn-sm" onclick="setCarryOverDecision(false)">Nee</button></div></div>';
  }else{
    var applied=log.carryOverDecision;
    wrap.innerHTML='<div class="card" style="margin-bottom:13px;display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="font-size:12px;color:var(--muted)">'+(applied?'Verrekend: ':'Niet verrekend: ')+desc+'</div><button class="btn btn-ghost btn-sm" onclick="setCarryOverDecision(null)">Wijzig</button></div>';
  }
}
function renderNutrition(){
  ensureNewFields();
  if(!nutritionViewDate)nutritionViewDate=todayStr();
  var dd=document.getElementById('nutrition-date');if(dd)dd.textContent=fmtDate(nutritionViewDate);
  var isToday=nutritionViewDate===todayStr();
  var todayBtn=document.getElementById('nutrition-today-btn');if(todayBtn){todayBtn.disabled=isToday;todayBtn.style.opacity=isToday?'.4':'1';}
  renderNutritionCarryOver();
  renderNutritionProgress();
  renderNutritionMeals();
  renderShoppingList();
}
function renderNutritionProgress(){
  var wrap=document.getElementById('nutrition-progress');if(!wrap)return;
  var totals=calcNutritionTotals(nutritionViewDate);
  var t=S.nutrition.targets;
  var effCalTarget=getEffectiveCalorieTarget(nutritionViewDate);
  var rows=[
    {label:'Calorieën',unit:'kcal',val:totals.calories,target:effCalTarget},
    {label:'Eiwit',unit:'g',val:totals.protein,target:t.protein},
    {label:'Koolhydraten',unit:'g',val:totals.carbs,target:t.carbs},
    {label:'Vet',unit:'g',val:totals.fat,target:t.fat}
  ];
  wrap.innerHTML='<div class="stat-grid">'+rows.map(function(r){
    var remaining=r.target-r.val;
    var over=remaining<0;
    var display=Math.round(Math.abs(remaining));
    return'<div class="stat-card"><div class="stat-label">'+r.label+'</div><div class="stat-value" style="font-size:18px;color:'+(over?'var(--warn)':'var(--accent)')+'">'+display+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">'+(over?'te veel':'nog te gaan')+' ('+Math.round(r.val)+'/'+r.target+r.unit+')</div></div>';
  }).join('')+'</div>';
}
function renderNutritionMeals(){
  var wrap=document.getElementById('nutrition-meals');if(!wrap)return;
  var log=getNutritionLog();
  var wdToggle=document.getElementById('workday-toggle');if(wdToggle)wdToggle.checked=!!log.workday;
  var html='';
  ['ontbijt','lunch','snack'].forEach(function(mt){
    var allItems=S.nutrition.pool.filter(function(p){return p.mealType===mt;});
    var items=log.workday?allItems.filter(function(p){return p.workday;}):allItems;
    html+='<div class="act-section"><div class="act-header"><div class="act-title">'+MEAL_LABELS[mt]+'</div></div>';
    if(log.workday&&allItems.length&&!items.length){
      html+='<div style="font-size:12px;color:var(--muted);margin-bottom:7px">Geen werkdag-geschikte opties voor '+MEAL_LABELS[mt].toLowerCase()+' (via Instellingen toevoegen of markeren).</div>';
    }else if(!items.length){
      html+='<div style="font-size:12px;color:var(--muted);margin-bottom:7px">Nog geen opties toegevoegd (via Instellingen).</div>';
    }else if(log.workday&&items.length<allItems.length){
      html+='<div style="font-size:10px;color:var(--muted);margin-bottom:5px">'+(allItems.length-items.length)+' optie(s) verborgen (niet werkdag-geschikt)</div>';
    }
    var logKey=mealLogKey(mt);
    html+='<div style="display:flex;flex-wrap:wrap;gap:7px">';
    html+=items.map(function(it){
      var count=(log[logKey]||[]).filter(function(s){return s===it.id;}).length;
      var countBadge=count>0?' <span style="background:#0e0e0f;color:var(--accent);border-radius:10px;padding:1px 6px;font-size:10px;margin-left:2px">×'+count+'</span>':'';
      var minusBtn=count>0?'<span onclick="removeMealInstance(\\''+mt+'\\',\\''+it.id+'\\')" style="cursor:pointer;padding:2px 6px;font-weight:900">−</span>':'';
      return'<div class="chip" style="cursor:pointer;padding:8px 12px;display:flex;align-items:center;'+(count>0?'background:var(--accent);color:#0e0e0f;font-weight:700':'')+'"><span onclick="pickMeal(\\''+mt+'\\',\\''+it.id+'\\')">'+it.name+' <span style="opacity:.7;font-size:10px">('+it.calories+'kcal)</span>'+countBadge+'</span>'+minusBtn+'</div>';
    }).join('');
    (log[logKey]||[]).forEach(function(entry,idx){
      if(entry&&typeof entry==='object'){
        html+='<div class="chip" style="background:var(--accent);color:#0e0e0f;font-weight:700">✏️ '+entry.name+' <span style="opacity:.7;font-size:10px">('+entry.calories+'kcal)</span> <span style="cursor:pointer;margin-left:4px" onclick="removeCustomEntry(\\''+mt+'\\','+idx+')">✕</span></div>';
      }
    });
    html+='<div class="chip" style="cursor:pointer;border:1px dashed var(--border);color:var(--muted)" onclick="openCustomMeal(\\''+mt+'\\')">✏️ Zelf invullen</div>';
    html+='</div>';
    var uniqueIds=Array.from(new Set((log[logKey]||[]).filter(function(id){return typeof id==='string';})));
    var ingredientLines=uniqueIds.map(function(id){
      var si=S.nutrition.pool.find(function(p){return p.id===id;});
      return(si&&si.ingredients)?'<strong>'+si.name+':</strong> '+si.ingredients:null;
    }).filter(Boolean);
    if(ingredientLines.length){
      html+='<div style="font-size:11px;color:var(--muted);margin-top:7px;padding:8px 10px;background:var(--surface2);border-radius:8px;line-height:1.5">🛒 '+ingredientLines.join('<br>')+'</div>';
    }
    html+='</div>';
  });
  var d=S.nutrition.dinnerDefault;
  html+='<div class="act-section"><div class="act-header"><div class="act-title">Avondeten</div></div><div class="card" style="font-size:12px;color:var(--muted)">Vast geschat: '+d.calories+' kcal, '+d.protein+'g eiwit, '+d.carbs+'g koolhydraten, '+d.fat+'g vet — elke dag automatisch meegeteld</div></div>';
  html+='<div class="act-section"><div class="act-header"><div class="act-title">🍺 Biertjes</div></div><div class="card" style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:12px;color:var(--muted)">'+(S.nutrition.beerCalories||0)+' kcal per stuk</span><input type="number" min="0" style="width:64px" value="'+(log.beers||0)+'" onchange="setBeers(this.value)"></div></div>';
  wrap.innerHTML=html;
}
function pickMeal(mealType,itemId){
  ensureNewFields();
  var log=getNutritionLog();
  log[mealLogKey(mealType)].push(itemId);
  saveS();renderNutrition();
}
function removeMealInstance(mealType,itemId){
  ensureNewFields();
  var log=getNutritionLog();
  var arr=log[mealLogKey(mealType)];
  var idx=arr.lastIndexOf(itemId);
  if(idx>=0)arr.splice(idx,1);
  saveS();renderNutrition();
}
var __customMealTarget=null;
function openCustomMeal(mealType){
  __customMealTarget=mealType;
  document.getElementById('custom-meal-name').value='';
  document.getElementById('custom-meal-cal').value='0';
  document.getElementById('custom-meal-protein-pct').value='20';
  openModal('m-custom-meal');
}
function confirmCustomMeal(){
  ensureNewFields();
  var name=document.getElementById('custom-meal-name').value.trim()||'Zelf ingevuld';
  var cal=Math.max(0,parseInt(document.getElementById('custom-meal-cal').value)||0);
  var pct=Math.max(0,Math.min(100,parseInt(document.getElementById('custom-meal-protein-pct').value)||0));
  var protein=Math.round((cal*pct/100)/4);
  var entry={custom:true,name:name,calories:cal,protein:protein,carbs:0,fat:0};
  var log=getNutritionLog();
  log[mealLogKey(__customMealTarget)].push(entry);
  saveS();closeModal('m-custom-meal');renderNutrition();showToast('Toegevoegd');
}
function removeCustomEntry(mealType,idx){
  var log=getNutritionLog();
  log[mealLogKey(mealType)].splice(idx,1);
  saveS();renderNutrition();
}
var __shoppingList=[];
function renderShoppingDayPicker(){
  var wrap=document.getElementById('shopping-day-picker');if(!wrap)return;
  ensureNewFields();
  var html='';
  for(var i=0;i<14;i++){
    var d=new Date(todayStr()+'T12:00:00');d.setDate(d.getDate()+i);
    var ds=localDateStr(d);
    var selected=S.nutrition.shoppingSelectedDates.includes(ds);
    html+='<div class="day-pill" style="'+(selected?'background:var(--accent);border-color:var(--accent);color:#0e0e0f':'')+'" onclick="toggleShoppingDate(\\''+ds+'\\')"><div class="dp-name">'+DAY_NAMES[jsDayToIndex(d.getDay())]+'</div><div style="font-size:9px;margin-top:2px">'+fmtShort(ds)+'</div></div>';
  }
  wrap.innerHTML=html;
}
function toggleShoppingDate(ds){
  ensureNewFields();
  var idx=S.nutrition.shoppingSelectedDates.indexOf(ds);
  if(idx>=0)S.nutrition.shoppingSelectedDates.splice(idx,1);
  else S.nutrition.shoppingSelectedDates.push(ds);
  saveS();renderShoppingDayPicker();renderShoppingList();
}
function renderShoppingList(){
  var wrap=document.getElementById('shopping-list');if(!wrap)return;
  ensureNewFields();
  renderShoppingDayPicker();
  var dates=S.nutrition.shoppingSelectedDates;
  if(!dates.length){wrap.innerHTML='<p style="font-size:13px;color:var(--muted)">Selecteer hierboven voor welke dag(en) je boodschappen wil doen.</p>';return;}
  var counts={};
  dates.forEach(function(ds){
    var log=S.nutrition.log[ds];
    if(!log)return;
    var ids=[];
    (log.ontbijt||[]).forEach(function(id){ids.push(id);});
    (log.lunch||[]).forEach(function(id){ids.push(id);});
    (log.snacks||[]).forEach(function(id){ids.push(id);});
    ids.forEach(function(id){
      var item=resolveMealEntry(id);
      if(!item||!item.ingredients)return;
      var store=(item.store||'').trim()||'Overig';
      (item.ingredients||'').split(',').map(function(s){return s.trim();}).filter(Boolean).forEach(function(ing){
        var key=store+'::'+ing;
        counts[key]=(counts[key]||0)+1;
      });
    });
  });
  var keys=Object.keys(counts);
  if(!keys.length){wrap.innerHTML='<p style="font-size:13px;color:var(--muted)">Nog geen maaltijden gekozen voor de geselecteerde dag(en). Blader met de pijltjes bovenaan naar die dagen en kies alvast wat je gaat eten.</p>';return;}
  __shoppingList=keys.map(function(k){var idx=k.indexOf('::');return{store:k.slice(0,idx),text:k.slice(idx+2),count:counts[k]};});
  var byStore={};
  __shoppingList.forEach(function(item,i){
    if(!byStore[item.store])byStore[item.store]=[];
    byStore[item.store].push(i);
  });
  var stores=Object.keys(byStore).sort();
  wrap.innerHTML=stores.map(function(store){
    var rows=byStore[store].map(function(i){
      var item=__shoppingList[i];
      var checked=!!S.nutrition.shoppingChecked[store+'::'+item.text];
      var countLbl=item.count>1?' <span style="opacity:.6">(x'+item.count+')</span>':'';
      return'<div class="checklist-item"><input type="checkbox" class="checklist-cb"'+(checked?' checked':'')+' onchange="toggleShoppingItem('+i+',this.checked)"><div class="checklist-act '+(checked?'done':'')+'">'+item.text+countLbl+'</div></div>';
    }).join('');
    return'<div style="margin-bottom:13px"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">'+store+'</div>'+rows+'</div>';
  }).join('');
}
function toggleShoppingItem(i,checked){
  ensureNewFields();
  var item=__shoppingList[i];if(!item)return;
  S.nutrition.shoppingChecked[item.store+'::'+item.text]=checked;
  saveS();
}
function recalcMacroTargetsFromPct(){
  var cals=S.nutrition.targets.calories||0;
  var pct=S.nutrition.macroPct;
  S.nutrition.targets.protein=Math.round((cals*pct.protein/100)/4);
  S.nutrition.targets.carbs=Math.round((cals*pct.carbs/100)/4);
  S.nutrition.targets.fat=Math.round((cals*pct.fat/100)/9);
}
function setNutritionTarget(key,val){
  ensureNewFields();
  S.nutrition.targets[key]=Math.max(0,parseInt(val)||0);
  if(key==='calories')recalcMacroTargetsFromPct();
  saveS();renderSettings();renderNutrition();
}
function setMacroPct(key,val){
  ensureNewFields();
  var v=Math.max(0,Math.min(100,parseInt(val)||0));
  var p=S.nutrition.macroPct;
  if(key==='protein')p.protein=Math.min(v,100-p.carbs);
  else if(key==='carbs')p.carbs=Math.min(v,100-p.protein);
  p.fat=100-p.protein-p.carbs;
  recalcMacroTargetsFromPct();
  saveS();renderSettings();renderNutrition();
}
function recalcDinnerMacrosFromPct(){
  var cals=S.nutrition.dinnerDefault.calories||0;
  var pct=S.nutrition.dinnerMacroPct;
  S.nutrition.dinnerDefault.protein=Math.round((cals*pct.protein/100)/4);
  S.nutrition.dinnerDefault.carbs=Math.round((cals*pct.carbs/100)/4);
  S.nutrition.dinnerDefault.fat=Math.round((cals*pct.fat/100)/9);
}
function setDinnerDefault(key,val){
  ensureNewFields();
  S.nutrition.dinnerDefault[key]=Math.max(0,parseInt(val)||0);
  if(key==='calories')recalcDinnerMacrosFromPct();
  saveS();renderSettings();renderNutrition();
}
function setDinnerMacroPct(key,val){
  ensureNewFields();
  var v=Math.max(0,Math.min(100,parseInt(val)||0));
  var p=S.nutrition.dinnerMacroPct;
  if(key==='protein')p.protein=Math.min(v,100-p.carbs);
  else if(key==='carbs')p.carbs=Math.min(v,100-p.protein);
  p.fat=100-p.protein-p.carbs;
  recalcDinnerMacrosFromPct();
  saveS();renderSettings();renderNutrition();
}
function setBeerCalories(val){
  ensureNewFields();
  S.nutrition.beerCalories=Math.max(0,parseInt(val)||0);
  saveS();renderSettings();renderNutrition();
}
function openAddFood(){
  document.getElementById('food-name').value='';
  document.getElementById('food-mealtype').value='ontbijt';
  document.getElementById('food-cal').value='0';
  document.getElementById('food-protein').value='0';
  document.getElementById('food-carbs').value='0';
  document.getElementById('food-fat').value='0';
  document.getElementById('food-ingredients').value='';
  document.getElementById('food-store').value='';
  document.getElementById('food-workday').checked=false;
  openModal('m-add-food');
}
function addFoodItem(){
  var name=document.getElementById('food-name').value.trim();
  if(!name){showToast('Vul een naam in');return;}
  ensureNewFields();
  S.nutrition.pool.push({
    id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    name:name,
    mealType:document.getElementById('food-mealtype').value,
    calories:parseInt(document.getElementById('food-cal').value)||0,
    protein:parseInt(document.getElementById('food-protein').value)||0,
    carbs:parseInt(document.getElementById('food-carbs').value)||0,
    fat:parseInt(document.getElementById('food-fat').value)||0,
    ingredients:document.getElementById('food-ingredients').value.trim(),
    store:document.getElementById('food-store').value.trim(),
    workday:document.getElementById('food-workday').checked
  });
  saveS();closeModal('m-add-food');renderFoodPoolList();renderNutrition();showToast('Toegevoegd');
}
function removeFoodItem(id){
  if(!confirm('Deze optie verwijderen?'))return;
  ensureNewFields();
  S.nutrition.pool=S.nutrition.pool.filter(function(p){return p.id!==id;});
  saveS();renderFoodPoolList();renderNutrition();showToast('Verwijderd');
}
function renderFoodPoolList(){
  var wrap=document.getElementById('food-pool-list');if(!wrap)return;
  ensureNewFields();
  if(!S.nutrition.pool.length){wrap.innerHTML='<p style="font-size:12px;color:var(--muted)">Nog geen opties toegevoegd.</p>';return;}
  wrap.innerHTML=S.nutrition.pool.map(function(p){
    return'<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--surface2)"><div style="flex:1"><div style="font-weight:600;font-size:13px">'+p.name+'</div><div style="font-size:11px;color:var(--muted)">'+MEAL_LABELS[p.mealType]+' · '+p.calories+'kcal · '+p.protein+'g eiwit'+(p.store?' · '+p.store:'')+(p.workday?' · werkdag':'')+'</div>'+(p.ingredients?'<div style="font-size:10px;color:var(--muted);margin-top:2px;font-style:italic">'+p.ingredients+'</div>':'')+'</div><button class="btn-icon" onclick="removeFoodItem(\\''+p.id+'\\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';
  }).join('');
}
function buildNutritionAiPrompt(){
  ensureNewFields();
  var t=S.nutrition.targets,d=S.nutrition.dinnerDefault;
  var remCal=Math.max(0,t.calories-d.calories);
  var remProtein=Math.max(0,t.protein-d.protein);
  var remCarbs=Math.max(0,t.carbs-d.carbs);
  var remFat=Math.max(0,t.fat-d.fat);
  return 'Ik wil voedingsopties voor ontbijt, lunch en snacks in dit exacte JSON-formaat. Geef ALLEEN de JSON terug, zonder uitleg en zonder markdown code-block eromheen:\\n\\n'
    +'[\\n'
    +'  { "name": "Naam van het gerecht", "mealType": "ontbijt", "calories": 380, "protein": 32, "carbs": 40, "fat": 8, "ingredients": "kwark 250g, havermout 40g, banaan 1 stuk, walnoten 15g", "workday": true }\\n'
    +']\\n\\n'
    +'Regels:\\n'
    +'- "mealType" is altijd een van: "ontbijt", "lunch", "snack"\\n'
    +'- "calories", "protein", "carbs", "fat" zijn getallen (kcal/gram), geen tekst\\n'
    +'- "workday" is true als het zonder bereiding of met heel weinig moeite te maken/mee te nemen is, anders false\\n'
    +'- "ingredients" MOET voor elk ingrediënt een concrete hoeveelheid met eenheid bevatten (bijv. "250g", "1 stuk", "2 sneetjes", "1 el") — nooit een ingrediënt zonder hoeveelheid\\n\\n'
    +'Mijn situatie:\\n'
    +'- Avondeten (vast, telt al mee, hoef je niet in te vullen): '+d.calories+' kcal, '+d.protein+'g eiwit, '+d.carbs+'g koolhydraten, '+d.fat+'g vet\\n'
    +'- Wat ontbijt + lunch + snacks SAMEN per dag ongeveer moeten opleveren (dagdoel min avondeten): '+remCal+' kcal, '+remProtein+'g eiwit, '+remCarbs+'g koolhydraten, '+remFat+'g vet\\n\\n'
    +'Maak het volgende:\\n'
    +'- 5 ontbijtopties: mag iets uitgebreider (bijv. havermout of eieren klaarmaken), maar hou het simpel, weinig kooktijd\\n'
    +'- 5 lunchopties, waarvan minstens 3 heel simpel en "workday": true — denk aan kant-en-klare bakkerijproducten (bijv. afgebakken snijbroodjes of kaasbroodjes van de supermarkt) met simpel beleg erop, geen bereiding nodig\\n'
    +'- 4 snackopties\\n\\n'
    +'Let bij het kiezen van ingrediënten op:\\n'
    +'- Veel eiwit, gevarieerd qua voedingsstoffen/vitamines (niet steeds hetzelfde)\\n'
    +'- Budgetvriendelijk — geef de voorkeur aan ingrediënten die je in bulk koopt en over meerdere dagen/maaltijden gebruikt (bijv. een brood, een pak kwark, een blok kaas) in plaats van iets wat je per portie apart moet kopen\\n'
    +'- Gangbare boodschappen bij een Nederlandse supermarkt';
}
function initVoiceButton(){
  var micBtn=document.getElementById('ai-mic-btn');
  if(!micBtn)return;
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  micBtn.style.display=SR?'':'none';
}
var __recognition=null;
function startVoiceInput(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){showToast('Spraakherkenning niet ondersteund op dit apparaat');return;}
  var micBtn=document.getElementById('ai-mic-btn');
  if(__recognition){__recognition.stop();__recognition=null;if(micBtn)micBtn.style.color='';return;}
  __recognition=new SR();
  __recognition.lang='nl-NL';
  __recognition.interimResults=false;
  __recognition.maxAlternatives=1;
  if(micBtn)micBtn.style.color='var(--danger)';
  __recognition.onresult=function(e){
    var text=e.results[0][0].transcript;
    var inp=document.getElementById('ai-nutrition-request');
    if(inp)inp.value=text;
  };
  __recognition.onerror=function(){showToast('Spraakherkenning mislukt');};
  __recognition.onend=function(){__recognition=null;if(micBtn)micBtn.style.color='';};
  __recognition.start();
}
async function requestAiNutritionOptions(){
  ensureNewFields();
  var reqInp=document.getElementById('ai-nutrition-request');
  var reqText=reqInp?reqInp.value.trim():'';
  if(!reqText){showToast('Vul in wat je erbij wil');return;}
  var statusEl=document.getElementById('ai-generate-status');
  var btn=document.getElementById('ai-generate-btn');
  if(btn){btn.disabled=true;btn.textContent='Bezig...';}
  if(statusEl)statusEl.textContent='';
  try{
    var res=await fetch('/api/nutrition-ai',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        request:reqText,
        pool:S.nutrition.pool.map(function(p){return{name:p.name,mealType:p.mealType,calories:p.calories,protein:p.protein};}),
        targets:S.nutrition.targets,
        dinnerDefault:S.nutrition.dinnerDefault
      })
    });
    var data=await res.json();
    if(!res.ok)throw new Error(data.error||'Serverfout');
    var items=data.items||[];
    if(!items.length){showToast('Geen nieuwe opties ontvangen');}
    items.forEach(function(it,idx){
      if(!it.name||!it.mealType)return;
      S.nutrition.pool.push({
        id:Date.now().toString(36)+Math.random().toString(36).slice(2,6)+idx,
        name:it.name,
        mealType:it.mealType,
        calories:parseInt(it.calories)||0,
        protein:parseInt(it.protein)||0,
        carbs:parseInt(it.carbs)||0,
        fat:parseInt(it.fat)||0,
        ingredients:it.ingredients||'',
        workday:!!it.workday,
        store:it.store||''
      });
    });
    saveS();renderFoodPoolList();renderNutrition();
    if(items.length){
      if(reqInp)reqInp.value='';
      showToast(items.length+' nieuwe optie(s) toegevoegd!');
    }
  }catch(err){
    if(statusEl)statusEl.textContent='Fout: '+err.message;
    showToast('Fout: '+err.message);
  }
  if(btn){btn.disabled=false;btn.textContent='Genereer';}
}
function copyNutritionAiPrompt(){
  var prompt=buildNutritionAiPrompt();
  navigator.clipboard.writeText(prompt).then(function(){
    showToast('Prompt gekopieerd! Plak in ChatGPT/Claude');
  }).catch(function(){
    showToast('Kopieren mislukt, probeer opnieuw');
  });
}
function parseAiJson(text){
  var t=(text||'').trim();
  var fenceMatch=t.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i);
  if(fenceMatch)t=fenceMatch[1].trim();
  try{
    return JSON.parse(t);
  }catch(e){
    var start=t.search(/[\[{]/);
    var end=Math.max(t.lastIndexOf(']'),t.lastIndexOf('}'));
    if(start>=0&&end>start){
      return JSON.parse(t.slice(start,end+1));
    }
    throw e;
  }
}
function importFoodItemsFromText(text){
  try{
    var data=parseAiJson(text);
    var items=Array.isArray(data)?data:[data];
    ensureNewFields();
    var added=0;
    items.forEach(function(it){
      if(!it.name||!it.mealType)return;
      S.nutrition.pool.push({
        id:Date.now().toString(36)+Math.random().toString(36).slice(2,6)+added,
        name:it.name,
        mealType:it.mealType,
        calories:parseInt(it.calories)||0,
        protein:parseInt(it.protein)||0,
        carbs:parseInt(it.carbs)||0,
        fat:parseInt(it.fat)||0,
        ingredients:it.ingredients||'',
        workday:!!it.workday,
        store:it.store||''
      });
      added++;
    });
    saveS();renderFoodPoolList();renderNutrition();showToast(added+' voedingsopties geimporteerd');
    return true;
  }catch(err){showToast('Fout: '+err.message);return false;}
}
var __importTarget=null;
function openImportSchema(){__importTarget='schema';document.getElementById('import-text-title').textContent='Schema importeren';document.getElementById('import-text-area').value='';openModal('m-import-text');}
function openImportFood(){__importTarget='food';document.getElementById('import-text-title').textContent='Voeding importeren';document.getElementById('import-text-area').value='';openModal('m-import-text');}
function confirmImportText(){
  var text=document.getElementById('import-text-area').value.trim();
  if(!text){showToast('Plak eerst de tekst van de AI');return;}
  var ok=false;
  if(__importTarget==='schema')ok=importProgramFromText(text);
  else if(__importTarget==='food')ok=importFoodItemsFromText(text);
  if(ok)closeModal('m-import-text');
}

/* ─── HISTORIE ─── */
function renderHistory(){
  var list=document.getElementById('hist-list');var empty=document.getElementById('hist-empty');
  if(!S.history.length){list.innerHTML='';empty.style.display='';return;}empty.style.display='none';
  var sorted=S.history.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  list.innerHTML=sorted.map(function(day,idx){
    var exCount=day.exercises.reduce(function(sum,b){return sum+b.exercises.length;},0);
    var allNames=day.exercises.flatMap(function(b){return b.exercises.map(function(e){return e.name;});});
    var label=day.schemaName?day.schemaName:allNames.slice(0,3).join(', ')+(allNames.length>3?'...':'');
    var blocksHtml=day.exercises.map(function(block){
      var exHtml=block.exercises.map(function(ex){
        var chips=(ex.setData||[]).filter(function(s){return s&&s.weight;}).map(function(s){return'<span class="chip">'+s.weight+'kg x '+(s.reps||'?')+'</span>';}).join('');
        var tl=ex.type==='warmup'?'<span class="badge badge-warmup" style="font-size:9px">warmup</span>':'';
        var nl=ex.note?'<div style="font-size:11px;color:var(--muted);margin-top:3px;font-style:italic">"'+ex.note+'"</div>':'';
        return'<div class="hd-ex"><div class="hd-ex-name">'+ex.name+tl+'</div><div class="hd-chips">'+(chips||'<span style="font-size:11px;color:var(--muted)">'+ex.sets+'x'+ex.reps+'</span>')+'</div>'+nl+'</div>';
      }).join('');
      if(block.type==='superset'){
        return'<div class="superset-block"><div class="superset-header" style="padding:5px 10px;font-size:10px">Superset</div>'+exHtml+'</div>';
      }
      return exHtml;
    }).join('');
    var nl=day.note?'<div style="margin-top:6px;padding:7px 10px;background:var(--surface2);border-radius:7px;font-size:12px;color:var(--muted)">'+day.note+'</div>':'';
    return'<div class="history-day">'
      +'<div class="hd-header" style="cursor:pointer" onclick="toggleHistoryDetail('+idx+')">'
        +'<span>'+fmtDate(day.date)+(label?' — '+label:'')+'</span>'
        +'<span style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
          +'<span>'+exCount+' oef.</span>'
          +'<button style="background:none;border:none;cursor:pointer;color:var(--danger);padding:4px" onclick="event.stopPropagation();deleteHistoryDay(\\''+day.date+'\\')" title="Training verwijderen"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>'
          +'<svg id="hist-chevron-'+idx+'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform .15s;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>'
        +'</span>'
      +'</div>'
      +'<div id="hist-detail-'+idx+'" style="display:none;padding-top:7px">'+blocksHtml+nl+'</div>'
    +'</div>';
  }).join('');
}
function deleteHistoryDay(date){
  if(!confirm('Deze training verwijderen uit je historie?'))return;
  S.history=S.history.filter(function(h){return h.date!==date;});
  saveS();renderHistory();showToast('Training verwijderd');
}
function toggleHistoryDetail(idx){
  var el=document.getElementById('hist-detail-'+idx);
  var chevron=document.getElementById('hist-chevron-'+idx);
  if(!el)return;
  var isOpen=el.style.display!=='none';
  el.style.display=isOpen?'none':'block';
  if(chevron)chevron.style.transform=isOpen?'':'rotate(180deg)';
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
  list.innerHTML=S.programs.map(function(p){
    return'<div class="prog-card" style="display:flex;align-items:center;gap:8px;cursor:default"><div style="flex:1;cursor:pointer" onclick="openProgDetail(\\''+p.id+'\\')"><div class="prog-card-title">'+p.name+'</div><div class="prog-card-meta">'+p.exercises.length+' oefen. - '+p.exercises.map(function(e){return e.name;}).slice(0,3).join(', ')+(p.exercises.length>3?'...':'')+'</div></div><button class="btn-icon" onclick="event.stopPropagation();deleteProgram(\\''+p.id+'\\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button></div>';
  }).join('');
}
function deleteProgram(id){
  if(!confirm('Schema verwijderen?'))return;
  S.programs=S.programs.filter(function(p){return p.id!==id;});
  saveS();renderPrograms();renderWkSchemaSelect();showToast('Schema verwijderd');
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
function importProgramFromText(text){
  try{
    var data=parseAiJson(text);
    var ps=Array.isArray(data)?data:[data];
    ps.forEach(function(p){if(!p.name||!p.exercises)throw new Error('Ongeldig formaat');S.programs.push({id:Date.now().toString()+Math.random(),name:p.name,exercises:p.exercises});});
    saveS();renderPrograms();renderWkSchemaSelect();showToast(ps.length+" schema's geimporteerd");
    return true;
  }catch(err){showToast('Fout: '+err.message);return false;}
}
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
  initVoiceButton();
  var t=S.nutrition.targets,d=S.nutrition.dinnerDefault,mp=S.nutrition.macroPct;
  var ct=document.getElementById('set-cal-target');if(ct)ct.value=t.calories;
  var ppct=document.getElementById('set-protein-pct');if(ppct)ppct.value=mp.protein;
  var kpct=document.getElementById('set-carbs-pct');if(kpct)kpct.value=mp.carbs;
  var fpct=document.getElementById('set-fat-pct');if(fpct)fpct.value=mp.fat;
  var gramsPreview=document.getElementById('macro-grams-preview');
  if(gramsPreview)gramsPreview.textContent='= '+t.protein+'g eiwit, '+t.carbs+'g koolhydraten, '+t.fat+'g vet per dag';
  var dmp=S.nutrition.dinnerMacroPct;
  var dc=document.getElementById('set-dinner-cal');if(dc)dc.value=d.calories;
  var dppct=document.getElementById('set-dinner-protein-pct');if(dppct)dppct.value=dmp.protein;
  var dkpct=document.getElementById('set-dinner-carbs-pct');if(dkpct)dkpct.value=dmp.carbs;
  var dfpct=document.getElementById('set-dinner-fat-pct');if(dfpct)dfpct.value=dmp.fat;
  var dinnerGramsPreview=document.getElementById('dinner-grams-preview');
  if(dinnerGramsPreview)dinnerGramsPreview.textContent='= '+d.protein+'g eiwit, '+d.carbs+'g koolhydraten, '+d.fat+'g vet';
  var beerCal=document.getElementById('set-beer-cal');if(beerCal)beerCal.value=S.nutrition.beerCalories;
  renderFoodPoolList();
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
