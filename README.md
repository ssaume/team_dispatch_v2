# Team Dispatch v2.3.0

## 共同作業

「新增自己的工作」可以勾選：
`此任務為共同作業`

並選擇一位以上共同作業人員。

共同作業不是拆分總工時。

例如：
- 任務預估總工時 5h
- Evon + A + B 三人共同作業

每人都是：
- Evon = 5h
- A = 5h
- B = 5h

因此系統總 Loading 會增加 15h。

### 排程獨立
同一 Task 的 TaskAllocations 以：
`taskId + userId`
分開管理。

例如預設五天各 1h：
- A 可拖成 2h / 2h / 1h
- B 仍維持 1h / 1h / 1h / 1h / 1h
- Evon 也可有自己的分配

互不影響。

### 逾期
共同作業人員各自遵守逾期規則。

若 5h 任務逾期：
- 每一位共同作業人員自己的 TaskAllocations
- 都會各自收斂成「今天 5h」

不會把所有人的工時合併成一筆。

### 我的工作
所有共同作業人員都能在「我的工作」看到該任務。
工作清單顯示：
`共同作業`

日曆也會有「共同」標籤。

### 任務儀表板
公開任務的負責人會一次顯示：
`Evon、A、B`

### 當週任務中止
同一任務名稱 + 相同需求日的中止任務會合併顯示。
負責人會去重後一起顯示。

不同需求日仍不合併，延續先前規則。

## 資料更新 UI
凡需要重新向 Apps Script / Google Sheet 讀取資料的操作，
全頁過場標題統一顯示：
`資料更新中`

派工可用性檢查仍採表單內：
`正在檢查行事曆…`
避免每次輸入都被全頁遮罩。

## 效率優化
本版重點優化 Team Calendar：

舊版：
每一位使用者都會重新讀一次 Tasks / TaskAllocations。

新版：
整個團隊檢視只讀一次：
- Users
- Leaves
- Trips
- Holidays
- Tasks
- TaskAllocations

之後在記憶體中依人員計算 Loading。

因此人數與任務數增加時，Google Sheet I/O 次數不再跟人數線性重複。

另外共同作業的 Loading / Allocation 查找改成：
`taskId + userId`
避免同一 Task 的不同人員排程互相覆蓋。

## 資料表變更
Tasks 新增欄位：
`collaboratorIds`

內容以 JSON 字串保存，例如：
`["USR_xxx","USR_yyy"]`

既有任務空白代表沒有共同作業人員。

## 從 v2.2.1 升級
這次必須執行一次：
`Team Dispatch → 初始化 / 修復資料表`

部署順序：
1. Apps Script 更新 Code.gs
2. 儲存
3. 回 Google Sheet 執行「初始化 / 修復資料表」
4. 部署既有 Web App 的新版本 v2.3.0
5. GitHub 更新 index.html / app.js / styles.css
6. config.js 保留
7. GitHub Pages 完成後 Ctrl + F5
