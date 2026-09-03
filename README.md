# Team Dispatch v1.7.0

## 任務公開 / 私人
Tasks 新增 `visibility` 欄位，值為 `public` 或 `private`。

- 公開：可出現在免登入儀表板。
- 私人：不會出現在免登入儀表板。
- 兩者都正常參與 Loading、TaskAllocations、拖拉、合併、分拆與團隊出勤計算。

新增自己的工作與請別人協助時都可選「公開 / 私人」，預設為公開。
既有任務可在任務詳細內容中修改此屬性。任務負責人或建立者可修改。

公開儀表板是在 Apps Script 後端查詢時直接排除 private 任務，不是單純由前端隱藏。

## 舊資料
舊任務 visibility 空白時視為 `public`，因此升級後既有任務不會突然消失。若需要隱藏，登入後改成私人即可。

## 從 v1.6.0 升級
1. 建議先備份 Google Sheet。
2. Apps Script 將 `Code.gs` 換成 v1.7.0。
3. 回 Google Sheet 執行 `Team Dispatch → 初始化 / 修復資料表`，這次必須執行，會在 Tasks 尾端新增 `visibility`，既有資料不刪除。
4. Apps Script `部署 → 管理部署作業 → 編輯 → 新版本 → 部署`。
5. GitHub 更新 `index.html`、`app.js`、`styles.css`，保留現有 `config.js`。
6. Commit 到 main，Pages 完成後 Ctrl+F5。

## 建議驗證
- 建一個公開任務、一個私人任務。
- 登入後兩者都看得到、Loading 都會計算。
- 免登入儀表板只能看到公開任務。
- 把私人改公開後，重新整理公開儀表板應出現；改回私人後應消失。
