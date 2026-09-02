# Team Dispatch v1.3

## 新增功能

- 派工給自己：在「我的工作」使用「新增自己的工作」，建立後直接為已接單，不經審核。
- 所有新工作新增「預估工時（小時）」欄位，作為 Loading 計算基礎。
- 請假設定：假別、開始與結束時間，精確到分鐘，只計週一至週五。
- 出差設定：目的、開始與結束日期，以天為顆粒度，只計週一至週五。
- 團隊出勤：14 天甘特式檢視，顯示每人每日 Loading、請假、出差。
- 請別人協助：選擇成員與 Due Date 後，自動檢查 Loading > 80%、請假、出差並提示；送出前再次確認。

## Loading 規則（v1.3 MVP）

- 標準產能：8 小時／工作日。
- 工作日：週一至週五；目前尚未納入國定假日 / 公司行事曆。
- 已接單且未完成的工作納入 Loading。
- 預估工時平均分配到「接單日 → 需求日」之間的工作日。
- 派工前的模擬，則把新工作的預估工時平均分配到「今天 → 需求日」。
- 每日 Loading = 當日分配工時 ÷ 8 小時。
- 超過 80% 才觸發高 Loading 警示。
- 舊版既有工作沒有預估工時時，暫以總計 8 小時計算。
- 請假與出差目前作為獨立衝突提示，不直接改寫 Loading 百分比。

## 從 v1.2 升級（重要）

1. Apps Script 將 `Code.gs` 全部替換為 v1.3 的 `apps-script/Code.gs`。
2. `Response.html` 保留 v1.2 目前版本，不必修改。
3. 回到 Google Sheet，重新整理頁面。
4. 執行：`Team Dispatch → 初始化 / 修復資料表`。
   - 這一步會新增 `Leaves`、`Trips` 工作表。
   - 也會在既有 `Tasks` 表最後加入 `plannedHours`、`selfAssigned` 欄位。
   - 不會刪除既有 Users / Tasks 資料。
5. Apps Script：`部署 → 管理部署作業 → 編輯 → 新版本 → 部署`。
6. GitHub 更新根目錄：`index.html`、`app.js`、`styles.css`。
7. **保留你目前 GitHub 上已設定正確 `/exec` URL 的 `config.js`，不要用 ZIP 裡的 placeholder 覆蓋。**
8. Commit 到 `main`，等待 GitHub Pages 部署完成。
9. 瀏覽器 `Ctrl + F5` 強制重新整理。

## Google Sheet 新增資料表

### Leaves
`id, userId, leaveType, startDateTime, endDateTime, createdAt`

### Trips
`id, userId, purpose, startDate, endDate, createdAt`

### Tasks 新增欄位
`plannedHours, selfAssigned`

## 注意

此版本將「工作日」定義為週一至週五。若後續要精準對應台灣國定假日、補班日、公司行事曆或每人不同工時，可再新增 Calendar / Capacity 設定表。
