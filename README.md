# Team Dispatch v2.8.5

本版為 v2.8.4 初始化修復程式 hotfix。

## 修正
初始化時的備份 Sheet 時間戳原本使用：
`Utilities.formatDate(new Date(), APP.TZ, ...)`

改為：
`Utilities.formatDate(new Date(), 'Asia/Taipei', ...)`

因此不再出現 timeZone 類型錯誤。

## 部署
1. 更新 Apps Script Code.gs
2. 儲存
3. 回 Google Sheet 再執行「Team Dispatch → 初始化 / 修復資料表」
4. 確認出現 `Tasks_backup_v284_...`
5. 確認 collaborationGroupId / 週期欄位恢復
6. 再部署 Web App v2.8.5

GitHub 功能不需更新；index.html 僅版本文字可同步。
