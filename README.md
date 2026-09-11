# Team Dispatch v2.7.0

本版新增 Admin「永久刪除任務」功能，因此依版本規則更新第二碼。

## Admin 永久刪除任務

Admin 可從兩個地方刪除任務：

1. 系統管理 → 人員工作管理 → 刪除
2. 團隊出勤 → 點擊 User → 點擊任務 → 永久刪除

刪除後會永久移除：
- 該筆 Tasks 資料
- 該 Task 對應的所有 TaskAllocations

因此：
- 不再出現在我的工作
- 不再出現在工作日曆
- 不再計算 Loading
- 不再出現在任務儀表板
- 不會保留「已中止」歷史
- 無法復原

## 共同作業

共同作業現在是每位人員一筆獨立 Task。

Admin 刪除 A 的任務：
- 只刪 A
- B / C 不會被刪除

工作標題 / 工作內容的同步群組仍保留給其餘共同作業者。

## 週期工作

週期工作每一期都是獨立 Task。

Admin 刪除第 2 期：
- 只刪第 2 期
- 第 1 / 3 / 4 期仍保留

不會自動刪除整個 periodicSeries。

## 安全提示

刪除前會明確提示：
- 這是永久刪除
- TaskAllocations 會一起刪除
- 無法復原

共同作業與週期工作會另外提示影響範圍。

## 升級

沒有新增 Google Sheet 欄位。

Apps Script：
- 更新 Code.gs
- 部署既有 Web App 新版本 v2.7.0

GitHub：
- 更新 index.html（版本文字）
- 更新 app.js
- 更新 styles.css

config.js 保留。
Google Sheet 不需要初始化 / 修復資料表。
