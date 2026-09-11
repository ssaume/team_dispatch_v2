# Team Dispatch v2.5.3

本版為 bug fix，因此只更新第三碼。

## 修正：資料更新等待層被任務 Dialog 蓋住

原因：
- 任務詳細內容使用原生 `<dialog>`
- `dialog.showModal()` 會進入瀏覽器 Top Layer
- 原本的 Loading 是一般 `<div>`
- 一般 div 即使設定很大的 z-index，也可能仍位於 dialog 下方

修正：
- 全域 `commitOverlay` 改為原生 `<dialog>`
- 資料讀取 / 寫入開始時使用 `showModal()`
- 完成時使用 `close()`
- Loading 因此會進入 Top Layer，永遠位於任務詳細視窗、Admin 視窗等 modal 上方

效果：
- 在「我的工作 → 點擊任務 → 更新內容 / 工時 / 日期 / 完成 / 中止」時
- Loading 會直接覆蓋在目前視窗最上層
- User 可以明確看到「資料處理中 / 資料更新中」
- 完成後等待層自動關閉，原本任務 dialog 保持正常

本版沒有 Sheet schema 變更。

升級：
- Apps Script：更新 Code.gs 並部署 v2.5.3
- GitHub：更新 index.html、app.js、styles.css
- config.js 不變
- 不需要初始化 / 修復資料表
