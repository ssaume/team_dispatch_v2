# Team Dispatch v1.4.1 — Bug Fix

本版修正 v1.4.0 四個問題。

## 修正 1：日曆拖拉選擇合併但沒有合併

原因不是拖拉 UI，而是 Google Sheets 會把 `workDate` 自動轉成 Date。
v1.4.0 後端把 Date 轉成 ISO 字串後，拿去和 `YYYY-MM-DD` 比對，導致同日期判斷失敗。

v1.4.1：
- `workDate`、`requestDate`、`startDate`、`endDate` 一律以 `Asia/Taipei` 的 `yyyy-MM-dd` 讀取。
- 合併判斷恢復正常。
- 如果 v1.4.0 已經因 bug 把兩個區塊搬到同一天但沒有合併，可以直接把其中一塊拖到「同一天」再選確認，即可補做合併。

## 修正 2：團隊出勤看不到 Loading 數字

同樣是上述日期型別造成 `TaskAllocations` 的日期 key 對不到團隊甘特圖日期。

v1.4.1：
- Loading 日期 key 已修正。
- 工作日即使沒有 Loading，也明確顯示 `0%`。
- 請假日仍不顯示 Loading，避免與請假疊加。

## 修正 3：admin 新增 User 成功後跳出 reset null

原因是瀏覽器事件物件的 `e.currentTarget` 在 `await` 後不保證仍存在。

v1.4.1：
- 在進入非同步流程前先保存 form reference。
- 同時修正「請別人協助」、「新增請假」、「新增出差」中相同的潛在問題。
- 移除 `loadAll()` 背景重複呼叫 admin 畫面的競態。

## 修正 4：登入時輸入帳號後看起來自動登入

v1.4.0 會在頁面連上 Google Apps Script 後，如果瀏覽器還留有上一個 Session Token，就自動恢復登入。
如果此時使用者剛好正在輸入帳號，看起來就像「輸入帳號後自動登入」。

v1.4.1：
- 每次重新開啟或重新整理網站都清除本機 Session Token。
- 一定要輸入帳號與密碼。
- 一定要按「登入」按鈕才會送出登入。
- Login form 關閉瀏覽器自動提交行為。

## 從 v1.4.0 更新

### Google Apps Script
1. 將 `apps-script/Code.gs` 全部替換成 v1.4.1。
2. 儲存。
3. `部署 → 管理部署作業 → 編輯 → 新版本 → 部署`。
4. **不需要重新初始化 Google Sheet。**
5. `TaskAllocations` 與既有資料不會被刪除。

### GitHub
更新：
- `index.html`
- `app.js`
- `styles.css`

保留：
- `config.js`

Commit 到 `main`，Pages 部署完成後按 `Ctrl + F5`。

## 建議驗證順序
1. 重新整理網站：確認不會自動登入。
2. 只輸入帳號：確認不會登入。
3. 輸入帳號 + 密碼後按登入：正常登入。
4. 團隊出勤：工作日應至少看到 `0%`，有工作者看到實際 Loading。
5. 把 9/2 的同任務區塊拖到 9/3，選「確定」：應只剩一個加總後區塊。
6. Admin 建立測試帳號：建立後不應再出現 `Cannot read properties of null (reading 'reset')`。
