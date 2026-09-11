# Team Dispatch v2.2.0

- Admin 新增「人員工作管理」：可看所有人員工作（含私人任務），依人員/狀態篩選，並修改工作類型與需求內容。
- 公開任務儀表板新增「當週任務中止」：只顯示公開任務，列出任務、負責人、原需求日、中止日。
- 自己工作新增「週期工作」：指定週期開始日，需求日作為週期結束；總工時平均分配到期間內有效工作天，排除週末、國定假日與請假。

本版新增 Tasks 欄位：
- cancelledAt
- isPeriodic
- periodStartDate

升級時必須更新 Code.gs 後執行一次：
Team Dispatch → 初始化 / 修復資料表

再部署 Apps Script v2.2.0。

GitHub 更新：
- index.html
- app.js
- styles.css

config.js 保留。
