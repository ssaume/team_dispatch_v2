# Team Dispatch v2.8.3

本版修正任務儀表板共同作業負責人仍只顯示一人的問題。

## 根本原因

v2.8.1 雖然會依 collaborationGroupId 合併共同作業，
但「本週執行中」與「未來 15 天」在合併前會先過濾 Task：

- 本週執行中：該人的 Task 必須有本週工時
- 未來 15 天：該人的 Task 需求日必須落在區間內

因此如果同一共同作業有 A / B / C，
但只有 A 的 Task 通過該區段條件，
真正進入 merge 的資料就只剩 A，
最後仍只能顯示 A。

## v2.8.3 修正

在任何儀表板區段篩選以前，
先從完整 Tasks 資料建立：

`collaborationGroupId → 所有目前負責人`

因此只要 Task 仍屬於這個共同作業群組，
其負責人就能被列出，不依賴他個人的 Task 是否剛好通過本週 / 15 天條件。

例如：

共同作業 COL-001

A：本週有排程
B：本週沒有排程
C：需求日在下週

只要 A / B / C 的 Task 仍是有效共同作業 Task，
儀表板負責人仍顯示：

`A、B、C`

### 不列入目前負責人的狀態

- rejected
- cancelled

因為這兩種狀態已不再是該工作的目前負責人。

completed 仍保留在共同作業負責人名單中，
因為該人仍是該共同工作的完成者 / 所有人。

## 升級

沒有 Sheet schema 變更。

Apps Script：
- 更新 Code.gs
- 部署 v2.8.3

GitHub：
- index.html 只有版本文字更新，可同步

app.js / styles.css / config.js 不需修改。
Google Sheet 不需初始化。
