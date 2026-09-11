# Team Dispatch v2.5.8

本版為既有功能修正，因此依規則只更新第三碼。

## 已中止任務可重新啟動

「我的工作 → 點擊已中止任務」新增：

`重新啟動任務`

### 情境 1：需求日尚未過期

直接重新啟動。

沿用：
- 原需求日
- 原預估總工時

重新啟動後：
- 狀態改回 accepted / 進行中
- cancelledAt 清空
- acceptedAt 更新為重新啟動時間
- completedAt 清空
- 從今天開始重新建立 TaskAllocations

舊中止時保留的 Allocation 會先刪除，再依目前條件重建。

### 情境 2：需求日已經過期

按「重新啟動任務」時要求輸入：

1. 新需求日
2. 新預估總工時

新需求日：
- 不可早於今天

預估總工時：
- 必須 > 0
- 最大 999h

確認後才重新啟動。

### 共同作業

如果是共同作業：
- 所有 participant 仍共用同一 Task
- 每位 participant 都重新建立自己的完整 TaskAllocations
- 每位 participant 都各自負荷完整預估總工時

如果其中一位在新需求日前完全沒有可排程工作日：
- 整筆重新啟動失敗
- 不會只成功一部分

### Admin

Admin 也可重新啟動其他 User 的已中止任務。

## 升級

沒有新增 Google Sheet 欄位。

Apps Script：
- 更新 Code.gs
- 部署既有 Web App 新版本 v2.5.8

GitHub：
- 更新 app.js
- 更新 styles.css

index.html / config.js 不需修改。
Google Sheet 不需初始化。
