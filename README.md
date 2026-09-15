# Team Dispatch v2.11.1

本版補強 v2.11.0 的登入中同步機制。

## 問題

v2.11.0 只會通知「新建立並指派給自己的 Task」。

如果相關 User 已登入，但另一位 User 對既有 Task 做：
- 接受 / 拒絕
- 完成 / 重啟
- 中止
- 修改需求日
- 修改總工時
- 修改日排程
- 修改內容
- 加入共同作業
- 共同作業其他成員狀態變更

其他關聯 User 的「我的工作」不一定會自動更新。

## v2.11.1

`pollAssignedTasks` 擴充為「關聯任務變更輪詢」。

關聯範圍：
- user 是 requester
- user 是 assignee
- user 目前存在於同一 collaborationGroupId

每 15 秒檢查：
`updatedAt > 上次 server cursor`

### 如果 User 正在「我的工作」

偵測到任何關聯 Task 更新：
1. 立即執行 `loadAll()`
2. 重新整理我的工作
3. 狀態 / 日期 / 工時 / 排程同步

### 如果 User 在其他頁面

不立即 loadAll，避免打斷正在輸入的：
- 指派任務
- 請假 / 出差
- 管理畫面

而是標記 `relatedTaskDataStale = true`。

下次切到「我的工作」：
- 自動執行 `loadAll()`
- 不需要手動重新整理

### 新派工通知

仍維持 v2.11.0：
- 新 Task 指派給自己才彈通知 Dialog
- 一般狀態變更只同步資料，不一直跳通知

## 效能

仍然使用 lightweight polling：
- 15 秒一次
- 只讀 Users + Tasks
- 不讀 Allocations / Leaves / Trips / Holidays
- background tab 不 polling
- 只有偵測到真正 related task change 時才執行 loadAll

因此不會每 15 秒重抓整個 DB。

## 部署

Apps Script：
- 更新 Code.gs
- 部署 v2.11.1

GitHub：
- 更新 app.js
- 更新 index.html（版本文字）
- styles.css 無功能變更，可沿用，但完整包已同步

config.js 不修改。

Google Sheet：
- 無 schema 變更
- 不需初始化
