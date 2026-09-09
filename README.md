# Team Dispatch v2.0.0

## 任務內容可修改
在「我的工作」點進任務詳細內容後，可直接修改：
- 工作類型
- 需求內容

工作類型仍支援既有名稱 datalist。
修改不影響 Loading、TaskAllocations、Due Date 或總工時。

## 任務中止
任務詳細內容新增「中止任務」。

可中止：
- pending
- accepted

不可中止：
- completed
- rejected
- cancelled

中止後：
- status = cancelled
- 不再計入 Loading
- 不再出現在工作日曆
- 不再出現在免登入儀表板
- 不能再拖拉 / 合併 / 分拆
- TaskAllocations 保留作歷史紀錄

負責人或建立者都可修改內容或中止任務。

## CRUD Loading
新增：
- 正在更新任務內容…
- 正在中止任務…

## 從 v1.9.0 升級
Google Sheet 不需初始化。

Apps Script：
- 更新 Code.gs
- 部署新版本 v2.0.0

GitHub：
- 更新 app.js
- 更新 styles.css

index.html 與 config.js 不需更新。
