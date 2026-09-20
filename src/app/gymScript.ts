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
  askConfirm('Google Agenda loskoppelen?','Loskoppelen',function(){gcalToken='';localStorage.removeItem('gymtracker_gcal_token');updateGcalUI();showToast('Losgekoppeld');});
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
  askConfirm('Verwijder alle '+allIds.length+' events uit je Google Agenda?','Verwijderen',__deleteGcalConfirmed);
}
async function __deleteGcalConfirmed(){
  var allIds=gcalAllIds();
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
  if(!S._deletedHistoryDates)S._deletedHistoryDates=[];
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
/* Voordat we de hele S-blob overschrijven: haal de nieuwste remote data op en vul
   lokaal ontbrekende dagen/items aan. Voorkomt dat een oud openstaand tabblad
   (met verouderde S in het geheugen) recentere logs van een ander tabblad/toestel
   overschrijft en zo laat "verdwijnen". */
function mergeRemoteIntoLocal(remote){
  if(!remote)return;
  ensureNewFields();
  var deletedHist={};(S._deletedHistoryDates||[]).forEach(function(d){deletedHist[d]=true;});
  if(Array.isArray(remote.history)){
    var localDates={};S.history.forEach(function(h){localDates[h.date]=true;});
    remote.history.forEach(function(h){if(!localDates[h.date]&&!deletedHist[h.date])S.history.push(h);});
  }
  if(Array.isArray(remote.activityDone)){
    var doneSet={};S.activityDone.forEach(function(k){doneSet[k]=true;});
    remote.activityDone.forEach(function(k){if(!doneSet[k]){S.activityDone.push(k);doneSet[k]=true;}});
  }
  if(remote.exerciseNotes){
    Object.keys(remote.exerciseNotes).forEach(function(k){if(!S.exerciseNotes[k])S.exerciseNotes[k]=remote.exerciseNotes[k];});
  }
}
var __saveTimer=null;
async function __doSaveS(){
  try{
    var res=await window.supabase.from('gym_state').select('data').eq('user_id',window.currentUserId).maybeSingle();
    if(!res.error&&res.data&&res.data.data)mergeRemoteIntoLocal(res.data.data);
  }catch(e){}
  window.supabase.from('gym_state').update({data:S,updated_at:new Date().toISOString()}).eq('user_id',window.currentUserId).then(function(res){
    if(res.error)console.error('Opslaan mislukt:',res.error.message);
  });
}
function saveS(){
  clearTimeout(__saveTimer);
  __saveTimer=setTimeout(function(){__saveTimer=null;__doSaveS();},350);
}
/* Als de app naar de achtergrond gaat (tab wisselen, app sluiten op telefoon) direct
   opslaan i.p.v. te wachten op de debounce-timer — anders kan een net opgeslagen
   training verloren gaan omdat de pagina al weg is voor de timer afgaat. */
function __flushSave(){
  if(__saveTimer){clearTimeout(__saveTimer);__saveTimer=null;__doSaveS();}
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')__flushSave();});
window.addEventListener('pagehide',__flushSave);
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
function todayStr(){return localDateStr(new Date());}
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
  if(n==='programs'){renderPrograms();}
  if(n==='planner')renderPlanner();
  if(n==='settings')renderSettings();
  if(n==='workout'){renderWkSchemaSelect();renderWorkout();}
}
function closeModal(id){document.getElementById(id).classList.add('hidden');}
function openModal(id){document.getElementById(id).classList.remove('hidden');}
var __confirmFn=null;
function askConfirm(msg,label,fn){
  __confirmFn=fn;
  document.getElementById('confirm-msg').textContent=msg;
  document.getElementById('confirm-yes').textContent=label||'Ja';
  openModal('m-confirm');
}
function confirmYes(){var fn=__confirmFn;__confirmFn=null;closeModal('m-confirm');if(fn)fn();}
function confirmNo(){__confirmFn=null;closeModal('m-confirm');}

/* ─── TIMER ─── */
function startTimer(){if(timerIv)return;timerStart=timerStart||Date.now();timerIv=setInterval(tickTimer,1000);document.getElementById('timer-bar').classList.add('vis');tickTimer();}
function tickTimer(){var e=Math.floor((Date.now()-timerStart)/1000);document.getElementById('timer-display').textContent=String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');}
function stopTimer(){askConfirm('Timer stoppen?','Stoppen',function(){clearInterval(timerIv);timerIv=null;timerStart=null;document.getElementById('timer-bar').classList.remove('vis');});}

/* ─── WORKOUT ─── */
function isWarmupBlock(block){return block.type==='normal'&&block.exercises[0].type==='warmup';}
function renderWorkout(){
  var warmupWrap=document.getElementById('wk-warmup');
  var wrap=document.getElementById('wk-exercises');var empty=document.getElementById('wk-empty');
  renderDayBanner();renderLastTraining();
  empty.style.display=S.today.exercises.length?'none':'';
  var fin=document.getElementById('wk-finish');if(fin)fin.style.display=S.today.exercises.length?'':'none';
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
  div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><div><span class="badge badge-warmup" style="margin-right:6px">Warm-up</span><span style="font-weight:800;font-size:16px">'+ex.name+'</span></div><button class="btn-icon" onclick="remBlock('+bi+')"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button></div><div style="font-size:13px;color:var(--muted);margin-top:5px;font-family:var(--mono)">'+ex.sets+' sets x '+ex.reps+' reps</div>';
  return div;
}
function renderDayBanner(){
  var b=document.getElementById('day-banner');
  ensureNewFields();
  if(S.today.exercises.length&&S.today.startDate&&S.today.startDate!==todayStr()){
    b.innerHTML='<div class="rest-banner"><div style="font-size:13px;line-height:1.5">Deze training is gestart op <b>'+fmtDate(S.today.startDate)+'</b>. Bij afronden wordt hij op die dag opgeslagen.</div></div>';
    return;
  }
  var todayIdx=jsDayToIndex(new Date().getDay());
  var acts=S.activities.filter(function(a){return (S.activitySchedule[a.key]||[]).includes(todayIdx);});
  if(acts.length){
    var labels=acts.map(function(a){return'<span style="color:'+a.color+';font-weight:700">'+(a.emoji?a.emoji+' ':'')+a.name+'</span>';}).join('<span style="color:var(--muted)"> · </span>');
    b.innerHTML='<div class="train-banner"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><div><div style="font-size:13px">Vandaag: '+labels+'</div></div></div>';
  }else{
    b.innerHTML='<div class="rest-banner"><div style="font-size:13px;color:var(--muted)">Rustdag, laat je spieren herstellen 😴</div></div>';
  }
}
function renderLastTraining(){
  var wrap=document.getElementById('last-training-card');if(!wrap)return;
  if(!S.history.length){wrap.innerHTML='';return;}
  var last=S.history.slice().sort(function(a,b){return b.date.localeCompare(a.date);})[0];
  var names=last.exercises.flatMap(function(b){return b.exercises.map(function(e){return e.name;});});
  var label=last.schemaName?last.schemaName:(names.slice(0,3).join(', ')+(names.length>3?'...':''));
  wrap.innerHTML='<div class="card" style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Laatste training</div><div style="font-weight:700;font-size:14px">'+label+'</div></div><div class="date-badge">'+fmtShort(last.date)+'</div></div>';
}
function makeExCard(ex,bi,ei,inSS){
  var prev=getLastSets(ex.name);var pr=getPR(ex.name);
  var typeLabel=ex.type==='warmup'?'Warm-up':'';var rows='';
  for(var si=0;si<ex.sets;si++){
    var p=prev[si];var prevStr=p&&p.weight?(p.weight+'kg x '+(p.reps||'?')):'--';
    var cw=(ex.setData&&ex.setData[si])?ex.setData[si].weight:'';var cr=(ex.setData&&ex.setData[si])?ex.setData[si].reps:ex.reps;
    var delta='';if(p&&p.weight&&cw!==''){var d=parseFloat(cw)-p.weight;if(d>0)delta='<br><span class="dp-pos">+'+d+'kg</span>';else if(d<0)delta='<br><span class="dp-neg">'+d+'kg</span>';}
    var copyBtn=si>0?'<button class="icon-tap" style="color:var(--muted)" onclick="copyPrevSet('+bi+','+ei+','+si+')" title="Zelfde als vorige set"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16V4h9M8 8h12v12H8z"/></svg></button>':'';
    rows+='<tr><td style="color:var(--muted);font-family:var(--mono);font-size:11px;width:20px">'+(si+1)+'</td><td><input class="wi" type="text" inputmode="decimal" value="'+cw+'" placeholder="kg" onchange="updSet('+bi+','+ei+','+si+',\\'weight\\',this.value)"></td><td><input class="ri" type="text" inputmode="numeric" pattern="[0-9]*" value="'+cr+'" onchange="updSet('+bi+','+ei+','+si+',\\'reps\\',this.value)"></td><td class="prev-cell">'+prevStr+delta+'</td><td style="white-space:nowrap;text-align:right">'+copyBtn+'<button class="icon-tap" style="color:var(--danger)" onclick="remSet('+bi+','+ei+','+si+')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button></td></tr>';
  }
  var prHtml=pr?'<span class="pr-chip">PR: '+pr.weight+'kg x '+pr.reps+'</span>':'';
  var storedNote=S.exerciseNotes&&S.exerciseNotes[noteKey(ex.name)];
  var isPinned=!!(storedNote&&storedNote.pinned);
  var noteHtml=ex.note?'<div class="inline-note" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="flex:1">'+ex.note+'</div><button class="icon-tap" style="flex-shrink:0;margin:-8px -8px 0 0;color:'+(isPinned?'var(--accent)':'var(--muted)')+'" onclick="pinExNote('+bi+','+ei+')" title="'+(isPinned?'Gepind - altijd tonen':'Voor altijd tonen')+'"><svg width="20" height="20" viewBox="0 0 24 24" fill="'+(isPinned?'currentColor':'none')+'" stroke="currentColor" stroke-width="2"><path d="M12 17v5M8 3h8l-1 7 3 2.5V14H6v-1.5L9 10z"/></svg></button></div>':'';
  var div=document.createElement('div');div.className=inSS?'superset-ex':'card';
  div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9px"><div><div style="font-weight:800;font-size:17px;letter-spacing:-.01em">'+ex.name+'</div><div style="margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">'+(typeLabel?'<span class="badge badge-warmup">'+typeLabel+'</span>':'')+'<span style="font-size:13px;color:var(--muted)">'+ex.sets+' sets x '+ex.reps+' reps</span>'+prHtml+'</div></div>'+(inSS?'':'<button class="btn-icon" onclick="remBlock('+bi+')"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>')+'</div><table class="sets-table"><thead><tr><th>#</th><th>Kg</th><th>Reps</th><th>Vorige</th><th></th></tr></thead><tbody>'+rows+'</tbody></table><div class="ex-actions"><button class="btn btn-ghost btn-sm" onclick="addSet('+bi+','+ei+')">+ Set</button><button class="btn btn-ghost btn-sm" onclick="openExNote('+bi+','+ei+')">Notitie</button></div>'+noteHtml;
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
  if(!S.today.startDate)S.today.startDate=todayStr();
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
function markTodayActivityDone(actKey,dateStr){
  ensureNewFields();
  dateStr=dateStr||todayStr();
  var todayIdx=jsDayToIndex(new Date(dateStr+'T12:00:00').getDay());
  if(!S.activitySchedule[actKey])S.activitySchedule[actKey]=[];
  if(!S.activitySchedule[actKey].includes(todayIdx))S.activitySchedule[actKey].push(todayIdx);
  var key=dateStr+'_'+actKey;
  if(!(S.activityDone||[]).includes(key))S.activityDone.push(key);
}
function saveWorkout(){
  if(!S.today.exercises.length){showToast('Geen oefeningen');return;}
  var ts=S.today.startDate||todayStr();
  var logged=S.today.exercises.filter(function(b){return !isWarmupBlock(b);});
  if(logged.length){
    var entry={date:ts,exercises:JSON.parse(JSON.stringify(logged)),note:S.today.note,schemaName:S.today.schemaName||''};
    var idx=S.history.findIndex(function(h){return h.date===ts;});if(idx>=0)S.history[idx]=entry;else S.history.push(entry);
  }
  S.today={exercises:[],note:''};
  markTodayActivityDone('gym',ts);
  if(timerIv){clearInterval(timerIv);timerIv=null;timerStart=null;document.getElementById('timer-bar').classList.remove('vis');}
  saveS();showToast('Training opgeslagen!');
  renderWorkout();
}
function clearWorkout(){var doIt=function(){S.today={exercises:[],note:''};if(timerIv){clearInterval(timerIv);timerIv=null;timerStart=null;document.getElementById('timer-bar').classList.remove('vis');}saveS();renderWorkout();};if(S.today.exercises.length)askConfirm('Deze training wissen? Wat je nu hebt ingevuld gaat verloren.','Wissen',doIt);else doIt();}
function renderWkSchemaSelect(){var sel=document.getElementById('wk-schema-sel');sel.innerHTML='<option value="">Kies schema...</option>'+S.programs.map(function(p){return'<option value="'+p.id+'">'+p.name+'</option>';}).join('');}
function loadSchema(){
  var id=document.getElementById('wk-schema-sel').value;if(!id){showToast('Kies eerst een training');return;}
  var prog=S.programs.find(function(p){return p.id===id;});if(!prog)return;
  S.today.schemaName=prog.name;
  if(!S.today.startDate)S.today.startDate=todayStr();
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
function openImportSchema(){document.getElementById('import-text-title').textContent='Schema plakken';document.getElementById('import-text-area').value='';openModal('m-import-text');}
function confirmImportText(){
  var text=document.getElementById('import-text-area').value.trim();
  if(!text){showToast('Plak eerst het antwoord van de AI');return;}
  if(importProgramFromText(text))closeModal('m-import-text');
}

/* ─── HISTORIE ─── */
var histView=(function(){try{return localStorage.getItem('gym_hist_view')||'overzicht';}catch(e){return 'overzicht';}})();
function setHistoryView(v){histView=v;try{localStorage.setItem('gym_hist_view',v);}catch(e){}renderHistory();}
function histStats(day){
  var sets=0,vol=0,exN=0,skipped=0;
  day.exercises.forEach(function(b){b.exercises.forEach(function(ex){
    var did=0;
    (ex.setData||[]).forEach(function(st){if(st&&st.weight){did++;sets++;vol+=parseFloat(st.weight)*(parseFloat(st.reps)||0);}});
    if(did)exN++;else skipped++;
  });});
  return{ex:exN,skipped:skipped,sets:sets,vol:Math.round(vol)};
}
function histExerciseHtml(ex){
  var logged=(ex.setData||[]).filter(function(st){return st&&st.weight;});
  var tl=ex.type==='warmup'?'<span class="badge badge-warmup" style="font-size:9px;margin-left:6px">warm-up</span>':'';
  var nl=ex.note?'<div class="hist-note">"'+ex.note+'"</div>':'';
  if(histView==='detail'){
    var chips=logged.map(function(st,i){return'<span class="chip"><span style="color:var(--muted)">'+(i+1)+'</span> '+st.weight+'kg x '+(st.reps||'?')+'</span>';}).join('');
    return'<div class="hd-ex"><div class="hd-ex-name">'+ex.name+tl+'</div><div class="hd-chips">'+(chips||'<span class="hist-skip">Niet gedaan</span>')+'</div>'+nl+'</div>';
  }
  var right='<span class="hist-skip">Niet gedaan</span>';
  if(logged.length){
    var top=logged.reduce(function(m,st){return parseFloat(st.weight)>parseFloat(m.weight)?st:m;},logged[0]);
    right='<span class="hist-top">'+top.weight+' kg</span><span style="color:var(--muted)"> x '+(top.reps||'?')+'</span><div class="hist-sub">'+logged.length+(logged.length===1?' set':' sets')+(logged.length>1?': '+logged.map(function(st){return st.weight;}).join(' &middot; '):'')+'</div>';
  }
  return'<div class="hist-line"><div class="hist-line-name">'+ex.name+tl+'</div><div class="hist-line-val">'+right+'</div></div>'+nl;
}
function renderHistory(){
  var list=document.getElementById('hist-list');var empty=document.getElementById('hist-empty');var seg=document.getElementById('hist-seg');
  if(!S.history.length){list.innerHTML='';if(seg)seg.innerHTML='';empty.style.display='';return;}empty.style.display='none';
  if(seg)seg.innerHTML='<button class="'+(histView==='overzicht'?'on':'')+'" onclick="setHistoryView(\\'overzicht\\')">Overzicht</button><button class="'+(histView==='detail'?'on':'')+'" onclick="setHistoryView(\\'detail\\')">Alle sets</button>';
  var sorted=S.history.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
  var lastMonth='';
  list.innerHTML=sorted.map(function(day,idx){
    var d=new Date(day.date+'T12:00:00');
    var monthKey=day.date.slice(0,7);
    var monthHtml='';
    if(monthKey!==lastMonth){
      lastMonth=monthKey;
      var n=sorted.filter(function(x){return x.date.slice(0,7)===monthKey;}).length;
      monthHtml='<div class="hist-month"><span>'+d.toLocaleDateString('nl-NL',{month:'long',year:'numeric'})+'</span><span>'+n+' '+(n===1?'training':'trainingen')+'</span></div>';
    }
    var st=histStats(day);
    var allNames=day.exercises.flatMap(function(b){return b.exercises.map(function(e){return e.name;});});
    var label=day.schemaName?day.schemaName:allNames.slice(0,2).join(', ')+(allNames.length>2?'...':'');
    var meta=st.ex+(st.ex===1?' oefening':' oefeningen')+(st.skipped?' ('+st.skipped+' niet gedaan)':'')+(st.sets?' &middot; '+st.sets+' sets':'')+(st.vol?' &middot; '+st.vol.toLocaleString('nl-NL')+' kg':'');
    var blocksHtml=day.exercises.map(function(block){
      var exHtml=block.exercises.map(histExerciseHtml).join('');
      if(block.type==='superset')return'<div class="hist-ss"><div class="hist-ss-label">Superset</div>'+exHtml+'</div>';
      return exHtml;
    }).join('');
    var nl=day.note?'<div class="hist-daynote">'+day.note+'</div>':'';
    return monthHtml+'<div class="hist-card">'
      +'<div class="hist-head" onclick="toggleHistoryDetail('+idx+')">'
        +'<div class="hist-date"><div class="hist-dow">'+d.toLocaleDateString('nl-NL',{weekday:'short'})+'</div><div class="hist-dnum">'+d.getDate()+'</div><div class="hist-mon">'+d.toLocaleDateString('nl-NL',{month:'short'})+'</div></div>'
        +'<div class="hist-main"><div class="hist-title">'+(label||'Training')+'</div><div class="hist-meta">'+meta+'</div></div>'
        +'<svg id="hist-chevron-'+idx+'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.2" style="transition:transform .15s;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>'
      +'</div>'
      +'<div id="hist-detail-'+idx+'" class="hist-body" style="display:none">'+blocksHtml+nl
        +'<button class="btn btn-danger btn-sm" style="width:100%;margin-top:12px" onclick="deleteHistoryDay(\\''+day.date+'\\')">Training verwijderen</button></div>'
    +'</div>';
  }).join('');
}
function deleteHistoryDay(date){
  askConfirm('Deze training verwijderen uit je historie?','Verwijderen',function(){
  S.history=S.history.filter(function(h){return h.date!==date;});
  ensureNewFields();
  if(!S._deletedHistoryDates.includes(date))S._deletedHistoryDates.push(date);
  saveS();renderHistory();showToast('Training verwijderd');
  });
}
function toggleHistoryDetail(idx){
  var el=document.getElementById('hist-detail-'+idx);
  var chevron=document.getElementById('hist-chevron-'+idx);
  if(!el)return;
  var isOpen=el.style.display!=='none';
  el.style.display=isOpen?'none':'block';
  if(chevron)chevron.style.transform=isOpen?'':'rotate(180deg)';
}

/* ─── SCHEMA'S ─── */
function renderPrograms(){
  var list=document.getElementById('prog-list');var empty=document.getElementById('prog-empty');
  if(!S.programs.length){list.innerHTML='';empty.style.display='';return;}empty.style.display='none';
  list.innerHTML=S.programs.map(function(p){
    return'<div class="prog-card" style="display:flex;align-items:center;gap:8px;cursor:default"><div style="flex:1;cursor:pointer" onclick="openProgDetail(\\''+p.id+'\\')"><div class="prog-card-title">'+p.name+'</div><div class="prog-card-meta">'+p.exercises.length+' oefeningen · '+p.exercises.map(function(e){return e.name;}).slice(0,3).join(', ')+(p.exercises.length>3?'...':'')+'</div></div><button class="btn-icon" onclick="event.stopPropagation();deleteProgram(\\''+p.id+'\\')"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button></div>';
  }).join('');
}
function deleteProgram(id){
  askConfirm('Schema verwijderen?','Verwijderen',function(){
    S.programs=S.programs.filter(function(p){return p.id!==id;});
    saveS();renderPrograms();renderWkSchemaSelect();showToast('Schema verwijderd');
  });
}
var editProgId=null;
function escAttr(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function openCreateProg(){
  editProgId=null;tempProgEx=[];
  document.getElementById('prog-modal-title').textContent='Nieuw schema';
  document.getElementById('prog-name').value='';
  renderProgExList();openModal('m-create-prog');
}
function editProg(){
  var p=S.programs.find(function(x){return x.id===curProgId;});if(!p)return;
  closeModal('m-prog-detail');
  editProgId=p.id;
  tempProgEx=JSON.parse(JSON.stringify(p.exercises));
  document.getElementById('prog-modal-title').textContent='Schema bewerken';
  document.getElementById('prog-name').value=p.name;
  renderProgExList();openModal('m-create-prog');
}
function addProgEx(){tempProgEx.push({name:'',sets:3,reps:10,type:'normal',supersetPair:''});renderProgExList();}
function moveProgEx(i,dir){
  var j=i+dir;if(j<0||j>=tempProgEx.length)return;
  var t=tempProgEx[i];tempProgEx[i]=tempProgEx[j];tempProgEx[j]=t;
  renderProgExList();
}
function removeProgEx(i){tempProgEx.splice(i,1);renderProgExList();}
function renderProgExList(){
  var w=document.getElementById('prog-ex-list');
  if(!tempProgEx.length){w.innerHTML='<div style="font-size:13px;color:var(--muted);padding:6px 0 12px">Nog geen oefeningen. Voeg er een toe.</div>';return;}
  var arrow='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">';
  w.innerHTML=tempProgEx.map(function(ex,i){
    var sel=function(v){return ex.type===v?' selected':'';};
    return'<div class="prog-ex-edit">'
      +'<div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">'
        +'<input type="text" value="'+escAttr(ex.name)+'" placeholder="Oefening naam" style="flex:1" oninput="tempProgEx['+i+'].name=this.value">'
        +'<button class="btn-icon" '+(i===0?'disabled style="opacity:.3"':'')+' onclick="moveProgEx('+i+',-1)">'+arrow+'<polyline points="18 15 12 9 6 15"/></svg></button>'
        +'<button class="btn-icon" '+(i===tempProgEx.length-1?'disabled style="opacity:.3"':'')+' onclick="moveProgEx('+i+',1)">'+arrow+'<polyline points="6 9 12 15 18 9"/></svg></button>'
        +'<button class="btn-icon" style="color:var(--danger)" onclick="removeProgEx('+i+')">'+arrow+'<path d="M18 6L6 18M6 6l12 12"/></svg></button>'
      +'</div>'
      +'<div class="fr3">'
        +'<div><label>Sets</label><input type="number" inputmode="numeric" value="'+ex.sets+'" min="1" oninput="tempProgEx['+i+'].sets=+this.value||3"></div>'
        +'<div><label>Reps</label><input type="number" inputmode="numeric" value="'+ex.reps+'" min="1" oninput="tempProgEx['+i+'].reps=+this.value||10"></div>'
        +'<div><label>Type</label><select onchange="tempProgEx['+i+'].type=this.value;renderProgExList()"><option value="normal"'+sel('normal')+'>Normaal</option><option value="warmup"'+sel('warmup')+'>Warm-up</option><option value="superset"'+sel('superset')+'>Superset</option></select></div>'
      +'</div>'
      +(ex.type==='superset'?'<div style="margin-top:8px"><label>Superset met</label><input type="text" value="'+escAttr(ex.supersetPair||'')+'" placeholder="Naam van de tweede oefening" oninput="tempProgEx['+i+'].supersetPair=this.value"></div>':'')
    +'</div>';
  }).join('');
}
function saveProg(){
  var name=document.getElementById('prog-name').value.trim();if(!name){showToast('Vul een naam in');return;}
  var exs=tempProgEx.filter(function(e){return e.name.trim();});
  if(!exs.length){showToast('Voeg minstens 1 oefening toe');return;}
  if(editProgId){
    var p=S.programs.find(function(x){return x.id===editProgId;});
    if(p){p.name=name;p.exercises=exs;}
  }else{
    S.programs.push({id:Date.now().toString(),name:name,exercises:exs});
  }
  saveS();closeModal('m-create-prog');renderPrograms();renderWkSchemaSelect();
  showToast(editProgId?'Schema bijgewerkt':'Schema opgeslagen');
  editProgId=null;
}
function openProgDetail(id){
  curProgId=id;var p=S.programs.find(function(x){return x.id===id;});
  document.getElementById('pd-title').textContent=p.name;
  document.getElementById('pd-body').innerHTML=p.exercises.map(function(e){
    var kind=e.type==='warmup'?'warm-up':(e.type==='superset'?'superset'+(e.supersetPair?' met '+e.supersetPair:''):'');
    return'<div style="padding:9px 0;border-bottom:1px solid var(--surface3);display:flex;justify-content:space-between;gap:10px"><span style="color:var(--text);font-weight:600">'+e.name+(kind?'<div style="color:var(--muted);font-size:11px;font-weight:400;margin-top:2px">'+kind+'</div>':'')+'</span><span style="font-family:var(--mono);flex-shrink:0">'+e.sets+'x'+e.reps+'</span></div>';
  }).join('');
  openModal('m-prog-detail');
}
function delProg(){var id=curProgId;closeModal('m-prog-detail');askConfirm('Schema verwijderen?','Verwijderen',function(){S.programs=S.programs.filter(function(p){return p.id!==id;});saveS();renderPrograms();renderWkSchemaSelect();showToast('Schema verwijderd');});}
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
}
function renderActivityManageList(){
  var wrap=document.getElementById('activity-manage-list');if(!wrap)return;
  wrap.innerHTML=S.activities.map(function(act){
    var delBtn=act.removable?'<button class="btn-icon" onclick="removeActivity(\\''+act.key+'\\')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>':'<div style="width:32px"></div>';
    return'<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--surface2)"><div style="flex:1;font-weight:700;font-size:16px">'+(act.emoji?act.emoji+' ':'')+act.name+'</div><input type="number" min="1" max="7" value="'+(S.activityTargets[act.key]||1)+'" style="width:64px;text-align:center" onchange="setTarget(\\''+act.key+'\\',this.value)">'+delBtn+'</div>';
  }).join('');
}
function setTarget(key,val){
  ensureNewFields();
  S.activityTargets[key]=Math.max(1,parseInt(val)||1);
  saveS();renderPlanner();
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
  saveS();renderSettings();renderPlanner();renderDayBanner();
  showToast('Sport toegevoegd');
}
function removeActivity(key){
  askConfirm('Deze sport verwijderen? Geplande dagen en voortgang hiervoor gaan verloren.','Verwijderen',function(){
  S.activities=S.activities.filter(function(a){return a.key!==key;});
  delete S.activityTargets[key];delete S.activitySchedule[key];
  S.activityDone=(S.activityDone||[]).filter(function(d){return !d.endsWith('_'+key);});
  S.gcalNeedsSync=true;
  saveS();renderSettings();renderPlanner();renderDayBanner();
  showToast('Sport verwijderd');
  });
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
