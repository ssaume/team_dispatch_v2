# Team Dispatch v2.11.5

## 1. F5 不再強制回登入畫面

Token 仍使用 `sessionStorage`，維持 tab-scoped 安全模型。

v2.11.5 啟動：
1. ping backend
2. 如果本分頁已有 sessionStorage token
3. 呼叫 `me`
4. Session 有效 → 自動恢復登入後畫面、loadAll、啟動同步 watcher
5. Session 無效 / 過期 → 才回登入

因此同一個 browser tab 按 F5 不需要重新登入。

## 2. 修改需求日 / 總工時 Timeout 優化

這兩種操作是目前最重的排程重建操作。

v2.11.5：
- updateSelfTaskRequestDate / updateTaskPlannedHours / updateTaskSchedule timeout 最低提高至 90 秒
- Allocation 刪除由逐列 deleteRow 改成連續列批次 deleteRows
- appendAllocationPlan 改成一次 setValues 批次新增
- 修改需求日 / 總工時時，Leaves 只讀一次，不再為每一天反覆 readObjects
- 寫入完成後的畫面 refresh 延續 silent refresh

這會明顯降低 Spreadsheet service call 數量。

## 3. 每個人可修改自己的密碼

Sidebar 增加「修改密碼」。

需要：
- 目前密碼
- 新密碼
- 確認新密碼

規則：
- 新密碼至少 8 碼
- 必須驗證目前密碼
- 新密碼兩次輸入必須相同
- 新密碼不可與目前密碼相同

更新成功後：
- 目前分頁 Session 保留
- 該 User 其他裝置 / 分頁的 Session 失效

Admin 原有重設其他 User 密碼功能不變。

## 4. 我的工作列表篩選

清單模式預設：
`已接單未完工`

上方四個統計卡可以直接點擊：
- 待接受
- 已接單
- 已完成
- 已逾期

點擊後自動切回清單模式並只顯示該類工作。

已逾期 = pending / accepted 且需求日早於今天。
completed / rejected / cancelled 不計入逾期。

## 多人登入 Queue 評估

### GitHub Pages
GitHub Pages 只提供靜態 HTML / JS / CSS，本身不會把 Team Dispatch 的資料操作排隊。
真正的資料 request 都送往 Google Apps Script。

### Browser 同一分頁
v2.10+ 已有 writeRpcQueue：
- 同一分頁的 write action 會依序送出
- Write 1 完成後才送 Write 2
- 避免同一個 User 快速點擊造成同分頁併發寫入

### 不同電腦 / 不同分頁
各 Browser 有自己的 write queue，因此：
- A 電腦與 B 電腦可以同時發 request
- 到 GAS 後，含 `withLock_()` 的寫入區段會競爭 ScriptLock
- lock wait 最長 30 秒
- 前一個寫入較久時，後一個 request 會等待 lock

### 容易排隊的情境
1. 多人同時接受任務
2. 多人同時修改排程 / 工時 / 需求日
3. 大量共同作業同步重建 Allocation
4. 新增請假後需要重平衡 Allocation
5. Admin 新增國定假日並重平衡多人排程
6. Admin / User 同時修改同一 Task
7. polling 剛好與大量 write 同時發生
8. Apps Script cold start / Google 平台本身 execution queue

### 不會被 ScriptLock 長時間卡住的典型讀取
- ping
- publicSyncState
- teamSyncState
- 一般純 read API

但讀取仍可能受 GAS execution concurrency、Spreadsheet service 延遲影響。

## 部署
Apps Script：
- 更新 Code.gs
- Deploy v2.11.5

GitHub：
- 更新 app.js
- index.html
- styles.css

config.js 不修改。

Google Sheet：
- 無 schema 變更
- 不需初始化
