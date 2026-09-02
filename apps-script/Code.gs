
const APP = {
  VERSION: '1.0.0',
  USERS: 'Users',
  TASKS: 'Tasks',
  SESSIONS: 'Sessions',
  SESSION_HOURS: 12,
  ADMIN_USERNAME: 'admin',
  ADMIN_INITIAL_PASSWORD: 'deltatwv2',
  DB_PROPERTY: 'DB_SPREADSHEET_ID'
};

const USER_HEADERS = ['id','username','displayName','passwordHash','salt','role','active','createdAt'];
const TASK_HEADERS = ['id','requesterId','assigneeId','workType','content','requestDate','status','rejectionReason','urgent','createdAt','acceptedAt','completedAt','updatedAt'];
const SESSION_HEADERS = ['token','userId','expiresAt','createdAt'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Team Dispatch')
    .addItem('初始化 / 修復資料表', 'setupTeamDispatch')
    .addItem('設定 GitHub Pages 網址', 'promptAllowedOrigin')
    .addToUi();
}

function setupTeamDispatch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('請從 Google Sheet 的「擴充功能 → Apps Script」建立此綁定指令碼，並從試算表執行初始化。');
  PropertiesService.getScriptProperties().setProperty(APP.DB_PROPERTY, ss.getId());
  ensureSheet_(ss, APP.USERS, USER_HEADERS);
  ensureSheet_(ss, APP.TASKS, TASK_HEADERS);
  ensureSheet_(ss, APP.SESSIONS, SESSION_HEADERS);

  const users = readObjects_(APP.USERS);
  if (!users.some(u => String(u.username).toLowerCase() === APP.ADMIN_USERNAME)) {
    const salt = randomToken_();
    appendObject_(APP.USERS, USER_HEADERS, {
      id: newId_('USR'),
      username: APP.ADMIN_USERNAME,
      displayName: 'Administrator',
      passwordHash: hashPassword_(APP.ADMIN_INITIAL_PASSWORD, salt),
      salt,
      role: 'admin',
      active: true,
      createdAt: nowIso_()
    });
  }

  const sessions = ss.getSheetByName(APP.SESSIONS);
  if (sessions && !sessions.isSheetHidden()) sessions.hideSheet();

  SpreadsheetApp.getUi().alert(
    '初始化完成\n\n預設管理員：admin\n預設密碼：deltatwv2\n\n請登入後立即修改管理員密碼。'
  );
}

function promptAllowedOrigin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(
    '設定 GitHub Pages 網址',
    '請輸入完整 Origin，例如：https://yourname.github.io\n若使用自訂網域則輸入：https://dispatch.example.com',
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const origin = normalizeOrigin_(r.getResponseText());
  PropertiesService.getScriptProperties().setProperty('ALLOWED_ORIGIN', origin);
  ui.alert('已設定：' + origin);
}

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Bridge');
  t.allowedOrigin = PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGIN') || '';
  return t.evaluate()
    .setTitle('Team Dispatch Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function api(payloadJson) {
  try {
    const p = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
    if (!p || !p.action) throw new Error('缺少 action');

    switch (p.action) {
      case 'login': return jsonSafe_(login_(p));
      case 'me': return jsonSafe_(me_(p));
      case 'logout': return jsonSafe_(logout_(p));
      case 'loadAll': return jsonSafe_(loadAll_(p));
      case 'createTask': return jsonSafe_(createTask_(p));
      case 'acceptTask': return jsonSafe_(acceptTask_(p));
      case 'rejectTask': return jsonSafe_(rejectTask_(p));
      case 'setUrgent': return jsonSafe_(setUrgent_(p));
      case 'setCompleted': return jsonSafe_(setCompleted_(p));
      case 'adminListUsers': return jsonSafe_(adminListUsers_(p));
      case 'adminCreateUser': return jsonSafe_(adminCreateUser_(p));
      case 'adminUpdateUser': return jsonSafe_(adminUpdateUser_(p));
      default: throw new Error('未知 action');
    }
  } catch (err) {
    throw new Error(err && err.message ? err.message : String(err));
  }
}

function login_(p) {
  cleanupSessions_();
  const username = clean_(p.username).toLowerCase();
  const password = String(p.password || '');
  if (!username || !password) throw new Error('請輸入帳號與密碼');

  const user = readObjects_(APP.USERS).find(u => String(u.username).toLowerCase() === username);
  if (!user || !truthy_(user.active) || hashPassword_(password, user.salt) !== user.passwordHash) {
    throw new Error('帳號或密碼錯誤');
  }

  const token = randomToken_() + randomToken_();
  const expires = new Date(Date.now() + APP.SESSION_HOURS * 3600 * 1000).toISOString();
  appendObject_(APP.SESSIONS, SESSION_HEADERS, {token,userId:user.id,expiresAt:expires,createdAt:nowIso_()});
  return {token,user:publicUser_(user)};
}

function me_(p) {
  const user = requireUser_(p.token);
  return {user:publicUser_(user)};
}

function logout_(p) {
  if (!p.token) return {ok:true};
  deleteRowsWhere_(APP.SESSIONS, r => String(r.token) === String(p.token));
  return {ok:true};
}

function loadAll_(p) {
  const user = requireUser_(p.token);
  const users = readObjects_(APP.USERS).filter(u => truthy_(u.active)).map(publicUser_);
  const tasks = readObjects_(APP.TASKS);
  const userMap = {};
  readObjects_(APP.USERS).forEach(u => userMap[u.id] = u);

  const incoming = tasks
    .filter(t => String(t.assigneeId) === String(user.id))
    .map(t => publicTask_(t,userMap))
    .sort(taskSort_);
  const outgoing = tasks
    .filter(t => String(t.requesterId) === String(user.id))
    .map(t => publicTask_(t,userMap))
    .sort((a,b)=>String(a.requestDate).localeCompare(String(b.requestDate)) || String(b.createdAt).localeCompare(String(a.createdAt)));

  return {user:publicUser_(user),users,incoming,outgoing};
}

function createTask_(p) {
  const requester = requireUser_(p.token);
  const assigneeId = clean_(p.assigneeId);
  const workType = clean_(p.workType);
  const content = cleanMultiline_(p.content);
  const requestDate = clean_(p.requestDate);

  if (!assigneeId || !workType || !content || !/^\d{4}-\d{2}-\d{2}$/.test(requestDate)) throw new Error('派工欄位不完整');
  if (String(assigneeId) === String(requester.id)) throw new Error('不可將工作指派給自己');

  const assignee = getUserById_(assigneeId);
  if (!assignee || !truthy_(assignee.active)) throw new Error('被派工者不存在或已停用');

  const now = nowIso_();
  const task = {
    id:newId_('TSK'), requesterId:requester.id, assigneeId, workType, content, requestDate,
    status:'pending', rejectionReason:'', urgent:false, createdAt:now, acceptedAt:'', completedAt:'', updatedAt:now
  };
  withLock_(()=>appendObject_(APP.TASKS,TASK_HEADERS,task));
  return {id:task.id};
}

function acceptTask_(p) {
  const user=requireUser_(p.token);
  return mutateTask_(p.taskId, t=>{
    if(String(t.assigneeId)!==String(user.id)) throw new Error('沒有權限');
    if(t.status!=='pending') throw new Error('此工作已處理');
    t.status='accepted';t.acceptedAt=nowIso_();t.rejectionReason='';t.updatedAt=nowIso_();return t;
  });
}

function rejectTask_(p) {
  const user=requireUser_(p.token); const reason=cleanMultiline_(p.reason);
  if(!reason)throw new Error('拒絕時必須輸入理由');
  return mutateTask_(p.taskId,t=>{
    if(String(t.assigneeId)!==String(user.id))throw new Error('沒有權限');
    if(t.status!=='pending')throw new Error('此工作已處理');
    t.status='rejected';t.rejectionReason=reason;t.updatedAt=nowIso_();return t;
  });
}

function setUrgent_(p) {
  const user=requireUser_(p.token);
  return mutateTask_(p.taskId,t=>{
    if(String(t.assigneeId)!==String(user.id))throw new Error('沒有權限');
    if(!['accepted','completed'].includes(t.status))throw new Error('只有已接單工作可標示緊急');
    t.urgent=!!p.urgent;t.updatedAt=nowIso_();return t;
  });
}

function setCompleted_(p) {
  const user=requireUser_(p.token);
  return mutateTask_(p.taskId,t=>{
    if(String(t.assigneeId)!==String(user.id))throw new Error('沒有權限');
    if(!['accepted','completed'].includes(t.status))throw new Error('只有已接單工作可完成');
    if(p.completed){t.status='completed';t.completedAt=nowIso_();}
    else{t.status='accepted';t.completedAt='';}
    t.updatedAt=nowIso_();return t;
  });
}

function adminListUsers_(p) {
  requireAdmin_(p.token);
  return {users:readObjects_(APP.USERS).map(publicUser_)};
}

function adminCreateUser_(p) {
  requireAdmin_(p.token);
  const username=clean_(p.username).toLowerCase(), displayName=clean_(p.displayName), password=String(p.password||'');
  const role=p.role==='admin'?'admin':'user';
  if(!username||!displayName||!password)throw new Error('帳號資料不完整');
  if(!/^[a-zA-Z0-9._-]{2,50}$/.test(username))throw new Error('帳號只能使用英數字、點、底線或連字號');
  if(password.length<8)throw new Error('密碼至少 8 碼');
  if(readObjects_(APP.USERS).some(u=>String(u.username).toLowerCase()===username))throw new Error('帳號已存在');

  const salt=randomToken_();
  const user={id:newId_('USR'),username,displayName,passwordHash:hashPassword_(password,salt),salt,role,active:true,createdAt:nowIso_()};
  withLock_(()=>appendObject_(APP.USERS,USER_HEADERS,user));
  return {id:user.id};
}

function adminUpdateUser_(p) {
  const admin=requireAdmin_(p.token);
  const targetId=clean_(p.userId); const displayName=clean_(p.displayName);
  if(!targetId||!displayName)throw new Error('資料不完整');

  return mutateUser_(targetId,u=>{
    u.displayName=displayName;
    u.role=p.role==='admin'?'admin':'user';
    if(u.username===APP.ADMIN_USERNAME){u.active=true;u.role='admin';}
    else u.active=!!p.active;

    if(String(p.password||'')){
      if(String(p.password).length<8)throw new Error('密碼至少 8 碼');
      u.salt=randomToken_();u.passwordHash=hashPassword_(String(p.password),u.salt);
      deleteRowsWhere_(APP.SESSIONS,s=>String(s.userId)===String(u.id));
    }
    return u;
  });
}

// ---------- Auth ----------
function requireUser_(token) {
  if(!token)throw new Error('登入已失效');
  cleanupSessions_();
  const session=readObjects_(APP.SESSIONS).find(s=>String(s.token)===String(token));
  if(!session)throw new Error('登入已失效');
  if(new Date(session.expiresAt).getTime()<=Date.now())throw new Error('登入已失效');
  const user=getUserById_(session.userId);
  if(!user||!truthy_(user.active))throw new Error('帳號已停用');
  return user;
}
function requireAdmin_(token){const u=requireUser_(token);if(u.role!=='admin')throw new Error('管理員權限不足');return u;}
function cleanupSessions_(){deleteRowsWhere_(APP.SESSIONS,s=>!s.expiresAt||new Date(s.expiresAt).getTime()<=Date.now());}

// ---------- Data helpers ----------
function getDb_() {
  const id = PropertiesService.getScriptProperties().getProperty(APP.DB_PROPERTY);
  if (!id) throw new Error('尚未設定資料庫。請回 Google Sheet 執行「Team Dispatch → 初始化 / 修復資料表」。');
  return SpreadsheetApp.openById(id);
}
function ensureSheet_(ss,name,headers){
  let sh=ss.getSheetByName(name); if(!sh)sh=ss.insertSheet(name);
  if(sh.getLastRow()===0)sh.appendRow(headers);
  else{
    const current=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getValues()[0];
    headers.forEach((h,i)=>{if(current[i]!==h)sh.getRange(1,i+1).setValue(h);});
  }
  sh.setFrozenRows(1);
  return sh;
}
function readObjects_(name){
  const sh=getDb_().getSheetByName(name); if(!sh||sh.getLastRow()<2)return[];
  const values=sh.getDataRange().getValues(); const headers=values[0].map(String);
  return values.slice(1).filter(r=>r.some(v=>v!==''&&v!==null)).map((r,idx)=>{
    const o={_row:idx+2};headers.forEach((h,i)=>o[h]=normalizeCell_(r[i]));return o;
  });
}
function normalizeCell_(v){
  if(v instanceof Date)return v.toISOString();
  return v;
}
function appendObject_(name,headers,obj){
  const sh=getDb_().getSheetByName(name);
  sh.appendRow(headers.map(h=>obj[h]===undefined?'':obj[h]));
}
function mutateTask_(id,fn){
  let result;
  withLock_(()=>{
    const rows=readObjects_(APP.TASKS); const t=rows.find(x=>String(x.id)===String(id));
    if(!t)throw new Error('找不到工作');
    const updated=fn({...t}); writeObjectRow_(APP.TASKS,TASK_HEADERS,t._row,updated); result={ok:true};
  });
  return result;
}
function mutateUser_(id,fn){
  let result;
  withLock_(()=>{
    const rows=readObjects_(APP.USERS); const u=rows.find(x=>String(x.id)===String(id));
    if(!u)throw new Error('找不到帳號');
    const updated=fn({...u}); writeObjectRow_(APP.USERS,USER_HEADERS,u._row,updated); result={ok:true};
  });
  return result;
}
function writeObjectRow_(name,headers,row,obj){
  const sh=getDb_().getSheetByName(name);
  sh.getRange(row,1,1,headers.length).setValues([headers.map(h=>obj[h]===undefined?'':obj[h])]);
}
function deleteRowsWhere_(name,predicate){
  const sh=getDb_().getSheetByName(name);if(!sh||sh.getLastRow()<2)return;
  const rows=readObjects_(name).filter(predicate).map(x=>x._row).sort((a,b)=>b-a);
  rows.forEach(r=>sh.deleteRow(r));
}
function getUserById_(id){return readObjects_(APP.USERS).find(u=>String(u.id)===String(id));}

function publicUser_(u){return{id:String(u.id),username:String(u.username),displayName:String(u.displayName),role:String(u.role),active:truthy_(u.active)};}
function publicTask_(t,userMap){
  return {
    id:String(t.id),requesterId:String(t.requesterId),assigneeId:String(t.assigneeId),
    requesterName:userMap[t.requesterId]?String(userMap[t.requesterId].displayName):'(未知)',
    assigneeName:userMap[t.assigneeId]?String(userMap[t.assigneeId].displayName):'(未知)',
    workType:String(t.workType||''),content:String(t.content||''),requestDate:String(t.requestDate||'').slice(0,10),
    status:String(t.status||'pending'),rejectionReason:String(t.rejectionReason||''),urgent:truthy_(t.urgent),
    createdAt:String(t.createdAt||''),acceptedAt:String(t.acceptedAt||''),completedAt:String(t.completedAt||''),updatedAt:String(t.updatedAt||'')
  };
}
function taskSort_(a,b){
  const order={pending:0,accepted:1,rejected:2,completed:3};
  return (order[a.status]??9)-(order[b.status]??9) || String(a.requestDate).localeCompare(String(b.requestDate)) || String(b.createdAt).localeCompare(String(a.createdAt));
}

// ---------- Security / utility ----------
function hashPassword_(password,salt){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(salt)+'|'+String(password),Utilities.Charset.UTF_8);
  return bytes.map(b=>('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('');
}
function randomToken_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function newId_(prefix){return prefix+'_'+Utilities.getUuid().replace(/-/g,'').slice(0,20);}
function nowIso_(){return new Date().toISOString();}
function clean_(v){return String(v??'').trim().slice(0,500);}
function cleanMultiline_(v){return String(v??'').trim().slice(0,10000);}
function truthy_(v){return v===true||v===1||String(v).toLowerCase()==='true'||String(v)==='1';}
function withLock_(fn){const lock=LockService.getScriptLock();lock.waitLock(10000);try{return fn();}finally{lock.releaseLock();}}
function normalizeOrigin_(v){
  const s=String(v||'').trim().replace(/\/+$/,'');
  if(!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(s))throw new Error('請輸入 HTTPS Origin，不要包含路徑');
  return s;
}
function jsonSafe_(v){return JSON.parse(JSON.stringify(v));}
