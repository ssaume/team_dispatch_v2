
const APP = {
  VERSION: '1.4.1',
  USERS: 'Users',
  TASKS: 'Tasks',
  ALLOCATIONS: 'TaskAllocations',
  SESSIONS: 'Sessions',
  LEAVES: 'Leaves',
  TRIPS: 'Trips',
  SESSION_HOURS: 12,
  ADMIN_USERNAME: 'admin',
  ADMIN_INITIAL_PASSWORD: 'deltatwv2',
  DB_PROPERTY: 'DB_SPREADSHEET_ID',
  WORKDAY_HOURS: 8
};

const USER_HEADERS = ['id','username','displayName','passwordHash','salt','role','active','createdAt'];
const TASK_HEADERS = ['id','requesterId','assigneeId','workType','content','requestDate','status','rejectionReason','urgent','createdAt','acceptedAt','completedAt','updatedAt','plannedHours','selfAssigned'];
const ALLOCATION_HEADERS = ['id','taskId','userId','workDate','hours','createdAt','updatedAt'];
const SESSION_HEADERS = ['token','userId','expiresAt','createdAt'];
const LEAVE_HEADERS = ['id','userId','leaveType','startDateTime','endDateTime','createdAt'];
const TRIP_HEADERS = ['id','userId','purpose','startDate','endDate','createdAt'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Team Dispatch')
    .addItem('初始化 / 修復資料表', 'setupTeamDispatch')
    .addItem('設定 GitHub Pages 網址', 'promptAllowedOrigin')
    .addToUi();
}

function setupTeamDispatch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('請從 Google Sheet 的「擴充功能 → Apps Script」建立此綁定指令碼。');

  PropertiesService.getScriptProperties().setProperty(APP.DB_PROPERTY, ss.getId());

  ensureSheet_(ss, APP.USERS, USER_HEADERS);
  ensureSheet_(ss, APP.TASKS, TASK_HEADERS);
  ensureSheet_(ss, APP.ALLOCATIONS, ALLOCATION_HEADERS);
  ensureSheet_(ss, APP.SESSIONS, SESSION_HEADERS);
  ensureSheet_(ss, APP.LEAVES, LEAVE_HEADERS);
  ensureSheet_(ss, APP.TRIPS, TRIP_HEADERS);

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

  backfillAllAllocations_();

  const sessions = ss.getSheetByName(APP.SESSIONS);
  if (sessions && !sessions.isSheetHidden()) sessions.hideSheet();

  SpreadsheetApp.getUi().alert(
    '初始化完成\n\n已確認 Users / Tasks / TaskAllocations / Sessions / Leaves / Trips 資料表。\n\n既有已接單工作若尚無日排程，已依工作日與請假狀況建立初始排程。'
  );
}

function promptAllowedOrigin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(
    '設定 GitHub Pages 網址',
    '請輸入完整 Origin，例如：https://yourname.github.io',
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const origin = normalizeOrigin_(r.getResponseText());
  PropertiesService.getScriptProperties().setProperty('ALLOWED_ORIGIN', origin);
  ui.alert('已設定：' + origin);
}

function doGet(e) {
  const origin = PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGIN') || '';
  return responseHtml_({
    channel: 'team-dispatch-rpc',
    id: 'health',
    ok: true,
    result: { ok: true, version: APP.VERSION }
  }, origin);
}

function doPost(e) {
  const requestId = e && e.parameter ? String(e.parameter.requestId || '') : '';
  const payloadText = e && e.parameter ? String(e.parameter.payload || '{}') : '{}';
  const origin = PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGIN') || '';
  let message;

  try {
    message = {
      channel: 'team-dispatch-rpc',
      id: requestId,
      ok: true,
      result: api(payloadText)
    };
  } catch (err) {
    message = {
      channel: 'team-dispatch-rpc',
      id: requestId,
      ok: false,
      error: err && err.message ? err.message : String(err)
    };
  }
  return responseHtml_(message, origin);
}

function responseHtml_(message, origin) {
  const t = HtmlService.createTemplateFromFile('Response');
  t.messageJson = JSON.stringify(message);
  t.allowedOrigin = origin;
  return t.evaluate()
    .setTitle('Team Dispatch Response')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function api(payloadJson) {
  try {
    const p = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
    if (!p || !p.action) throw new Error('缺少 action');

    switch (p.action) {
      case 'ping': return jsonSafe_({ ok: true, version: APP.VERSION });
      case 'login': return jsonSafe_(login_(p));
      case 'me': return jsonSafe_(me_(p));
      case 'logout': return jsonSafe_(logout_(p));
      case 'loadAll': return jsonSafe_(loadAll_(p));

      case 'createTask': return jsonSafe_(createTask_(p));
      case 'createSelfTask': return jsonSafe_(createSelfTask_(p));
      case 'acceptTask': return jsonSafe_(acceptTask_(p));
      case 'rejectTask': return jsonSafe_(rejectTask_(p));
      case 'setUrgent': return jsonSafe_(setUrgent_(p));
      case 'setCompleted': return jsonSafe_(setCompleted_(p));

      case 'moveAllocation': return jsonSafe_(moveAllocation_(p));
      case 'splitAllocation': return jsonSafe_(splitAllocation_(p));

      case 'createLeave': return jsonSafe_(createLeave_(p));
      case 'deleteLeave': return jsonSafe_(deleteLeave_(p));
      case 'createTrip': return jsonSafe_(createTrip_(p));
      case 'deleteTrip': return jsonSafe_(deleteTrip_(p));

      case 'checkAvailability': return jsonSafe_(checkAvailability_(p));
      case 'teamCalendar': return jsonSafe_(teamCalendar_(p));

      case 'adminListUsers': return jsonSafe_(adminListUsers_(p));
      case 'adminCreateUser': return jsonSafe_(adminCreateUser_(p));
      case 'adminUpdateUser': return jsonSafe_(adminUpdateUser_(p));

      default: throw new Error('未知 action');
    }
  } catch (err) {
    throw new Error(err && err.message ? err.message : String(err));
  }
}

// ---------- Auth ----------
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
  const expires = new Date(Date.now() + APP.SESSION_HOURS * 3600000).toISOString();

  appendObject_(APP.SESSIONS, SESSION_HEADERS, {
    token,
    userId: user.id,
    expiresAt: expires,
    createdAt: nowIso_()
  });
  return { token, user: publicUser_(user) };
}

function me_(p) {
  return { user: publicUser_(requireUser_(p.token)) };
}

function logout_(p) {
  if (p.token) deleteRowsWhere_(APP.SESSIONS, r => String(r.token) === String(p.token));
  return { ok: true };
}

function requireUser_(token) {
  if (!token) throw new Error('登入已失效');
  cleanupSessions_();

  const session = readObjects_(APP.SESSIONS).find(s => String(s.token) === String(token));
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) throw new Error('登入已失效');

  const user = getUserById_(session.userId);
  if (!user || !truthy_(user.active)) throw new Error('帳號已停用');
  return user;
}

function requireAdmin_(token) {
  const user = requireUser_(token);
  if (user.role !== 'admin') throw new Error('管理員權限不足');
  return user;
}

function cleanupSessions_() {
  deleteRowsWhere_(APP.SESSIONS, s => !s.expiresAt || new Date(s.expiresAt).getTime() <= Date.now());
}

// ---------- Load ----------
function loadAll_(p) {
  const user = requireUser_(p.token);
  ensureUserAllocations_(user.id);

  const allUsers = readObjects_(APP.USERS);
  const users = allUsers.filter(u => truthy_(u.active)).map(publicUser_);
  const tasks = readObjects_(APP.TASKS);
  const userMap = {};
  allUsers.forEach(u => userMap[u.id] = u);

  const incoming = tasks
    .filter(t => String(t.assigneeId) === String(user.id))
    .map(t => publicTask_(t, userMap))
    .sort(taskSort_);

  const outgoing = tasks
    .filter(t => String(t.requesterId) === String(user.id))
    .map(t => publicTask_(t, userMap))
    .sort((a,b) => String(a.requestDate).localeCompare(String(b.requestDate)) || String(b.createdAt).localeCompare(String(a.createdAt)));

  const myAllocations = readObjects_(APP.ALLOCATIONS)
    .filter(a => String(a.userId) === String(user.id))
    .map(publicAllocation_)
    .sort((a,b) => String(a.workDate).localeCompare(String(b.workDate)) || String(a.taskId).localeCompare(String(b.taskId)));

  const myLeaves = readObjects_(APP.LEAVES)
    .filter(x => String(x.userId) === String(user.id))
    .map(publicLeave_)
    .sort((a,b) => String(b.startDateTime).localeCompare(String(a.startDateTime)));

  const myTrips = readObjects_(APP.TRIPS)
    .filter(x => String(x.userId) === String(user.id))
    .map(publicTrip_)
    .sort((a,b) => String(b.startDate).localeCompare(String(a.startDate)));

  return {
    user: publicUser_(user),
    users,
    incoming,
    outgoing,
    myAllocations,
    myLeaves,
    myTrips
  };
}

// ---------- Tasks ----------
function validateTaskInput_(p) {
  const workType = clean_(p.workType);
  const content = cleanMultiline_(p.content);
  const requestDate = clean_(p.requestDate);
  const plannedHours = Number(p.plannedHours);

  if (
    !workType ||
    !content ||
    !isDateKey_(requestDate) ||
    !Number.isFinite(plannedHours) ||
    plannedHours <= 0 ||
    plannedHours > 999
  ) {
    throw new Error('工作欄位不完整或預估工時不正確');
  }

  return { workType, content, requestDate, plannedHours };
}

function createTask_(p) {
  const requester = requireUser_(p.token);
  const assigneeId = clean_(p.assigneeId);
  const v = validateTaskInput_(p);

  if (!assigneeId) throw new Error('請選擇被派工者');
  if (String(assigneeId) === String(requester.id)) throw new Error('派給自己請使用「新增自己的工作」');

  const assignee = getUserById_(assigneeId);
  if (!assignee || !truthy_(assignee.active)) throw new Error('被派工者不存在或已停用');

  const now = nowIso_();
  const task = {
    id: newId_('TSK'),
    requesterId: requester.id,
    assigneeId,
    workType: v.workType,
    content: v.content,
    requestDate: v.requestDate,
    status: 'pending',
    rejectionReason: '',
    urgent: false,
    createdAt: now,
    acceptedAt: '',
    completedAt: '',
    updatedAt: now,
    plannedHours: v.plannedHours,
    selfAssigned: false
  };

  withLock_(() => appendObject_(APP.TASKS, TASK_HEADERS, task));
  return { id: task.id };
}

function createSelfTask_(p) {
  const user = requireUser_(p.token);
  const v = validateTaskInput_(p);
  const now = nowIso_();

  const task = {
    id: newId_('TSK'),
    requesterId: user.id,
    assigneeId: user.id,
    workType: v.workType,
    content: v.content,
    requestDate: v.requestDate,
    status: 'accepted',
    rejectionReason: '',
    urgent: false,
    createdAt: now,
    acceptedAt: now,
    completedAt: '',
    updatedAt: now,
    plannedHours: v.plannedHours,
    selfAssigned: true
  };

  const plan = buildInitialAllocationPlan_(task);
  if (!plan.length) throw new Error('建立日至需求日之間沒有可排程的工作日，請調整需求日期或請假設定');

  withLock_(() => {
    appendObject_(APP.TASKS, TASK_HEADERS, task);
    appendAllocationPlan_(task, plan);
  });

  return { id: task.id };
}

function acceptTask_(p) {
  const user = requireUser_(p.token);
  const taskId = clean_(p.taskId);
  let result;

  withLock_(() => {
    const task = readObjects_(APP.TASKS).find(t => String(t.id) === taskId);
    if (!task || String(task.assigneeId) !== String(user.id)) throw new Error('找不到工作');
    if (task.status !== 'pending') throw new Error('此工作已處理');

    const updated = { ...task };
    updated.status = 'accepted';
    updated.acceptedAt = nowIso_();
    updated.rejectionReason = '';
    updated.updatedAt = nowIso_();

    const plan = buildInitialAllocationPlan_(updated);
    if (!plan.length) throw new Error('接單日至需求日之間沒有可排程的工作日，請先調整請假或請派工者調整需求日期');

    writeObjectRow_(APP.TASKS, TASK_HEADERS, task._row, updated);
    deleteRowsWhere_(APP.ALLOCATIONS, a => String(a.taskId) === taskId);
    appendAllocationPlan_(updated, plan);
    result = { ok: true };
  });

  return result;
}

function rejectTask_(p) {
  const user = requireUser_(p.token);
  const reason = cleanMultiline_(p.reason);
  if (!reason) throw new Error('拒絕時必須輸入理由');

  return mutateTask_(p.taskId, t => {
    if (String(t.assigneeId) !== String(user.id)) throw new Error('沒有權限');
    if (t.status !== 'pending') throw new Error('此工作已處理');
    t.status = 'rejected';
    t.rejectionReason = reason;
    t.updatedAt = nowIso_();
    return t;
  });
}

function setUrgent_(p) {
  const user = requireUser_(p.token);
  return mutateTask_(p.taskId, t => {
    if (String(t.assigneeId) !== String(user.id)) throw new Error('沒有權限');
    if (!['accepted','completed'].includes(t.status)) throw new Error('只有已接單工作可標示緊急');
    t.urgent = !!p.urgent;
    t.updatedAt = nowIso_();
    return t;
  });
}

function setCompleted_(p) {
  const user = requireUser_(p.token);
  return mutateTask_(p.taskId, t => {
    if (String(t.assigneeId) !== String(user.id)) throw new Error('沒有權限');
    if (!['accepted','completed'].includes(t.status)) throw new Error('只有已接單工作可完成');

    if (p.completed) {
      t.status = 'completed';
      t.completedAt = nowIso_();
    } else {
      t.status = 'accepted';
      t.completedAt = '';
    }
    t.updatedAt = nowIso_();
    return t;
  });
}

// ---------- Task allocations ----------
function backfillAllAllocations_() {
  const tasks = readObjects_(APP.TASKS)
    .filter(t => ['accepted','completed'].includes(String(t.status)));

  const existing = readObjects_(APP.ALLOCATIONS);
  const has = {};
  existing.forEach(a => has[String(a.taskId)] = true);

  withLock_(() => {
    tasks.forEach(task => {
      const alreadyExists = readObjects_(APP.ALLOCATIONS)
        .some(a => String(a.taskId) === String(task.id));
      if (alreadyExists) return;
      const plan = buildInitialAllocationPlan_(task);
      if (plan.length) appendAllocationPlan_(task, plan);
    });
  });
}

function ensureUserAllocations_(userId) {
  const tasks = readObjects_(APP.TASKS)
    .filter(t =>
      String(t.assigneeId) === String(userId) &&
      ['accepted','completed'].includes(String(t.status))
    );

  const allocations = readObjects_(APP.ALLOCATIONS);
  const has = {};
  allocations.forEach(a => has[String(a.taskId)] = true);

  const missing = tasks.filter(t => !has[String(t.id)]);
  if (!missing.length) return;

  withLock_(() => {
    missing.forEach(task => {
      const alreadyExists = readObjects_(APP.ALLOCATIONS)
        .some(a => String(a.taskId) === String(task.id));
      if (alreadyExists) return;
      const plan = buildInitialAllocationPlan_(task);
      if (plan.length) appendAllocationPlan_(task, plan);
    });
  });
}

function taskStartDate_(task) {
  const raw = task.acceptedAt || task.createdAt;
  if (!raw) return '';
  return dateKey_(new Date(raw));
}

function buildInitialAllocationPlan_(task) {
  const start = taskStartDate_(task);
  const end = String(task.requestDate || '').slice(0,10);
  if (!isDateKey_(start) || !isDateKey_(end) || end < start) return [];

  const leaveDates = leaveDateSet_(task.assigneeId, start, end);
  const dates = dateKeys_(start, end)
    .filter(d => isWorkdayKey_(d) && !leaveDates[d]);

  return distributeHours_(dates, Number(task.plannedHours) || 8);
}

function distributeHours_(dates, totalHours) {
  if (!dates.length || !Number.isFinite(Number(totalHours)) || Number(totalHours) <= 0) return [];

  const cents = Math.round(Number(totalHours) * 100);
  const base = Math.floor(cents / dates.length);
  let remainder = cents - base * dates.length;

  return dates.map(date => {
    const value = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return { workDate: date, hours: value / 100 };
  }).filter(x => x.hours > 0);
}

function appendAllocationPlan_(task, plan) {
  const now = nowIso_();
  plan.forEach(x => {
    appendObject_(APP.ALLOCATIONS, ALLOCATION_HEADERS, {
      id: newId_('ALC'),
      taskId: task.id,
      userId: task.assigneeId,
      workDate: x.workDate,
      hours: roundHours_(x.hours),
      createdAt: now,
      updatedAt: now
    });
  });
}

function validateAllocationTarget_(task, userId, targetDate) {
  if (!isDateKey_(targetDate)) throw new Error('目標日期格式錯誤');
  if (!isWorkdayKey_(targetDate)) throw new Error('週六、週日不是工作日，不能排入任務');
  if (isUserOnLeaveDate_(userId, targetDate)) throw new Error('目標日期已有請假，不能排入任務');

  const start = taskStartDate_(task);
  const end = String(task.requestDate || '').slice(0,10);

  if (targetDate < start || targetDate > end) {
    throw new Error(`目標日期必須在任務可排程期間 ${start} ～ ${end} 之內`);
  }
}

function moveAllocation_(p) {
  const user = requireUser_(p.token);
  const allocationId = clean_(p.allocationId);
  const targetDate = clean_(p.targetDate);
  const merge = !!p.merge;
  let result;

  withLock_(() => {
    const allocations = readObjects_(APP.ALLOCATIONS);
    const source = allocations.find(a => String(a.id) === allocationId);
    if (!source || String(source.userId) !== String(user.id)) throw new Error('找不到日曆任務區塊');

    const task = readObjects_(APP.TASKS).find(t => String(t.id) === String(source.taskId));
    if (!task || String(task.assigneeId) !== String(user.id)) throw new Error('找不到工作');
    if (task.status !== 'accepted') throw new Error('只有進行中的已接單工作可以拖拉排程');

    validateAllocationTarget_(task, user.id, targetDate);

    const targetSame = allocations.filter(a =>
      String(a.taskId) === String(source.taskId) &&
      String(a.workDate) === targetDate &&
      String(a.id) !== allocationId
    );

    // Same-day drop is normally a no-op, but allow it when there are
    // multiple same-task blocks and the user explicitly chooses merge.
    if (String(source.workDate) === targetDate && !(merge && targetSame.length)) {
      result = { ok: true, merged: false };
      return;
    }

    if (merge && targetSame.length) {
      const total = roundHours_(
        Number(source.hours) +
        targetSame.reduce((sum,a) => sum + Number(a.hours || 0), 0)
      );

      deleteRowsWhere_(APP.ALLOCATIONS, a =>
        String(a.id) === allocationId ||
        (
          String(a.taskId) === String(source.taskId) &&
          String(a.workDate) === targetDate
        )
      );

      appendObject_(APP.ALLOCATIONS, ALLOCATION_HEADERS, {
        id: newId_('ALC'),
        taskId: source.taskId,
        userId: source.userId,
        workDate: targetDate,
        hours: total,
        createdAt: nowIso_(),
        updatedAt: nowIso_()
      });

      result = { ok: true, merged: true, hours: total };
    } else {
      const updated = { ...source, workDate: targetDate, updatedAt: nowIso_() };
      writeObjectRow_(APP.ALLOCATIONS, ALLOCATION_HEADERS, source._row, updated);
      result = { ok: true, merged: false, hours: Number(source.hours) };
    }
  });

  return result;
}

function splitAllocation_(p) {
  const user = requireUser_(p.token);
  const allocationId = clean_(p.allocationId);
  const targetDate = clean_(p.targetDate);
  const movePercent = Number(p.movePercent);
  const mergeTarget = !!p.mergeTarget;
  let result;

  if (!Number.isFinite(movePercent) || movePercent <= 0 || movePercent >= 100) {
    throw new Error('分拆比例必須大於 0% 且小於 100%');
  }

  withLock_(() => {
    const allocations = readObjects_(APP.ALLOCATIONS);
    const source = allocations.find(a => String(a.id) === allocationId);
    if (!source || String(source.userId) !== String(user.id)) throw new Error('找不到日曆任務區塊');

    const task = readObjects_(APP.TASKS).find(t => String(t.id) === String(source.taskId));
    if (!task || String(task.assigneeId) !== String(user.id)) throw new Error('找不到工作');
    if (task.status !== 'accepted') throw new Error('只有進行中的已接單工作可以分拆');

    validateAllocationTarget_(task, user.id, targetDate);
    if (String(source.workDate) === targetDate) throw new Error('分拆目標日不可與原日期相同');

    const sourceHours = Number(source.hours);
    const movedHours = roundHours_(sourceHours * movePercent / 100);
    const remainHours = roundHours_(sourceHours - movedHours);

    if (movedHours < 0.01 || remainHours < 0.01) {
      throw new Error('分拆後每一部分至少需要 0.01 小時，請調整比例');
    }

    const updatedSource = {
      ...source,
      hours: remainHours,
      updatedAt: nowIso_()
    };
    writeObjectRow_(APP.ALLOCATIONS, ALLOCATION_HEADERS, source._row, updatedSource);

    const targetSame = allocations.filter(a =>
      String(a.taskId) === String(source.taskId) &&
      String(a.workDate) === targetDate &&
      String(a.id) !== allocationId
    );

    if (mergeTarget && targetSame.length) {
      const total = roundHours_(
        movedHours + targetSame.reduce((sum,a) => sum + Number(a.hours || 0), 0)
      );

      deleteRowsWhere_(APP.ALLOCATIONS, a =>
        String(a.taskId) === String(source.taskId) &&
        String(a.workDate) === targetDate
      );

      appendObject_(APP.ALLOCATIONS, ALLOCATION_HEADERS, {
        id: newId_('ALC'),
        taskId: source.taskId,
        userId: source.userId,
        workDate: targetDate,
        hours: total,
        createdAt: nowIso_(),
        updatedAt: nowIso_()
      });

      result = {
        ok: true,
        sourceHours: remainHours,
        targetHours: total,
        merged: true
      };
    } else {
      appendObject_(APP.ALLOCATIONS, ALLOCATION_HEADERS, {
        id: newId_('ALC'),
        taskId: source.taskId,
        userId: source.userId,
        workDate: targetDate,
        hours: movedHours,
        createdAt: nowIso_(),
        updatedAt: nowIso_()
      });

      result = {
        ok: true,
        sourceHours: remainHours,
        targetHours: movedHours,
        merged: false
      };
    }
  });

  return result;
}

// ---------- Leave / Trip ----------
function createLeave_(p) {
  const user = requireUser_(p.token);
  const leaveType = clean_(p.leaveType);
  const start = parseLocalDateTime_(p.startDateTime);
  const end = parseLocalDateTime_(p.endDateTime);

  if (!leaveType || !start || !end || end <= start) {
    throw new Error('請假資料不完整，或結束時間早於開始時間');
  }

  const startDate = dateKey_(start);
  const endDate = dateKey_(end);
  if (countWorkdays_(startDate, endDate) === 0) {
    throw new Error('此區間沒有工作日（週一至週五）');
  }

  validateLeaveRebalancePossible_(user.id, startDate, endDate);

  const row = {
    id: newId_('LEV'),
    userId: user.id,
    leaveType,
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    createdAt: nowIso_()
  };

  withLock_(() => {
    appendObject_(APP.LEAVES, LEAVE_HEADERS, row);
    rebalanceAllocationsForLeave_(user.id, startDate, endDate);
  });

  return { id: row.id };
}

function deleteLeave_(p) {
  const user = requireUser_(p.token);
  const id = clean_(p.id);
  const row = readObjects_(APP.LEAVES).find(x => String(x.id) === id);

  if (!row || String(row.userId) !== String(user.id)) throw new Error('找不到請假紀錄');
  deleteRowsWhere_(APP.LEAVES, x => String(x.id) === id);
  return { ok: true };
}


function validateLeaveRebalancePossible_(userId, leaveStart, leaveEnd) {
  const tasks = readObjects_(APP.TASKS)
    .filter(t => String(t.assigneeId) === String(userId) && String(t.status) === 'accepted');

  const allocations = readObjects_(APP.ALLOCATIONS);
  tasks.forEach(task => {
    const affected = allocations.some(a =>
      String(a.taskId) === String(task.id) &&
      String(a.workDate) >= leaveStart &&
      String(a.workDate) <= leaveEnd
    );
    if (!affected) return;

    const taskStart = taskStartDate_(task);
    const taskEnd = String(task.requestDate).slice(0,10);
    const leaveDates = leaveDateSet_(userId, taskStart, taskEnd);
    dateKeys_(leaveStart > taskStart ? leaveStart : taskStart, leaveEnd < taskEnd ? leaveEnd : taskEnd)
      .filter(isWorkdayKey_)
      .forEach(d => leaveDates[d] = true);

    const validDates = dateKeys_(taskStart, taskEnd)
      .filter(d => isWorkdayKey_(d) && !leaveDates[d]);

    if (!validDates.length) {
      throw new Error(`請假設定會讓「${task.workType}」沒有任何可排程工作日，請先調整任務需求日期或其他排程`);
    }
  });
}

function rebalanceAllocationsForLeave_(userId, leaveStart, leaveEnd) {
  const tasks = readObjects_(APP.TASKS)
    .filter(t => String(t.assigneeId) === String(userId) && String(t.status) === 'accepted');

  const allocations = readObjects_(APP.ALLOCATIONS);

  tasks.forEach(task => {
    const taskRows = allocations.filter(a => String(a.taskId) === String(task.id));
    const affected = taskRows.filter(a =>
      String(a.workDate) >= leaveStart &&
      String(a.workDate) <= leaveEnd
    );

    if (!affected.length) return;

    const removedHours = roundHours_(affected.reduce((sum,a) => sum + Number(a.hours || 0), 0));
    const taskStart = taskStartDate_(task);
    const taskEnd = String(task.requestDate).slice(0,10);
    const leaveDates = leaveDateSet_(userId, taskStart, taskEnd);

    const validDates = dateKeys_(taskStart, taskEnd)
      .filter(d => isWorkdayKey_(d) && !leaveDates[d]);

    if (!validDates.length) {
      throw new Error(`請假設定會讓「${task.workType}」沒有任何可排程工作日，請先調整任務需求日期或其他排程`);
    }

    const additions = distributeHours_(validDates, removedHours);

    affected.forEach(a => deleteRowsWhere_(APP.ALLOCATIONS, x => String(x.id) === String(a.id)));

    additions.forEach(add => {
      mergeHoursIntoTaskDate_(task.id, userId, add.workDate, add.hours);
    });
  });
}

function mergeHoursIntoTaskDate_(taskId, userId, workDate, hours) {
  const rows = readObjects_(APP.ALLOCATIONS).filter(a =>
    String(a.taskId) === String(taskId) &&
    String(a.workDate) === String(workDate)
  );

  if (!rows.length) {
    appendObject_(APP.ALLOCATIONS, ALLOCATION_HEADERS, {
      id: newId_('ALC'),
      taskId,
      userId,
      workDate,
      hours: roundHours_(hours),
      createdAt: nowIso_(),
      updatedAt: nowIso_()
    });
    return;
  }

  const total = roundHours_(Number(hours) + rows.reduce((sum,a) => sum + Number(a.hours || 0), 0));
  rows.forEach(a => deleteRowsWhere_(APP.ALLOCATIONS, x => String(x.id) === String(a.id)));

  appendObject_(APP.ALLOCATIONS, ALLOCATION_HEADERS, {
    id: newId_('ALC'),
    taskId,
    userId,
    workDate,
    hours: total,
    createdAt: nowIso_(),
    updatedAt: nowIso_()
  });
}

function createTrip_(p) {
  const user = requireUser_(p.token);
  const purpose = cleanMultiline_(p.purpose);
  const startDate = clean_(p.startDate);
  const endDate = clean_(p.endDate);

  if (!purpose || !isDateKey_(startDate) || !isDateKey_(endDate) || startDate > endDate) {
    throw new Error('出差資料不完整，或日期範圍錯誤');
  }

  if (countWorkdays_(startDate, endDate) === 0) {
    throw new Error('此區間沒有工作日（週一至週五）');
  }

  const row = {
    id: newId_('TRP'),
    userId: user.id,
    purpose,
    startDate,
    endDate,
    createdAt: nowIso_()
  };

  withLock_(() => appendObject_(APP.TRIPS, TRIP_HEADERS, row));
  return { id: row.id };
}

function deleteTrip_(p) {
  const user = requireUser_(p.token);
  const id = clean_(p.id);
  const row = readObjects_(APP.TRIPS).find(x => String(x.id) === id);

  if (!row || String(row.userId) !== String(user.id)) throw new Error('找不到出差紀錄');
  deleteRowsWhere_(APP.TRIPS, x => String(x.id) === id);
  return { ok: true };
}

// ---------- Availability / Team calendar ----------
function checkAvailability_(p) {
  requireUser_(p.token);

  const assigneeId = clean_(p.assigneeId);
  const requestDate = clean_(p.requestDate);
  const plannedHours = Number(p.plannedHours);

  if (!assigneeId || !isDateKey_(requestDate) || !Number.isFinite(plannedHours) || plannedHours <= 0) {
    throw new Error('請先選擇被派工者、需求日期與預估工時');
  }

  const assignee = getUserById_(assigneeId);
  if (!assignee || !truthy_(assignee.active)) throw new Error('被派工者不存在或已停用');

  const today = dateKey_(new Date());
  if (requestDate < today) throw new Error('需求日期不可早於今天');

  const loads = calculateUserLoads_(assigneeId, today, requestDate);
  const proposed = spreadHoursForUser_(assigneeId, today, requestDate, plannedHours);

  Object.keys(proposed).forEach(d => {
    loads[d] = (loads[d] || 0) + proposed[d];
  });

  const highLoadDates = Object.keys(loads)
    .filter(d => d >= today && d <= requestDate && isWorkdayKey_(d))
    .map(d => ({ date: d, loadPct: loads[d] / APP.WORKDAY_HOURS * 100 }))
    .filter(x => x.loadPct > 80)
    .sort((a,b) => a.date.localeCompare(b.date));

  const allPcts = Object.keys(loads)
    .filter(d => d >= today && d <= requestDate)
    .map(d => loads[d] / APP.WORKDAY_HOURS * 100);

  const peakLoadPct = Math.max(0, ...allPcts);

  const leaves = readObjects_(APP.LEAVES)
    .filter(x =>
      String(x.userId) === assigneeId &&
      rangesOverlap_(
        dateKey_(new Date(x.startDateTime)),
        dateKey_(new Date(x.endDateTime)),
        today,
        requestDate
      ) &&
      hasWorkdayOverlap_(
        dateKey_(new Date(x.startDateTime)),
        dateKey_(new Date(x.endDateTime)),
        today,
        requestDate
      )
    )
    .map(publicLeave_);

  const trips = readObjects_(APP.TRIPS)
    .filter(x =>
      String(x.userId) === assigneeId &&
      rangesOverlap_(x.startDate, x.endDate, today, requestDate) &&
      hasWorkdayOverlap_(x.startDate, x.endDate, today, requestDate)
    )
    .map(publicTrip_);

  return {
    peakLoadPct,
    highLoadDates,
    leaves,
    trips,
    hasWarning: highLoadDates.length > 0 || leaves.length > 0 || trips.length > 0
  };
}

function teamCalendar_(p) {
  requireUser_(p.token);

  const startDate = clean_(p.startDate);
  const endDate = clean_(p.endDate);

  if (!isDateKey_(startDate) || !isDateKey_(endDate) || startDate > endDate) {
    throw new Error('日期區間錯誤');
  }

  const dates = dateKeys_(startDate, endDate);
  if (dates.length > 31) throw new Error('單次最多檢視 31 天');

  const users = readObjects_(APP.USERS).filter(u => truthy_(u.active));
  const leaves = readObjects_(APP.LEAVES);
  const trips = readObjects_(APP.TRIPS);

  const members = users.map(u => {
    const loads = calculateUserLoads_(u.id, startDate, endDate);
    const days = {};

    dates.forEach(d => {
      const leaveLabels = leaves
        .filter(x =>
          String(x.userId) === String(u.id) &&
          d >= dateKey_(new Date(x.startDateTime)) &&
          d <= dateKey_(new Date(x.endDateTime)) &&
          isWorkdayKey_(d)
        )
        .map(x => String(x.leaveType));

      const tripLabels = trips
        .filter(x =>
          String(x.userId) === String(u.id) &&
          d >= String(x.startDate) &&
          d <= String(x.endDate) &&
          isWorkdayKey_(d)
        )
        .map(x => String(x.purpose));

      days[d] = {
        workday: isWorkdayKey_(d),
        loadPct: isWorkdayKey_(d) && !leaveLabels.length
          ? (loads[d] || 0) / APP.WORKDAY_HOURS * 100
          : 0,
        leaveLabels,
        tripLabels
      };
    });

    return {
      id: u.id,
      username: String(u.username),
      displayName: String(u.displayName),
      days
    };
  });

  return { dates, members, workdayHours: APP.WORKDAY_HOURS };
}

function calculateUserLoads_(userId, startDate, endDate) {
  const loads = {};
  const tasks = readObjects_(APP.TASKS)
    .filter(t => String(t.assigneeId) === String(userId) && String(t.status) === 'accepted');

  const taskIds = {};
  tasks.forEach(t => taskIds[String(t.id)] = true);

  const allAllocations = readObjects_(APP.ALLOCATIONS);
  const taskHasAllocation = {};
  const leaveDates = leaveDateSet_(userId, startDate, endDate);
  allAllocations.forEach(a => taskHasAllocation[String(a.taskId)] = true);

  allAllocations
    .filter(a =>
      String(a.userId) === String(userId) &&
      taskIds[String(a.taskId)] &&
      String(a.workDate) >= startDate &&
      String(a.workDate) <= endDate &&
      isWorkdayKey_(String(a.workDate)) &&
      !leaveDates[String(a.workDate)]
    )
    .forEach(a => {
      const d = String(a.workDate);
      loads[d] = (loads[d] || 0) + Number(a.hours || 0);
    });

  // Backward-compatible fallback if a task somehow has no allocation row.
  tasks.forEach(task => {
    if (taskHasAllocation[String(task.id)]) return;

    const start = taskStartDate_(task);
    const end = String(task.requestDate).slice(0,10);
    const spread = spreadHoursForUser_(userId, start, end, Number(task.plannedHours) || 8);

    Object.keys(spread).forEach(d => {
      if (d >= startDate && d <= endDate) {
        loads[d] = (loads[d] || 0) + spread[d];
      }
    });
  });

  return loads;
}

function spreadHoursForUser_(userId, startDate, endDate, hours) {
  const leaveDates = leaveDateSet_(userId, startDate, endDate);
  const dates = dateKeys_(startDate, endDate)
    .filter(d => isWorkdayKey_(d) && !leaveDates[d]);

  const plan = distributeHours_(dates, Number(hours));
  const out = {};
  plan.forEach(x => out[x.workDate] = x.hours);
  return out;
}

// ---------- Admin ----------
function adminListUsers_(p) {
  requireAdmin_(p.token);
  return { users: readObjects_(APP.USERS).map(publicUser_) };
}

function adminCreateUser_(p) {
  requireAdmin_(p.token);

  const username = clean_(p.username).toLowerCase();
  const displayName = clean_(p.displayName);
  const password = String(p.password || '');
  const role = p.role === 'admin' ? 'admin' : 'user';

  if (!username || !displayName || !password) throw new Error('帳號資料不完整');
  if (!/^[a-zA-Z0-9._-]{2,50}$/.test(username)) throw new Error('帳號只能使用英數字、點、底線或連字號');
  if (password.length < 8) throw new Error('密碼至少 8 碼');
  if (readObjects_(APP.USERS).some(u => String(u.username).toLowerCase() === username)) throw new Error('帳號已存在');

  const salt = randomToken_();
  const user = {
    id: newId_('USR'),
    username,
    displayName,
    passwordHash: hashPassword_(password, salt),
    salt,
    role,
    active: true,
    createdAt: nowIso_()
  };

  withLock_(() => appendObject_(APP.USERS, USER_HEADERS, user));
  return { id: user.id };
}

function adminUpdateUser_(p) {
  requireAdmin_(p.token);

  const targetId = clean_(p.userId);
  const displayName = clean_(p.displayName);
  if (!targetId || !displayName) throw new Error('資料不完整');

  return mutateUser_(targetId, u => {
    u.displayName = displayName;
    u.role = p.role === 'admin' ? 'admin' : 'user';

    if (u.username === APP.ADMIN_USERNAME) {
      u.active = true;
      u.role = 'admin';
    } else {
      u.active = !!p.active;
    }

    if (String(p.password || '')) {
      if (String(p.password).length < 8) throw new Error('密碼至少 8 碼');
      u.salt = randomToken_();
      u.passwordHash = hashPassword_(String(p.password), u.salt);
      deleteRowsWhere_(APP.SESSIONS, s => String(s.userId) === String(u.id));
    }
    return u;
  });
}

// ---------- Data helpers ----------
function getDb_() {
  const id = PropertiesService.getScriptProperties().getProperty(APP.DB_PROPERTY);
  if (!id) throw new Error('尚未設定資料庫。請回 Google Sheet 執行「Team Dispatch → 初始化 / 修復資料表」。');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
  } else {
    const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
    headers.forEach((h,i) => {
      if (current[i] !== h) sh.getRange(1,i+1).setValue(h);
    });
  }

  sh.setFrozenRows(1);
  return sh;
}

function readObjects_(name) {
  const sh = getDb_().getSheetByName(name);
  if (!sh) throw new Error('缺少資料表 ' + name + '，請先執行初始化 / 修復資料表');
  if (sh.getLastRow() < 2) return [];

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);

  return values.slice(1)
    .filter(r => r.some(v => v !== '' && v !== null))
    .map((r, idx) => {
      const o = { _row: idx + 2 };
      headers.forEach((h,i) => o[h] = normalizeCell_(r[i], h));
      return o;
    });
}

function normalizeCell_(v, header) {
  if (!(v instanceof Date)) return v;

  // Google Sheets often converts date-only strings into Date objects.
  // For date-only columns we must convert them back in the script timezone;
  // using toISOString().slice(0,10) can shift the date by one day in UTC+8.
  if (['requestDate','startDate','endDate','workDate'].includes(String(header))) {
    return Utilities.formatDate(
      v,
      Session.getScriptTimeZone() || 'Asia/Taipei',
      'yyyy-MM-dd'
    );
  }

  return v.toISOString();
}

function appendObject_(name, headers, obj) {
  const sh = getDb_().getSheetByName(name);
  sh.appendRow(headers.map(h => obj[h] === undefined ? '' : obj[h]));
}

function writeObjectRow_(name, headers, row, obj) {
  getDb_().getSheetByName(name)
    .getRange(row,1,1,headers.length)
    .setValues([headers.map(h => obj[h] === undefined ? '' : obj[h])]);
}

function deleteRowsWhere_(name, predicate) {
  const sh = getDb_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return;

  readObjects_(name)
    .filter(predicate)
    .map(x => x._row)
    .sort((a,b) => b - a)
    .forEach(r => sh.deleteRow(r));
}

function mutateTask_(id, fn) {
  let result;
  withLock_(() => {
    const rows = readObjects_(APP.TASKS);
    const task = rows.find(x => String(x.id) === String(id));
    if (!task) throw new Error('找不到工作');

    const updated = fn({ ...task });
    writeObjectRow_(APP.TASKS, TASK_HEADERS, task._row, updated);
    result = { ok: true };
  });
  return result;
}

function mutateUser_(id, fn) {
  let result;
  withLock_(() => {
    const rows = readObjects_(APP.USERS);
    const user = rows.find(x => String(x.id) === String(id));
    if (!user) throw new Error('找不到帳號');

    const updated = fn({ ...user });
    writeObjectRow_(APP.USERS, USER_HEADERS, user._row, updated);
    result = { ok: true };
  });
  return result;
}

function getUserById_(id) {
  return readObjects_(APP.USERS).find(u => String(u.id) === String(id));
}

// ---------- Public objects ----------
function publicUser_(u) {
  return {
    id: String(u.id),
    username: String(u.username),
    displayName: String(u.displayName),
    role: String(u.role),
    active: truthy_(u.active)
  };
}

function publicTask_(t, userMap) {
  return {
    id: String(t.id),
    requesterId: String(t.requesterId),
    assigneeId: String(t.assigneeId),
    requesterName: userMap[t.requesterId] ? String(userMap[t.requesterId].displayName) : '(未知)',
    assigneeName: userMap[t.assigneeId] ? String(userMap[t.assigneeId].displayName) : '(未知)',
    workType: String(t.workType || ''),
    content: String(t.content || ''),
    requestDate: String(t.requestDate || '').slice(0,10),
    status: String(t.status || 'pending'),
    rejectionReason: String(t.rejectionReason || ''),
    urgent: truthy_(t.urgent),
    createdAt: String(t.createdAt || ''),
    acceptedAt: String(t.acceptedAt || ''),
    completedAt: String(t.completedAt || ''),
    updatedAt: String(t.updatedAt || ''),
    plannedHours: Number(t.plannedHours) || 8,
    selfAssigned: truthy_(t.selfAssigned)
  };
}

function publicAllocation_(a) {
  return {
    id: String(a.id),
    taskId: String(a.taskId),
    userId: String(a.userId),
    workDate: String(a.workDate || '').slice(0,10),
    hours: Number(a.hours) || 0,
    createdAt: String(a.createdAt || ''),
    updatedAt: String(a.updatedAt || '')
  };
}

function publicLeave_(x) {
  return {
    id: String(x.id),
    userId: String(x.userId),
    leaveType: String(x.leaveType || ''),
    startDateTime: String(x.startDateTime || ''),
    endDateTime: String(x.endDateTime || ''),
    createdAt: String(x.createdAt || '')
  };
}

function publicTrip_(x) {
  return {
    id: String(x.id),
    userId: String(x.userId),
    purpose: String(x.purpose || ''),
    startDate: String(x.startDate || '').slice(0,10),
    endDate: String(x.endDate || '').slice(0,10),
    createdAt: String(x.createdAt || '')
  };
}

function taskSort_(a,b) {
  const order = { pending:0, accepted:1, rejected:2, completed:3 };
  return (order[a.status] ?? 9) - (order[b.status] ?? 9)
    || String(a.requestDate).localeCompare(String(b.requestDate))
    || String(b.createdAt).localeCompare(String(a.createdAt));
}

// ---------- Date / schedule helpers ----------
function leaveDateSet_(userId, startDate, endDate) {
  const out = {};

  readObjects_(APP.LEAVES)
    .filter(x => String(x.userId) === String(userId))
    .forEach(x => {
      const s = dateKey_(new Date(x.startDateTime));
      const e = dateKey_(new Date(x.endDateTime));
      const from = s > startDate ? s : startDate;
      const to = e < endDate ? e : endDate;
      if (from > to) return;

      dateKeys_(from, to)
        .filter(isWorkdayKey_)
        .forEach(d => out[d] = true);
    });

  return out;
}

function isUserOnLeaveDate_(userId, date) {
  return !!leaveDateSet_(userId, date, date)[date];
}

function roundHours_(v) {
  return Math.round(Number(v) * 100) / 100;
}

function parseLocalDateTime_(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey_(d) {
  const x = new Date(d);
  return Utilities.formatDate(
    x,
    Session.getScriptTimeZone() || 'Asia/Taipei',
    'yyyy-MM-dd'
  );
}

function isDateKey_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function isWorkdayKey_(s) {
  const d = new Date(String(s) + 'T12:00:00');
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function dateKeys_(start, end) {
  const out = [];
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');

  while (d <= e) {
    out.push(Utilities.formatDate(
      d,
      Session.getScriptTimeZone() || 'Asia/Taipei',
      'yyyy-MM-dd'
    ));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function countWorkdays_(start, end) {
  return dateKeys_(start, end).filter(isWorkdayKey_).length;
}

function rangesOverlap_(a1, a2, b1, b2) {
  return a1 <= b2 && b1 <= a2;
}

function hasWorkdayOverlap_(a1, a2, b1, b2) {
  const s = a1 > b1 ? a1 : b1;
  const e = a2 < b2 ? a2 : b2;
  return s <= e && countWorkdays_(s, e) > 0;
}

// ---------- General utility ----------
function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + '|' + String(password),
    Utilities.Charset.UTF_8
  );

  return bytes.map(b => (
    '0' + ((b < 0 ? b + 256 : b).toString(16))
  ).slice(-2)).join('');
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g,'').slice(0,20);
}

function nowIso_() {
  return new Date().toISOString();
}

function clean_(v) {
  return String(v ?? '').trim().slice(0,500);
}

function cleanMultiline_(v) {
  return String(v ?? '').trim().slice(0,10000);
}

function truthy_(v) {
  return v === true || v === 1 || String(v).toLowerCase() === 'true' || String(v) === '1';
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function normalizeOrigin_(v) {
  const s = String(v || '').trim().replace(/\/+$/,'');
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(s)) {
    throw new Error('請輸入 HTTPS Origin，不要包含路徑');
  }
  return s;
}

function jsonSafe_(v) {
  return JSON.parse(JSON.stringify(v));
}
