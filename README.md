# Team Dispatch v2.10.0

## 衝突檢查
Task 修改送出時會攜帶前端看到的 `updatedAt`。
後端寫入前比對目前 DB 的 `updatedAt`；不一致時回傳 CONFLICT，要求重新整理。
排程修改、移動、分拆後也會更新 Task.updatedAt，因此另一台電腦的舊畫面會被擋下。

同一瀏覽器分頁的 write RPC 會序列化送出，避免使用者連續操作造成 Apps Script 併發排隊。

## 共同作業同步
有 collaborationGroupId 時：
- 需求日、預估總工時由共同作業建立者（或 admin）修改
- 會同步到所有仍有效的共同作業 Task
- 每個人保留自己的 Allocation 比例
- 個別日曆比例調整只影響自己的 Task

## 已發生工時凍結
以「今天」為切點：
- workDate < today 視為已發生
- 修改需求日 / 總工時時不重寫歷史 Allocation
- 新總工時先扣除各人的已發生工時
- 剩餘工時依該人目前未來 Allocation 比例重新配比
- 若新總工時小於某人的已發生工時，拒絕修改
- 手動日曆排程也不能修改或移除歷史工時
- move / split 不能操作歷史 Allocation

## 公開儀表板
新增「近期出差人員」：
- 位置在休假計畫上方
- 顯示今天起未來 30 天內有重疊的出差
- 排除 admin

「當日休假人員」改為「休假計畫」：
- 當日
- 未來一個月
兩個頁簽。

## Queue / timeout UX
- 同分頁 write request 排隊送出
- 8 秒後 loading 文字改為「正在排隊處理」
- write timeout 最少 45 秒
- read timeout 最少 30 秒
- 避免 20 秒直接 timeout 後使用者重複按送出

## 部署
Apps Script：更新 Code.gs 並部署 v2.10.0。
GitHub：更新 index.html / app.js / styles.css。
config.js 不改。
Google Sheet 無 schema 變更，不需初始化。
