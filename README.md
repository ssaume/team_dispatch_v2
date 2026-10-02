# Team Dispatch v2.11.6.1

## Guide UI 重設計

v2.11.6 的 Guide 只有一段文字與條列，在 Dialog 中資訊層級不夠明顯。

v2.11.6.1 改為：
- Guide Hero：顯示頁面名稱與一句用途摘要
- Guide Card：每個操作重點獨立成卡片
- 左側編號 01 / 02 / 03
- 重要規則使用黃色提醒卡
- Sticky Header / Sticky Footer
- Dialog 背景加深、內容區提高對比
- Mobile 改成全畫面 Guide，避免小螢幕文字擁擠

## 任務詳細資訊新增 Guide

點擊任務名稱進入 Task Detail 後，右上方新增 Guide。

Task Guide 說明：
- 任務摘要區
- 可修改的設定與排程
- 已發生工時鎖定規則
- 共同作業資料模型
- 完成 / 中止 / 重啟與 Loading
- 多裝置衝突檢查

Guide 只使用前端靜態資料，不增加 Apps Script request。

## 部署

Apps Script：
- 更新 Code.gs
- Deploy v2.11.6.1

GitHub：
- 更新 app.js
- index.html
- styles.css

config.js 不修改。
Google Sheet 無 schema 變更，不需初始化。
