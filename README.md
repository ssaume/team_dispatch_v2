# Team Dispatch v2.8.6

本版依目前 Team Dispatch DB 實際資料檢查結果，修正共同作業 Allocation 殘留與請假容量問題，並新增 DB audit 工具。

## 修復前自動備份

初始化會先檢查是否存在：
- 舊共同作業 foreign-user Allocation
- partial leave capacity violation

只要其中一項存在，就會先建立：

`TaskAllocations_backup_v286_yyyyMMdd_HHmmss`

完成備份後才會進行刪除／重排。

## 1. 清理舊共同作業 Allocation

v2.6+ 的共同作業模型是：
- 每位負責人一筆獨立 Task
- 每筆 Task 只保留自己的 assignee Allocation

因此若：
- Task 有 collaborationGroupId
- 但 Allocation.userId != Task.assigneeId

代表是舊模型殘留。

v2.8.6 初始化時會自動刪除這種 Allocation。

目前附件 DB 檢查到的已知問題就是這一類：
- 27 筆舊共同作業 Allocation
- 合計約 64h 額外 Loading

## 2. 修正 legacy migration

舊共同作業轉成 per-user Task 時：
- collaborator Allocation 會移到 clone Task
- 原 Task 只保留原 assignee 的 Allocation
- conversion 後再防禦性清理外來 user allocation

避免之後 migration 再留下重複 Loading。

## 3. 修正部分請假容量 violation

初始化時會掃描 accepted Task。

若某工作日在 partial leave 後：
- Task 工時 > 當日 available hours

會把超出的工時往後搬。

規則維持既有 v2.5.2：
- partial leave 日：該 Task 不可超過 available hours
- 無請假日：Loading 僅顯示用途，單一 Task 可承接超過 8h
- overflow 可往需求日之後移動
- completed Task 不重排

## 4. 新增 auditTeamDispatchData()

可在 Apps Script 手動執行：

`auditTeamDispatchData()`

會回傳 / Logger 輸出：

- duplicate Task ID
- duplicate Allocation ID
- orphan Allocation
- collaboration foreign-user Allocation
- 同 Task/User/Date 重複 Allocation
- plannedHours 與 scheduledHours 不一致
- leave capacity violation
- collaborationGroup 結構異常

建議每次 major migration 後執行一次。

## 部署

1. 更新 Apps Script Code.gs
2. 儲存
3. 回 Google Sheet
4. 執行「Team Dispatch → 初始化 / 修復資料表」
5. 再手動執行 `auditTeamDispatchData()`
6. 確認 Logger 中各 issue array 為空或為預期
7. 部署 Web App v2.8.6

GitHub：
- index.html 僅版本文字更新，可同步
- app.js / styles.css / config.js 不需修改

Google Sheet：
- 不新增欄位
- 但本版初始化會清理歷史錯誤 Allocation 並重排部分請假超額工時
