
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const app = $('#app');
const cfg = window.TEAM_DISPATCH_CONFIG || {};

let rpcSeq = 1;
const pendingRpc = new Map();
let backendReady = false;
let me = null, users = [], incoming = [], outgoing = [];
let myMode = 'list';
let currentWeekStart = startOfWeek(new Date());

function startOfWeek(d){
  const x = new Date(d); const day = x.getDay(); const diff = day===0 ? -6 : 1-day;
  x.setDate(x.getDate()+diff); x.setHours(0,0,0,0); return x;
}
function dateOnly(s){ return s ? new Date(`${String(s).slice(0,10)}T00:00:00`) : null; }
function fmtDate(s){
  if(!s) return '-'; const d=dateOnly(s);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDateTime(s){
  if(!s) return '-'; const d=new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('zh-TW',{hour12:false});
}
function daysToDue(task){
  const due=dateOnly(task.requestDate); const now=new Date(); now.setHours(0,0,0,0);
  return Math.ceil((due-now)/86400000);
}
function colorClass(task){
  if(task.status==='completed') return 'task-gray';
  const d=daysToDue(task); if(d<0)return'task-pink'; if(d<=2)return'task-orange'; return'task-green';
}
function calClass(task){ return colorClass(task).replace('task-','cal-'); }
function statusText(s){ return ({pending:'待接受',accepted:'已接單',rejected:'已拒絕',completed:'已完成'})[s]||s; }
function token(){ return localStorage.getItem('teamDispatchToken') || ''; }
function setToken(v){ if(v)localStorage.setItem('teamDispatchToken',v); else localStorage.removeItem('teamDispatchToken'); }

function validGoogleOrigin(origin){
  try{
    const u=new URL(origin);
    return u.protocol === 'https:' && (
      u.hostname === 'script.google.com' ||
      u.hostname === 'script.googleusercontent.com' ||
      u.hostname.endsWith('.googleusercontent.com')
    );
  }catch{return false;}
}

window.addEventListener('message', ev=>{
  if(!validGoogleOrigin(ev.origin)) return;
  const m=ev.data||{};
  if(m.channel!=='team-dispatch-rpc' || !m.id) return;
  const p=pendingRpc.get(m.id);
  if(!p) return;
  pendingRpc.delete(m.id);
  clearTimeout(p.timer);
  try{ p.iframe.remove(); }catch{}
  if(m.ok) p.resolve(m.result);
  else p.reject(new Error(m.error||'操作失敗'));
});

function rpc(action, payload={}){
  if(!cfg.APPS_SCRIPT_URL || cfg.APPS_SCRIPT_URL.includes('PASTE_YOUR_')){
    return Promise.reject(new Error('尚未設定 Apps Script URL'));
  }

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

    const requestId=document.createElement('input');
    requestId.type='hidden';
    requestId.name='requestId';
    requestId.value=id;
    form.appendChild(requestId);

    const data=document.createElement('input');
    data.type='hidden';
    data.name='payload';
    data.value=JSON.stringify({action,token:token(),...payload});
    form.appendChild(data);

    document.body.appendChild(form);

    const timer=setTimeout(()=>{
      pendingRpc.delete(id);
      try{iframe.remove();}catch{}
      reject(new Error('Google Apps Script 回應逾時'));
    },cfg.REQUEST_TIMEOUT_MS||20000);

    pendingRpc.set(id,{resolve,reject,timer,iframe});

    try{
      form.submit();
    }catch(err){
      clearTimeout(timer);
      pendingRpc.delete(id);
      iframe.remove();
      reject(err);
    }finally{
      form.remove();
    }
  });
}

async function connectBackend(){
  showLogin();
  const st=$('#bridgeState');

  if(!cfg.APPS_SCRIPT_URL || cfg.APPS_SCRIPT_URL.includes('PASTE_YOUR_')){
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
    if($('#loginForm button[type="submit"]')) $('#loginForm button[type="submit"]').disabled=false;

    if(token()){
      try{
        const d=await rpc('me');
        me=d.user; showMain(); await loadAll();
      }catch{
        setToken('');
      }
    }
  }catch(err){
    if($('#bridgeState')){
      $('#bridgeState').textContent='Google Drive 連線失敗';
      $('#bridgeState').className='bridge-state bad';
    }
    if($('#loginError')) $('#loginError').textContent=err.message;
  }
}
function showLogin(){
  me=null; app.innerHTML=''; app.append($('#loginTpl').content.cloneNode(true));
  if(backendReady){
    $('#bridgeState').textContent='Google Drive 已連線'; $('#bridgeState').className='bridge-state ok';
    $('#loginForm button[type="submit"]').disabled=false;
  }
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault(); $('#loginError').textContent='';
    const fd=new FormData(e.currentTarget);
    try{
      const d=await rpc('login',{username:fd.get('username'),password:fd.get('password')});
      setToken(d.token); me=d.user; showMain(); await loadAll();
    }catch(err){$('#loginError').textContent=err.message;}
  });
}
function showMain(){
  app.innerHTML=''; app.append($('#mainTpl').content.cloneNode(true));
  $('#whoami').innerHTML=`<strong>${escapeHtml(me.displayName)}</strong><div class="muted">${escapeHtml(me.username)} · ${me.role}</div>`;
  $('#adminNav').classList.toggle('hidden',me.role!=='admin');
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view,b)));
  $('#logoutBtn').addEventListener('click',async()=>{try{await rpc('logout');}catch{} setToken('');showLogin();});
  $('#rejectCancel').addEventListener('click',()=>$('#rejectDialog').close());
  $('#rejectForm').addEventListener('submit',handleReject);
}
function switchView(name,btn){
  $$('.view').forEach(v=>v.classList.add('hidden')); $$('.nav-btn').forEach(v=>v.classList.remove('active')); btn?.classList.add('active');
  if(name==='my')$('#myView').classList.remove('hidden');
  if(name==='request')$('#requestView').classList.remove('hidden');
  if(name==='admin'){ $('#adminView').classList.remove('hidden'); renderAdmin(); }
}
async function loadAll(){
  try{
    const d=await rpc('loadAll');
    me=d.user; users=d.users||[]; incoming=d.incoming||[]; outgoing=d.outgoing||[];
    renderMy(); renderRequest(); if(me.role==='admin')renderAdmin();
  }catch(e){
    if(/登入|session|權限/i.test(e.message)){setToken('');showLogin();}
    else alert(e.message);
  }
}
function renderMy(){
  const el=$('#myView'); if(!el)return;
  const pending=incoming.filter(x=>x.status==='pending').length;
  const accepted=incoming.filter(x=>x.status==='accepted').length;
  const completed=incoming.filter(x=>x.status==='completed').length;
  const overdue=incoming.filter(x=>!['completed','rejected'].includes(x.status)&&daysToDue(x)<0).length;
  el.innerHTML=`
    <div class="page-header">
      <div><h1>我的工作</h1><div class="muted">查看待接受、已接單與已完成工作</div></div>
      <div class="segmented">
        <button data-mode="list" class="${myMode==='list'?'active':''}">清單</button>
        <button data-mode="calendar" class="${myMode==='calendar'?'active':''}">日曆</button>
      </div>
    </div>
    <div class="cards">
      <div class="stat"><div class="muted">待接受</div><div class="n">${pending}</div></div>
      <div class="stat"><div class="muted">已接單</div><div class="n">${accepted}</div></div>
      <div class="stat"><div class="muted">已完成</div><div class="n">${completed}</div></div>
      <div class="stat"><div class="muted">已逾期</div><div class="n">${overdue}</div></div>
    </div><div id="myBody"></div>`;
  $$('[data-mode]',el).forEach(b=>b.addEventListener('click',()=>{myMode=b.dataset.mode;renderMy();}));
  if(myMode==='list')renderMyList();else renderCalendar();
}
function renderMyList(){
  const body=$('#myBody');
  const rows=incoming.map(t=>`
    <tr class="${colorClass(t)}">
      <td>${t.urgent?'<span class="urgent">!</span> ':''}<button class="link-btn" data-detail="${t.id}">${escapeHtml(t.workType)}</button></td>
      <td>${escapeHtml(t.requesterName)}</td><td>${fmtDate(t.requestDate)}</td>
      <td><span class="badge ${t.status}">${statusText(t.status)}</span></td><td>${taskActions(t)}</td>
    </tr>`).join('');
  body.innerHTML=`<div class="panel table-scroll"><table><thead><tr><th>工作類型</th><th>派工者</th><th>需求日期</th><th>狀態</th><th>操作</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="5" class="empty">目前沒有工作</td></tr>'}</tbody></table></div>`;
  bindTaskActions(body);
}
function taskActions(t){
  if(t.status==='pending')return`<div class="row-actions"><button class="secondary" data-accept="${t.id}">接受</button><button class="danger" data-reject="${t.id}">拒絕</button></div>`;
  if(['accepted','completed'].includes(t.status))return`<div class="row-actions">
    <button class="ghost" data-urgent="${t.id}" data-value="${t.urgent?0:1}">${t.urgent?'取消緊急':'標示緊急'}</button>
    <button class="secondary" data-complete="${t.id}" data-value="${t.status==='completed'?0:1}">${t.status==='completed'?'改回未完成':'完成'}</button></div>`;
  return t.rejectionReason?`<span class="muted">理由：${escapeHtml(t.rejectionReason)}</span>`:'-';
}
function bindTaskActions(root){
  $$('[data-detail]',root).forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));
  $$('[data-accept]',root).forEach(b=>b.addEventListener('click',async()=>{try{await rpc('acceptTask',{taskId:b.dataset.accept});await loadAll();}catch(e){alert(e.message);}}));
  $$('[data-reject]',root).forEach(b=>b.addEventListener('click',()=>{$('#rejectForm [name="task_id"]').value=b.dataset.reject;$('#rejectForm [name="reason"]').value='';$('#rejectDialog').showModal();}));
  $$('[data-urgent]',root).forEach(b=>b.addEventListener('click',async()=>{try{await rpc('setUrgent',{taskId:b.dataset.urgent,urgent:b.dataset.value==='1'});await loadAll();}catch(e){alert(e.message);}}));
  $$('[data-complete]',root).forEach(b=>b.addEventListener('click',async()=>{try{await rpc('setCompleted',{taskId:b.dataset.complete,completed:b.dataset.value==='1'});await loadAll();}catch(e){alert(e.message);}}));
}
async function handleReject(e){
  e.preventDefault();const fd=new FormData(e.currentTarget);
  try{await rpc('rejectTask',{taskId:fd.get('task_id'),reason:fd.get('reason')});$('#rejectDialog').close();await loadAll();}catch(err){alert(err.message);}
}
function openDetail(id){
  const t=[...incoming,...outgoing].find(x=>String(x.id)===String(id)); if(!t)return;
  $('#taskDetail').innerHTML=`<div class="detail-grid">
    <div class="k">工作類型</div><div>${escapeHtml(t.workType)}</div>
    <div class="k">需求內容</div><div>${escapeHtml(t.content).replace(/\n/g,'<br>')}</div>
    <div class="k">派工者</div><div>${escapeHtml(t.requesterName)}</div>
    <div class="k">被派工者</div><div>${escapeHtml(t.assigneeName)}</div>
    <div class="k">需求日期</div><div>${fmtDate(t.requestDate)}</div>
    <div class="k">狀態</div><div>${statusText(t.status)} ${t.urgent?'<span class="urgent">!</span>':''}</div>
    <div class="k">建立時間</div><div>${fmtDateTime(t.createdAt)}</div>
    <div class="k">接單時間</div><div>${fmtDateTime(t.acceptedAt)}</div>
    <div class="k">完成時間</div><div>${fmtDateTime(t.completedAt)}</div>
    <div class="k">拒絕理由</div><div>${escapeHtml(t.rejectionReason||'-')}</div></div>`;
  $('#taskDialog').showModal();
}
function renderCalendar(){
  const body=$('#myBody');
  const days=[0,1,2,3,4,5,6].map(i=>{const d=new Date(currentWeekStart);d.setDate(d.getDate()+i);return d;});
  const names=['一','二','三','四','五','六','日'];
  const headers=days.map((d,i)=>`<div class="calendar-head">${names[i]}<br>${d.getMonth()+1}/${d.getDate()}</div>`).join('');
  const cells=days.map(d=>{
    const day=new Date(d);day.setHours(0,0,0,0);
    const tasks=incoming.filter(t=>{
      if(!['accepted','completed'].includes(t.status)||!t.acceptedAt)return false;
      const start=new Date(t.acceptedAt);start.setHours(0,0,0,0);const end=dateOnly(t.requestDate);
      return day>=start&&day<=end;
    });
    return `<div class="calendar-day"><div class="calendar-date">${d.getMonth()+1}/${d.getDate()}</div>${tasks.map(t=>`
      <div class="cal-task ${calClass(t)}" data-detail="${t.id}">${t.urgent?'<b>!</b> ':''}${escapeHtml(t.workType)}
      <div class="range-label">${fmtDate(t.acceptedAt)} → ${fmtDate(t.requestDate)}</div></div>`).join('')}</div>`;
  }).join('');
  body.innerHTML=`<div class="page-header"><div class="toolbar"><button class="ghost" id="prevWeek">← 上週</button><button class="ghost" id="thisWeek">本週</button><button class="ghost" id="nextWeek">下週 →</button></div>
  <div class="muted">日曆以「接單日 → 需求日」區間表示</div></div><div class="panel calendar-wrap"><div class="calendar-grid">${headers}${cells}</div></div>`;
  $('#prevWeek').onclick=()=>{currentWeekStart.setDate(currentWeekStart.getDate()-7);renderCalendar();};
  $('#thisWeek').onclick=()=>{currentWeekStart=startOfWeek(new Date());renderCalendar();};
  $('#nextWeek').onclick=()=>{currentWeekStart.setDate(currentWeekStart.getDate()+7);renderCalendar();};
  $$('[data-detail]',body).forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));
}
function renderRequest(){
  const el=$('#requestView');if(!el)return;
  const options=users.filter(u=>u.id!==me.id&&u.active).map(u=>`<option value="${attr(u.id)}">${escapeHtml(u.displayName)} (${escapeHtml(u.username)})</option>`).join('');
  const rows=outgoing.map(t=>`<tr><td><button class="link-btn" data-detail="${t.id}">${escapeHtml(t.workType)}</button></td>
    <td>${escapeHtml(t.assigneeName)}</td><td>${fmtDate(t.requestDate)}</td><td><span class="badge ${t.status}">${statusText(t.status)}</span></td>
    <td>${t.rejectionReason?escapeHtml(t.rejectionReason):'-'}</td></tr>`).join('');
  el.innerHTML=`<div class="page-header"><div><h1>請別人協助</h1><div class="muted">建立派工並追蹤對方是否接單</div></div></div>
    <div class="request-grid"><form id="createTaskForm" class="form-card"><h3>新增派工</h3>
      <label>被派工者<select name="assigneeId" required><option value="">請選擇</option>${options}</select></label>
      <label>工作類型<input name="workType" placeholder="自由輸入，例如：資料整理" required></label>
      <label>需求內容<textarea name="content" rows="6" required></textarea></label>
      <label>需求日期<input type="date" name="requestDate" required></label><button class="primary" type="submit">送出派工</button></form>
      <div class="panel table-scroll"><table><thead><tr><th>工作類型</th><th>被派工者</th><th>需求日期</th><th>狀態</th><th>拒絕理由</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="5" class="empty">尚未建立派工</td></tr>'}</tbody></table></div></div>`;
  $('#createTaskForm').addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    try{await rpc('createTask',Object.fromEntries(fd));e.currentTarget.reset();await loadAll();alert('派工已送出');}catch(err){alert(err.message);}
  });
  $$('[data-detail]',el).forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.detail)));
}
async function renderAdmin(){
  if(me?.role!=='admin'||!$('#adminView'))return;
  let data;try{data=await rpc('adminListUsers');}catch(e){alert(e.message);return;}
  const rows=data.users.map(u=>`<div class="admin-row" data-user-row="${u.id}">
    <input data-field="displayName" value="${attr(u.displayName)}"><input value="${attr(u.username)}" disabled>
    <select data-field="role"><option value="user" ${u.role==='user'?'selected':''}>user</option><option value="admin" ${u.role==='admin'?'selected':''}>admin</option></select>
    <label style="margin:0;display:flex;gap:6px;align-items:center"><input style="width:auto" type="checkbox" data-field="active" ${u.active?'checked':''} ${u.username==='admin'?'disabled':''}>啟用</label>
    <button class="secondary" data-save-user="${u.id}">儲存</button><input data-field="password" type="password" placeholder="新密碼（留白不變）" style="grid-column:1/5"><span></span></div>`).join('');
  $('#adminView').innerHTML=`<div class="page-header"><div><h1>帳號管理</h1><div class="muted">建立帳號、設定角色、停用帳號或重設密碼</div></div></div>
    <div class="admin-grid"><form id="createUserForm" class="form-card"><h3>新增帳號</h3>
      <label>帳號<input name="username" required></label><label>顯示名稱<input name="displayName" required></label>
      <label>密碼<input type="password" name="password" required></label><label>角色<select name="role"><option value="user">user</option><option value="admin">admin</option></select></label>
      <button class="primary">建立</button></form><div class="panel panel-pad"><h3>現有帳號</h3>${rows}</div></div>`;
  $('#createUserForm').addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    try{await rpc('adminCreateUser',Object.fromEntries(fd));e.currentTarget.reset();await loadAll();renderAdmin();}catch(err){alert(err.message);}
  });
  $$('[data-save-user]').forEach(b=>b.addEventListener('click',async()=>{
    const row=$(`[data-user-row="${b.dataset.saveUser}"]`);
    const body={userId:b.dataset.saveUser,displayName:$('[data-field="displayName"]',row).value,role:$('[data-field="role"]',row).value,
      active:$('[data-field="active"]',row).checked,password:$('[data-field="password"]',row).value};
    try{await rpc('adminUpdateUser',body);alert('已更新');await loadAll();renderAdmin();}catch(err){alert(err.message);}
  }));
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function attr(v=''){return escapeHtml(v);}


connectBackend();
