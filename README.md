# Team Dispatch v2.11.4 — revised before deployment

此包取代先前未部署的 v2.11.4，版本號維持不變。

## 1. Admin 區塊同步

Admin 的 related-task polling 現在視所有 Task 為關聯資料。

其他 User 更新 Task 時：
- Admin 正開著「系統管理 → 人員工作管理」：自動重抓 task list
- Admin 正開著「人員工作日曆」Dialog：自動重抓該 User 工作 / Allocation / Leave / Trip
- Admin 不在相關畫面：標記 stale，下次進入系統管理時更新

避免重建 Admin 表單造成正在輸入的帳號資料被清空，所以一般 Task 變更只更新 task list / user-work dialog。

## 2. 公開儀表板改為 30 秒提示檢查

Apps Script 後端仍在每次成功寫入後更新 Script Properties 的 public revision。

公開儀表板：
- 不自動重新抓完整 Dashboard
- 每 30 秒只查一次 public revision
- revision 改變 → 顯示「有新的資料更新」
- User 自己按「重新整理」才讀完整 Dashboard

目前 GitHub Pages + Apps Script 沒有 WebSocket / Server Push，
因此後端不能主動把訊息推到瀏覽器；30 秒的輕量 revision polling 是較穩定的折衷。

## 3. 指派任務來源可修改需求日

透過「指派任務」建立的 Task，requester 現在可在任務詳細資料修改需求日。

權限：
- requester
- self-assigned owner
- Admin

狀態：
- pending
- accepted

排程規則：
- 過去 `workDate < today` 完全保留
- 剩餘工時 = plannedHours - 已發生工時
- 新需求日期內重新建立未來排程
- 原本個人已調整過的未來 Allocation 作為權重
- 新增加的可排程日期使用目前平均權重
- 因此延長需求日會把工作帶入新增日期，而不是全部留在舊日期
- 共同作業仍依 collaborationGroupId 同步需求日，但各人依自己的 Allocation 權重平準

pending Task 尚未有 Allocation，只更新 requestDate。

## 4. 等待視窗

commitOverlay 原本的圓形 spinner 改為純 CSS3 幾何動畫：
- 四個幾何方塊
- 旋轉 + pulse
- 不使用圖片 / SVG / JS animation
- 支援 prefers-reduced-motion

## 5. 等待時間 UX 優化

GitHub Pages + Apps Script 的寫入仍必須等待 server acknowledgment，
否則前端無法知道 Google Sheet 是否真的成功寫入。

但 v2.11.4 revised 減少「不必要的第二次等待」：
- 第一次 login 的 loadAll 保留 loading
- 完成寫入後的 loadAll refresh 預設 silent
- Team 自動同步 refresh 為 silent
- Admin 自動同步 refresh 為 silent
- write request queue / conflict check 仍保留

真正耗時主要來自：
1. Browser → Apps Script HTTP round trip
2. Apps Script cold start / execution queue
3. SpreadsheetApp 多次 read/write
4. ScriptLock 等待

後續若要再大幅提升速度，優先順序建議：
- 一次 read DataRange 後在記憶體共用，減少同 request 重複 readObjects_
- 批次 setValues / append，減少逐 row Spreadsheet I/O
- CacheService 快取 Users / Holidays / public lookup
- 將 teamCalendar 做 revision-key cache
- 長期若需要真正 push / real-time，可改 Firebase / Supabase / Cloud Run；GitHub Pages + GAS 本身沒有 WebSocket push

## 部署

Apps Script：
- 更新 Code.gs
- Deploy v2.11.4

GitHub：
- 更新 app.js
- index.html
- styles.css

config.js 不修改。
Google Sheet 無 schema 變更，不需初始化。
