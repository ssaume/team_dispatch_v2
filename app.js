
const $=(s,root=document)=>root.querySelector(s);const $$=(s,root=document)=>[...root.querySelectorAll(s)];const app=$('#app');const cfg=window.TEAM_DISPATCH_CONFIG||{};
let rpcSeq=1;const pendingRpc=new Map();let backendReady=false;let me=null,users=[],incoming=[],outgoing=[],myAllocations=[],myLeaves=[],myTrips=[],holidays=[];let myMode='list';let currentWeekStart=startOfWeek(new Date());let teamStart=startOfWeek(new Date());let availabilityTimer=null;let lastAvailability=null;
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

function holidayRecordsOnDate(d){
  const key=typeof d==='string'?String(d).slice(0,10):isoDate(new Date(d));
  return holidays.filter(x=>String(x.holidayDate)===key);
}

function daysToDue(t){const due=dateOnly(t.requestDate),now=new Date();now.setHours(0,0,0,0);return Math.ceil((due-now)/86400000)}function colorClass(t){if(t.status==='completed')return'task-gray';const d=daysToDue(t);if(d<0)return'task-pink';if(d<=2)return'task-orange';return'task-green'}function calClass(t){return colorClass(t).replace('task-','cal-')}function statusText(s){return({pending:'待接受',accepted:'已接單',rejected:'已拒絕',completed:'已完成'})[s]||s}function token(){return localStorage.getItem('teamDispatchToken')||''}function setToken(v){if(v)localStorage.setItem('teamDispatchToken',v);else localStorage.removeItem('teamDispatchToken')}

const COMMIT_ACTIONS=new Set([
  'createTask','createSelfTask','acceptTask','rejectTask',
  'setUrgent','setCompleted','moveAllocation','splitAllocation',
  'createLeave','deleteLeave','createTrip','deleteTrip',
  'adminCreateUser','adminUpdateUser',
  'adminCreateHoliday','adminDeleteHoliday'
]);
const COMMIT_MESSAGES={
  createTask:'正在建立派工…',
  createSelfTask:'正在建立工作並計算排程…',
  acceptTask:'正在接單並建立日排程…',
  rejectTask:'正在更新拒絕結果…',
  setUrgent:'正在更新緊急狀態…',
  setCompleted:'正在更新完成狀態…',
  moveAllocation:'正在移動並重新計算排程…',
  splitAllocation:'正在分拆並重新計算排程…',
  createLeave:'正在新增請假並重新計算排程…',
  deleteLeave:'正在刪除請假…',
  createTrip:'正在新增出差…',
  deleteTrip:'正在刪除出差…',
  adminCreateUser:'正在建立帳號…',
  adminUpdateUser:'正在更新帳號…',
  adminCreateHoliday:'正在新增國定假日並重新計算所有受影響排程…',
  adminDeleteHoliday:'正在刪除國定假日…'
};
let commitLoadingCount=0;
function beginCommitLoading(action){
  commitLoadingCount++;
  const overlay=$('#commitOverlay');
  if(!overlay)return;
  $('#commitLoadingText').textContent=COMMIT_MESSAGES[action]||'正在更新 Google Drive，請稍候…';
  overlay.classList.remove('hidden');
}
function endCommitLoading(){
  commitLoadingCount=Math.max(0,commitLoadingCount-1);
  if(commitLoadingCount===0){
    const overlay=$('#commitOverlay');
    if(overlay)overlay.classList.add('hidden');
  }
}

function validGoogleOrigin(origin){try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com'))}catch{return false}}
window.addEventListener('message',ev=>{if(!validGoogleOrigin(ev.origin))return;const m=ev.data||{};if(m.channel!=='team-dispatch-rpc'||!m.id)return;const p=pendingRpc.get(m.id);if(!p)return;pendingRpc.delete(m.id);clearTimeout(p.timer);try{p.iframe.remove()}catch{}if(p.isCommit)endCommitLoading();m.ok?p.resolve(m.result):p.reject(new Error(m.error||'操作失敗'))});
function rpc(action,payload={}){
  if(!cfg.APPS_SCRIPT_URL||cfg.APPS_SCRIPT_URL.includes('PASTE_YOUR_')){
    return Promise.reject(new Error('尚未設定 Apps Script URL'));
  }

  const isCommit=COMMIT_ACTIONS.has(action);
  if(isCommit)beginCommitLoading(action);

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
    data.value=JSON.stringify({action,token:token(),...payload});
    form.appendChild(data);
    document.body.appendChild(form);

    const timer=setTimeout(()=>{
      pendingRpc.delete(id);
      try{iframe.remove()}catch{}
      if(isCommit)endCommitLoading();
      reject(new Error('Google Apps Script 回應逾時'));
    },cfg.REQUEST_TIMEOUT_MS||20000);

    pendingRpc.set(id,{resolve,reject,timer,iframe,isCommit});

    try{
      form.submit();
    }catch(err){
      clearTimeout(timer);
      pendingRpc.delete(id);
      iframe.remove();
      if(isCommit)endCommitLoading();
      reject(err);
    }finally{
      form.remove();
    }
  });
}
async function connectBackend(){
  // v1.4.1: opening / refreshing the site always returns to the login screen.
  // Do not silently restore a previous local session.
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

  // Prevent browser/password-manager implicit form submission.
  form.addEventListener('submit',e=>e.preventDefault());

  loginBtn.addEventListener('click',async()=>{
    $('#loginError').textContent='';

    const username=form.elements.username.value.trim();
    const password=form.elements.password.value;

    if(!username||!password){
      $('#loginError').textContent='請輸入帳號與密碼後再按登入。';
      return;
    }

    loginBtn.disabled=true;
    try{
      const d=await rpc('login',{username,password});
      setToken(d.token);
      me=d.user;
      showMain();
      await loadAll();
    }catch(err){
      $('#loginError').textContent=err.message;
      loginBtn.disabled=false;
    }
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
  $('#dashboardHorizonRange').textContent=`${fmtDate(d.today)} ～ ${fmtDate(d.horizonEnd)} · 依剩餘工作量由高到低排序`;

  const week=d.currentWeekTasks||[];
  const future=d.next15DaysTasks||[];

  $('#dashboardWeekCount').textContent=`${week.length} 件`;
  $('#dashboardFutureCount').textContent=`${future.length} 件`;

  $('#dashboardWeekTasks').innerHTML=dashboardTaskTable(week,'week');
  $('#dashboardFutureTasks').innerHTML=dashboardTaskTable(future,'future');
}

function dashboardTaskTable(tasks,mode){
  if(!tasks.length){
    return `<div class="dashboard-empty">${mode==='week'?'本工作週沒有未結任務。':'未來 15 天沒有到期的未結任務。'}</div>`;
  }

  const workloadLabel=mode==='week'?'本週排程':'剩餘工作量';

  return `<div class="panel table-scroll dashboard-table-wrap">
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>任務</th>
          <th>負責人</th>
          <th>狀態</th>
          <th>需求日</th>
          <th>${workloadLabel}</th>
          <th>預估總工時</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(t=>{
          const workload=mode==='week'
            ? (t.status==='pending'?t.plannedHours:t.weekHours)
            : t.remainingHours;

          return `<tr class="${t.urgent?'dashboard-urgent-row':''}">
            <td>
              <div class="dashboard-task-name">
                ${t.urgent?'<span class="urgent">!</span>':''}
                <strong>${escapeHtml(t.workType)}</strong>
              </div>
              ${t.selfAssigned?'<div class="mini">自己建立</div>':''}
            </td>
            <td><span class="assignee-pill">${escapeHtml(t.assigneeName)}</span></td>
            <td><span class="badge ${t.status}">${statusText(t.status)}</span></td>
            <td>${fmtDate(t.requestDate)}</td>
            <td><strong>${num(workload)}h</strong></td>
            <td>${num(t.plannedHours)}h</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function showMain(){app.innerHTML='';app.append($('#mainTpl').content.cloneNode(true));$('#whoami').innerHTML=`<strong>${escapeHtml(me.displayName)}</strong><div class="muted">${escapeHtml(me.username)} · ${me.role}</div>`;$('#adminNav').classList.toggle('hidden',me.role!=='admin');$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view,b)));$('#logoutBtn').addEventListener('click',async()=>{try{await rpc('logout')}catch{}setToken('');showLogin()});$('#rejectCancel').addEventListener('click',()=>$('#rejectDialog').close());$('#rejectForm').addEventListener('submit',handleReject);$('#selfTaskClose').onclick=$('#selfTaskCancel').onclick=()=>$('#selfTaskDialog').close();$('#selfTaskForm').addEventListener('submit',handleSelfTask);$('#splitAllocationClose').onclick=$('#splitAllocationCancel').onclick=()=>$('#splitAllocationDialog').close();$('#splitAllocationForm').addEventListener('submit',handleSplitAllocation);$('#splitAllocationForm [name="movePercent"]').addEventListener('input',updateSplitPreview);$('#splitAllocationForm [name="targetDate"]').addEventListener('change',updateSplitTargetHint)}
function switchView(name,btn){$$('.view').forEach(v=>v.classList.add('hidden'));$$('.nav-btn').forEach(v=>v.classList.remove('active'));btn?.classList.add('active');if(name==='my')$('#myView').classList.remove('hidden');if(name==='request')$('#requestView').classList.remove('hidden');if(name==='schedule'){$('#scheduleView').classList.remove('hidden');renderSchedule()}if(name==='team'){$('#teamView').classList.remove('hidden');renderTeamCalendar()}if(name==='admin'){$('#adminView').classList.remove('hidden');renderAdmin()}}
async function loadAll(){try{const d=await rpc('loadAll');me=d.user;users=d.users||[];incoming=d.incoming||[];outgoing=d.outgoing||[];myAllocations=d.myAllocations||[];myLeaves=d.myLeaves||[];myTrips=d.myTrips||[];holidays=d.holidays||[];renderMy();renderRequest();renderSchedule()}catch(e){if(/登入|session|權限/i.test(e.message)){setToken('');showLogin()}else alert(e.message)}}
function renderMy(){const el=$('#myView');if(!el)return;const pending=incoming.filter(x=>x.status==='pending').length,accepted=incoming.filter(x=>x.status==='accepted').length,completed=incoming.filter(x=>x.status==='completed').length,overdue=incoming.filter(x=>!['completed','rejected'].includes(x.status)&&daysToDue(x)<0).length;el.innerHTML=`<div class="page-header"><div><h1>我的工作</h1><div class="muted">查看待接受、已接單與已完成工作</div></div><div class="toolbar"><button class="primary" id="newSelfTask">＋新增自己的工作</button><div class="segmented"><button data-mode="list" class="${myMode==='list'?'active':''}">清單</button><button data-mode="calendar" class="${myMode==='calendar'?'active':''}">日曆</button></div></div></div><div class="cards"><div class="stat"><div class="muted">待接受</div><div class="n">${pending}</div></div><div class="stat"><div class="muted">已接單</div><div class="n">${accepted}</div></div><div class="stat"><div class="muted">已完成</div><div class="n">${completed}</div></div><div class="stat"><div class="muted">已逾期</div><div class="n">${overdue}</div></div></div><div id="myBody"></div>`;$('#newSelfTask').onclick=()=>{$('#selfTaskForm').reset();$('#selfTaskForm [name="plannedHours"]').value='8';$('#selfTaskDialog').showModal()};$$('[data-mode]',el).forEach(b=>b.addEventListener('click',()=>{myMode=b.dataset.mode;renderMy()}));myMode==='list'?renderMyList():renderCalendar()}
async function handleSelfTask(e){e.preventDefault();const fd=new FormData(e.currentTarget);try{await rpc('createSelfTask',Object.fromEntries(fd));$('#selfTaskDialog').close();await loadAll();alert('自己的工作已建立，已自動接單')}catch(err){alert(err.message)}}
function renderMyList(){const body=$('#myBody');const rows=incoming.map(t=>`<tr class="${colorClass(t)}"><td>${t.urgent?'<span class="urgent">!</span> ':''}<button class="link-btn" data-detail="${t.id}">${escapeHtml(t.workType)}</button>${t.selfAssigned?'<div class="mini">自己建立</div>':''}</td><td>${escapeHtml(t.requesterName)}</td><td>${fmtDate(t.requestDate)}</td><td>${num(t.plannedHours)}h</td><td><span class="badge ${t.status}">${statusText(t.status)}</span></td><td>${taskActions(t)}</td></tr>`).join('');body.innerHTML=`<div class="panel table-scroll"><table><thead><tr><th>工作類型</th><th>派工者</th><th>需求日期</th><th>預估工時</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">目前沒有工作</td></tr>'}</tbody></table></div>`;bindTaskActions(body)}
function taskActions(t){if(t.status==='pending')return`<div class="row-actions"><button class="secondary" data-accept="${t.id}">接受</button><button class="danger" data-reject="${t.id}">拒絕</button></div>`;if(['accepted','completed'].includes(t.status))return`<div class="row-actions"><button class="ghost" data-urgent="${t.id}" data-value="${t.urgent?0:1}">${t.urgent?'取消緊急':'標示緊急'}</button><button class="secondary" data-complete="${t.id}" data-value="${t.status==='completed'?0:1}">${t.status==='completed'?'改回未完成':'完成'}</button></div>`;return t.rejectionReason?`<span class="muted">理由：${escapeHtml(t.rejectionReason)}</span>`:'-'}
function bindTaskActions(root){$$('[data-detail]',root).forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));$$('[data-accept]',root).forEach(b=>b.addEventListener('click',async()=>{try{await rpc('acceptTask',{taskId:b.dataset.accept});await loadAll()}catch(e){alert(e.message)}}));$$('[data-reject]',root).forEach(b=>b.addEventListener('click',()=>{$('#rejectForm [name="task_id"]').value=b.dataset.reject;$('#rejectForm [name="reason"]').value='';$('#rejectDialog').showModal()}));$$('[data-urgent]',root).forEach(b=>b.addEventListener('click',async()=>{try{await rpc('setUrgent',{taskId:b.dataset.urgent,urgent:b.dataset.value==='1'});await loadAll()}catch(e){alert(e.message)}}));$$('[data-complete]',root).forEach(b=>b.addEventListener('click',async()=>{try{await rpc('setCompleted',{taskId:b.dataset.complete,completed:b.dataset.value==='1'});await loadAll()}catch(e){alert(e.message)}}))}
async function handleReject(e){e.preventDefault();const fd=new FormData(e.currentTarget);try{await rpc('rejectTask',{taskId:fd.get('task_id'),reason:fd.get('reason')});$('#rejectDialog').close();await loadAll()}catch(err){alert(err.message)}}
function openDetail(id){
  const t=[...incoming,...outgoing].find(x=>String(x.id)===String(id));
  if(!t)return;

  const allocations=myAllocations
    .filter(a=>String(a.taskId)===String(t.id))
    .sort((a,b)=>String(a.workDate).localeCompare(String(b.workDate))||Number(a.hours)-Number(b.hours));

  const scheduledHours=allocations.reduce((s,a)=>s+Number(a.hours||0),0);
  const canEditSchedule=String(t.assigneeId)===String(me.id)&&t.status==='accepted';

  const allocationHtml=String(t.assigneeId)===String(me.id)&&['accepted','completed'].includes(t.status)
    ? `<div class="allocation-detail">
        <h4>日曆排程</h4>
        <div class="allocation-total">已排 ${num(scheduledHours)}h / 預估 ${num(t.plannedHours)}h</div>
        ${allocations.length
          ? allocations.map(a=>`<div class="allocation-row">
              <div>
                <strong>${fmtDate(a.workDate)}</strong>
                <span>${num(a.hours)}h</span>
              </div>
              ${canEditSchedule?`<button type="button" class="secondary split-btn" data-split-allocation="${a.id}">比例分拆</button>`:''}
            </div>`).join('')
          : '<div class="mini">目前沒有可顯示的日排程。</div>'}
        ${canEditSchedule?'<div class="mini allocation-help">也可以直接在「我的工作 → 日曆」拖曳區塊到其他工作日。</div>':''}
      </div>`
    : '';

  $('#taskDetail').innerHTML=`<div class="detail-grid">
    <div class="k">工作類型</div><div>${escapeHtml(t.workType)}</div>
    <div class="k">需求內容</div><div>${escapeHtml(t.content).replace(/\n/g,'<br>')}</div>
    <div class="k">派工者</div><div>${escapeHtml(t.requesterName)}</div>
    <div class="k">被派工者</div><div>${escapeHtml(t.assigneeName)}</div>
    <div class="k">需求日期</div><div>${fmtDate(t.requestDate)}</div>
    <div class="k">預估工時</div><div>${num(t.plannedHours)} 小時</div>
    <div class="k">狀態</div><div>${statusText(t.status)} ${t.urgent?'<span class="urgent">!</span>':''}</div>
    <div class="k">建立時間</div><div>${fmtDateTime(t.createdAt)}</div>
    <div class="k">接單時間</div><div>${fmtDateTime(t.acceptedAt)}</div>
    <div class="k">完成時間</div><div>${fmtDateTime(t.completedAt)}</div>
    <div class="k">拒絕理由</div><div>${escapeHtml(t.rejectionReason||'-')}</div>
  </div>${allocationHtml}`;

  $$('[data-split-allocation]',$('#taskDetail')).forEach(b=>{
    b.addEventListener('click',()=>openSplitAllocation(b.dataset.splitAllocation));
  });

  $('#taskDialog').showModal();
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
    await rpc('splitAllocation',{allocationId,targetDate,movePercent,mergeTarget});
    $('#splitAllocationDialog').close();
    await loadAll();
    openDetail(a.taskId);
  }catch(err){
    alert(err.message);
  }
}

function renderCalendar(){
  const body=$('#myBody');
  const days=[0,1,2,3,4,5,6].map(i=>{const d=new Date(currentWeekStart);d.setDate(d.getDate()+i);return d});
  const names=['一','二','三','四','五','六','日'];

  const headers=days.map((d,i)=>`<div class="calendar-head ${!isWorkdayDate(d)?'weekend':''}">${names[i]}<br>${d.getMonth()+1}/${d.getDate()}</div>`).join('');

  const cells=days.map(d=>{
    const date=isoDate(d);
    const weekday=isWorkdayDate(d);
    const holidayList=holidayRecordsOnDate(date);
    const workday=weekday&&holidayList.length===0;
    const leaves=workday?leaveRecordsOnDate(d):[];
    const availableDrop=workday&&leaves.length===0;

    const allocations=availableDrop
      ? myAllocations
          .filter(a=>String(a.workDate)===date)
          .map(a=>({allocation:a,task:incoming.find(t=>String(t.id)===String(a.taskId))}))
          .filter(x=>x.task&&['accepted','completed'].includes(x.task.status))
      : [];

    const dayClass=holidayList.length?'holiday-day':!weekday?'weekend':leaves.length?'leave-day':'';

    const notice=holidayList.length
      ? holidayList.map(x=>`<div class="event-strip holiday">國休｜${escapeHtml(x.holidayName)}</div>`).join('')
      : !weekday
        ? `<div class="calendar-block-note">非工作日</div>`
        : leaves.length
          ? leaves.map(x=>`<div class="event-strip leave">假｜${escapeHtml(x.leaveType)}<div class="range-label">${fmtLocalDateTime(x.startDateTime)} ～ ${fmtLocalDateTime(x.endDateTime)}</div></div>`).join('')
          : '';

    return `<div class="calendar-day ${dayClass} ${availableDrop?'calendar-drop-zone':''}" data-calendar-date="${date}">
      <div class="calendar-date">${d.getMonth()+1}/${d.getDate()}</div>
      ${notice}
      ${allocations.map(({allocation:a,task:t})=>`
        <div class="cal-task ${calClass(t)} ${t.status==='accepted'?'draggable-task':''}"
          data-detail="${t.id}"
          data-allocation-id="${a.id}"
          data-task-id="${t.id}"
          draggable="${t.status==='accepted'?'true':'false'}"
          title="${t.status==='accepted'?'拖曳可重新安排日期；點擊可查看與分拆':'已完成任務'}">
          <div class="cal-task-main">${t.urgent?'<b>!</b> ':''}${escapeHtml(t.workType)}</div>
          <div class="cal-hours">${num(a.hours)}h</div>
        </div>
      `).join('')}
    </div>`;
  }).join('');

  body.innerHTML=`<div class="page-header">
    <div class="toolbar">
      <button class="ghost" id="prevWeek">← 上週</button>
      <button class="ghost" id="thisWeek">本週</button>
      <button class="ghost" id="nextWeek">下週 →</button>
    </div>
    <div class="muted">可拖曳已接單任務重新排程；週末、國定假日與請假日不可放置</div>
  </div>
  <div class="panel calendar-wrap">
    <div class="calendar-grid">${headers}${cells}</div>
  </div>`;

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
按「取消」：${targetDate===source.workDate?'不做任何變更':'仍移到 '+fmtDate(targetDate)+'，但保留為兩個獨立區塊'}。`);
        if(targetDate===source.workDate&&!merge)return;
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

function renderRequest(){const el=$('#requestView');if(!el)return;const options=users.filter(u=>u.id!==me.id&&u.active).map(u=>`<option value="${attr(u.id)}">${escapeHtml(u.displayName)} (${escapeHtml(u.username)})</option>`).join(''),rows=outgoing.filter(t=>!t.selfAssigned).map(t=>`<tr><td><button class="link-btn" data-detail="${t.id}">${escapeHtml(t.workType)}</button></td><td>${escapeHtml(t.assigneeName)}</td><td>${fmtDate(t.requestDate)}</td><td>${num(t.plannedHours)}h</td><td><span class="badge ${t.status}">${statusText(t.status)}</span></td><td>${t.rejectionReason?escapeHtml(t.rejectionReason):'-'}</td></tr>`).join('');el.innerHTML=`<div class="page-header"><div><h1>請別人協助</h1><div class="muted">建立派工前會檢查對方 Loading、請假與出差</div></div></div><div class="request-grid"><form id="createTaskForm" class="form-card"><h3>新增派工</h3><label>被派工者<select name="assigneeId" required><option value="">請選擇</option>${options}</select></label><label>工作類型<input name="workType" placeholder="自由輸入，例如：資料整理" required></label><label>需求內容<textarea name="content" rows="5" required></textarea></label><label>需求日期<input type="date" name="requestDate" required></label><label>預估工時（小時）<input type="number" name="plannedHours" min="0.25" max="999" step="0.25" value="8" required></label><div id="availabilityHint" class="hint-box">選擇被派工者、需求日期與預估工時後，系統會檢查行事曆。</div><button class="primary" type="submit">送出派工</button></form><div class="panel table-scroll"><table><thead><tr><th>工作類型</th><th>被派工者</th><th>需求日期</th><th>預估工時</th><th>狀態</th><th>拒絕理由</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">尚未建立派工</td></tr>'}</tbody></table></div></div>`;const form=$('#createTaskForm');['assigneeId','requestDate','plannedHours'].forEach(n=>form.elements[n].addEventListener('change',()=>scheduleAvailabilityCheck(form)));form.elements.plannedHours.addEventListener('input',()=>scheduleAvailabilityCheck(form));form.addEventListener('submit',async e=>{e.preventDefault();const taskForm=e.currentTarget;const fd=new FormData(taskForm),payload=Object.fromEntries(fd);try{const check=await rpc('checkAvailability',payload);if(check.hasWarning&&!confirm(availabilityConfirmText(check)))return;await rpc('createTask',payload);taskForm.reset();taskForm.elements.plannedHours.value='8';lastAvailability=null;await loadAll();alert('派工已送出')}catch(err){alert(err.message)}});$$('[data-detail]',el).forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)))}
function scheduleAvailabilityCheck(form){clearTimeout(availabilityTimer);availabilityTimer=setTimeout(()=>checkAvailabilityUI(form),450)}async function checkAvailabilityUI(form){const hint=$('#availabilityHint');if(!hint)return;const assigneeId=form.elements.assigneeId.value,requestDate=form.elements.requestDate.value,plannedHours=form.elements.plannedHours.value;if(!assigneeId||!requestDate||!plannedHours){hint.className='hint-box';hint.textContent='選擇被派工者、需求日期與預估工時後，系統會檢查行事曆。';return}hint.className='hint-box';hint.textContent='正在檢查行事曆…';try{const d=await rpc('checkAvailability',{assigneeId,requestDate,plannedHours});lastAvailability=d;hint.className=`hint-box ${d.hasWarning?'warn':'ok'}`;hint.innerHTML=availabilityHtml(d)}catch(e){hint.className='hint-box warn';hint.textContent=e.message}}
function availabilityHtml(d){const lines=[`預估期間最高 Loading：<strong>${Math.round(d.peakLoadPct)}%</strong>`];if(d.highLoadDates?.length)lines.push(`Loading > 80%：${d.highLoadDates.map(x=>fmtDate(x.date)+' ('+Math.round(x.loadPct)+'%)').join('、')}`);if(d.holidays?.length)lines.push(`國定假日：${d.holidays.map(x=>escapeHtml(x.holidayName)+' '+fmtDate(x.holidayDate)).join('；')}`);if(d.leaves?.length)lines.push(`請假：${d.leaves.map(x=>escapeHtml(x.leaveType)+' '+fmtLocalDateTime(x.startDateTime)+'～'+fmtLocalDateTime(x.endDateTime)).join('；')}`);if(d.trips?.length)lines.push(`出差：${d.trips.map(x=>escapeHtml(x.purpose)+' '+fmtDate(x.startDate)+'～'+fmtDate(x.endDate)).join('；')}`);if(!d.hasWarning)lines.push('此期間目前沒有 Loading > 80%、國定假日、請假或出差衝突。');return lines.map(x=>`<div class="hint-line">${x}</div>`).join('')}function availabilityConfirmText(d){const parts=['被派工者的行事曆有以下提示：'];if(d.highLoadDates?.length)parts.push(`• Loading > 80%：${d.highLoadDates.map(x=>fmtDate(x.date)+' '+Math.round(x.loadPct)+'%').join('、')}`);if(d.holidays?.length)parts.push(`• 有 ${d.holidays.length} 個國定假日`);if(d.leaves?.length)parts.push(`• 有 ${d.leaves.length} 筆請假`);if(d.trips?.length)parts.push(`• 有 ${d.trips.length} 筆出差`);parts.push('仍要送出派工嗎？');return parts.join('\n')}
function renderSchedule(){const el=$('#scheduleView');if(!el)return;const leaveRows=myLeaves.map(x=>`<div class="record-card leave"><div><div class="record-title">${escapeHtml(x.leaveType)}</div><div>${fmtLocalDateTime(x.startDateTime)} ～ ${fmtLocalDateTime(x.endDateTime)}</div><div class="mini">只計入週一至週五工作日</div></div><button class="ghost" data-del-leave="${x.id}">刪除</button></div>`).join(''),tripRows=myTrips.map(x=>`<div class="record-card trip"><div><div class="record-title">${escapeHtml(x.purpose)}</div><div>${fmtDate(x.startDate)} ～ ${fmtDate(x.endDate)}</div><div class="mini">以天為顆粒度，只計入週一至週五</div></div><button class="ghost" data-del-trip="${x.id}">刪除</button></div>`).join('');el.innerHTML=`<div class="page-header"><div><h1>請假／出差設定</h1><div class="muted">請假可精確到分鐘；出差以天為單位</div></div></div><div class="schedule-grid"><form id="leaveForm" class="form-card"><h3>新增請假</h3><label>假別<input name="leaveType" list="leaveTypes" placeholder="例如：特休" required><datalist id="leaveTypes"><option value="特休"><option value="事假"><option value="病假"><option value="公假"><option value="其他"></datalist></label><label>開始時間<input type="datetime-local" name="startDateTime" step="60" required></label><label>結束時間<input type="datetime-local" name="endDateTime" step="60" required></label><button class="primary">新增請假</button></form><form id="tripForm" class="form-card"><h3>新增出差</h3><label>目的<textarea name="purpose" rows="3" placeholder="例如：台中工廠 UAT Workshop" required></textarea></label><label>開始日期<input type="date" name="startDate" required></label><label>結束日期<input type="date" name="endDate" required></label><button class="primary">新增出差</button></form></div><div class="schedule-grid"><div class="panel panel-pad"><h3>我的請假</h3><div class="record-list">${leaveRows||'<div class="empty">尚無請假紀錄</div>'}</div></div><div class="panel panel-pad"><h3>我的出差</h3><div class="record-list">${tripRows||'<div class="empty">尚無出差紀錄</div>'}</div></div></div>`;$('#leaveForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;try{await rpc('createLeave',Object.fromEntries(new FormData(form)));form.reset();await loadAll();renderSchedule()}catch(err){alert(err.message)}});$('#tripForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;try{await rpc('createTrip',Object.fromEntries(new FormData(form)));form.reset();await loadAll();renderSchedule()}catch(err){alert(err.message)}});$$('[data-del-leave]',el).forEach(b=>b.onclick=async()=>{if(!confirm('刪除此請假紀錄？'))return;try{await rpc('deleteLeave',{id:b.dataset.delLeave});await loadAll();renderSchedule()}catch(e){alert(e.message)}});$$('[data-del-trip]',el).forEach(b=>b.onclick=async()=>{if(!confirm('刪除此出差紀錄？'))return;try{await rpc('deleteTrip',{id:b.dataset.delTrip});await loadAll();renderSchedule()}catch(e){alert(e.message)}})}
async function renderTeamCalendar(){const el=$('#teamView');if(!el)return;el.innerHTML=`<div class="page-header"><div><h1>團隊出勤行事曆</h1><div class="muted">以 8 小時／工作日計算任務 Loading；國定假日與請假日不分配 Loading，出差另行顯示</div></div><div class="toolbar"><button class="ghost" id="teamPrev">← 前 14 天</button><button class="ghost" id="teamToday">今天</button><button class="ghost" id="teamNext">後 14 天 →</button></div></div><div class="legend"><span><i class="dot load"></i>Loading ≤80%</span><span><i class="dot high"></i>Loading >80%</span><span><i class="dot holiday"></i>國定假日</span><span><i class="dot leave"></i>請假</span><span><i class="dot trip"></i>出差</span></div><div id="teamGantt" class="gantt-wrap"><div class="empty">載入中…</div></div>`;$('#teamPrev').onclick=()=>{teamStart.setDate(teamStart.getDate()-14);renderTeamCalendar()};$('#teamToday').onclick=()=>{teamStart=startOfWeek(new Date());renderTeamCalendar()};$('#teamNext').onclick=()=>{teamStart.setDate(teamStart.getDate()+14);renderTeamCalendar()};const end=new Date(teamStart);end.setDate(end.getDate()+13);try{const d=await rpc('teamCalendar',{startDate:isoDate(teamStart),endDate:isoDate(end)});drawTeamGantt(d)}catch(e){$('#teamGantt').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`}}
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
      <div>${escapeHtml(m.displayName)}</div>
      <div class="mini">${escapeHtml(m.username)}</div>
    </div>`;

    dates.forEach(d=>{
      const cell=m.days[d]||{loadPct:0,leaveLabels:[],tripLabels:[],holidayLabels:[],workday:true};
      const hasHoliday=(cell.holidayLabels||[]).length>0;
      const cls=hasHoliday?'holiday-cell':!cell.workday?'weekend':'';
      const hasLeave=(cell.leaveLabels||[]).length>0;

      let chip='';
      if(cell.workday&&!hasLeave&&!hasHoliday){
        const pct=Math.max(0,Number(cell.loadPct)||0);
        const c=pct>100?'over':pct>80?'high':'';
        chip=`<span class="load-chip ${c}" title="Loading ${Math.round(pct)}%">${Math.round(pct)}%</span>`;
      }

      const holidayHtml=(cell.holidayLabels||[])
        .map(x=>`<div class="event-strip holiday">國休｜${escapeHtml(x)}</div>`).join('');
      const leaves=(cell.leaveLabels||[])
        .map(x=>`<div class="event-strip leave">假｜${escapeHtml(x)}</div>`).join('');
      const trips=(cell.tripLabels||[])
        .map(x=>`<div class="event-strip trip">出｜${escapeHtml(x)}</div>`).join('');

      html+=`<div class="gantt-cell ${cls}">${chip}${holidayHtml}${leaves}${trips}</div>`;
    });
  });

  html+='</div>';
  wrap.innerHTML=html;
}

async function renderAdmin(){
  if(me?.role!=='admin'||!$('#adminView'))return;

  let data;
  try{
    data=await rpc('adminListUsers');
  }catch(e){
    alert(e.message);
    return;
  }

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
    try{
      await rpc('adminDeleteHoliday',{id:b.dataset.deleteHoliday});
      await loadAll();
      await renderAdmin();
    }catch(err){
      alert(err.message);
    }
  }));
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}function attr(v=''){return escapeHtml(v)}function num(v){const n=Number(v);return Number.isFinite(n)?(Math.round(n*100)/100):0}
connectBackend();
