# Team Dispatch v2.11.3

本版是第三碼 bug fix，補齊登入中多使用者之間的畫面同步。

## 同步原則

登入後仍維持 15 秒 lightweight polling。
Task 關聯同步與 Team Attendance 同步分開判斷。

### 1. 我的工作 → 團隊出勤

下列操作會更新全體登入者的 Team sync revision：

- createSelfTask
- acceptTask
- setCompleted / reopen
- updateSelfTaskRequestDate
- updateTaskPlannedHours
- updateTaskSchedule
- stopTask
- restartTask
- addTaskCollaborators
- moveAllocation
- splitAllocation
- adminDeleteTask

若其他 User 正在「團隊出勤」：
- 清除 teamCalendarCache
- 強制重新呼叫 teamCalendar
- Loading 自動更新

若不在「團隊出勤」：
- 標記 teamDataStale
- 下次進入「團隊出勤」自動刷新

### 2. 新派工

A createTask → B：
- B 登入中時仍保留 v2.11.0 的新任務 Dialog
- B 若正在「我的工作」，先 loadAll 再彈 Dialog
- 不在我的工作則標記資料 stale；進入我的工作自動刷新

### 3. 請假 / 出差

createLeave / deleteLeave / createTrip / deleteTrip：
- 會更新 Team sync revision
- 所有登入者的團隊出勤自動 invalidation
- 出差仍只顯示，不扣 Loading 工時

### 4. B 接受任務

acceptTask 同時造成：
- 全體登入者團隊出勤 Loading revision 更新
- requester A 的 related Task 變更

A 若正在「指派任務」：
- 自動 loadAll
- 狀態由待接受更新為已接單

A 若不在指派任務：
- 標記 relatedTaskDataStale
- 下次進入指派任務自動 loadAll

### 5. 其他已納入同步

Task related：
- reject
- urgent
- completed / reopen
- visibility
- title/content
- requestDate
- plannedHours
- schedule
- stop / restart
- add collaborator
- allocation move/split
- admin task update

Team：
- user create/update/enable/disable
- holiday create/delete
- leave/trip create/delete
- 所有會影響 accepted Loading 的 Task 動作

## 公開儀表板

不自動刷新。

公開頁每 15 秒只讀 Script Properties revision。
若資料有變：
- 顯示「有新的資料更新」
- 提示使用右上角「重新整理」
- 不自動改變目前畫面

## 效能

Team / Public revision 儲存在 Apps Script Script Properties，不增加 Sheet。
輪詢沒有讀取 TaskAllocations / Leaves / Trips / Holidays 來判斷全域變更。

只有：
- related Task 真的改變 → loadAll
- Team revision 真的改變且目前正在團隊出勤 → teamCalendar

因此避免固定每 15 秒重讀完整 DB。

## 部署

Apps Script：更新 Code.gs，部署 v2.11.3。
GitHub：更新 app.js、index.html、styles.css。
config.js 不修改。
Google Sheet 無 schema 變更，不需初始化。
