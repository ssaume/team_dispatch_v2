
# Team Dispatch v1.4.0

## 本版重點

### 1. 我的工作日曆改為「實際日排程」

過去 `plannedHours` 只是在接單日到需求日之間平均計算。
v1.4.0 新增 Google Sheet：

`TaskAllocations`

每一列代表某個任務在某一天實際排了多少小時：

```text
id
taskId
userId
workDate
hours
createdAt
updatedAt
```

因此拖拉、合併、分拆後的結果都會真正保存。

### 2. 拖拉

只有狀態為「已接單」的工作可以拖拉。

- 拖到沒有相同任務的工作日：直接搬移。
- 拖到已有相同任務的工作日：系統詢問是否合併。
  - 確定：合併成一個區塊，例如 0.5h + 0.5h = 1h。
  - 取消：仍然移動，但保留兩個獨立區塊。
- 週六、週日不能放。
- 有請假的日期不能放。
- 不能拖到接單日以前或需求日以後。
- 已完成工作只保留歷史排程，不可拖拉。

### 3. 比例分拆

點日曆任務，進入任務內容後，可在「日曆排程」看到每一個日排程區塊。

按「比例分拆」後：

- 輸入要移到其他日期的比例，例如 50%。
- 指定目標日期。
- 系統顯示原日期保留工時與移出工時。
- 如果目標日期已有同一任務，也會詢問是否合併。

例如：

```text
9/3   1.0h
```

設定：

```text
移出 50%
目標日 9/4
```

結果：

```text
9/3   0.5h
9/4   0.5h
```

### 4. Loading

團隊 Loading 不再重新平均計算已接單工作，而是直接加總 `TaskAllocations`。

因此你在自己的日曆拖拉後：

```text
個人工作日曆
↓
TaskAllocations
↓
團隊 Loading 甘特圖
```

會同步變化。

### 5. 請假

新增請假時，如果請假日已有進行中的工作排程：

- 該日排程會自動移除。
- 工時平均重新分配到該任務期間其他沒有請假的工作日。
- 如果整個任務期間已經沒有任何可用工作日，請假建立會被阻止並提示先調整任務。

### 6. Outlook

本版不包含 Outlook / ICS / Microsoft Graph 匯入功能。

---

# 從 v1.3.2 升級到 v1.4.0

## A. Google Apps Script

1. 打開 `Team Dispatch DB`
2. `擴充功能 → Apps Script`
3. 將現有 `Code.gs` 全部替換為 v1.4.0 的：
   `apps-script/Code.gs`
4. 儲存

`Response.html` 不需要修改。

## B. 回 Google Sheet 初始化

回 `Team Dispatch DB`，重新整理後執行：

`Team Dispatch → 初始化 / 修復資料表`

系統會新增：

`TaskAllocations`

並替既有的已接單 / 已完成工作建立初始日排程。

**Users、Tasks、Leaves、Trips 等既有資料不會刪除。**

## C. 重新部署 Apps Script

`部署 → 管理部署作業 → 編輯 → 新版本`

說明可填：

`Team Dispatch v1.4.0`

再按部署。

原本 `/exec` URL 通常不變。

## D. GitHub

更新：

- `index.html`
- `app.js`
- `styles.css`

保留你目前已設定好的：

- `config.js`

Commit 到 `main`。

GitHub Pages 部署完成後：

`Ctrl + F5`

---

# 初次驗證建議

建立一個 1 小時、跨兩個工作日的自己的工作。

應該會先看到：

```text
9/2  0.5h
9/3  0.5h
```

把 9/2 的 0.5h 拖到 9/3：

- 選擇合併 → 9/3 變成 1.0h。
- 點進任務 → 日曆排程 → 9/3 1.0h → 比例分拆。
- 設 50%，目標 9/2 → 再回到 0.5h / 0.5h。

這可以完整驗證拖拉、合併、分拆、Google Sheet 保存與 Loading 同步。
