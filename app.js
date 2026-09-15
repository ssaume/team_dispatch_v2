
const $=(s,root=document)=>root.querySelector(s);const $$=(s,root=document)=>[...root.querySelectorAll(s)];const app=$('#app');const cfg=window.TEAM_DISPATCH_CONFIG||{};
let rpcSeq=1;const pendingRpc=new Map();let backendReady=false;
let assignmentPollTimer=null;
let assignmentPollCursor='';
let assignmentPollBusy=false;
let relatedTaskDataStale=false;
const ASSIGNMENT_POLL_INTERVAL_MS=15000;let me=null,users=[],adminUsers=[],taskTitles=[],incoming=[],outgoing=[],myAllocations=[],myLeaves=[],myTrips=[],holidays=[],adminTasks=[];let adminTasksLoaded=false,adminUserWorkContext=null,adminUserWorkWeekStart=null;const teamCalendarCache=new Map();let myMode='list';let currentWeekStart=startOfWeek(new Date());let teamStart=startOfWeek(new Date());let availabilityTimer=null;let lastAvailability=null;
function startOfWeek(d){const x=new Date(d),day=x.getDay(),diff=day===0?-6:1-day;x.setDate(x.getDate()+diff);x.setHours(0,0,0,0);return x}function isoDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}function dateOnly(s){return s?new Date(`${String(s).slice(0,10)}T00:00:00`):null}function fmtDate(s){if(!s)return'-';const d=dateOnly(s);return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`}function fmtDateTime(s){if(!s)return'-';const d=new Date(s);return Number.isNaN(d.getTime())?String(s):d.toLocaleString('zh-TW',{hour12:false})}function fmtLocalDateTime(s){if(!s)return'-';const d=new Date(s);return Number.isNaN(d.getTime())?s:d.toLocaleString('zh-TW',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function isWorkdayDate(d){return ![0,6].includes(new Date(d).getDay())}
function leaveRecordsOnDate(d){
  const day=new Date(d);day.setHours(12,0,0,0);
  return myLeaves.filter(x=>{
    const s=new Date(x.startDateTime),e=new Date(x.endDateTime);
    if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime()))return false;
    const sd=new Date(s);sd.setHours(0,0,0,0);
    const ed=new Date(e);ed.setHours(23,59,59,999);
    return day>=sd&&day<=ed;
  });
}


function leaveHoursOnDateClient(d){
  const key=typeof d==='string'?String(d).slice(0,10):isoDate(new Date(d));
  const dayStart=new Date(`${key}T00:00:00`);
  const dayEnd=new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate()+1);

  let hours=0;
  myLeaves.forEach(x=>{
    const s=new Date(x.startDateTime),e=new Date(x.endDateTime);
    if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime())||e<=s)return;
    const from=s>dayStart?s:dayStart;
    const to=e<dayEnd?e:dayEnd;
    if(to>from)hours+=(to-from)/3600000;
  });

  return Math.min(8,Math.max(0,Math.round(hours*100)/100));
}

function holidayRecordsOnDate(d){
  const key=typeof d==='string'?String(d).slice(0,10):isoDate(new Date(d));
  return holidays.filter(x=>String(x.holidayDate)===key);
}

function daysToDue(t){const due=dateOnly(t.requestDate),now=new Date();now.setHours(0,0,0,0);return Math.ceil((due-now)/86400000)}function colorClass(t){if(t.status==='completed')return'task-gray';const d=daysToDue(t);if(d<0)return'task-pink';if(d<=2)return'task-orange';return'task-green'}function calClass(t){return colorClass(t).replace('task-','cal-')}function statusText(s){return({pending:'待接受',accepted:'已接單',rejected:'已拒絕',cancelled:'已中止',completed:'已完成',mixed:'多筆'})[s]||s}function token(){return sessionStorage.getItem('teamDispatchToken')||''}
function setToken(v){
  // v2.7.1: auth token is tab-scoped. localStorage is intentionally
  // not used because it is shared by every tab on the same GitHub Pages origin.
  localStorage.removeItem('teamDispatchToken');
  if(v)sessionStorage.setItem('teamDispatchToken',v);
  else sessionStorage.removeItem('teamDispatchToken');
}

const WRITE_ACTIONS=new Set([
  'createTask','createSelfTask','acceptTask','rejectTask',
  'setUrgent','setCompleted','setTaskVisibility','updateTaskDetails','updateSelfTaskRequestDate','updateTaskPlannedHours','updateTaskSchedule','stopTask','restartTask','addTaskCollaborators',
  'moveAllocation','splitAllocation',
  'createLeave','deleteLeave','createTrip','deleteTrip',
  'adminCreateUser','adminUpdateUser','adminUpdateTaskDetails','adminDeleteTask',
  'adminCreateHoliday','adminDeleteHoliday'
]);

// Read actions that actually wait for Google Sheet / Apps Script data.
// checkAvailability is intentionally excluded because it runs automatically
// while the user edits the assignment form; a full-screen overlay there
// would make normal typing feel blocked.
const READ_ACTIONS=new Set([
  'loadAll',
  'teamCalendar',
  'publicDashboard',
  'adminListUsers','adminListTasks','adminUserWork'
]);

const DATA_LOADING_MESSAGES={
  loadAll:'正在讀取工作資料…',
  teamCalendar:'正在讀取團隊出勤資料…',
  publicDashboard:'正在讀取任務儀表板…',
  adminListUsers:'正在讀取系統管理資料…',
  adminListTasks:'正在讀取人員工作資料…',
  adminUserWork:'正在讀取人員工作日曆…',

  createTask:'正在建立派工…',
  createSelfTask:'正在建立工作並計算排程…',
  acceptTask:'正在接單並建立日排程…',
  rejectTask:'正在更新拒絕結果…',
  setUrgent:'正在更新緊急狀態…',
  setCompleted:'正在更新完成狀態…',
  setTaskVisibility:'正在更新任務公開屬性…',
  updateTaskDetails:'正在更新任務內容…',
  updateSelfTaskRequestDate:'正在更新需求日期並整理排程…',
  stopTask:'正在中止任務…',
  restartTask:'正在重新啟動任務並建立排程…',
  addTaskCollaborators:'正在新增共同作業者並建立個別工時排程…',
  updateTaskPlannedHours:'正在依目前排程比例重新計算工時…',
  updateTaskSchedule:'正在更新日曆排程…',
  moveAllocation:'正在移動並重新計算排程…',
  splitAllocation:'正在分拆並重新計算排程…',
  createLeave:'正在新增請假並重新計算排程…',
  deleteLeave:'正在刪除請假…',
  createTrip:'正在新增出差…',
  deleteTrip:'正在刪除出差…',
  adminCreateUser:'正在建立帳號…',
  adminUpdateUser:'正在更新帳號…',
  adminUpdateTaskDetails:'正在更新人員工作內容…',
  adminDeleteTask:'正在永久刪除任務與相關排程…',
  adminCreateHoliday:'正在新增國定假日並重新計算所有受影響排程…',
  adminDeleteHoliday:'正在刪除國定假日…'
};

let dataLoadingCount=0;
let writeRpcQueue=Promise.resolve();

function beginDataLoading(action){
  dataLoadingCount++;
  const overlay=$('#commitOverlay');
  if(!overlay)return;

  const isRead=READ_ACTIONS.has(action);
  const title=$('#commitLoadingTitle');
  if(title)title.textContent=isRead?'資料更新中':'資料處理中';

  const text=$('#commitLoadingText');
  if(text)text.textContent=DATA_LOADING_MESSAGES[action]||(isRead?'正在更新畫面資料，請稍候…':'正在更新 Google Drive，請稍候…');

  // Native <dialog> enters the browser Top Layer. This guarantees the
  // loading UI stays above task/admin dialogs instead of being hidden
  // behind an already-open modal.
  try{
    if(!overlay.open)overlay.showModal();
  }catch{
    overlay.setAttribute('open','');
  }
}

function endDataLoading(){
  dataLoadingCount=Math.max(0,dataLoadingCount-1);

  if(dataLoadingCount===0){
    const overlay=$('#commitOverlay');
    if(!overlay)return;

    try{
      if(overlay.open)overlay.close();
    }catch{
      overlay.removeAttribute('open');
    }
  }
}


function staleSessionError(){
  const err=new Error('登入帳號已切換，已忽略舊帳號的資料回應');
  err.code='STALE_SESSION';
  return err;
}
function isStaleSessionError(err){
  return !!err&&err.code==='STALE_SESSION';
}

function findTaskSnapshot(taskId){
  return [...incoming,...outgoing, ...adminTasks]
    .find(x=>String(x.id)===String(taskId))||null;
}
function taskVersionPayload(taskOrId,payload={}){
  const t=typeof taskOrId==='object'?taskOrId:findTaskSnapshot(taskOrId);
  return {
    ...payload,
    expectedUpdatedAt:t?.updatedAt||''
  };
}
function isConflictError(err){
  return !!err&&/^CONFLICT:/.test(String(err.message||''));
}
async function handleConflictError(err){
  if(!isConflictError(err))return false;
  alert(String(err.message).replace(/^CONFLICT:\s*/,'')+'\\n\\n畫面將重新整理最新資料。');
  if(me)await loadAll();
  return true;
}

function validGoogleOrigin(origin){try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com'))}catch{return false}}
window.addEventListener('message',ev=>{
  if(!validGoogleOrigin(ev.origin))return;

  const m=ev.data||{};
  if(m.channel!=='team-dispatch-rpc'||!m.id)return;

  const p=pendingRpc.get(m.id);
  if(!p)return;

  pendingRpc.delete(m.id);
  clearTimeout(p.timer);
  if(p.slowTimer)clearTimeout(p.slowTimer);

  try{p.iframe.remove()}catch{}
  if(p.hasDataLoading)endDataLoading();

  // For authenticated requests, never allow a response created under an
  // older login token to update a newer login context in this tab.
  if(p.authenticated&&p.tokenSnapshot!==token()){
    p.reject(staleSessionError());
    return;
  }

  m.ok?p.resolve(m.result):p.reject(new Error(m.error||'操作失敗'));
});
function rpcDirect(action,payload={}){
  if(!cfg.APPS_SCRIPT_URL||cfg.APPS_SCRIPT_URL.includes('PASTE_YOUR_')){
    return Promise.reject(new Error('尚未設定 Apps Script URL'));
  }

  const tokenSnapshot=token();
  const authenticated=!!tokenSnapshot&&!['ping','login','publicDashboard'].includes(action);

  const hasDataLoading=WRITE_ACTIONS.has(action)||READ_ACTIONS.has(action);
  if(hasDataLoading)beginDataLoading(action);

  return new Promise((resolve,reject)=>{
    const id=`r${Date.now()}_${rpcSeq++}`;
    const frameName=`td_rpc_${id}`;
    const iframe=document.createElement('iframe');
    iframe.name=frameName;
    iframe.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:-9999px;';
    iframe.setAttribute('aria-hidden','true');
    document.body.appendChild(iframe);

    const form=document.createElement('form');
    form.method='POST';
    form.action=cfg.APPS_SCRIPT_URL;
    form.target=frameName;
    form.style.display='none';

    const rid=document.createElement('input');
    rid.type='hidden';
    rid.name='requestId';
    rid.value=id;
    form.appendChild(rid);

    const data=document.createElement('input');
    data.type='hidden';
    data.name='payload';
    // Use the token captured at rpc() invocation. Never re-read auth state
    // after the request has already been constructed.
    data.value=JSON.stringify({action,token:tokenSnapshot,...payload});
    form.appendChild(data);
    document.body.appendChild(form);

    const timeoutMs=Math.max(Number(cfg.REQUEST_TIMEOUT_MS||0),WRITE_ACTIONS.has(action)?45000:30000);
    const slowTimer=setTimeout(()=>{
      const text=$('#commitLoadingText');
      if(text&&pendingRpc.has(id)){
        text.textContent='Google Apps Script 正在排隊處理，請勿重複送出；系統會繼續等待回應…';
      }
    },8000);

    const timer=setTimeout(()=>{
      pendingRpc.delete(id);
      clearTimeout(slowTimer);
      try{iframe.remove()}catch{}
      if(hasDataLoading)endDataLoading();
      reject(new Error('Google Apps Script 等待超過預期時間，請確認資料是否已更新後再重試'));
    },timeoutMs);

    pendingRpc.set(id,{resolve,reject,timer,slowTimer,iframe,hasDataLoading,tokenSnapshot,authenticated});

    try{
      form.submit();
    }catch(err){
      clearTimeout(timer);
      pendingRpc.delete(id);
      iframe.remove();
      if(hasDataLoading)endDataLoading();
      reject(err);
    }finally{
      form.remove();
    }
  });
}

function rpc(action,payload={}){
  if(!WRITE_ACTIONS.has(action)){
    return rpcDirect(action,payload);
  }

  const run=()=>rpcDirect(action,payload);
  const queued=writeRpcQueue.then(run,run);
  writeRpcQueue=queued.catch(()=>{});
  return queued;
}


function stopAssignmentWatcher(){
  if(assignmentPollTimer){
    clearInterval(assignmentPollTimer);
    assignmentPollTimer=null;
  }
  assignmentPollCursor='';
  assignmentPollBusy=false;
  relatedTaskDataStale=false;
}

async function startAssignmentWatcher(){
  stopAssignmentWatcher();
  if(!me||!token())return;

  try{
    const init=await rpc('pollAssignedTasks',{since:''});
    assignmentPollCursor=String(init?.cursor||'');
  }catch{
    assignmentPollCursor='';
  }

  assignmentPollTimer=setInterval(
    pollAssignedTaskNotifications,
    ASSIGNMENT_POLL_INTERVAL_MS
  );
}

function assignmentNotificationHtml(tasks){
  return `<div class="assignment-notification-list">
    ${tasks.map(t=>`
      <div class="assignment-notification-item">
        <div>
          <strong>${escapeHtml(t.workType||'新任務')}</strong>
          <div class="mini">派工者：${escapeHtml(t.requesterName||'(未知)')}</div>
        </div>
        <div class="assignment-notification-meta">
          <span>需求日 ${fmtDate(t.requestDate)}</span>
          <span>${num(t.plannedHours)}h</span>
          ${t.status==='accepted'
            ? '<span class="badge accepted">已接單</span>'
            : '<span class="badge pending">待接受</span>'}
        </div>
      </div>
    `).join('')}
  </div>`;
}

function showAssignmentNotification(tasks){
  const dialog=$('#assignmentNotificationDialog');
  const body=$('#assignmentNotificationBody');
  const title=$('#assignmentNotificationTitle');
  if(!dialog||!body||!tasks.length)return;

  if(title){
    title.textContent=tasks.length===1
      ? '收到 1 筆新任務'
      : `收到 ${tasks.length} 筆新任務`;
  }

  body.innerHTML=assignmentNotificationHtml(tasks);

  try{
    if(!dialog.open)dialog.showModal();
  }catch{
    dialog.setAttribute('open','');
  }
}

async function pollAssignedTaskNotifications(){
  if(assignmentPollBusy||!me||!token()||!assignmentPollCursor)return;
  if(document.hidden)return;

  assignmentPollBusy=true;
  try{
    const d=await rpc('pollAssignedTasks',{since:assignmentPollCursor});
    const nextCursor=String(d?.cursor||assignmentPollCursor);
    const newAssignments=Array.isArray(d?.newAssignments)
      ? d.newAssignments
      : (Array.isArray(d?.tasks)?d.tasks:[]);
    const relatedChanges=Array.isArray(d?.relatedChanges)
      ? d.relatedChanges
      : newAssignments;

    assignmentPollCursor=nextCursor;

    if(relatedChanges.length){
      const onMyWork=!!$('#myView')&&!$('#myView').classList.contains('hidden');

      if(onMyWork){
        // Any related task change must be reflected immediately while
        // My Work is visible.
        await loadAll();
        relatedTaskDataStale=false;
      }else{
        // Avoid interrupting forms in another view. Refresh automatically
        // the next time the user opens My Work.
        relatedTaskDataStale=true;
      }
    }

    if(newAssignments.length){
      showAssignmentNotification(newAssignments);
    }
  }catch(err){
    console.warn('Related task synchronization poll failed:',err);
  }finally{
    assignmentPollBusy=false;
  }
}


async function connectBackend(){
  // v1.4.1: opening / refreshing the site always returns to the login screen.
  // Do not silently restore a previous local session.
  // Each page refresh starts logged out in this tab, preserving the existing
  // explicit-login behavior. Also remove any legacy shared localStorage token.
  localStorage.removeItem('teamDispatchToken');
  setToken('');
  showLogin();

  const st=$('#bridgeState');
  if(!cfg.APPS_SCRIPT_URL||cfg.APPS_SCRIPT_URL.includes('PASTE_YOUR_')){
    st.textContent='尚未設定 Apps Script URL';
    st.className='bridge-state bad';
    $('#loginError').textContent='請先修改 config.js 的 APPS_SCRIPT_URL。';
    return;
  }

  try{
    await rpc('ping');
    backendReady=true;
    if($('#bridgeState')){
      $('#bridgeState').textContent='Google Drive 已連線';
      $('#bridgeState').className='bridge-state ok';
    }
    if($('#loginBtn'))$('#loginBtn').disabled=false;
    if($('#publicDashboardBtn'))$('#publicDashboardBtn').disabled=false;
  }catch(err){
    if($('#bridgeState')){
      $('#bridgeState').textContent='Google Drive 連線失敗';
      $('#bridgeState').className='bridge-state bad';
    }
    if($('#loginError'))$('#loginError').textContent=err.message;
  }
}

function showLogin(){
  stopAssignmentWatcher();
  me=null;
  app.innerHTML='';
  app.append($('#loginTpl').content.cloneNode(true));

  const form=$('#loginForm');
  const loginBtn=$('#loginBtn');

  if(backendReady){
    $('#bridgeState').textContent='Google Drive 已連線';
    $('#bridgeState').className='bridge-state ok';
    loginBtn.disabled=false;
    $('#publicDashboardBtn').disabled=false;
  }

  $('#publicDashboardBtn').addEventListener('click',showPublicDashboard);

  const performLogin=async()=>{
    if(loginBtn.disabled)return;

    $('#loginError').textContent='';

    const username=form.elements.username.value.trim();
    const password=form.elements.password.value;

    if(!username||!password){
      $('#loginError').textContent='請輸入帳號與密碼後再按登入。';
      return;
    }

    loginBtn.disabled=true;
    setToken('');
    me=null;

    try{
      const d=await rpc('login',{username,password});
      setToken(d.token);
      me=d.user;
      showMain();
      await loadAll();
      await startAssignmentWatcher();
    }catch(err){
      $('#loginError').textContent=err.message;
      loginBtn.disabled=false;
    }
  };

  form.addEventListener('submit',e=>{
    e.preventDefault();
    performLogin();
  });

}


async function showPublicDashboard(){
  // Public dashboard is intentionally independent from authentication.
  // Clear any residual local token before entering this read-only surface.
  setToken('');
  me=null;
  app.innerHTML='';
  app.append($('#dashboardTpl').content.cloneNode(true));

  $('#dashboardBackLogin').addEventListener('click',showLogin);
  $('#dashboardRefresh').addEventListener('click',loadPublicDashboard);

  await loadPublicDashboard();
}

async function loadPublicDashboard(){
  const state=$('#dashboardState');
  const content=$('#dashboardContent');
  const refresh=$('#dashboardRefresh');

  if(!state||!content)return;

  state.className='dashboard-state';
  state.innerHTML='<div class="loading-spinner" aria-hidden="true"></div><span>正在讀取目前任務…</span>';
  content.classList.add('hidden');
  if(refresh)refresh.disabled=true;

  try{
    const d=await rpc('publicDashboard');
    renderPublicDashboard(d);
    state.classList.add('hidden');
    content.classList.remove('hidden');
  }catch(err){
    state.className='dashboard-state error-state';
    state.innerHTML=`<strong>儀表板讀取失敗</strong><span>${escapeHtml(err.message)}</span>`;
  }finally{
    if(refresh)refresh.disabled=false;
  }
}

function renderPublicDashboard(d){
  $('#dashboardGeneratedAt').textContent=fmtDateTime(d.generatedAt);
  $('#dashboardWeekRange').textContent=`工作週 ${fmtDate(d.weekStart)} ～ ${fmtDate(d.weekEnd)}`;
  $('#dashboardHorizonRange').textContent='依需求日期排序';

  const leavePeople=d.todayLeavePeople||[];
  const futureLeaves=d.futureLeavePlans||[];
  const recentTrips=d.recentTrips||[];
  const week=d.currentWeekTasks||[];
  const cancelled=d.cancelledWeekTasks||[];
  const future=d.futureTasks||d.next15DaysTasks||[];
  const heatmap=d.loadingHeatmap||{dates:[],members:[]};

  $('#dashboardTodayLeaveCount').textContent=`${leavePeople.length + futureLeaves.length} 筆`;
  $('#dashboardLeaveRange').textContent=`${fmtDate(d.today)} ～ ${fmtDate(d.monthEnd||d.horizonEnd)}`;
  $('#dashboardTripCount').textContent=`${recentTrips.length} 筆`;
  $('#dashboardTripRange').textContent=`${fmtDate(d.today)} ～ ${fmtDate(d.monthEnd||d.horizonEnd)}`;
  $('#dashboardWeekCount').textContent=`${week.length} 件`;
  $('#dashboardCancelledCount').textContent=`${cancelled.length} 件`;
  $('#dashboardFutureCount').textContent=`${future.length} 件`;
  $('#dashboardCancelledRange').textContent=`${fmtDate(d.weekStart)} ～ ${fmtDate(d.calendarWeekEnd||d.weekEnd)}`;
  $('#dashboardLoadingCount').textContent=`${(heatmap.members||[]).length} 人`;

  if(heatmap.startDate&&heatmap.endDate){
    $('#dashboardLoadingRange').textContent=`${fmtDate(heatmap.startDate)} ～ ${fmtDate(heatmap.endDate)} · 冷色低 Loading，暖色高 Loading`;
  }

  $('#dashboardTodayLeave').innerHTML=dashboardTodayLeaveHtml(leavePeople);
  $('#dashboardFutureLeaves').innerHTML=dashboardFutureLeaveHtml(futureLeaves);
  $('#dashboardRecentTrips').innerHTML=dashboardRecentTripsHtml(recentTrips);
  bindDashboardLeaveTabs();
  $('#dashboardWeekTasks').innerHTML=dashboardTaskTable(week,'week');
  $('#dashboardCancelledTasks').innerHTML=dashboardCancelledTaskTable(cancelled);
  $('#dashboardFutureTasks').innerHTML=dashboardTaskTable(future,'future');
  $('#dashboardLoadingHeatmap').innerHTML=dashboardLoadingHeatmapHtml(heatmap);
}





function dashboardHeatClass(day){
  if(!day)return 'heat-nonwork';
  if(day.holiday)return 'heat-holiday';
  if(day.weekend)return 'heat-weekend';
  if(day.fullLeave||Number(day.availableHours||0)<=0)return 'heat-leave';
  const pct=Number(day.loadPct||0);
  if(pct<=0)return 'heat-zero';
  if(pct<=40)return 'heat-cool-low';
  if(pct<=80)return 'heat-cool-mid';
  if(pct<=100)return 'heat-warm';
  return 'heat-hot';
}

function dashboardLoadingHeatmapHtml(data){
  const dates=Array.isArray(data?.dates)?data.dates:[];
  const members=Array.isArray(data?.members)?data.members:[];

  if(!dates.length||!members.length){
    return '<div class="dashboard-empty">目前沒有可顯示的 Loading 資料。</div>';
  }

  const weekday=['日','一','二','三','四','五','六'];

  const head=dates.map(d=>{
    const dt=new Date(`${d}T12:00:00`);
    const label=Number.isNaN(dt.getTime())?'':`${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`;
    const wd=Number.isNaN(dt.getTime())?'':weekday[dt.getDay()];
    return `<th class="heat-date-head"><span>${label}</span><small>${wd}</small></th>`;
  }).join('');

  const body=members.map(member=>`
    <tr>
      <th class="heat-user-head">${escapeHtml(member.displayName)}</th>
      ${dates.map(date=>{
        const day=member.days?.[date]||{};
        const cls=dashboardHeatClass(day);
        const pct=Math.round(Number(day.loadPct||0));
        const hours=num(day.loadHours||0);
        const available=num(day.availableHours||0);

        let main='-', sub='';
        if(day.holiday){ main='國假'; sub=(day.holidayLabels||[]).join('、'); }
        else if(day.weekend){ main='週末'; }
        else if(day.fullLeave||available<=0){ main='休'; }
        else{
          main=`${pct}%`;
          const notes=[];
          if(day.partialLeave)notes.push(`假${num(day.leaveHours||0)}h`);
          if(Array.isArray(day.tripLabels)&&day.tripLabels.length)notes.push('出差');
          sub=notes.join(' · ');
        }
        const tip=[date];
        if(day.holiday)tip.push(`國定假日：${(day.holidayLabels||[]).join('、')||'國定假日'}`);
        else if(day.weekend)tip.push('週末');
        else{
          tip.push(`Loading ${pct}%`);
          tip.push(`${hours}h / 可用 ${available}h`);
          if(day.partialLeave)tip.push(`部分請假 ${num(day.leaveHours||0)}h`);
          else if(day.fullLeave)tip.push('整天請假');
          if(Array.isArray(day.tripLabels)&&day.tripLabels.length)tip.push(`出差：${day.tripLabels.join('、')}（不影響 Loading）`);
        }
        return `<td class="heat-cell ${cls}" title="${attr(tip.join(' · '))}">
          <span class="heat-main">${escapeHtml(main)}</span>
          ${sub?`<small class="heat-note">${escapeHtml(sub)}</small>`:''}
        </td>`;
      }).join('')}
    </tr>
  `).join('');

  return `<div class="loading-heatmap-scroll">
    <table class="loading-heatmap-table">
      <thead><tr><th class="heat-user-head heat-corner">人員</th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}



function bindDashboardLeaveTabs(){
  $$('[data-leave-tab]').forEach(btn=>{
    btn.onclick=()=>{
      $$('[data-leave-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      $('#dashboardLeaveTodayPanel')?.classList.toggle('hidden',btn.dataset.leaveTab!=='today');
      $('#dashboardLeaveFuturePanel')?.classList.toggle('hidden',btn.dataset.leaveTab!=='future');
    };
  });
}

function dashboardRecentTripsHtml(rows){
  if(!rows.length)return '<div class="dashboard-empty">未來一個月沒有出差計畫。</div>';
  return `<div class="dashboard-plan-grid">${rows.map(x=>`
    <div class="dashboard-plan-card trip">
      <strong>${escapeHtml(x.displayName)}</strong>
      <span>${fmtDate(x.startDate)} ～ ${fmtDate(x.endDate)}</span>
      <small>${escapeHtml(x.purpose||'出差')}</small>
    </div>`).join('')}</div>`;
}

function dashboardFutureLeaveHtml(rows){
  if(!rows.length)return '<div class="dashboard-empty">未來一個月沒有休假計畫。</div>';
  return `<div class="dashboard-plan-grid">${rows.map(x=>`
    <div class="dashboard-plan-card leave">
      <strong>${escapeHtml(x.displayName)}</strong>
      <span>${fmtLocalDateTime(x.startDateTime)} ～ ${fmtLocalDateTime(x.endDateTime)}</span>
      <small>${escapeHtml(x.leaveType||'休假')}</small>
    </div>`).join('')}</div>`;
}

function fmtTimeOnly(v){
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return '-';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function dashboardTodayLeaveHtml(rows){
  if(!rows.length){
    return '<div class="dashboard-empty">今天沒有休假人員。</div>';
  }

  return `<div class="today-leave-grid">
    ${rows.map(x=>`
      <div class="today-leave-card ${x.fullDay?'full-day':''}">
        <strong>${escapeHtml(x.displayName)}</strong>
        <span>${x.fullDay
          ? `整天休假 · 起始 ${fmtTimeOnly(x.leaveStartAt)}`
          : `休假起始 ${fmtTimeOnly(x.leaveStartAt)}`}</span>
      </div>
    `).join('')}
  </div>`;
}

function dashboardCancelledTaskTable(tasks){
  if(!tasks.length)return '<div class="dashboard-empty">本週沒有中止任務。</div>';
  return `<div class="panel table-scroll dashboard-table-wrap"><table class="dashboard-table">
    <thead><tr><th>任務</th><th>負責人</th><th>原需求日</th><th>中止日</th></tr></thead>
    <tbody>${tasks.map(t=>`<tr><td><strong>${escapeHtml(t.workType)}</strong></td><td><span class="assignee-pill">${escapeHtml(t.assigneeName)}</span></td><td>${fmtDate(t.requestDate)}</td><td><span class="badge cancelled">已中止</span> ${t.cancelledDateStart&&t.cancelledDateEnd&&t.cancelledDateStart!==t.cancelledDateEnd?`${fmtDate(t.cancelledDateStart)} ～ ${fmtDate(t.cancelledDateEnd)}`:fmtDate(t.cancelledDate)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function dashboardTaskTable(tasks,mode){
  if(!tasks.length){
    return `<div class="dashboard-empty">${mode==='week'?'本工作週沒有執行中任務。':'目前沒有已派發的未來任務。'}</div>`;
  }

  return `<div class="panel table-scroll dashboard-table-wrap">
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>任務</th>
          <th>負責人</th>
          <th>狀態</th>
          <th>需求日</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(t=>{
          const grouped=!!t.grouped;
          const due=grouped&&t.requestDateEnd&&t.requestDateEnd!==t.requestDate
            ? `${fmtDate(t.requestDate)} ～ ${fmtDate(t.requestDateEnd)}`
            : fmtDate(t.requestDate);

          const dueWarning=t.dueState==='overdue'
            ? '<span class="due-warning overdue">⚠ 已逾期</span>'
            : t.dueState==='dueToday'
              ? '<span class="due-warning today">⚠ 今日到期</span>'
              : '';

          return `<tr class="${[t.urgent?'dashboard-urgent-row':'',t.dueState?'dashboard-due-row':''].filter(Boolean).join(' ')}">
            <td>
              <div class="dashboard-task-name">
                ${t.urgent?'<span class="urgent">!</span>':''}
                <strong>${escapeHtml(t.workType)}</strong>
                ${dueWarning}
              </div>
              ${grouped?`<div class="mini">合併 ${t.taskCount} 筆同名任務</div>`:''}
              ${mode==='future'&&t.within15Days?'<div class="future-due-tag">15 天內到期</div>':''}
            </td>
            <td><span class="assignee-pill">${escapeHtml(t.assigneeName)}</span></td>
            <td><span class="badge ${t.status}">${statusText(t.status)}</span></td>
            <td>${due}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function showMain(){app.innerHTML='';app.append($('#mainTpl').content.cloneNode(true));$('#whoami').innerHTML=`<strong>${escapeHtml(me.displayName)}</strong><div class="muted">${escapeHtml(me.username)} · ${me.role}</div>`;$('#adminNav').classList.toggle('hidden',me.role!=='admin');$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view,b)));$('#logoutBtn').addEventListener('click',async()=>{try{await rpc('logout')}catch(e){if(!isStaleSessionError(e)){} }stopAssignmentWatcher();setToken('');me=null;showLogin()});$('#rejectCancel').addEventListener('click',()=>$('#rejectDialog').close());$('#stopTaskClose').onclick=$('#stopTaskCancel').onclick=()=>$('#stopTaskDialog').close();$('#stopTaskForm').addEventListener('submit',handleStopTask);$('#rejectForm').addEventListener('submit',handleReject);$('#selfTaskClose').onclick=$('#selfTaskCancel').onclick=()=>$('#selfTaskDialog').close();$('#selfTaskForm').addEventListener('submit',handleSelfTask);$('#selfTaskPeriodic').addEventListener('change',toggleSelfPeriodicFields);$('#selfTaskForm [name="requestDate"]').addEventListener('change',toggleSelfPeriodicFields);$('#periodEndMode').addEventListener('change',togglePeriodEndMode);$('#selfTaskCollaborative').addEventListener('change',toggleSelfCollaborativeFields);$('#adminTaskClose').onclick=$('#adminTaskCancel').onclick=()=>$('#adminTaskDialog').close();$('#adminTaskForm').addEventListener('submit',handleAdminTaskSave);$('#adminUserWorkClose').onclick=()=>$('#adminUserWorkDialog').close();$('#adminUserTaskClose').onclick=()=>$('#adminUserTaskDialog').close();$('#moveAllocationClose').onclick=$('#moveAllocationCancel').onclick=()=>$('#moveAllocationDialog').close();$('#moveAllocationForm').addEventListener('submit',handleMoveAllocation);$('#splitAllocationClose').onclick=$('#splitAllocationCancel').onclick=()=>$('#splitAllocationDialog').close();$('#splitAllocationForm').addEventListener('submit',handleSplitAllocation);$('#splitAllocationForm [name="movePercent"]').addEventListener('input',updateSplitPreview);$('#splitAllocationForm [name="targetDate"]').addEventListener('change',updateSplitTargetHint);
$('#assignmentNotificationClose')?.addEventListener('click',()=>$('#assignmentNotificationDialog').close());
$('#assignmentNotificationGoMy')?.addEventListener('click',()=>{
  $('#assignmentNotificationDialog').close();
  const btn=$('.nav-btn[data-view="my"]');
  switchView('my',btn);
  loadAll();
})}
function switchView(name,btn){
  $$('.view').forEach(v=>v.classList.add('hidden'));
  $$('.nav-btn').forEach(v=>v.classList.remove('active'));
  btn?.classList.add('active');

  if(name==='my'){
    $('#myView').classList.remove('hidden');

    if(relatedTaskDataStale){
      relatedTaskDataStale=false;
      loadAll().catch(err=>{
        relatedTaskDataStale=true;
        console.warn('My Work auto refresh failed:',err);
      });
    }
  }

  if(name==='request')$('#requestView').classList.remove('hidden');

  if(name==='schedule'){
    $('#scheduleView').classList.remove('hidden');
    renderSchedule();
  }

  if(name==='team'){
    $('#teamView').classList.remove('hidden');
    renderTeamCalendar();
  }

  if(name==='admin'){
    $('#adminView').classList.remove('hidden');
    renderAdmin();
  }
}
async function loadAll(){
  const expectedUserId=me?.id?String(me.id):'';

  try{
    const d=await rpc('loadAll');

    // Defense in depth: even if a stale response somehow gets through,
    // never replace the current page with another user's dataset.
    if(expectedUserId&&String(d.user?.id||'')!==expectedUserId){
      throw staleSessionError();
    }

    me=d.user;
    users=d.users||[];
    adminUsers=d.adminUsers||[];
    taskTitles=d.taskTitles||[];
    incoming=d.incoming||[];
    outgoing=d.outgoing||[];
    myAllocations=d.myAllocations||[];
    myLeaves=d.myLeaves||[];
    myTrips=d.myTrips||[];
    holidays=d.holidays||[];
    adminTasksLoaded=false;
    adminTasks=[];
    teamCalendarCache.clear();

    renderMy();
    renderRequest();
    renderSchedule();
    refreshTaskTitleOptions();
  }catch(e){
    if(isStaleSessionError(e))return;

    if(/登入|session|權限/i.test(e.message)){
      setToken('');
      showLogin();
    }else{
      alert(e.message);
    }
  }
}

function taskTitleOptionsHtml(){
  return taskTitles.map(x=>`<option value="${attr(x)}"></option>`).join('');
}
function refreshTaskTitleOptions(){
  const self=$('#taskTitleOptionsSelf');
  if(self)self.innerHTML=taskTitleOptionsHtml();
  const req=$('#taskTitleOptionsRequest');
  if(req)req.innerHTML=taskTitleOptionsHtml();
}


function isMyTaskParticipant(t){
  return Array.isArray(t.participantIds)
    ? t.participantIds.map(String).includes(String(me.id))
    : String(t.assigneeId)===String(me.id);
}

function renderMy(){const el=$('#myView');if(!el)return;const pending=incoming.filter(x=>x.status==='pending').length,accepted=incoming.filter(x=>x.status==='accepted').length,completed=incoming.filter(x=>x.status==='completed').length,overdue=incoming.filter(x=>!['completed','rejected'].includes(x.status)&&daysToDue(x)<0).length;el.innerHTML=`<div class="page-header"><div><h1>我的工作</h1><div class="muted">查看待接受、已接單與已完成工作</div></div><div class="toolbar"><button class="primary" id="newSelfTask">＋新增自己的工作</button><div class="segmented"><button data-mode="list" class="${myMode==='list'?'active':''}">清單</button><button data-mode="calendar" class="${myMode==='calendar'?'active':''}">日曆</button></div></div></div><div class="cards"><div class="stat"><div class="muted">待接受</div><div class="n">${pending}</div></div><div class="stat"><div class="muted">已接單</div><div class="n">${accepted}</div></div><div class="stat"><div class="muted">已完成</div><div class="n">${completed}</div></div><div class="stat"><div class="muted">已逾期</div><div class="n">${overdue}</div></div></div><div id="myBody"></div>`;$('#newSelfTask').onclick=()=>{$('#selfTaskForm').reset();$('#selfTaskForm [name="plannedHours"]').value='8';$('#selfTaskForm [name="periodCount"]').value='4';$('#selfTaskPeriodicFields').classList.add('hidden');$('#periodCountField').classList.remove('hidden');$('#periodEndDateField').classList.add('hidden');$('#selfTaskCollaborativeFields').classList.add('hidden');$('#selfTaskCollaborators').innerHTML=users.filter(u=>String(u.id)!==String(me.id)&&u.active).map(u=>`<option value="${attr(u.id)}">${escapeHtml(u.displayName)}</option>`).join('');refreshTaskTitleOptions();$('#selfTaskDialog').showModal()};$$('[data-mode]',el).forEach(b=>b.addEventListener('click',()=>{myMode=b.dataset.mode;renderMy()}));myMode==='list'?renderMyList():renderCalendar()}

function toggleSelfCollaborativeFields(){
  const checked=$('#selfTaskCollaborative').checked;
  $('#selfTaskCollaborativeFields').classList.toggle('hidden',!checked);
  if(!checked){
    [...$('#selfTaskCollaborators').options].forEach(o=>o.selected=false);
  }
}

function toggleSelfPeriodicFields(){
  const checked=$('#selfTaskPeriodic').checked;
  $('#selfTaskPeriodicFields').classList.toggle('hidden',!checked);
  togglePeriodEndMode();
}

function togglePeriodEndMode(){
  const mode=$('#periodEndMode')?.value||'count';
  $('#periodCountField')?.classList.toggle('hidden',mode!=='count');
  $('#periodEndDateField')?.classList.toggle('hidden',mode!=='date');

  const form=$('#selfTaskForm');
  if(!form)return;

  form.elements.periodCount.required=$('#selfTaskPeriodic').checked&&mode==='count';
  form.elements.periodSeriesEndDate.required=$('#selfTaskPeriodic').checked&&mode==='date';
}

async function handleSelfTask(e){
  e.preventDefault();
  const form=e.currentTarget;
  const payload=Object.fromEntries(new FormData(form));

  payload.isCollaborative=form.elements.isCollaborative.checked;
  payload.collaboratorIds=payload.isCollaborative
    ? [...form.elements.collaboratorIds.selectedOptions].map(o=>o.value)
    : [];

  if(payload.isCollaborative&&!payload.collaboratorIds.length){
    alert('共同作業請至少選擇一位共同作業人員');
    return;
  }

  payload.isPeriodic=form.elements.isPeriodic.checked;

  if(payload.isPeriodic){
    payload.periodCadenceWeeks=Number(form.elements.periodCadenceWeeks.value);
    payload.periodEndMode=form.elements.periodEndMode.value;

    if(payload.periodEndMode==='count'){
      payload.periodCount=Number(form.elements.periodCount.value);
      payload.periodSeriesEndDate='';
    }else{
      payload.periodSeriesEndDate=form.elements.periodSeriesEndDate.value;
      payload.periodCount='';
    }
  }else{
    payload.periodCadenceWeeks='';
    payload.periodEndMode='';
    payload.periodCount='';
    payload.periodSeriesEndDate='';
  }

  try{
    const result=await rpc('createSelfTask',payload);
    $('#selfTaskDialog').close();
    await loadAll();

    if(payload.isPeriodic){
      alert(`週期工作已建立，共 ${result.periodCount} 個週期。`);
    }else{
      alert('自己的工作已建立，已自動接單');
    }
  }catch(err){
    alert(err.message);
  }
}
function renderMyList(){const body=$('#myBody');const rows=incoming.map(t=>`<tr class="${colorClass(t)}"><td>${t.urgent?'<span class="urgent">!</span> ':''}<button class="link-btn" data-detail="${t.id}">${escapeHtml(t.workType)}</button>${t.isCollaborative?'<span class="collab-badge">共同作業</span>':''}${t.selfAssigned?'<div class="mini">自己建立</div>':''}</td><td>${escapeHtml(t.requesterName)}</td><td>${fmtDate(t.requestDate)}</td><td>${num(t.plannedHours)}h</td><td><span class="visibility-badge ${t.visibility==='private'?'private':'public'}">${t.visibility==='private'?'私人':'公開'}</span></td><td><span class="badge ${t.status}">${statusText(t.status)}</span></td><td>${taskActions(t)}</td></tr>`).join('');body.innerHTML=`<div class="panel table-scroll"><table><thead><tr><th>工作類型</th><th>派工者</th><th>需求日期</th><th>預估工時</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">目前沒有工作</td></tr>'}</tbody></table></div>`;bindTaskActions(body)}
function taskActions(t){if(t.status==='pending')return`<div class="row-actions"><button class="secondary" data-accept="${t.id}">接受</button><button class="danger" data-reject="${t.id}">拒絕</button></div>`;if(['accepted','completed'].includes(t.status))return`<div class="row-actions"><button class="ghost" data-urgent="${t.id}" data-value="${t.urgent?0:1}">${t.urgent?'取消緊急':'標示緊急'}</button><button class="secondary" data-complete="${t.id}" data-value="${t.status==='completed'?0:1}">${t.status==='completed'?'改回未完成':'完成'}</button></div>`;if(t.status==='cancelled')return`<button class="secondary" data-restart="${t.id}">重新啟動</button>`;return t.rejectionReason?`<span class="muted">理由：${escapeHtml(t.rejectionReason)}</span>`:'-'}
function bindTaskActions(root){
  $$('[data-detail]',root).forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));

  $$('[data-accept]',root).forEach(b=>b.addEventListener('click',async()=>{
    try{
      await rpc('acceptTask',taskVersionPayload(b.dataset.accept,{taskId:b.dataset.accept}));
      await loadAll();
    }catch(e){alert(e.message)}
  }));

  $$('[data-reject]',root).forEach(b=>b.addEventListener('click',()=>{
    $('#rejectForm [name="task_id"]').value=b.dataset.reject;
    $('#rejectForm [name="reason"]').value='';
    $('#rejectDialog').showModal();
  }));

  $$('[data-urgent]',root).forEach(b=>b.addEventListener('click',async()=>{
    try{
      await rpc('setUrgent',taskVersionPayload(b.dataset.urgent,{taskId:b.dataset.urgent,urgent:b.dataset.value==='1'}));
      await loadAll();
    }catch(e){alert(e.message)}
  }));

  $$('[data-complete]',root).forEach(b=>b.addEventListener('click',async()=>{
    const t=incoming.find(x=>String(x.id)===String(b.dataset.complete));
    if(!t)return;

    const completing=b.dataset.value==='1';
    const payload={taskId:t.id,completed:completing};

    if(!completing&&String(t.requestDate)<isoDate(new Date())){
      const requestDate=prompt('原需求日已過，請輸入新的需求日期（YYYY-MM-DD）',isoDate(new Date()));
      if(!requestDate)return;
      payload.requestDate=requestDate;
    }

    try{
      await rpc('setCompleted',payload);
      await loadAll();
    }catch(e){alert(e.message)}
  }));

  $$('[data-restart]',root).forEach(b=>b.addEventListener('click',async()=>{
    await restartTaskFromUi(b.dataset.restart);
  }));
}

async function restartTaskFromUi(taskId){
  const t=incoming.find(x=>String(x.id)===String(taskId));
  if(!t)return;

  const payload=taskVersionPayload(t,{taskId:t.id});

  if(String(t.requestDate)<isoDate(new Date())){
    const requestDate=prompt('原需求日已過，請輸入新的需求日期（YYYY-MM-DD）',isoDate(new Date()));
    if(!requestDate)return;

    const plannedHoursRaw=prompt('請確認重新啟動後的預估總工時',String(t.plannedHours));
    if(plannedHoursRaw===null)return;

    const plannedHours=Number(plannedHoursRaw);
    if(!Number.isFinite(plannedHours)||plannedHours<=0){
      alert('預估總工時必須大於 0');
      return;
    }

    payload.requestDate=requestDate;
    payload.plannedHours=plannedHours;
  }

  try{
    await rpc('restartTask',payload);
    await loadAll();
  }catch(e){
    alert(e.message);
  }
}

async function handleReject(e){e.preventDefault();const fd=new FormData(e.currentTarget);try{await rpc('rejectTask',taskVersionPayload(fd.get('task_id'),{taskId:fd.get('task_id'),reason:fd.get('reason')}));$('#rejectDialog').close();await loadAll()}catch(err){alert(err.message)}}

function taskScheduleStartDate(t){
  if(t.isPeriodic&&t.periodStartDate)return String(t.periodStartDate).slice(0,10);
  const raw=t.acceptedAt||t.createdAt;
  return raw?isoDate(new Date(raw)):'';
}

function taskScheduleValidDates(t,currentRows=[]){
  const start=taskScheduleStartDate(t);
  const due=String(t.requestDate||'').slice(0,10);
  if(!start||!due||start>due)return[];

  const existingDates=new Set(
    currentRows.map(x=>String(
      typeof x==='string'
        ? x
        : (x.workDate||x.dataset?.scheduleDate||'')
    )).filter(Boolean)
  );

  const out=[];
  const d=new Date(`${start}T12:00:00`);
  const e=new Date(`${due}T12:00:00`);

  while(d<=e){
    const key=isoDate(d);
    const weekday=isWorkdayDate(d);
    const holiday=holidayRecordsOnDate(key).length>0;
    const leaveHours=leaveHoursOnDateClient(key);
    const availableHours=Math.max(0,8-leaveHours);

    if(weekday&&!holiday&&availableHours>0&&!existingDates.has(key)){
      out.push({
        date:key,
        leaveHours,
        availableHours
      });
    }

    d.setDate(d.getDate()+1);
  }

  return out;
}

function groupedTaskAllocations(allocations){
  const map=new Map();

  allocations.forEach(a=>{
    const date=String(a.workDate);
    const row=map.get(date)||{workDate:date,hours:0};
    row.hours+=Number(a.hours||0);
    map.set(date,row);
  });

  return [...map.values()]
    .map(x=>({...x,hours:Math.round(x.hours*100)/100}))
    .sort((a,b)=>a.workDate.localeCompare(b.workDate));
}

function refreshTaskScheduleSummary(t){
  const box=$('#taskScheduleEditor');
  if(!box)return;

  const inputs=$$('[data-schedule-hours]',box);
  const total=inputs.reduce((sum,input)=>sum+(Number(input.value)||0),0);
  const rounded=Math.round(total*100)/100;
  const planned=Math.round(Number(t.plannedHours||0)*100)/100;
  const diff=Math.round((planned-rounded)*100)/100;

  const summary=$('#taskScheduleSummary');
  const save=$('#saveTaskSchedule');

  if(summary){
    summary.innerHTML=diff===0
      ? `<strong>合計 ${num(rounded)}h / 預估 ${num(planned)}h</strong>`
      : `<strong>合計 ${num(rounded)}h / 預估 ${num(planned)}h</strong><span class="schedule-diff">尚差 ${num(diff)}h</span>`;
  }

  if(save)save.disabled=Math.abs(diff)>0.009||!inputs.length;
}

function addTaskScheduleRow(t){
  const select=$('#taskScheduleAddDate');
  if(!select||!select.value)return;

  const date=select.value;
  const list=$('#taskScheduleRows');
  if(!list)return;

  const currentInputs=$$('[data-schedule-hours]',$('#taskScheduleEditor'));
  const currentTotal=currentInputs.reduce((sum,input)=>sum+(Number(input.value)||0),0);
  const remaining=Math.round((Number(t.plannedHours||0)-currentTotal)*100)/100;
  const defaultHours=remaining>0?remaining:0.01;

  const row=document.createElement('div');
  row.className='allocation-row schedule-edit-row';
  row.dataset.scheduleDate=date;
  row.innerHTML=`
    <div>
      <strong>${fmtDate(date)}</strong>
      <div class="mini schedule-capacity-note"></div>
    </div>
    <div class="schedule-hours-control">
      <input type="number" min="0.01" max="999" step="0.01"
        value="${num(defaultHours)}"
        data-schedule-hours="${attr(date)}">
      <span>h</span>
      <button type="button" class="ghost" data-remove-schedule="${attr(date)}">移除</button>
    </div>
  `;

  list.appendChild(row);

  [...select.options].forEach(o=>{
    if(o.value===date)o.remove();
  });
  select.value='';

  bindTaskScheduleEditorEvents(t);
  refreshTaskScheduleSummary(t);
}

function bindTaskScheduleEditorEvents(t){
  const box=$('#taskScheduleEditor');
  if(!box)return;

  $$('[data-schedule-hours]',box).forEach(input=>{
    if(input.dataset.bound==='1')return;
    input.dataset.bound='1';
    input.addEventListener('input',()=>refreshTaskScheduleSummary(t));
  });

  $$('[data-remove-schedule]',box).forEach(btn=>{
    if(btn.dataset.bound==='1')return;
    btn.dataset.bound='1';
    btn.addEventListener('click',()=>{
      const date=btn.dataset.removeSchedule;
      const row=btn.closest('[data-schedule-date]');
      if(row)row.remove();

      const currentDates=$$('[data-schedule-date]',box)
        .map(r=>r.dataset.scheduleDate);
      const candidates=taskScheduleValidDates(t,currentDates);

      const select=$('#taskScheduleAddDate');
      if(select){
        select.innerHTML='<option value="">選擇工作日</option>'+
          candidates.map(x=>`<option value="${attr(x.date)}">${fmtDate(x.date)}${x.leaveHours>0?`（請假後可用 ${num(x.availableHours)}h）`:''}</option>`).join('');
      }

      refreshTaskScheduleSummary(t);
    });
  });
}


function openStopTaskDialog(task,source='user'){
  const form=$('#stopTaskForm');
  form.reset();
  form.elements.taskId.value=task.id;
  form.elements.source.value=source;
  form.dataset.expectedUpdatedAt=task.updatedAt||'';
  $('#stopTaskSummary').textContent=`${task.workType} · ${task.assigneeName||''}`;
  $('#stopTaskDialog').showModal();
}

async function handleStopTask(e){
  e.preventDefault();

  const form=e.currentTarget;
  const taskId=form.elements.taskId.value;
  const reason=form.elements.reason.value.trim();
  const source=form.elements.source.value;

  if(!reason){
    alert('請輸入中止理由');
    return;
  }

  try{
    await rpc('stopTask',{taskId,reason,expectedUpdatedAt:form.dataset.expectedUpdatedAt||''});
    $('#stopTaskDialog').close();

    if(source==='admin-user'&&adminUserWorkContext){
      $('#adminUserTaskDialog').close();
      await refreshAdminUserWork(adminUserWorkContext.user.id,false);
    }else{
      $('#taskDialog')?.close();
      await loadAll();
    }
  }catch(err){
    alert(err.message);
  }
}

function openDetail(id){
  const t=[...incoming,...outgoing].find(x=>String(x.id)===String(id));
  if(!t)return;

  const allocations=myAllocations
    .filter(a=>String(a.taskId)===String(t.id))
    .sort((a,b)=>String(a.workDate).localeCompare(String(b.workDate))||Number(a.hours)-Number(b.hours));

  const groupedAllocations=groupedTaskAllocations(allocations);
  const scheduledHours=groupedAllocations.reduce((s,a)=>s+Number(a.hours||0),0);
  const canEditSchedule=isMyTaskParticipant(t)&&t.status==='accepted';

  const scheduleCandidates=canEditSchedule
    ? taskScheduleValidDates(t,groupedAllocations)
    : [];

  const allocationHtml=isMyTaskParticipant(t)&&['accepted','completed'].includes(t.status)
    ? `<section class="task-detail-section allocation-detail" id="taskScheduleEditor">
        <h4>日曆排程</h4>

        ${canEditSchedule
          ? `<div id="taskScheduleSummary" class="allocation-total">合計 ${num(scheduledHours)}h / 預估 ${num(t.plannedHours)}h</div>
             <div id="taskScheduleRows">
               ${groupedAllocations.length
                 ? groupedAllocations.map(a=>{
                     const leaveHours=leaveHoursOnDateClient(a.workDate);
                     const availableHours=Math.max(0,8-leaveHours);
                     const historical=String(a.workDate)<isoDate(new Date());
                     return `<div class="allocation-row schedule-edit-row ${historical?'schedule-history-row':''}" data-schedule-date="${attr(a.workDate)}">
                       <div>
                         <strong>${fmtDate(a.workDate)}</strong>
                         ${historical?'<div class="mini">已發生工時 · 鎖定</div>':''}
                         ${leaveHours>0
                           ? `<div class="mini">${availableHours>0?`請假後可用 ${num(availableHours)}h`:'整天請假'}</div>`
                           : ''}
                       </div>
                       <div class="schedule-hours-control">
                         <input type="number" min="0.01" max="999" step="0.01"
                           value="${num(a.hours)}"
                           data-schedule-hours="${attr(a.workDate)}" ${historical?'disabled':''}>
                         <span>h</span>
                         ${historical?'':'<button type="button" class="ghost" data-remove-schedule="'+attr(a.workDate)+'">移除</button>'}
                       </div>
                     </div>`;
                   }).join('')
                 : '<div class="mini">目前沒有可顯示的日排程。</div>'}
             </div>

             <div class="schedule-add-row">
               <select id="taskScheduleAddDate">
                 <option value="">選擇工作日</option>
                 ${scheduleCandidates.map(x=>`<option value="${attr(x.date)}">${fmtDate(x.date)}${x.leaveHours>0?`（請假後可用 ${num(x.availableHours)}h）`:''}</option>`).join('')}
               </select>
               <button type="button" class="secondary" id="addTaskScheduleDate">新增工作日</button>
             </div>

             <div class="schedule-save-row">
               <button type="button" class="primary" id="saveTaskSchedule">儲存日曆排程</button>
               <div class="mini">每日工時合計必須等於預估總工時；新增工作日不可超過需求日。</div>
             </div>`
          : `<div class="allocation-total">已排 ${num(scheduledHours)}h / 預估 ${num(t.plannedHours)}h</div>
             ${groupedAllocations.length
               ? groupedAllocations.map(a=>`<div class="allocation-row">
                   <div><strong>${fmtDate(a.workDate)}</strong></div>
                   <div>${num(a.hours)}h</div>
                 </div>`).join('')
               : '<div class="mini">目前沒有可顯示的日排程。</div>'}`}
      </section>`
    : '';

  $('#taskDetail').innerHTML=`
  <div class="task-detail-summary">
    <div class="task-detail-summary-main">
      <div class="task-detail-eyebrow">工作任務</div>
      <h2>${escapeHtml(t.workType)}</h2>
      <div class="task-detail-badges">
        <span class="badge ${t.status}">${statusText(t.status)}</span>
        ${t.urgent?'<span class="urgent">!</span>':''}
        <span class="visibility-badge ${t.visibility==='private'?'private':'public'}">${t.visibility==='private'?'私人':'公開'}</span>
        ${t.isCollaborative?'<span class="collab-badge">共同作業</span>':''}
      </div>
    </div>

    <div class="task-summary-grid">
      <div class="task-summary-item">
        <span>需求日</span>
        <strong>${fmtDate(t.requestDate)}</strong>
      </div>
      <div class="task-summary-item">
        <span>預估工時</span>
        <strong>${num(t.plannedHours)}h</strong>
      </div>
      <div class="task-summary-item">
        <span>派工者</span>
        <strong>${escapeHtml(t.requesterName)}</strong>
      </div>
      <div class="task-summary-item">
        <span>負責人</span>
        <strong>${escapeHtml(t.assigneeName)}</strong>
      </div>
    </div>
  </div>

  <section class="task-detail-section">
    <div class="task-section-title">
      <div>
        <h3>工作內容</h3>
        <div class="mini">任務標題與需求內容</div>
      </div>
    </div>

    <label class="task-field">
      <span>工作類型</span>
      <input id="taskWorkTypeInput" list="taskTitleOptionsDetail" value="${attr(t.workType)}" ${t.status==='cancelled'?'disabled':''}>
      <datalist id="taskTitleOptionsDetail">${taskTitleOptionsHtml()}</datalist>
    </label>

    <label class="task-field">
      <span>需求內容</span>
      <textarea id="taskContentInput" rows="5" ${t.status==='cancelled'?'disabled':''}>${escapeHtml(t.content)}</textarea>
    </label>

    ${t.status!=='cancelled'
      ? '<div class="task-section-actions"><button type="button" id="saveTaskDetails" class="secondary">更新工作內容</button></div>'
      : ''}
  </section>

  <details class="task-detail-section task-detail-fold">
    <summary>
      <div>
        <h3>任務設定</h3>
        <div class="mini">需求日、總工時、公開屬性與共同作業</div>
      </div>
      <span class="task-fold-indicator"></span>
    </summary>

    <div class="task-fold-body">
      <div class="task-setting-grid">
        <div class="task-setting-item">
          <div class="task-setting-label">任務類型</div>
          <div>${t.isPeriodic
            ? `週期工作（第 ${t.periodIndex}/${t.periodCount} 期 · ${t.periodCadenceWeeks===2?'雙週':'每週'} · ${fmtDate(t.periodStartDate)} ～ ${fmtDate(t.requestDate)}）`
            : '一般工作'}</div>
        </div>

        <div class="task-setting-item">
          <div class="task-setting-label">需求日期</div>
          <div>
            ${t.selfAssigned&&t.status==='accepted'&&String(t.assigneeId)===String(me.id)
              ? `<div class="request-date-edit">
                  <input id="taskRequestDateInput" type="date" value="${attr(t.requestDate)}">
                  <button type="button" id="saveTaskRequestDate" class="secondary">更新</button>
                </div>
                <div class="mini">日期往前縮時，超出的排程會收回有效期間內。</div>`
              : `<strong>${fmtDate(t.requestDate)}</strong>`}
          </div>
        </div>

        <div class="task-setting-item">
          <div class="task-setting-label">預估總工時</div>
          <div>
            <div class="planned-hours-edit">
              <input id="taskPlannedHoursInput" type="number" min="0.01" max="999" step="0.01" value="${num(t.plannedHours)}">
              <span>小時</span>
              <button type="button" id="saveTaskPlannedHours" class="secondary">更新</button>
            </div>
            <div class="mini">更新後依目前各工作日工時比例重新配比。</div>
          </div>
        </div>

        <div class="task-setting-item">
          <div class="task-setting-label">公開屬性</div>
          <div>
            <div class="task-inline-controls">
              <select id="taskVisibilitySelect" class="inline-visibility-select">
                <option value="public" ${t.visibility!=='private'?'selected':''}>公開</option>
                <option value="private" ${t.visibility==='private'?'selected':''}>私人</option>
              </select>
              <button type="button" id="saveTaskVisibility" class="secondary">更新</button>
            </div>
            <div class="mini">僅影響免登入任務儀表板。</div>
          </div>
        </div>

        ${t.status==='accepted'&&String(t.assigneeId)===String(me.id)?`
          <div class="task-setting-item task-setting-wide">
            <div class="task-setting-label">新增共同作業</div>
            <div>
              <select id="addCollaboratorSelect" multiple size="4">
                ${users
                  .filter(u=>u.active&&String(u.id)!==String(me.id))
                  .map(u=>`<option value="${attr(u.id)}">${escapeHtml(u.displayName)}</option>`)
                  .join('')}
              </select>
              <div class="task-section-actions">
                <button type="button" id="addCollaboratorBtn" class="secondary">指派共同作業</button>
              </div>
              <div class="mini">新成員各自負荷完整預估總工時，並建立自己的排程與 Loading。</div>
            </div>
          </div>`:''}
      </div>
    </div>
  </details>

  ${allocationHtml}

  <details class="task-detail-section task-detail-fold task-history">
    <summary>
      <div>
        <h3>歷程紀錄</h3>
        <div class="mini">建立、接單、完成與異常原因</div>
      </div>
      <span class="task-fold-indicator"></span>
    </summary>
    <div class="task-fold-body">
      <div class="task-history-grid">
        <div><span>建立時間</span><strong>${fmtDateTime(t.createdAt)}</strong></div>
        <div><span>接單時間</span><strong>${fmtDateTime(t.acceptedAt)}</strong></div>
        <div><span>完成時間</span><strong>${fmtDateTime(t.completedAt)}</strong></div>
        <div><span>目前狀態</span><strong>${statusText(t.status)}</strong></div>
        ${t.rejectionReason?`<div class="task-history-wide"><span>拒絕理由</span><strong>${escapeHtml(t.rejectionReason)}</strong></div>`:''}
        ${t.cancelledReason?`<div class="task-history-wide"><span>中止理由</span><strong>${escapeHtml(t.cancelledReason)}</strong></div>`:''}
      </div>
    </div>
  </details>

  ${!['completed','rejected','cancelled'].includes(t.status)?`
    <section class="task-detail-section task-danger-zone">
      <div>
        <h3>任務操作</h3>
        <div class="mini">${t.isCollaborative
          ? '中止只影響你自己的共同作業任務，不影響其他共同作業者。'
          : '中止後不再計入 Loading，也不再顯示於工作日曆。'}</div>
      </div>
      <button type="button" id="stopTaskBtn" class="danger">中止任務</button>
    </section>`:''}

  ${t.status==='cancelled'?`
    <section class="task-detail-section task-restart-zone">
      <div>
        <h3>重新啟動</h3>
        <div class="mini">從重啟日到需求日重新平均分配完整預估工時。</div>
      </div>
      <button type="button" id="restartTaskBtn" class="secondary">重新啟動任務</button>
    </section>`:''}
  `;

  if(canEditSchedule){
    bindTaskScheduleEditorEvents(t);
    refreshTaskScheduleSummary(t);

    $('#addTaskScheduleDate')?.addEventListener('click',()=>{
      addTaskScheduleRow(t);
    });

    $('#saveTaskSchedule')?.addEventListener('click',async()=>{
      const entries=$$('[data-schedule-date]',$('#taskScheduleEditor')).map(row=>({
        workDate:row.dataset.scheduleDate,
        hours:Number(row.querySelector('[data-schedule-hours]')?.value||0)
      }));

      if(!entries.length){
        alert('至少需要保留一個工作日排程');
        return;
      }

      const total=Math.round(entries.reduce((s,x)=>s+Number(x.hours||0),0)*100)/100;
      const planned=Math.round(Number(t.plannedHours||0)*100)/100;

      if(Math.abs(total-planned)>0.009){
        alert(`每日工時合計必須等於預估總工時 ${num(planned)}h，目前合計 ${num(total)}h`);
        return;
      }

      try{
        await rpc('updateTaskSchedule',taskVersionPayload(t,{
          taskId:t.id,
          entries:JSON.stringify(entries)
        }));
        await loadAll();
        openDetail(t.id);
      }catch(err){
        alert(err.message);
      }
    });
  }

  const addCollaboratorBtn=$('#addCollaboratorBtn');
  if(addCollaboratorBtn){
    addCollaboratorBtn.addEventListener('click',async()=>{
      const select=$('#addCollaboratorSelect');
      const userIds=[...select.selectedOptions].map(o=>o.value);

      if(!userIds.length){
        alert('請至少選擇一位共同作業者');
        return;
      }

      try{
        await rpc('addTaskCollaborators',taskVersionPayload(t,{taskId:t.id,userIds}));
        await loadAll();
        openDetail(t.id);
      }catch(err){
        alert(err.message);
      }
    });
  }

  const saveRequestDateBtn=$('#saveTaskRequestDate');
  if(saveRequestDateBtn){
    saveRequestDateBtn.addEventListener('click',async()=>{
      const requestDate=$('#taskRequestDateInput').value;
      if(!requestDate){alert('請選擇需求日期');return}
      try{
        await rpc('updateSelfTaskRequestDate',taskVersionPayload(t,{taskId:t.id,requestDate}));
        await loadAll();
        openDetail(t.id);
      }catch(err){alert(err.message)}
    });
  }

  const saveDetailsBtn=$('#saveTaskDetails');
  if(saveDetailsBtn){
    saveDetailsBtn.addEventListener('click',async()=>{
      const workType=$('#taskWorkTypeInput').value.trim();
      const content=$('#taskContentInput').value.trim();
      if(!workType||!content){alert('工作類型與需求內容不可空白');return}
      try{
        await rpc('updateTaskDetails',taskVersionPayload(t,{taskId:t.id,workType,content}));
        await loadAll();
        openDetail(t.id);
      }catch(err){alert(err.message)}
    });
  }

  const stopBtn=$('#stopTaskBtn');
  if(stopBtn){
    stopBtn.addEventListener('click',()=>openStopTaskDialog(t,'user'));
  }

  const restartBtn=$('#restartTaskBtn');
  if(restartBtn){
    restartBtn.addEventListener('click',async()=>{
      await restartTaskFromUi(t.id);
      if($('#taskDialog').open){
        const refreshed=incoming.find(x=>String(x.id)===String(t.id));
        if(refreshed)openDetail(t.id);
        else $('#taskDialog').close();
      }
    });
  }

  const plannedHoursBtn=$('#saveTaskPlannedHours');
  if(plannedHoursBtn){
    plannedHoursBtn.addEventListener('click',async()=>{
      const plannedHours=Number($('#taskPlannedHoursInput').value);
      if(!Number.isFinite(plannedHours)||plannedHours<=0||plannedHours>999){
        alert('請輸入 0～999 之間的有效工時');
        return;
      }
      try{
        await rpc('updateTaskPlannedHours',taskVersionPayload(t,{taskId:t.id,plannedHours}));
        await loadAll();
        openDetail(t.id);
      }catch(err){
        alert(err.message);
      }
    });
  }

  const visibilityBtn=$('#saveTaskVisibility');
  if(visibilityBtn){
    visibilityBtn.addEventListener('click',async()=>{
      const visibility=$('#taskVisibilitySelect').value;
      try{
        await rpc('setTaskVisibility',taskVersionPayload(t,{taskId:t.id,visibility}));
        await loadAll();
        openDetail(t.id);
      }catch(err){
        alert(err.message);
      }
    });
  }

  $('#taskDialog').showModal();
}


function openMoveAllocation(allocationId){
  const a=myAllocations.find(x=>String(x.id)===String(allocationId));
  if(!a)return;
  const t=incoming.find(x=>String(x.id)===String(a.taskId));
  if(!t||t.status!=='accepted')return;
  const form=$('#moveAllocationForm');
  form.reset();
  form.elements.allocationId.value=a.id;
  form.elements.targetDate.min=String(t.acceptedAt||t.createdAt).slice(0,10);
  form.elements.targetDate.max=t.requestDate;
  form.elements.targetDate.value=a.workDate;
  $('#moveAllocationSummary').innerHTML=`<strong>${escapeHtml(t.workType)}</strong><div>目前：${fmtDate(a.workDate)} · ${num(a.hours)}h</div>`;
  $('#moveAllocationDialog').showModal();
}

async function handleMoveAllocation(e){
  e.preventDefault();
  const form=e.currentTarget;
  const allocationId=form.elements.allocationId.value;
  const a=myAllocations.find(x=>String(x.id)===String(allocationId));
  if(!a)return;
  const targetDate=form.elements.targetDate.value;
  if(!targetDate){alert('請指定目標日期');return}
  if(targetDate===a.workDate){$('#moveAllocationDialog').close();return}
  const same=myAllocations.filter(x=>String(x.taskId)===String(a.taskId)&&String(x.workDate)===String(targetDate)&&String(x.id)!==String(a.id));
  let merge=false;
  if(same.length){
    merge=confirm(`目標日期已有相同任務共 ${num(same.reduce((s,x)=>s+Number(x.hours||0),0))}h。\n\n按「確定」：與目標日任務合併。\n按「取消」：仍移動，但保留為獨立區塊。`);
  }
  try{
    const task=findTaskSnapshot(a.taskId);
    await rpc('moveAllocation',taskVersionPayload(task,{allocationId,targetDate,merge}));
    $('#moveAllocationDialog').close();
    await loadAll();
    openDetail(a.taskId);
  }catch(err){alert(err.message)}
}

function openSplitAllocation(allocationId){
  const a=myAllocations.find(x=>String(x.id)===String(allocationId));
  if(!a)return;
  const t=incoming.find(x=>String(x.id)===String(a.taskId));
  if(!t||t.status!=='accepted')return;

  const form=$('#splitAllocationForm');
  form.reset();
  form.elements.allocationId.value=a.id;
  form.elements.movePercent.value='50';
  form.elements.targetDate.min=isoDate(new Date(t.acceptedAt||t.createdAt));
  form.elements.targetDate.max=t.requestDate;
  form.elements.targetDate.value='';

  $('#splitAllocationSummary').innerHTML=`<strong>${escapeHtml(t.workType)}</strong><div>${fmtDate(a.workDate)} · ${num(a.hours)}h</div>`;
  updateSplitPreview();
  updateSplitTargetHint();
  $('#splitAllocationDialog').showModal();
}

function updateSplitPreview(){
  const form=$('#splitAllocationForm');
  if(!form)return;
  const a=myAllocations.find(x=>String(x.id)===String(form.elements.allocationId.value));
  if(!a)return;
  const pct=Math.min(99,Math.max(1,Number(form.elements.movePercent.value)||0));
  const moved=Math.round(Number(a.hours)*pct)/100;
  const remain=Math.round((Number(a.hours)-moved)*100)/100;
  $('#splitAllocationPreview').textContent=`原區塊保留約 ${num(remain)}h，移至目標日約 ${num(moved)}h。`;
}

function updateSplitTargetHint(){
  const form=$('#splitAllocationForm');
  if(!form)return;
  const a=myAllocations.find(x=>String(x.id)===String(form.elements.allocationId.value));
  const target=form.elements.targetDate.value;
  if(!a||!target){$('#splitTargetHint').textContent='';return}
  const same=myAllocations.filter(x=>String(x.taskId)===String(a.taskId)&&String(x.workDate)===target&&String(x.id)!==String(a.id));
  $('#splitTargetHint').textContent=same.length
    ? `目標日已有相同任務 ${num(same.reduce((s,x)=>s+Number(x.hours||0),0))}h，送出時會詢問是否合併。`
    : '';
}

async function handleSplitAllocation(e){
  e.preventDefault();
  const form=e.currentTarget;
  const allocationId=form.elements.allocationId.value;
  const a=myAllocations.find(x=>String(x.id)===String(allocationId));
  if(!a)return;

  const targetDate=form.elements.targetDate.value;
  const movePercent=Number(form.elements.movePercent.value);
  if(!targetDate){alert('請指定分拆目標日');return}

  const same=myAllocations.filter(x=>String(x.taskId)===String(a.taskId)&&String(x.workDate)===targetDate&&String(x.id)!==String(a.id));
  let mergeTarget=false;
  if(same.length){
    mergeTarget=confirm(`目標日已有相同任務 ${num(same.reduce((s,x)=>s+Number(x.hours||0),0))}h。

按「確定」：與目標日任務合併。
按「取消」：保留為另一個獨立區塊。`);
  }

  try{
    const task=findTaskSnapshot(a.taskId);
    await rpc('splitAllocation',taskVersionPayload(task,{allocationId,targetDate,movePercent,mergeTarget}));
    $('#splitAllocationDialog').close();
    await loadAll();
    openDetail(a.taskId);
  }catch(err){
    alert(err.message);
  }
}


function renderCalendar(){
  const body=$('#myBody');

  const renderWeek=(weekStart,weekIndex)=>{
    const days=[0,1,2,3,4,5,6].map(i=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d});
    const names=['一','二','三','四','五','六','日'];
    const headers=days.map((d,i)=>`<div class="calendar-head ${!isWorkdayDate(d)?'weekend':''}">${names[i]}<br>${d.getMonth()+1}/${d.getDate()}</div>`).join('');

    const cells=days.map(d=>{
      const date=isoDate(d);
      const weekday=isWorkdayDate(d);
      const holidayList=holidayRecordsOnDate(date);
      const workday=weekday&&holidayList.length===0;
      const leaves=workday?leaveRecordsOnDate(d):[];
      const leaveHours=workday?leaveHoursOnDateClient(date):0;
      const availableHours=Math.max(0,8-leaveHours);
      const availableDrop=workday&&availableHours>0;
      const allocations=workday
        ? myAllocations.filter(a=>String(a.workDate)===date).map(a=>({allocation:a,task:incoming.find(t=>String(t.id)===String(a.taskId))})).filter(x=>x.task&&['accepted','completed'].includes(x.task.status))
        : [];

      const activeHours=allocations
        .filter(x=>x.task.status==='accepted')
        .reduce((sum,x)=>sum+Number(x.allocation.hours||0),0);

      const dayLoadPct=availableHours>0
        ? activeHours/availableHours*100
        : 0;

      const partialLeaveLoad=leaves.length&&availableHours>0
        ? `<span class="load-chip ${dayLoadPct>100?'over':dayLoadPct>80?'high':''}" title="可用 ${num(availableHours)}h · Loading ${Math.round(dayLoadPct)}%">${Math.round(dayLoadPct)}%</span>`
        : '';

      const dayClass=holidayList.length?'holiday-day':!weekday?'weekend':leaves.length?'leave-day':'';
      const notice=holidayList.length
        ? holidayList.map(x=>`<div class="event-strip holiday">國休｜${escapeHtml(x.holidayName)}</div>`).join('')
        : !weekday
          ? `<div class="calendar-block-note">非工作日</div>`
          : leaves.length
            ? leaves.map(x=>`<div class="event-strip leave">假｜${escapeHtml(x.leaveType)}<div class="range-label">${fmtLocalDateTime(x.startDateTime)} ～ ${fmtLocalDateTime(x.endDateTime)}</div></div>`).join('')+
              `<div class="calendar-block-note">${availableHours>0?`可用 ${num(availableHours)}h`:'整天請假・不可派工'}</div>`
            : '';
      return `<div class="calendar-day ${dayClass} ${availableDrop?'calendar-drop-zone':''}" data-calendar-date="${date}">
        <div class="calendar-date-row">
          <div class="calendar-date">${d.getMonth()+1}/${d.getDate()}</div>
          ${partialLeaveLoad}
        </div>
        ${notice}
        ${allocations.map(({allocation:a,task:t})=>`<div class="cal-task ${calClass(t)} ${t.status==='accepted'?'draggable-task':''}" data-detail="${t.id}" data-allocation-id="${a.id}" data-task-id="${t.id}" draggable="${t.status==='accepted'?'true':'false'}" title="${t.status==='accepted'?'拖曳可重新安排日期；點擊可查看、移動與分拆':'已完成任務'}"><div class="cal-task-main">${t.urgent?'<b>!</b> ':''}${escapeHtml(t.workType)}${t.isCollaborative?'<span class="cal-collab">共同</span>':''}</div><div class="cal-hours">${num(a.hours)}h</div></div>`).join('')}
      </div>`;
    }).join('');

    const end=days[6];
    return `<section class="calendar-week-block"><div class="calendar-week-label"><strong>${weekIndex===0?'第 1 週':'第 2 週'}</strong><span>${days[0].getMonth()+1}/${days[0].getDate()} ～ ${end.getMonth()+1}/${end.getDate()}</span></div><div class="calendar-grid">${headers}${cells}</div></section>`;
  };

  const secondWeekStart=new Date(currentWeekStart);
  secondWeekStart.setDate(secondWeekStart.getDate()+7);

  body.innerHTML=`<div class="page-header"><div class="toolbar"><button class="ghost" id="prevWeek">← 前一週</button><button class="ghost" id="thisWeek">今天</button><button class="ghost" id="nextWeek">後一週 →</button></div><div class="muted">一次顯示連續兩週，可直接跨週拖曳；也可點進任務使用「移動日期」</div></div><div class="two-week-calendar">${renderWeek(currentWeekStart,0)}${renderWeek(secondWeekStart,1)}</div>`;

  $('#prevWeek').onclick=()=>{currentWeekStart.setDate(currentWeekStart.getDate()-7);renderCalendar()};
  $('#thisWeek').onclick=()=>{currentWeekStart=startOfWeek(new Date());renderCalendar()};
  $('#nextWeek').onclick=()=>{currentWeekStart.setDate(currentWeekStart.getDate()+7);renderCalendar()};
  bindCalendarInteractions(body);
}

function bindCalendarInteractions(root){
  let draggedId='';

  $$('.cal-task[data-detail]',root).forEach(el=>{
    el.addEventListener('click',()=>openDetail(el.dataset.detail));

    if(el.getAttribute('draggable')!=='true')return;

    el.addEventListener('dragstart',e=>{
      draggedId=el.dataset.allocationId;
      el.classList.add('dragging');
      if(e.dataTransfer){
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',draggedId);
      }
    });

    el.addEventListener('dragend',()=>{
      el.classList.remove('dragging');
      $$('.calendar-day.drag-over',root).forEach(x=>x.classList.remove('drag-over'));
      draggedId='';
    });
  });

  $$('.calendar-drop-zone',root).forEach(day=>{
    day.addEventListener('dragover',e=>{
      e.preventDefault();
      if(e.dataTransfer)e.dataTransfer.dropEffect='move';
      day.classList.add('drag-over');
    });

    day.addEventListener('dragleave',e=>{
      if(!day.contains(e.relatedTarget))day.classList.remove('drag-over');
    });

    day.addEventListener('drop',async e=>{
      e.preventDefault();
      day.classList.remove('drag-over');

      const allocationId=(e.dataTransfer&&e.dataTransfer.getData('text/plain'))||draggedId;
      if(!allocationId)return;

      const source=myAllocations.find(a=>String(a.id)===String(allocationId));
      if(!source)return;

      const targetDate=day.dataset.calendarDate;

      const task=incoming.find(t=>String(t.id)===String(source.taskId));
      if(!task)return;

      const same=myAllocations.filter(a=>
        String(a.taskId)===String(source.taskId)&&
        String(a.workDate)===targetDate&&
        String(a.id)!==String(source.id)
      );

      let merge=false;
      if(same.length){
        merge=confirm(`${fmtDate(targetDate)} 已有相同任務「${task.workType}」共 ${num(same.reduce((s,a)=>s+Number(a.hours||0),0))}h。

按「確定」：把拖過來的 ${num(source.hours)}h 合併進同一區塊。
按「取消」：不做任何變更。`);
        if(!merge)return;
      }else if(targetDate===source.workDate){
        return;
      }

      try{
        await rpc('moveAllocation',{allocationId,targetDate,merge});
        await loadAll();
      }catch(err){
        alert(err.message);
      }
    });
  });
}

function renderRequest(){
  const el=$('#requestView');
  if(!el)return;

  const options=users
    .filter(u=>String(u.id)!==String(me.id)&&u.active)
    .map(u=>`<option value="${attr(u.id)}">${escapeHtml(u.displayName)} (${escapeHtml(u.username)})</option>`)
    .join('');

  const rows=outgoing
    .filter(t=>!t.selfAssigned)
    .map(t=>`<tr>
      <td><button class="link-btn" data-detail="${t.id}">${escapeHtml(t.workType)}</button></td>
      <td>${escapeHtml(t.assigneeName)}</td>
      <td>${fmtDate(t.requestDate)}</td>
      <td>${num(t.plannedHours)}h</td>
      <td><span class="badge ${t.status}">${statusText(t.status)}</span></td>
      <td>${t.rejectionReason?escapeHtml(t.rejectionReason):'-'}</td>
    </tr>`).join('');

  el.innerHTML=`<div class="page-header">
    <div>
      <h1>指派任務</h1>
      <div class="muted">可一次選擇多位人員；每位人員會建立獨立派工，判定、接單與工時計算都與單一派工相同。</div>
    </div>
  </div>

  <div class="request-grid">
    <form id="createTaskForm" class="form-card">
      <h3>新增派工</h3>

      <label>被派工者
        <select name="assigneeIds" multiple size="6" required>${options}</select>
        <span class="mini">可選多位。每位都會各自負荷完整預估工時，不會彼此拆分。</span>
      </label>

      <label>工作類型
        <input name="workType" list="taskTitleOptionsRequest" placeholder="自由輸入或選擇既有名稱" required>
        <datalist id="taskTitleOptionsRequest">${taskTitleOptionsHtml()}</datalist>
      </label>

      <label>需求內容<textarea name="content" rows="5" required></textarea></label>
      <label>需求日期<input type="date" name="requestDate" required></label>
      <label>預估工時（小時）<input type="number" name="plannedHours" min="0.25" max="999" step="0.25" value="8" required></label>
      <label>是否公開
        <select name="visibility" required>
          <option value="public" selected>公開</option>
          <option value="private">私人</option>
        </select>
      </label>

      <div id="availabilityHint" class="hint-box">
        選擇被派工者、需求日期與預估工時後，系統會逐一檢查行事曆。
      </div>

      <button class="primary" type="submit">送出派工</button>
    </form>

    <div class="panel table-scroll">
      <table>
        <thead><tr><th>工作類型</th><th>被派工者</th><th>需求日期</th><th>預估工時</th><th>狀態</th><th>拒絕理由</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="6" class="empty">尚未建立派工</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;

  const form=$('#createTaskForm');

  ['assigneeIds','requestDate','plannedHours'].forEach(n=>{
    form.elements[n].addEventListener('change',()=>scheduleAvailabilityCheck(form));
  });

  form.elements.plannedHours.addEventListener('input',()=>scheduleAvailabilityCheck(form));

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const taskForm=e.currentTarget;

    const assigneeIds=[...taskForm.elements.assigneeIds.selectedOptions].map(o=>o.value);
    if(!assigneeIds.length){
      alert('請至少選擇一位被派工者');
      return;
    }

    const payload=Object.fromEntries(new FormData(taskForm));
    payload.assigneeIds=assigneeIds;

    try{
      const checks=await Promise.all(
        assigneeIds.map(async id=>({
          user:users.find(u=>String(u.id)===String(id)),
          result:await rpc('checkAvailability',{
            assigneeId:id,
            requestDate:payload.requestDate,
            plannedHours:payload.plannedHours
          })
        }))
      );

      const warnings=checks.filter(x=>x.result.hasWarning);
      if(warnings.length){
        const text=['以下人員有行事曆提示：'];
        warnings.forEach(x=>{
          text.push('');
          text.push(`【${x.user?.displayName||'人員'}】`);
          text.push(availabilityConfirmText(x.result).replace(/^被派工者的行事曆有以下提示：\n?/,''));
        });
        text.push('');
        text.push('仍要送出多重派工嗎？');
        if(!confirm(text.join('\n')))return;
      }

      const result=await rpc('createTask',payload);

      taskForm.reset();
      taskForm.elements.plannedHours.value='8';
      lastAvailability=null;
      await loadAll();

      alert(`派工已送出，共 ${result.count||assigneeIds.length} 位人員`);
    }catch(err){
      alert(err.message);
    }
  });

  $$('[data-detail]',el).forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));
}

function scheduleAvailabilityCheck(form){clearTimeout(availabilityTimer);availabilityTimer=setTimeout(()=>checkAvailabilityUI(form),450)}async function checkAvailabilityUI(form){
  const hint=$('#availabilityHint');
  if(!hint)return;

  const assigneeIds=[...form.elements.assigneeIds.selectedOptions].map(o=>o.value);
  const requestDate=form.elements.requestDate.value;
  const plannedHours=form.elements.plannedHours.value;

  if(!assigneeIds.length||!requestDate||!plannedHours){
    hint.className='hint-box';
    hint.textContent='選擇被派工者、需求日期與預估工時後，系統會逐一檢查行事曆。';
    return;
  }

  hint.className='hint-box';
  hint.textContent=`正在檢查 ${assigneeIds.length} 位人員的行事曆…`;

  try{
    const results=await Promise.all(
      assigneeIds.map(async id=>{
        const result=await rpc('checkAvailability',{
          assigneeId:id,
          requestDate,
          plannedHours
        });

        return {
          id,
          user:users.find(u=>String(u.id)===String(id)),
          result
        };
      })
    );

    const hasWarning=results.some(x=>x.result.hasWarning);
    lastAvailability=results;

    hint.className=`hint-box ${hasWarning?'warn':'ok'}`;
    hint.innerHTML=results.map(x=>`
      <div class="multi-availability-person">
        <strong>${escapeHtml(x.user?.displayName||'人員')}</strong>
        ${availabilityHtml(x.result)}
      </div>
    `).join('');
  }catch(e){
    hint.className='hint-box warn';
    hint.textContent=e.message;
  }
}

function availabilityHtml(d){const lines=[`預估期間最高 Loading：<strong>${Math.round(d.peakLoadPct)}%</strong>`];if(d.highLoadDates?.length)lines.push(`Loading > 80%：${d.highLoadDates.map(x=>fmtDate(x.date)+' ('+Math.round(x.loadPct)+'%)').join('、')}`);if(d.holidays?.length)lines.push(`國定假日：${d.holidays.map(x=>escapeHtml(x.holidayName)+' '+fmtDate(x.holidayDate)).join('；')}`);if(d.leaves?.length)lines.push(`請假：${d.leaves.map(x=>escapeHtml(x.leaveType)+' '+fmtLocalDateTime(x.startDateTime)+'～'+fmtLocalDateTime(x.endDateTime)).join('；')}`);if(d.trips?.length)lines.push(`出差：${d.trips.map(x=>escapeHtml(x.purpose)+' '+fmtDate(x.startDate)+'～'+fmtDate(x.endDate)).join('；')}`);if(!d.hasWarning)lines.push('此期間目前沒有 Loading > 80%、國定假日、請假或出差衝突。');return lines.map(x=>`<div class="hint-line">${x}</div>`).join('')}function availabilityConfirmText(d){const parts=['被派工者的行事曆有以下提示：'];if(d.highLoadDates?.length)parts.push(`• Loading > 80%：${d.highLoadDates.map(x=>fmtDate(x.date)+' '+Math.round(x.loadPct)+'%').join('、')}`);if(d.holidays?.length)parts.push(`• 有 ${d.holidays.length} 個國定假日`);if(d.leaves?.length)parts.push(`• 有 ${d.leaves.length} 筆請假`);if(d.trips?.length)parts.push(`• 有 ${d.trips.length} 筆出差`);parts.push('仍要送出派工嗎？');return parts.join('\n')}
function renderSchedule(){const el=$('#scheduleView');if(!el)return;const leaveRows=myLeaves.map(x=>`<div class="record-card leave"><div><div class="record-title">${escapeHtml(x.leaveType)}</div><div>${fmtLocalDateTime(x.startDateTime)} ～ ${fmtLocalDateTime(x.endDateTime)}</div><div class="mini">只計入週一至週五工作日</div></div><button class="ghost" data-del-leave="${x.id}">刪除</button></div>`).join(''),tripRows=myTrips.map(x=>`<div class="record-card trip"><div><div class="record-title">${escapeHtml(x.purpose)}</div><div>${fmtDate(x.startDate)} ～ ${fmtDate(x.endDate)}</div><div class="mini">以天為顆粒度，只計入週一至週五</div></div><button class="ghost" data-del-trip="${x.id}">刪除</button></div>`).join('');el.innerHTML=`<div class="page-header"><div><h1>請假／出差設定</h1><div class="muted">請假可精確到分鐘；出差以天為單位</div></div></div><div class="schedule-grid"><form id="leaveForm" class="form-card"><h3>新增請假</h3><label>假別<input name="leaveType" list="leaveTypes" placeholder="例如：特休" required><datalist id="leaveTypes"><option value="特休"><option value="事假"><option value="病假"><option value="公假"><option value="其他"></datalist></label><label>開始時間<input type="datetime-local" name="startDateTime" step="60" required></label><label>結束時間<input type="datetime-local" name="endDateTime" step="60" required></label><button class="primary">新增請假</button></form><form id="tripForm" class="form-card"><h3>新增出差</h3><label>目的<textarea name="purpose" rows="3" placeholder="例如：台中工廠 UAT Workshop" required></textarea></label><label>開始日期<input type="date" name="startDate" required></label><label>結束日期<input type="date" name="endDate" required></label><button class="primary">新增出差</button></form></div><div class="schedule-grid"><div class="panel panel-pad"><h3>我的請假</h3><div class="record-list">${leaveRows||'<div class="empty">尚無請假紀錄</div>'}</div></div><div class="panel panel-pad"><h3>我的出差</h3><div class="record-list">${tripRows||'<div class="empty">尚無出差紀錄</div>'}</div></div></div>`;$('#leaveForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;try{await rpc('createLeave',Object.fromEntries(new FormData(form)));form.reset();await loadAll();renderSchedule()}catch(err){alert(err.message)}});$('#tripForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;try{await rpc('createTrip',Object.fromEntries(new FormData(form)));form.reset();await loadAll();renderSchedule()}catch(err){alert(err.message)}});$$('[data-del-leave]',el).forEach(b=>b.onclick=async()=>{if(!confirm('刪除此請假紀錄？'))return;try{await rpc('deleteLeave',{id:b.dataset.delLeave});await loadAll();renderSchedule()}catch(e){alert(e.message)}});$$('[data-del-trip]',el).forEach(b=>b.onclick=async()=>{if(!confirm('刪除此出差紀錄？'))return;try{await rpc('deleteTrip',{id:b.dataset.delTrip});await loadAll();renderSchedule()}catch(e){alert(e.message)}})}
async function renderTeamCalendar(){const el=$('#teamView');if(!el)return;el.innerHTML=`<div class="page-header"><div><h1>團隊出勤行事曆</h1><div class="muted">以 8 小時／工作日計算任務 Loading；國定假日與請假日不分配 Loading，出差另行顯示</div></div><div class="toolbar"><button class="ghost" id="teamPrev">← 前 14 天</button><button class="ghost" id="teamToday">今天</button><button class="ghost" id="teamNext">後 14 天 →</button></div></div><div class="legend"><span><i class="dot load"></i>Loading ≤80%</span><span><i class="dot high"></i>Loading >80%</span><span><i class="dot holiday"></i>國定假日</span><span><i class="dot leave"></i>請假</span><span><i class="dot trip"></i>出差</span></div><div id="teamGantt" class="gantt-wrap"><div class="empty">載入中…</div></div>`;$('#teamPrev').onclick=()=>{teamStart.setDate(teamStart.getDate()-14);renderTeamCalendar()};$('#teamToday').onclick=()=>{teamStart=startOfWeek(new Date());renderTeamCalendar()};$('#teamNext').onclick=()=>{teamStart.setDate(teamStart.getDate()+14);renderTeamCalendar()};const end=new Date(teamStart);end.setDate(end.getDate()+13);const startDate=isoDate(teamStart),endDate=isoDate(end),cacheKey=`${startDate}|${endDate}`;try{let d=teamCalendarCache.get(cacheKey);if(!d){d=await rpc('teamCalendar',{startDate,endDate});teamCalendarCache.set(cacheKey,d)}drawTeamGantt(d)}catch(e){$('#teamGantt').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`}}
function drawTeamGantt(data){
  const wrap=$('#teamGantt');
  if(!wrap)return;

  const dates=data.dates||[];
  const members=data.members||[];
  const cols=`160px repeat(${dates.length}, minmax(78px,1fr))`;

  let html=`<div class="gantt" style="grid-template-columns:${cols}">
    <div class="gantt-cell gantt-head gantt-name">成員</div>`;

  dates.forEach(d=>{
    const dt=dateOnly(d);
    html+=`<div class="gantt-cell gantt-head ${[0,6].includes(dt.getDay())?'weekend':''}">
      ${dt.getMonth()+1}/${dt.getDate()}<br>${['日','一','二','三','四','五','六'][dt.getDay()]}
    </div>`;
  });

  members.forEach(m=>{
    html+=`<div class="gantt-cell gantt-name">
      ${me?.role==='admin'
        ? `<button type="button" class="team-user-link" data-admin-user-work="${m.id}">
            <span>${escapeHtml(m.displayName)}</span>
            <span class="mini">${escapeHtml(m.username)}</span>
          </button>`
        : `<div>${escapeHtml(m.displayName)}</div><div class="mini">${escapeHtml(m.username)}</div>`}
    </div>`;

    dates.forEach(d=>{
      const cell=m.days[d]||{loadPct:0,leaveLabels:[],tripLabels:[],holidayLabels:[],workday:true,leaveHours:0,availableHours:8};
      const hasHoliday=(cell.holidayLabels||[]).length>0;
      const cls=hasHoliday?'holiday-cell':!cell.workday?'weekend':'';
      const hasLeave=(cell.leaveLabels||[]).length>0;
      const availableHours=Math.max(0,Number(cell.availableHours??8));

      let chip='';
      if(cell.workday&&availableHours>0&&!hasHoliday){
        const pct=Math.max(0,Number(cell.loadPct)||0);
        const c=pct>100?'over':pct>80?'high':'';
        const title=hasLeave
          ? `休假 ${num(cell.leaveHours||0)}h · 可用 ${num(availableHours)}h · Loading ${Math.round(pct)}%`
          : `Loading ${Math.round(pct)}%`;
        chip=`<span class="load-chip ${c}" title="${title}">${Math.round(pct)}%</span>`;
      }

      const holidayHtml=(cell.holidayLabels||[])
        .map(x=>`<div class="event-strip holiday">國休｜${escapeHtml(x)}</div>`).join('');
      const leaves=(cell.leaveLabels||[])
        .map(x=>`<div class="event-strip leave">假｜${escapeHtml(x)}</div>`).join('')+
        (hasLeave?`<div class="mini">${availableHours>0?`可用 ${num(availableHours)}h`:'整天請假・不可派工'}</div>`:'');
      const trips=(cell.tripLabels||[])
        .map(x=>`<div class="event-strip trip">出｜${escapeHtml(x)}</div>`).join('');

      html+=`<div class="gantt-cell ${cls}">${chip}${holidayHtml}${leaves}${trips}</div>`;
    });
  });

  html+='</div>';
  wrap.innerHTML=html;

  if(me?.role==='admin'){
    $$('[data-admin-user-work]',wrap).forEach(b=>{
      b.addEventListener('click',()=>openAdminUserWork(b.dataset.adminUserWork));
    });
  }
}



function adminWorkLeaveRecordsOnDate(d){
  if(!adminUserWorkContext)return[];

  const day=new Date(d);
  day.setHours(12,0,0,0);

  return (adminUserWorkContext.leaves||[]).filter(x=>{
    const s=new Date(x.startDateTime),e=new Date(x.endDateTime);
    if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime()))return false;

    const sd=new Date(s);sd.setHours(0,0,0,0);
    const ed=new Date(e);ed.setHours(23,59,59,999);

    return day>=sd&&day<=ed;
  });
}

function adminWorkLeaveHoursOnDate(date){
  if(!adminUserWorkContext)return 0;

  const key=String(date).slice(0,10);
  const dayStart=new Date(`${key}T00:00:00`);
  const dayEnd=new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate()+1);

  let hours=0;

  (adminUserWorkContext.leaves||[]).forEach(x=>{
    const s=new Date(x.startDateTime),e=new Date(x.endDateTime);
    if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime())||e<=s)return;

    const from=s>dayStart?s:dayStart;
    const to=e<dayEnd?e:dayEnd;

    if(to>from)hours+=(to-from)/3600000;
  });

  return Math.min(8,Math.max(0,Math.round(hours*100)/100));
}

function adminWorkHolidayRecordsOnDate(date){
  const key=String(date).slice(0,10);
  return (adminUserWorkContext?.holidays||[])
    .filter(x=>String(x.holidayDate)===key);
}

async function openAdminUserWork(userId){
  if(me?.role!=='admin')return;

  adminUserWorkWeekStart=startOfWeek(new Date());
  await refreshAdminUserWork(userId,false);

  $('#adminUserWorkDialog').showModal();
}

async function refreshAdminUserWork(userId,keepTaskDialog=false){
  if(me?.role!=='admin')return;

  const d=await rpc('adminUserWork',{userId});
  adminUserWorkContext=d;

  $('#adminUserWorkTitle').textContent=`${d.user.displayName}｜工作日曆`;
  $('#adminUserWorkSubtitle').textContent=`${d.user.username} · Admin 代管模式`;

  renderAdminUserWorkCalendar();

  if(keepTaskDialog&&$('#adminUserTaskDialog').open){
    const taskId=$('#adminUserTaskDetail').dataset.taskId;
    if(taskId)openAdminUserTaskDetail(taskId);
  }
}

function renderAdminUserWorkCalendar(){
  const box=$('#adminUserWorkBody');
  if(!box||!adminUserWorkContext)return;

  const ctx=adminUserWorkContext;

  const renderWeek=(weekStart,index)=>{
    const days=[0,1,2,3,4,5,6].map(i=>{
      const d=new Date(weekStart);
      d.setDate(d.getDate()+i);
      return d;
    });

    const names=['一','二','三','四','五','六','日'];

    const headers=days.map((d,i)=>`
      <div class="calendar-head ${!isWorkdayDate(d)?'weekend':''}">
        ${names[i]}<br>${d.getMonth()+1}/${d.getDate()}
      </div>
    `).join('');

    const cells=days.map(d=>{
      const date=isoDate(d);
      const weekday=isWorkdayDate(d);
      const holidayList=adminWorkHolidayRecordsOnDate(date);
      const workday=weekday&&holidayList.length===0;
      const leaves=workday?adminWorkLeaveRecordsOnDate(d):[];
      const leaveHours=workday?adminWorkLeaveHoursOnDate(date):0;
      const availableHours=Math.max(0,8-leaveHours);
      const availableDrop=workday&&availableHours>0;

      const allocations=(ctx.allocations||[])
        .filter(a=>String(a.workDate)===date)
        .map(a=>({
          allocation:a,
          task:(ctx.tasks||[]).find(t=>String(t.id)===String(a.taskId))
        }))
        .filter(x=>x.task&&['accepted','completed'].includes(x.task.status));

      const activeHours=allocations
        .filter(x=>x.task.status==='accepted')
        .reduce((sum,x)=>sum+Number(x.allocation.hours||0),0);

      const dayLoadPct=availableHours>0
        ? activeHours/availableHours*100
        : 0;

      const partialLeaveLoad=leaves.length&&availableHours>0
        ? `<span class="load-chip ${dayLoadPct>100?'over':dayLoadPct>80?'high':''}" title="可用 ${num(availableHours)}h · Loading ${Math.round(dayLoadPct)}%">${Math.round(dayLoadPct)}%</span>`
        : '';

      const dayClass=holidayList.length?'holiday-day':!weekday?'weekend':leaves.length?'leave-day':'';

      const notice=holidayList.length
        ? holidayList.map(x=>`<div class="event-strip holiday">國休｜${escapeHtml(x.holidayName)}</div>`).join('')
        : !weekday
          ? '<div class="calendar-block-note">非工作日</div>'
          : leaves.length
            ? leaves.map(x=>`<div class="event-strip leave">假｜${escapeHtml(x.leaveType)}<div class="range-label">${fmtLocalDateTime(x.startDateTime)} ～ ${fmtLocalDateTime(x.endDateTime)}</div></div>`).join('')+
              `<div class="calendar-block-note">${availableHours>0?`可用 ${num(availableHours)}h`:'整天請假・不可排程'}</div>`
            : '';

      return `<div class="calendar-day ${dayClass} ${availableDrop?'admin-calendar-drop-zone':''}" data-admin-calendar-date="${date}">
        <div class="calendar-date-row">
          <div class="calendar-date">${d.getMonth()+1}/${d.getDate()}</div>
          ${partialLeaveLoad}
        </div>
        ${notice}

        ${allocations.map(({allocation:a,task:t})=>`
          <div class="cal-task ${calClass(t)} ${t.status==='accepted'?'draggable-task':''}"
            data-admin-task-detail="${t.id}"
            data-admin-allocation-id="${a.id}"
            draggable="${t.status==='accepted'?'true':'false'}">
            <div class="cal-task-main">
              ${t.urgent?'<b>!</b> ':''}${escapeHtml(t.workType)}
              ${t.isCollaborative?'<span class="cal-collab">共同</span>':''}
            </div>
            <div class="cal-hours">${num(a.hours)}h</div>
          </div>
        `).join('')}
      </div>`;
    }).join('');

    const end=days[6];

    return `<section class="calendar-week-block">
      <div class="calendar-week-label">
        <strong>${index===0?'第 1 週':'第 2 週'}</strong>
        <span>${days[0].getMonth()+1}/${days[0].getDate()} ～ ${end.getMonth()+1}/${end.getDate()}</span>
      </div>
      <div class="calendar-grid">${headers}${cells}</div>
    </section>`;
  };

  const second=new Date(adminUserWorkWeekStart);
  second.setDate(second.getDate()+7);

  box.innerHTML=`
    <div class="admin-work-toolbar">
      <div class="toolbar">
        <button class="ghost" id="adminWorkPrev">← 前一週</button>
        <button class="ghost" id="adminWorkToday">今天</button>
        <button class="ghost" id="adminWorkNext">後一週 →</button>
      </div>
      <div class="muted">Admin 可直接拖拉該人員的 Loading；點工作可修改內容與狀態。</div>
    </div>

    <div class="two-week-calendar">
      ${renderWeek(adminUserWorkWeekStart,0)}
      ${renderWeek(second,1)}
    </div>`;

  $('#adminWorkPrev').onclick=()=>{
    adminUserWorkWeekStart.setDate(adminUserWorkWeekStart.getDate()-7);
    renderAdminUserWorkCalendar();
  };

  $('#adminWorkToday').onclick=()=>{
    adminUserWorkWeekStart=startOfWeek(new Date());
    renderAdminUserWorkCalendar();
  };

  $('#adminWorkNext').onclick=()=>{
    adminUserWorkWeekStart.setDate(adminUserWorkWeekStart.getDate()+7);
    renderAdminUserWorkCalendar();
  };

  bindAdminUserWorkCalendar();
}

function bindAdminUserWorkCalendar(){
  const root=$('#adminUserWorkBody');
  if(!root||!adminUserWorkContext)return;

  let draggedId='';

  $$('[data-admin-task-detail]',root).forEach(el=>{
    el.addEventListener('click',()=>openAdminUserTaskDetail(el.dataset.adminTaskDetail));

    if(el.getAttribute('draggable')!=='true')return;

    el.addEventListener('dragstart',e=>{
      draggedId=el.dataset.adminAllocationId;
      el.classList.add('dragging');

      if(e.dataTransfer){
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',draggedId);
      }
    });

    el.addEventListener('dragend',()=>{
      el.classList.remove('dragging');
      $$('.admin-calendar-drop-zone.drag-over',root).forEach(x=>x.classList.remove('drag-over'));
      draggedId='';
    });
  });

  $$('.admin-calendar-drop-zone',root).forEach(day=>{
    day.addEventListener('dragover',e=>{
      e.preventDefault();
      day.classList.add('drag-over');
    });

    day.addEventListener('dragleave',e=>{
      if(!day.contains(e.relatedTarget))day.classList.remove('drag-over');
    });

    day.addEventListener('drop',async e=>{
      e.preventDefault();
      day.classList.remove('drag-over');

      const allocationId=(e.dataTransfer&&e.dataTransfer.getData('text/plain'))||draggedId;
      if(!allocationId)return;

      const source=(adminUserWorkContext.allocations||[])
        .find(a=>String(a.id)===String(allocationId));

      if(!source)return;

      const targetDate=day.dataset.adminCalendarDate;

      const same=(adminUserWorkContext.allocations||[]).filter(a=>
        String(a.taskId)===String(source.taskId)&&
        String(a.workDate)===String(targetDate)&&
        String(a.id)!==String(source.id)
      );

      let merge=false;

      if(same.length){
        merge=confirm('目標日期已有相同任務。\n\n按「確定」合併工時；按「取消」保留獨立區塊。');
      }

      try{
        await rpc('moveAllocation',{allocationId,targetDate,merge});
        await refreshAdminUserWork(adminUserWorkContext.user.id,false);
      }catch(err){
        alert(err.message);
      }
    });
  });
}


function adminLeaveHoursOnDate(date){
  if(!adminUserWorkContext)return 0;

  const key=String(date).slice(0,10);
  const dayStart=new Date(`${key}T00:00:00`);
  const dayEnd=new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate()+1);

  let hours=0;

  (adminUserWorkContext.leaves||[]).forEach(x=>{
    const s=new Date(x.startDateTime);
    const e=new Date(x.endDateTime);
    if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime())||e<=s)return;

    const from=s>dayStart?s:dayStart;
    const to=e<dayEnd?e:dayEnd;
    if(to>from)hours+=(to-from)/3600000;
  });

  return Math.min(8,Math.max(0,Math.round(hours*100)/100));
}

function adminHolidayOnDate(date){
  return (adminUserWorkContext?.holidays||[])
    .some(x=>String(x.holidayDate)===String(date));
}

function adminScheduleStartDate(t){
  if(t.isPeriodic&&t.periodStartDate)return String(t.periodStartDate).slice(0,10);
  const raw=t.acceptedAt||t.createdAt;
  return raw?isoDate(new Date(raw)):'';
}

function adminScheduleValidDates(t,currentDates=[]){
  const start=adminScheduleStartDate(t);
  const due=String(t.requestDate||'').slice(0,10);
  if(!start||!due||start>due)return[];

  const existing=new Set(currentDates.map(String));
  const out=[];
  const d=new Date(`${start}T12:00:00`);
  const e=new Date(`${due}T12:00:00`);

  while(d<=e){
    const key=isoDate(d);
    const leaveHours=adminLeaveHoursOnDate(key);
    const availableHours=Math.max(0,8-leaveHours);

    if(isWorkdayDate(d)&&!adminHolidayOnDate(key)&&availableHours>0&&!existing.has(key)){
      out.push({date:key,leaveHours,availableHours});
    }

    d.setDate(d.getDate()+1);
  }

  return out;
}

function refreshAdminScheduleSummary(t){
  const box=$('#adminTaskScheduleEditor');
  if(!box)return;

  const inputs=$$('[data-admin-schedule-hours]',box);
  const total=Math.round(inputs.reduce((s,x)=>s+(Number(x.value)||0),0)*100)/100;
  const planned=Math.round(Number(t.plannedHours||0)*100)/100;
  const diff=Math.round((planned-total)*100)/100;

  $('#adminTaskScheduleSummary').innerHTML=diff===0
    ? `<strong>合計 ${num(total)}h / 預估 ${num(planned)}h</strong>`
    : `<strong>合計 ${num(total)}h / 預估 ${num(planned)}h</strong><span class="schedule-diff">尚差 ${num(diff)}h</span>`;

  $('#adminSaveTaskSchedule').disabled=Math.abs(diff)>0.009||!inputs.length;
}

function rebuildAdminScheduleDateOptions(t){
  const box=$('#adminTaskScheduleEditor');
  const select=$('#adminTaskScheduleAddDate');
  if(!box||!select)return;

  const currentDates=$$('[data-admin-schedule-date]',box)
    .map(r=>r.dataset.adminScheduleDate);

  const candidates=adminScheduleValidDates(t,currentDates);

  select.innerHTML='<option value="">選擇工作日</option>'+
    candidates.map(x=>`<option value="${attr(x.date)}">${fmtDate(x.date)}${x.leaveHours>0?`（請假後可用 ${num(x.availableHours)}h）`:''}</option>`).join('');
}

function bindAdminScheduleEditor(t){
  const box=$('#adminTaskScheduleEditor');
  if(!box)return;

  $$('[data-admin-schedule-hours]',box).forEach(input=>{
    if(input.dataset.bound==='1')return;
    input.dataset.bound='1';
    input.addEventListener('input',()=>refreshAdminScheduleSummary(t));
  });

  $$('[data-admin-remove-schedule]',box).forEach(btn=>{
    if(btn.dataset.bound==='1')return;
    btn.dataset.bound='1';

    btn.addEventListener('click',()=>{
      btn.closest('[data-admin-schedule-date]')?.remove();
      rebuildAdminScheduleDateOptions(t);
      refreshAdminScheduleSummary(t);
    });
  });
}

function addAdminScheduleRow(t){
  const select=$('#adminTaskScheduleAddDate');
  const date=select?.value;
  if(!date)return;

  const list=$('#adminTaskScheduleRows');
  if(!list)return;

  const currentTotal=$$('[data-admin-schedule-hours]',$('#adminTaskScheduleEditor'))
    .reduce((s,x)=>s+(Number(x.value)||0),0);

  const remaining=Math.round((Number(t.plannedHours||0)-currentTotal)*100)/100;
  const leaveHours=adminLeaveHoursOnDate(date);
  const availableHours=Math.max(0,8-leaveHours);
  const defaultHours=Math.max(0.01,remaining>0?Math.min(remaining,leaveHours>0?availableHours:remaining):0.01);

  const row=document.createElement('div');
  row.className='allocation-row schedule-edit-row';
  row.dataset.adminScheduleDate=date;
  row.innerHTML=`
    <div>
      <strong>${fmtDate(date)}</strong>
      ${leaveHours>0?`<div class="mini">請假後可用 ${num(availableHours)}h</div>`:''}
    </div>
    <div class="schedule-hours-control">
      <input type="number" min="0.01" max="999" step="0.01"
        value="${num(defaultHours)}"
        data-admin-schedule-hours="${attr(date)}">
      <span>h</span>
      <button type="button" class="ghost" data-admin-remove-schedule="${attr(date)}">移除</button>
    </div>`;

  list.appendChild(row);
  bindAdminScheduleEditor(t);
  rebuildAdminScheduleDateOptions(t);
  refreshAdminScheduleSummary(t);
}

function openAdminUserTaskDetail(taskId){
  if(!adminUserWorkContext)return;

  const t=(adminUserWorkContext.tasks||[])
    .find(x=>String(x.id)===String(taskId));

  if(!t)return;

  const allocations=(adminUserWorkContext.allocations||[])
    .filter(a=>String(a.taskId)===String(t.id))
    .sort((a,b)=>String(a.workDate).localeCompare(String(b.workDate)));

  const scheduled=allocations.reduce((s,a)=>s+Number(a.hours||0),0);

  const box=$('#adminUserTaskDetail');
  box.dataset.taskId=t.id;

  box.innerHTML=`
    <div class="detail-grid">
      <div class="k">工作類型</div>
      <div><input id="adminWorkType" value="${attr(t.workType)}" ${t.status==='cancelled'?'disabled':''}></div>

      <div class="k">需求內容</div>
      <div><textarea id="adminWorkContent" rows="5" ${t.status==='cancelled'?'disabled':''}>${escapeHtml(t.content)}</textarea></div>

      <div class="k">負責人</div><div>${escapeHtml(t.assigneeName)}</div>
      <div class="k">派工者</div><div>${escapeHtml(t.requesterName)}</div>
      <div class="k">狀態</div><div><span class="badge ${t.status}">${statusText(t.status)}</span></div>

      <div class="k">需求日期</div>
      <div>
        ${t.selfAssigned&&t.status==='accepted'
          ? `<input id="adminWorkRequestDate" type="date" value="${attr(t.requestDate)}">`
          : fmtDate(t.requestDate)}
      </div>

      <div class="k">預估總工時</div>
      <div><input id="adminWorkPlannedHours" type="number" min="0.01" max="999" step="0.01" value="${num(t.plannedHours)}" ${t.status==='cancelled'?'disabled':''}></div>

      <div class="k">公開屬性</div>
      <div>
        <select id="adminWorkVisibility" ${t.status==='cancelled'?'disabled':''}>
          <option value="public" ${t.visibility!=='private'?'selected':''}>公開</option>
          <option value="private" ${t.visibility==='private'?'selected':''}>私人</option>
        </select>
      </div>

      <div class="k">Admin 操作</div>
      <div class="row-actions admin-work-actions">
        ${t.status!=='cancelled'?'<button type="button" class="secondary" id="adminSaveTaskContent">更新內容</button>':''}
        ${t.status!=='cancelled'?'<button type="button" class="secondary" id="adminSaveTaskHours">更新總工時</button>':''}
        ${t.selfAssigned&&t.status==='accepted'?'<button type="button" class="secondary" id="adminSaveRequestDate">更新需求日期</button>':''}
        ${t.status!=='cancelled'?'<button type="button" class="secondary" id="adminSaveVisibility">更新公開屬性</button>':''}
        ${['accepted','completed'].includes(t.status)?`<button type="button" class="ghost" id="adminToggleUrgent">${t.urgent?'取消緊急':'標示緊急'}</button>`:''}
        ${['accepted','completed'].includes(t.status)?`<button type="button" class="secondary" id="adminToggleCompleted">${t.status==='completed'?'改回未完成':'完成'}</button>`:''}
        ${!['completed','rejected','cancelled'].includes(t.status)?'<button type="button" class="danger" id="adminStopTask">中止任務</button>':''}
        <button type="button" class="danger admin-delete-task-btn" id="adminDeleteTask">永久刪除</button>
      </div>
    </div>

    ${['accepted','completed'].includes(t.status)?`
      <div class="allocation-detail" id="adminTaskScheduleEditor">
        <h4>${escapeHtml(adminUserWorkContext.user.displayName)} 的日曆排程</h4>

        ${t.status==='accepted'
          ? `<div id="adminTaskScheduleSummary" class="allocation-total">合計 ${num(scheduled)}h / 預估 ${num(t.plannedHours)}h</div>
             <div id="adminTaskScheduleRows">
               ${allocations.length
                 ? allocations.map(a=>{
                     const leaveHours=adminLeaveHoursOnDate(a.workDate);
                     const availableHours=Math.max(0,8-leaveHours);
                     return `<div class="allocation-row schedule-edit-row" data-admin-schedule-date="${attr(a.workDate)}">
                       <div>
                         <strong>${fmtDate(a.workDate)}</strong>
                         ${leaveHours>0?`<div class="mini">${availableHours>0?`請假後可用 ${num(availableHours)}h`:'整天請假'}</div>`:''}
                       </div>
                       <div class="schedule-hours-control">
                         <input type="number" min="0.01" max="999" step="0.01"
                           value="${num(a.hours)}"
                           data-admin-schedule-hours="${attr(a.workDate)}">
                         <span>h</span>
                         <button type="button" class="ghost" data-admin-remove-schedule="${attr(a.workDate)}">移除</button>
                       </div>
                     </div>`;
                   }).join('')
                 : '<div class="mini">目前沒有日排程。</div>'}
             </div>

             <div class="schedule-add-row">
               <select id="adminTaskScheduleAddDate"><option value="">選擇工作日</option></select>
               <button type="button" class="secondary" id="adminAddTaskScheduleDate">新增工作日</button>
             </div>

             <div class="schedule-save-row">
               <button type="button" class="primary" id="adminSaveTaskSchedule">儲存日曆排程</button>
               <div class="mini">規則與 User 相同：合計必須等於預估總工時；新增工作日不可超過需求日。</div>
             </div>`
          : `<div class="allocation-total">已排 ${num(scheduled)}h / 預估 ${num(t.plannedHours)}h</div>
             ${allocations.map(a=>`<div class="allocation-row"><div><strong>${fmtDate(a.workDate)}</strong></div><div>${num(a.hours)}h</div></div>`).join('')}`}
      </div>
    `:''}
  `;

  const refresh=async()=>{
    await refreshAdminUserWork(adminUserWorkContext.user.id,true);
  };

  $('#adminSaveTaskContent')?.addEventListener('click',async()=>{
    try{
      await rpc('adminUpdateTaskDetails',{
        taskId:t.id,
        workType:$('#adminWorkType').value.trim(),
        content:$('#adminWorkContent').value.trim()
      });
      await refresh();
    }catch(err){alert(err.message)}
  });

  $('#adminSaveTaskHours')?.addEventListener('click',async()=>{
    try{
      await rpc('updateTaskPlannedHours',{
        taskId:t.id,
        plannedHours:$('#adminWorkPlannedHours').value
      });
      await refresh();
    }catch(err){alert(err.message)}
  });

  $('#adminSaveRequestDate')?.addEventListener('click',async()=>{
    try{
      await rpc('updateSelfTaskRequestDate',{
        taskId:t.id,
        requestDate:$('#adminWorkRequestDate').value
      });
      await refresh();
    }catch(err){alert(err.message)}
  });

  $('#adminSaveVisibility')?.addEventListener('click',async()=>{
    try{
      await rpc('setTaskVisibility',{
        taskId:t.id,
        visibility:$('#adminWorkVisibility').value
      });
      await refresh();
    }catch(err){alert(err.message)}
  });

  $('#adminToggleUrgent')?.addEventListener('click',async()=>{
    try{
      await rpc('setUrgent',taskVersionPayload(t,{taskId:t.id,urgent:!t.urgent}));
      await refresh();
    }catch(err){alert(err.message)}
  });

  $('#adminToggleCompleted')?.addEventListener('click',async()=>{
    try{
      await rpc('setCompleted',taskVersionPayload(t,{
        taskId:t.id,
        completed:t.status!=='completed'
      }));
      await refresh();
    }catch(err){alert(err.message)}
  });

  $('#adminStopTask')?.addEventListener('click',()=>{
    openStopTaskDialog(t,'admin-user');
  });

  $('#adminDeleteTask')?.addEventListener('click',async()=>{
    const extra=t.isCollaborative
      ? '\n\n這是共同作業，只會刪除目前這位人員的任務，不會刪除其他共同作業者。'
      : t.isPeriodic
        ? '\n\n這是週期工作，只會刪除目前這一期任務，不會刪除整個週期系列。'
        : '';

    if(!confirm(`確定要「永久刪除」任務「${t.workType}」？\n\n此操作會一併刪除該任務的日曆排程，且無法復原。${extra}`))return;

    try{
      await rpc('adminDeleteTask',{taskId:t.id});
      $('#adminUserTaskDialog').close();
      adminTasksLoaded=false;
      await loadAll();
      await refreshAdminUserWork(adminUserWorkContext.user.id,false);
    }catch(err){
      alert(err.message);
    }
  });

  if(t.status==='accepted'){
    bindAdminScheduleEditor(t);
    rebuildAdminScheduleDateOptions(t);
    refreshAdminScheduleSummary(t);

    $('#adminAddTaskScheduleDate')?.addEventListener('click',()=>{
      addAdminScheduleRow(t);
    });

    $('#adminSaveTaskSchedule')?.addEventListener('click',async()=>{
      const entries=$$('[data-admin-schedule-date]',$('#adminTaskScheduleEditor')).map(row=>({
        workDate:row.dataset.adminScheduleDate,
        hours:Number(row.querySelector('[data-admin-schedule-hours]')?.value||0)
      }));

      if(!entries.length){
        alert('至少需要保留一個工作日排程');
        return;
      }

      const total=Math.round(entries.reduce((s,x)=>s+Number(x.hours||0),0)*100)/100;
      const planned=Math.round(Number(t.plannedHours||0)*100)/100;

      if(Math.abs(total-planned)>0.009){
        alert(`每日工時合計必須等於預估總工時 ${num(planned)}h，目前合計 ${num(total)}h`);
        return;
      }

      try{
        await rpc('updateTaskSchedule',{
          taskId:t.id,
          targetUserId:adminUserWorkContext.user.id,
          entries:JSON.stringify(entries)
        });
        await refresh();
      }catch(err){
        alert(err.message);
      }
    });
  }

  if(!$('#adminUserTaskDialog').open){
    $('#adminUserTaskDialog').showModal();
  }
}

async function adminPromptMoveAllocation(allocationId){
  if(!adminUserWorkContext)return;

  const a=(adminUserWorkContext.allocations||[])
    .find(x=>String(x.id)===String(allocationId));

  if(!a)return;

  const targetDate=prompt(
    `目前日期：${a.workDate}\n請輸入移動目標日期（YYYY-MM-DD）`,
    a.workDate
  );

  if(!targetDate||targetDate===a.workDate)return;

  const same=(adminUserWorkContext.allocations||[]).filter(x=>
    String(x.taskId)===String(a.taskId)&&
    String(x.workDate)===String(targetDate)&&
    String(x.id)!==String(a.id)
  );

  let merge=false;
  if(same.length){
    merge=confirm('目標日期已有相同任務，是否合併？');
  }

  try{
    await rpc('moveAllocation',{allocationId,targetDate,merge});
    await refreshAdminUserWork(adminUserWorkContext.user.id,true);
  }catch(err){
    alert(err.message);
  }
}

async function adminPromptSplitAllocation(allocationId){
  if(!adminUserWorkContext)return;

  const a=(adminUserWorkContext.allocations||[])
    .find(x=>String(x.id)===String(allocationId));

  if(!a)return;

  const targetDate=prompt('請輸入分拆目標日期（YYYY-MM-DD）');
  if(!targetDate)return;

  const percentRaw=prompt('要移動多少比例？請輸入 1～99', '50');
  if(percentRaw===null)return;

  const movePercent=Number(percentRaw);
  if(!Number.isFinite(movePercent)||movePercent<=0||movePercent>=100){
    alert('比例必須介於 1～99');
    return;
  }

  const same=(adminUserWorkContext.allocations||[]).filter(x=>
    String(x.taskId)===String(a.taskId)&&
    String(x.workDate)===String(targetDate)&&
    String(x.id)!==String(a.id)
  );

  let mergeTarget=false;
  if(same.length){
    mergeTarget=confirm('目標日期已有相同任務，是否把分拆工時合併到既有區塊？');
  }

  try{
    await rpc('splitAllocation',{
      allocationId,
      targetDate,
      movePercent,
      mergeTarget
    });

    await refreshAdminUserWork(adminUserWorkContext.user.id,true);
  }catch(err){
    alert(err.message);
  }
}

async function loadAdminTasks(){
  if(me?.role!=='admin')return;
  try{
    if(!adminTasksLoaded){const d=await rpc('adminListTasks');adminTasks=d.tasks||[];adminTasksLoaded=true}
    renderAdminTaskList();
  }catch(e){const box=$('#adminTaskList');if(box)box.innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`}
}
function renderAdminTaskList(){
  const box=$('#adminTaskList');if(!box)return;
  const userId=$('#adminTaskUserFilter')?.value||'',status=$('#adminTaskStatusFilter')?.value||'';
  const rows=adminTasks.filter(t=>(!userId||(Array.isArray(t.participantIds)?t.participantIds.map(String).includes(String(userId)):String(t.assigneeId)===String(userId)))&&(!status||String(t.status)===String(status)));
  if(!rows.length){box.innerHTML='<div class="empty">沒有符合條件的工作。</div>';return}
  box.innerHTML=`<div class="table-scroll"><table><thead><tr><th>工作類型</th><th>負責人</th><th>需求日</th><th>狀態</th><th>公開</th><th>需求內容</th><th>操作</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${escapeHtml(t.workType)}</td><td>${escapeHtml(t.assigneeName)}</td><td>${fmtDate(t.requestDate)}</td><td><span class="badge ${t.status}">${statusText(t.status)}</span></td><td><span class="visibility-badge ${t.visibility==='private'?'private':'public'}">${t.visibility==='private'?'私人':'公開'}</span></td><td class="admin-task-content">${escapeHtml(t.content)}</td><td><div class="row-actions"><button type="button" class="secondary" data-admin-edit-task="${t.id}">編輯</button><button type="button" class="danger" data-admin-delete-task="${t.id}">刪除</button></div></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-admin-edit-task]',box).forEach(b=>b.addEventListener('click',()=>openAdminTaskEditor(b.dataset.adminEditTask)));
  $$('[data-admin-delete-task]',box).forEach(b=>b.addEventListener('click',async()=>{
    const taskId=b.dataset.adminDeleteTask;
    const t=adminTasks.find(x=>String(x.id)===String(taskId));
    if(!t)return;

    const extra=t.isCollaborative
      ? '\n\n這是共同作業，只會刪除目前這位人員的任務。'
      : t.isPeriodic
        ? '\n\n這是週期工作，只會刪除目前這一期任務。'
        : '';

    if(!confirm(`確定永久刪除「${t.workType}」？\n\n相關日曆排程也會一併刪除，且無法復原。${extra}`))return;

    try{
      await rpc('adminDeleteTask',{taskId});
      adminTasksLoaded=false;
      await loadAll();
      await loadAdminTasks();
    }catch(err){
      alert(err.message);
    }
  }));
}
function openAdminTaskEditor(taskId){
  const t=adminTasks.find(x=>String(x.id)===String(taskId));if(!t)return;
  const form=$('#adminTaskForm');form.elements.taskId.value=t.id;form.elements.workType.value=t.workType;form.elements.content.value=t.content;
  $('#adminTaskMeta').textContent=`${t.assigneeName} · ${statusText(t.status)} · 需求日 ${fmtDate(t.requestDate)}`;
  $('#adminTaskDialog').showModal();
}
async function handleAdminTaskSave(e){
  e.preventDefault();const form=e.currentTarget,payload=Object.fromEntries(new FormData(form));
  if(!payload.workType.trim()||!payload.content.trim()){alert('工作類型與需求內容不可空白');return}
  try{await rpc('adminUpdateTaskDetails',payload);$('#adminTaskDialog').close();adminTasksLoaded=false;await loadAll();await loadAdminTasks()}catch(err){alert(err.message)}
}

async function renderAdmin(){
  if(me?.role!=='admin'||!$('#adminView'))return;

  const data={users:adminUsers,holidays};

  const rows=(data.users||[]).map(u=>`<div class="admin-row" data-user-row="${u.id}">
    <input data-field="displayName" value="${attr(u.displayName)}">
    <input value="${attr(u.username)}" disabled>
    <select data-field="role">
      <option value="user" ${u.role==='user'?'selected':''}>user</option>
      <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
    </select>
    <label style="margin:0;display:flex;gap:6px;align-items:center">
      <input style="width:auto" type="checkbox" data-field="active" ${u.active?'checked':''} ${u.username==='admin'?'disabled':''}>啟用
    </label>
    <button class="secondary" data-save-user="${u.id}">儲存</button>
    <input data-field="password" type="password" placeholder="新密碼（留白不變）" style="grid-column:1/5">
    <span></span>
  </div>`).join('');

  const holidayRows=(data.holidays||[]).map(h=>`<div class="holiday-admin-row">
    <div>
      <strong>${fmtDate(h.holidayDate)}</strong>
      <div>${escapeHtml(h.holidayName)}</div>
    </div>
    <button class="ghost" data-delete-holiday="${h.id}">刪除</button>
  </div>`).join('');

  $('#adminView').innerHTML=`
    <div class="page-header">
      <div>
        <h1>系統管理</h1>
        <div class="muted">帳號權限與全團隊共用工作日曆設定</div>
      </div>
    </div>

    <div class="admin-grid">
      <form id="createUserForm" class="form-card">
        <h3>新增帳號</h3>
        <label>帳號<input name="username" required></label>
        <label>顯示名稱<input name="displayName" required></label>
        <label>密碼<input type="password" name="password" required></label>
        <label>角色
          <select name="role">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button class="primary">建立</button>
      </form>

      <div class="panel panel-pad">
        <h3>現有帳號</h3>
        ${rows}
      </div>
    </div>

    <details class="admin-task-section panel panel-pad admin-task-details">
      <summary class="admin-task-summary">
        <div><h3>人員工作管理</h3><div class="mini">點擊展開／收合。Admin 可檢視所有人員工作，包含私人任務。</div></div>
        <span class="admin-expand-indicator">展開</span>
      </summary>
      <div class="admin-task-body">
        <div class="admin-task-head"><div></div><button class="secondary" id="adminReloadTasks" type="button">重新整理工作</button></div>
        <div class="admin-task-filters"><label>人員<select id="adminTaskUserFilter"><option value="">全部人員</option>${(data.users||[]).map(u=>`<option value="${attr(u.id)}">${escapeHtml(u.displayName)}</option>`).join('')}</select></label><label>狀態<select id="adminTaskStatusFilter"><option value="">全部狀態</option><option value="pending">待接受</option><option value="accepted">已接單</option><option value="completed">已完成</option><option value="rejected">已拒絕</option><option value="cancelled">已中止</option></select></label></div>
        <div id="adminTaskList"><div class="empty">正在準備人員工作資料…</div></div>
      </div>
    </details>

    <div class="admin-grid admin-holiday-section">
      <form id="holidayForm" class="form-card">
        <h3>新增國定假日</h3>
        <label>日期<input type="date" name="holidayDate" required></label>
        <label>假日名稱<input name="holidayName" placeholder="例如：中秋節" required></label>
        <div class="mini">設定後套用所有團隊成員；該日不安排 Task Loading，也不可拖入任務。</div>
        <button class="primary">新增國定假日</button>
      </form>

      <div class="panel panel-pad">
        <h3>國定假日</h3>
        <div class="holiday-admin-list">
          ${holidayRows||'<div class="empty">尚未設定國定假日</div>'}
        </div>
      </div>
    </div>`;

  $('#createUserForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    const fd=new FormData(form);
    try{
      await rpc('adminCreateUser',Object.fromEntries(fd));
      form.reset();
      await loadAll();
      await renderAdmin();
    }catch(err){
      alert(err.message);
    }
  });

  $$('[data-save-user]').forEach(b=>b.addEventListener('click',async()=>{
    const row=$(`[data-user-row="${b.dataset.saveUser}"]`);
    const body={
      userId:b.dataset.saveUser,
      displayName:$('[data-field="displayName"]',row).value,
      role:$('[data-field="role"]',row).value,
      active:$('[data-field="active"]',row).checked,
      password:$('[data-field="password"]',row).value
    };
    try{
      await rpc('adminUpdateUser',body);
      alert('已更新');
      await loadAll();
      await renderAdmin();
    }catch(err){
      alert(err.message);
    }
  }));

  $('#holidayForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    try{
      await rpc('adminCreateHoliday',Object.fromEntries(new FormData(form)));
      form.reset();
      await loadAll();
      await renderAdmin();
    }catch(err){
      alert(err.message);
    }
  });

  $$('[data-delete-holiday]').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('刪除此國定假日設定？刪除後不會自動把既有任務重新移回該日期。'))return;
    try{await rpc('adminDeleteHoliday',{id:b.dataset.deleteHoliday});await loadAll();await renderAdmin()}catch(err){alert(err.message)}
  }));
  $('#adminTaskUserFilter').addEventListener('change',renderAdminTaskList);
  $('#adminTaskStatusFilter').addEventListener('change',renderAdminTaskList);
  $('#adminReloadTasks').addEventListener('click',async()=>{adminTasksLoaded=false;await loadAdminTasks()});
  await loadAdminTasks();
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}function attr(v=''){return escapeHtml(v)}function num(v){const n=Number(v);return Number.isFinite(n)?(Math.round(n*100)/100):0}
connectBackend();
