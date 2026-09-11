# Team Dispatch v2.5.6

本版為 bug fix，因此只更新第三碼。

## 修正：Loading 仍出現橫向白色區塊

v2.5.5 仍可能受到舊 `.commit-overlay` CSS 影響。

v2.5.6 不再讓 `<dialog id="commitOverlay">` 使用 `commit-overlay` class。

新結構：
- dialog.loading-dialog：只負責 Top Layer
- loading-dialog-center：負責置中
- commit-loading-card：只負責 loading 卡片本身
- dialog::backdrop：負責全頁半透明遮罩

因此舊 `.commit-overlay` 的 position / width / flex / background 規則不再能影響新的 dialog。

## 升級
GitHub 必須更新：
- index.html
- styles.css

app.js 不需修改。
config.js 不需修改。

Apps Script：
- 僅版本號更新；若要版本一致可部署 v2.5.6

Google Sheet：
- 不需初始化。
