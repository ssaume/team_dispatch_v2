# Team Dispatch v2.11.6

## 1. F5 不再先閃登入畫面

v2.11.5 雖然可恢復 session，但 connectBackend 一開始仍先呼叫 showLogin，因此會先看到登入畫面再跳回系統。

v2.11.6：
- 若 sessionStorage 已有 token，不先 render login
- 先顯示中性的「正在恢復登入狀態」
- ping + me 成功後直接 showMain / loadAll
- session 無效時才 render login

並新增 tab-scoped `teamDispatchLastView`：
- 每次切換功能頁記住最後頁面
- F5 後恢復到原本的我的工作／指派任務／請假出差／團隊出勤／系統管理
- 非 Admin 不會恢復到 Admin 頁

## 2. 團隊出勤進入時直接讀最新資料

原本：
進入頁面時可能先 render cache / 舊 revision，再被 watcher 判斷為 stale，造成「停一下 → 又重整」。

v2.11.6：
1. 進入團隊出勤
2. 先 silent 呼叫 teamSyncState
3. 更新本機 teamSyncRevision
4. clear teamCalendarCache
5. 強制只讀一次最新 teamCalendar
6. 完成後顯示

因此 watcher 不會在剛進頁面後立刻再觸發第二次 refresh。

前／後 14 天與「今天」切換也改成直接抓該區間最新資料。

## 3. 每個功能頁新增 Guide

共用 Guide Dialog，功能頁右上角提供 Guide：

- 我的工作
- 指派任務
- 請假／出差
- 團隊出勤
- 系統管理
- 公開任務儀表板

內容只說明：
- 這個畫面用途
- 主要操作
- 關鍵規則 / 注意事項

Guide 不讀後端，不增加 GAS request。

## 部署

Apps Script：
- 更新 Code.gs
- Deploy v2.11.6

GitHub：
- 更新 app.js
- index.html
- styles.css

config.js 不修改。

Google Sheet：
- 無 schema 變更
- 不需初始化
