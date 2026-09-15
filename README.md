# Team Dispatch v2.11.2

本版修正登入前 / 登入後版本號顯示可能不同步的問題。

## 原因

v2.11.1 的 index.html 其實已有兩個靜態版本字串：
- 登入畫面
- 登入後 Sidebar

但版本號只依賴 GitHub Pages 的靜態 HTML。
若瀏覽器 / CDN 還拿到舊 index.html，就可能看到舊版號，即使 Apps Script 已經部署新版本。

## v2.11.2

新增動態版本同步：

1. 前端啟動時呼叫 Apps Script `ping`
2. 後端回傳 `APP.VERSION`
3. 前端把所有 `.app-version` 元素統一更新成後端版本

因此：
- 登入畫面版本號
- 登入後 Sidebar 版本號

都會以實際正在連線的 Apps Script 版本為準。

index.html 仍保留 `v2.11.2` 作為連線前 fallback。

## 部署

Apps Script：
- 更新 Code.gs
- 部署 v2.11.2

GitHub：
- 更新 index.html
- 更新 app.js

styles.css 無功能變更。
config.js 不修改。
Google Sheet 無 schema 變更，不需初始化。
