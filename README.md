# Team Dispatch v2.8.0

本版包含新增功能與既有流程調整，因此更新第二碼。

## 1. 我的工作日曆拖拉取消

當目標日期已有相同任務時，拖拉後會詢問是否合併。

v2.8.0：
- 確定 → 合併並移動
- 取消 → 完全不做任何變更

不再出現「取消但仍把資料寫到目標日期」的行為。

## 2. Admin 日曆排程改成與 User 相同

Admin 點擊團隊出勤中的 User 工作後，日曆排程改為：
- 每個工作日直接輸入工時
- 可移除工作日
- 透過下拉選單新增工作日
- 新增工作日不可超過需求日
- 合計必須等於預估總工時
- 部分請假顯示可用工時
- 整天請假不可新增

後端仍使用同一個 `updateTaskSchedule`，Admin 只多傳 `targetUserId`。

## 3. 中止任務理由

Tasks 新增：
`cancelledReason`

User / Admin 中止任務時，不再直接 confirm，而是開啟輸入視窗：
- 中止理由必填
- 儲存到 Tasks.cancelledReason

重新啟動任務時會清除舊中止理由。

## 4. 既有任務新增共同作業

「我的工作 → 點擊進行中任務」可直接新增共同作業者。

規則：
- 只有目前負責人可新增
- 只限 accepted 任務
- 可一次選多人
- 新成員各自建立一筆獨立 Task
- 與原 Task 共用 collaborationGroupId
- 標題 / 工作內容仍同步
- 狀態 / 需求日 / 工時 / Loading / 排程 / 中止 / 完成仍各自獨立

### Loading
新共同作業者不是分攤原本工時。

例如：
原任務預估 8h
新增 B / C

結果：
A = 8h
B = 8h
C = 8h

每個人的 8h 都依該人的工作日、請假狀況分配到 TaskAllocations，
並完整計入該人的 Loading。

其他任務已有多少 Loading 不會阻止新增共同作業；
Loading 仍只作顯示。

## 5. 選單名稱

「請別人協助」改為：
「指派任務」

頁面標題也同步修改。

## 6. 登入頁 Enter

登入表單現在支援：
- 點「登入」
- 在帳號 / 密碼輸入後直接按 Enter

兩者執行完全相同的登入流程。

## 7. Admin 人員工作管理

「系統管理 → 人員工作管理」改成可展開 / 收合。

預設收合，點標題即可展開。

## 8. 任務儀表板未來 15 天

「未來 15 天任務」中的任務新增：
`15 天內到期`

視覺標示，讓 User 可快速辨識近期到期工作。

## Schema

Tasks 新增：
`cancelledReason`

因此部署後需要執行一次：
`Team Dispatch → 初始化 / 修復資料表`

## 部署

Apps Script：
1. 更新 Code.gs
2. 儲存
3. 回 Google Sheet 執行「初始化 / 修復資料表」
4. 管理部署作業 → 編輯既有 Web App
5. 部署 v2.8.0

GitHub：
- 更新 index.html
- 更新 app.js
- 更新 styles.css
- config.js 保留
