# Team Dispatch v2.9.1

- 已派發未來任務：改為顯示全部 public 的 pending / accepted 未結任務，包含逾期；依需求日排序。
- 15 天內到期標籤保留：只有 today ~ today+14 的任務顯示標籤。
- Heatmap 部分請假：百分比照常顯示，第二行顯示 `假xh`；Loading 分母使用請假後可用工時。
- Heatmap 國定假日：顯示 `國假` 與 holidayName。
- Heatmap 週末：顯示 `週末`。
- Heatmap 出差：顯示 `出差` 與 purpose，但不扣 availableHours、不改 Loading 計算。

部署：更新 Code.gs、app.js、index.html、styles.css；config.js 不變；Google Sheet 無 schema 變更、不需初始化。
