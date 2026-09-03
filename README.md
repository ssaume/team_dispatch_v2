# Team Dispatch v1.9.0

- 我的工作日曆改成上下連續兩週。
- 前/後按鈕每次移動一週，但始終顯示 14 天。
- 可直接跨週拖拉。
- 任務詳細內容新增「移動日期」，手機可不用拖曳。
- 移動日期與拖曳共用既有 moveAllocation API，所以週末、國定假日、請假與任務期間限制完全一致。
- 前後週只重新 render 已載入資料，不額外呼叫 Google Apps Script。

從 v1.8.5 升級：
- Google Sheet 不需初始化。
- GitHub 更新 index.html / app.js / styles.css。
- Apps Script 功能未變；Code.gs 只同步版本號，可選擇更新部署。
