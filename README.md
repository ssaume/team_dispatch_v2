# Team Dispatch v1.5.0

## 1. Admin 國定假日設定

「帳號管理」已擴充成「系統管理」，新增：

- 國定假日日期
- 國定假日名稱
- 刪除國定假日

資料保存於新的 Google Sheet：

`Holidays`

欄位：

```text
id
holidayDate
holidayName
createdAt
```

國定假日套用到所有使用者：

- 我的工作日曆顯示「國休｜假日名稱」
- 團隊出勤甘特圖顯示國定假日
- 國定假日 Loading = 0
- 任務不會在國定假日建立初始排程
- 任務不可拖到國定假日
- 任務不可分拆到國定假日
- 派工 Loading 試算會自動排除國定假日
- 派工提示會列出需求期間內的國定假日
- 請假 / 出差的「工作日」計算也會排除國定假日

### 新增國定假日時已有任務怎麼辦

若該日期已有進行中的 TaskAllocations：

1. 該日 Task Allocation 移除
2. 工時重新平均到同一任務區間內其他可工作日期
3. 同時排除：
   - 週末
   - 其他國定假日
   - 該使用者請假日
4. 如果某個受影響任務已經完全沒有其他可工作日期，系統會拒絕新增該國定假日，避免工時遺失

刪除國定假日時，不會自動把任務搬回原日期；該日期只會重新變成可排程工作日。

---

## 2. Commit Loading 遮罩

所有會寫入 Google Sheet 的操作現在都有全頁 Loading：

- 新增自己的工作
- 派工
- 接受 / 拒絕
- 緊急狀態
- 完成 / 改回未完成
- 日曆拖拉
- 任務合併
- 比例分拆
- 新增 / 刪除請假
- 新增 / 刪除出差
- 新增 / 修改帳號
- 新增 / 刪除國定假日

例如拖拉時會顯示：

`正在移動並重新計算排程…`

新增國定假日時：

`正在新增國定假日並重新計算所有受影響排程…`

遮罩期間不能再點其他操作，Google Apps Script 回覆後自動消失。

---

# 從 v1.4.1 升級

## A. 建議先備份

Google Sheet：

`檔案 → 建立副本`

## B. 更新 Apps Script

1. `Team Dispatch DB → 擴充功能 → Apps Script`
2. 將 `Code.gs` 全部替換成 v1.5.0
3. 儲存

## C. 執行初始化 / 修復資料表

這次 **必須執行一次**：

`Team Dispatch → 初始化 / 修復資料表`

會新增：

`Holidays`

既有：

- Users
- Tasks
- TaskAllocations
- Sessions
- Leaves
- Trips

都會保留。

## D. 重新部署 Apps Script

`部署 → 管理部署作業 → 編輯 → 新版本 → 部署`

說明可填：

`Team Dispatch v1.5.0`

## E. 更新 GitHub

更新：

- `index.html`
- `app.js`
- `styles.css`

保留目前的：

- `config.js`

Commit 到 `main`。

等 GitHub Pages 完成後：

`Ctrl + F5`

---

# 建議測試

1. Admin 建立明天為「測試國定假日」
2. 我的工作日曆該日應顯示國休，沒有 Task
3. 團隊出勤該日所有人都顯示國休，沒有 Loading %
4. 嘗試把 Task 拖到該日，應被後端拒絕
5. 刪除測試國定假日
6. 建立 / 修改一筆工作，確認前端會出現「資料處理中」
