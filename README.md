# Team Dispatch — GitHub Pages + Google Drive

此版本將前端部署在 **GitHub Pages**，後端資料放在 **Google Sheets / Google Drive**，並以 **Google Apps Script** 執行登入、權限與任務資料操作。

## 架構

```text
GitHub Pages
  index.html / app.js / styles.css
          │
          │ postMessage
          ▼
Google Apps Script Web App (hidden iframe bridge)
          │
          │ google.script.run
          ▼
Google Sheets
  ├─ Users
  ├─ Tasks
  └─ Sessions
       ↓
Google Drive
```

這樣做的原因是 GitHub Pages 本身只有靜態 HTML/CSS/JS，無法安全保存多人共用帳號與任務資料。
Apps Script Web App 與 GitHub Pages 直接 fetch 也可能碰到跨網域 / redirect 問題，因此此版本使用 iframe bridge + `postMessage`。

---

# A. 建立 Google Drive 後端

## 1. 建立 Google Sheet

在 Google Drive 新增一份 Google 試算表，例如：

`Team Dispatch DB`

## 2. 開啟 Apps Script

試算表：

`擴充功能 → Apps Script`

把預設 `Code.gs` 全部刪除，貼上本專案：

`apps-script/Code.gs`

再新增 HTML 檔：

`Bridge`

把：

`apps-script/Bridge.html`

貼進去。

如果需要 manifest，可在 Apps Script 專案設定中顯示 `appsscript.json`，內容使用本專案提供的版本。

## 3. 初始化資料庫

回到 Google Sheet 並重新整理。

功能表會出現：

`Team Dispatch`

選：

`Team Dispatch → 初始化 / 修復資料表`

初始化時也會自動記錄這份 Google Sheet 的 Spreadsheet ID，讓 Web App 執行時能固定讀寫正確資料庫。

系統會建立：

- Users
- Tasks
- Sessions

預設管理員：

- 帳號：`admin`
- 密碼：`deltatwv2`

**第一次登入後務必修改密碼。**

## 4. 部署 Apps Script Web App

Apps Script：

`部署 → 新增部署作業 → 網頁應用程式`

建議：

- 執行身分：**我**
- 存取權：**任何人**

部署後取得：

`https://script.google.com/macros/s/.../exec`

保存此 URL。

> 「任何人」是為了讓 GitHub Pages 能載入 bridge；真正資料操作仍需 Team Dispatch 帳密及 Session Token。

---

# B. 設定 GitHub 前端

## 1. 修改 config.js

把：

```js
APPS_SCRIPT_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE"
```

改成剛才 Apps Script 的 `/exec` URL。

## 2. Push 到 GitHub repository

Repository 根目錄應包含：

```text
index.html
app.js
styles.css
config.js
.nojekyll
```

`apps-script/` 可以一起保留在 repository，方便版本管理，不會被前端執行。

## 3. 啟用 GitHub Pages

GitHub Repository：

`Settings → Pages`

Build and deployment：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/(root)`

儲存後會得到類似：

`https://YOUR_NAME.github.io/YOUR_REPOSITORY/`

---

# C. 限制 Apps Script 只接受你的 GitHub 網站

知道 GitHub Pages URL 後，取它的 **Origin**。

例如網站是：

`https://evon.github.io/team-dispatch/`

Origin 是：

`https://evon.github.io`

回 Google Sheet：

`Team Dispatch → 設定 GitHub Pages 網址`

輸入：

`https://evon.github.io`

**不要輸入 `/team-dispatch/` 路徑。**

若使用自訂網域：

`https://dispatch.example.com`

就輸入該 Origin。

設定後 Apps Script bridge 只接受該網站的 `postMessage`。

---

# D. 使用方式

開 GitHub Pages 網址。

第一次登入：

```text
admin
deltatwv2
```

到：

`帳號管理`

建立團隊成員。

目前具備：

- 帳號 / 密碼登入
- admin / user 權限
- 新增團隊帳號
- 啟用 / 停用
- 重設密碼
- 指派工作給其他人
- 工作類型自由輸入
- 需求內容
- 需求日期
- 待接受工作
- 接受 / 拒絕
- 拒絕理由
- 接單者標示緊急
- 接單者完成工作
- 派工者查看狀態及拒絕理由
- 個人工作清單
- 個人工作週日曆
- 接單日 → 需求日期間表達

顏色：

- 已完成：灰
- Due Date > 2 天：粉綠
- Due Date 0–2 天：粉橘
- 已超過 Due Date：粉紅
- 緊急：紅色 `!`

---

# E. 資料表

## Users

```text
id
username
displayName
passwordHash
salt
role
active
createdAt
```

密碼不以明碼保存。

## Tasks

```text
id
requesterId
assigneeId
workType
content
requestDate
status
rejectionReason
urgent
createdAt
acceptedAt
completedAt
updatedAt
```

## Sessions

```text
token
userId
expiresAt
createdAt
```

Session 預設 12 小時。

---

# F. 注意事項

此架構適合：

- 小型 / 中小型內部團隊
- MVP
- 數十人等級
- 低到中等頻率派工作業

不建議當成：

- 大型企業核心系統
- 高併發交易系統
- 存放高度機敏資料的正式 IAM 系統

若未來使用量提高，可保留 GitHub Pages 前端，將後端從 Apps Script / Sheets 換成 Cloud Run + Cloud SQL / Firebase / Supabase，而 UI 不必重做。
