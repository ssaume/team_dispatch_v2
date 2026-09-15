# Team Dispatch v2.11.0

## 新任務登入中通知

當 A 透過「指派任務」建立 B 的新任務，而 B 當下已登入 Team Dispatch：

- B 每 15 秒執行一次輕量 `pollAssignedTasks`
- 只查 B 自己在上次 server cursor 之後新建立的 Task
- 不重載整個 DB
- 偵測到新任務後以 Dialog 顯示
- 內容包含任務、派工者、需求日、預估工時、狀態
- 同一輪偵測到多筆任務時合併成一個通知視窗

第一次 poll 只建立 server cursor，因此不會把登入前的歷史 pending 任務全部彈出。

## 我的工作強制刷新

如果 B 收到新任務時剛好正在「我的工作」：
1. 先執行 `loadAll()`
2. 強制更新工作資料
3. 再顯示通知視窗

因此畫面上的任務清單會先更新，再通知使用者。

## 效能與 Queue

`pollAssignedTasks` 是 lightweight read：
- 不顯示全頁 loading
- 不加入 write queue
- 瀏覽器分頁在背景時不 polling
- 暫時性 Apps Script / 網路錯誤只記錄 console，不打斷使用者
- 下一輪會自動繼續

Polling interval：15 秒。

## 部署

Apps Script：更新 Code.gs 並部署 v2.11.0。
GitHub：更新 index.html、app.js、styles.css。
config.js 不修改。
Google Sheet 無 schema 變更，不需初始化。
