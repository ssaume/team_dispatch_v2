# Team Dispatch v2.7.1

本版為登入/session bug fix，因此依版本規則更新第三碼。

## 問題原因

v2.7.0 以前登入 token 儲存在：

`localStorage.teamDispatchToken`

localStorage 會被同一個 GitHub Pages origin 下的所有瀏覽器分頁共用。

因此：

分頁 A：
- User A 登入
- localStorage = Token A

分頁 B：
- User B 登入
- localStorage 被改成 Token B

接著分頁 A 執行 loadAll / 更新工作時，
前端會讀到 Token B，導致分頁 A 取得 User B 的資料。

這就是同一台電腦 / 同一瀏覽器登入兩個帳號時資料串帳的主要原因。

## v2.7.1 修正

### 1. token 改為 sessionStorage

改成：

`sessionStorage.teamDispatchToken`

sessionStorage 是「每個分頁獨立」。

因此可以：

- 分頁 A → User A
- 分頁 B → User B

兩個分頁的 token 不再互相覆蓋。

### 2. RPC 固定使用發送當下 token

每個 rpc() 呼叫一開始就建立：

`tokenSnapshot`

真正送出的 payload 使用這個 snapshot。

即使同一分頁稍後切換帳號，
既有 request 也不會突然改用新的 token。

### 3. 舊登入回應不得覆蓋新登入資料

每個 authenticated RPC 都記錄：
- tokenSnapshot
- 是否為 authenticated request

回應抵達時重新比較目前 tab token。

如果 request 是舊帳號發出的：

`request token != current tab token`

則直接忽略，不讓它覆蓋畫面資料。

### 4. loadAll 再增加 User ID 防護

loadAll 發送前記住目前：

`me.id`

回應後再次確認：

`response.user.id === expected user id`

不符合即視為 stale session response，不更新：
- me
- incoming
- outgoing
- TaskAllocations
- Leave
- Trips
- Admin data

### 5. 移除舊 localStorage token

升級後會主動：

`localStorage.removeItem('teamDispatchToken')`

避免舊版 shared token 殘留。

## 預期使用方式

同一個 Chrome：

Tab A：
`User A`

Tab B：
`User B`

可以同時使用。

A 更新工作後只會刷新 A。
B 更新工作後只會刷新 B。

注意：
同一個「分頁」仍只允許一個登入帳號；
要同時登入兩個帳號請使用兩個分頁。

## 升級

沒有 Google Sheet schema 變更。

GitHub：
- 必須更新 app.js
- 更新 index.html 以顯示 v2.7.1

Apps Script：
- 功能邏輯無變更
- 若要版本號同步，更新 Code.gs 並部署 v2.7.1

styles.css / config.js 不需修改。
Google Sheet 不需初始化。
