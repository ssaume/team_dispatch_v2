# Team Dispatch v2.4.0

## 1. 請別人協助：多重派工

新增派工的「被派工者」可一次選擇多人。

多重派工不是共同作業。

例如：
- 工作：UAT
- 預估工時：5h
- 被派工者：A、B、C

系統建立三筆彼此獨立的 Task：
- A / UAT / 5h / pending
- B / UAT / 5h / pending
- C / UAT / 5h / pending

因此：
- A 可以接受，B 可以拒絕
- 每個人都各自負荷 5h
- 每個人的 Loading、請假、同日接單、逾期規則都與單一派工完全相同
- 不會因 A 接單而一起改變 B / C 的狀態

送出前會逐一檢查每一位人員：
- Loading
- 請假
- 國定假日
- 出差
- 整天請假是否禁止派工

如果任一被派工者今天整天請假，整批派工不送出，避免只成功一半。

## 2. Admin：從團隊出勤直接管理 User 工作

Admin 登入後，在：
`團隊出勤`

人員名稱改成可點擊。

點擊後開啟該 User 的兩週工作日曆。

Admin 可以直接替該 User：
- 跨週拖拉 Loading
- 移動日期
- 比例分拆
- 修改工作類型
- 修改需求內容
- 修改預估總工時
- 自派工作可修改需求日期
- 修改公開 / 私人
- 標示 / 取消緊急
- 完成 / 改回未完成
- 中止任務

所有 Allocation 仍然維持在該 User 名下，不會移到 Admin 身上。

共同作業時：
Admin 點 A，只會拖拉 A 自己的 TaskAllocations；
B / C 的排程不受影響。

## Admin 權限修正

v2.4.0 同時重新整理後端權限：

以下既有 API 在 role=admin 時允許管理其他 User 的任務：
- updateTaskDetails
- updateTaskPlannedHours
- updateSelfTaskRequestDate
- setTaskVisibility
- setUrgent
- setCompleted
- stopTask
- moveAllocation
- splitAllocation

move / split 仍使用 Allocation 本身的 userId 驗證：
- 請假
- 國定假日
- 可排程期間

所以 Admin 不會套用自己的請假狀態到被管理者身上。

## 新增讀取 API

新增：
`adminUserWork`

只允許 Admin。

一次讀取該 User：
- Tasks
- TaskAllocations
- Leaves
- Trips
- Holidays

並在開啟時套用：
- Allocation 補齊
- 逾期 Loading 收斂

畫面會走既有「資料更新中」UI。

## 升級

沒有新增 Google Sheet 欄位，因此：
- 不需要初始化 / 修復資料表

Apps Script：
1. 更新 Code.gs
2. 儲存
3. 部署既有 Web App 新版本 v2.4.0

GitHub：
- 更新 index.html
- 更新 app.js
- 更新 styles.css

config.js 保留。
