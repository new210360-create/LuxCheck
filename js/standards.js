/* =========================================================================
 * standards.js — 辦公空間照明需求（參考 CNS 12112 / EN 12464-1 辦公類別）
 *   Em: 維持平均照度 (lx)，UGR: 統一眩光值上限，U0: 均齊度下限，Ra: 演色性下限
 *   ※ 數值供設計檢核參考，正式送審請以最新公告版本條文為準
 * ========================================================================= */
(function (LX) {
  'use strict';

  LX.STANDARDS = [
    { id: 'office-general', name: '一般辦公（書寫、打字、閱讀、資料處理）', Em: 500, UGR: 19, U0: 0.6, Ra: 80, wp: 0.75 },
    { id: 'office-open', name: '開放式辦公區', Em: 500, UGR: 19, U0: 0.6, Ra: 80, wp: 0.75 },
    { id: 'office-cad', name: 'CAD 工作站', Em: 500, UGR: 19, U0: 0.6, Ra: 80, wp: 0.75 },
    { id: 'office-drawing', name: '技術製圖', Em: 750, UGR: 16, U0: 0.7, Ra: 80, wp: 0.75 },
    { id: 'office-meeting', name: '會議室', Em: 500, UGR: 19, U0: 0.6, Ra: 80, wp: 0.75 },
    { id: 'office-reception', name: '接待櫃台', Em: 300, UGR: 22, U0: 0.6, Ra: 80, wp: 0.75 },
    { id: 'office-filing', name: '歸檔、影印、流通區', Em: 300, UGR: 19, U0: 0.4, Ra: 80, wp: 0.75 },
    { id: 'office-archive', name: '檔案室 / 儲藏', Em: 200, UGR: 25, U0: 0.4, Ra: 80, wp: 0.0 },
    { id: 'office-pantry', name: '茶水間 / 休息區', Em: 200, UGR: 22, U0: 0.4, Ra: 80, wp: 0.75 },
    { id: 'office-corridor', name: '走廊 / 通道', Em: 100, UGR: 28, U0: 0.4, Ra: 40, wp: 0.0 },
    { id: 'office-lobby', name: '入口大廳', Em: 200, UGR: 22, U0: 0.4, Ra: 80, wp: 0.0 },
    { id: 'custom', name: '自訂', Em: 500, UGR: 19, U0: 0.6, Ra: 80, wp: 0.75 },
  ];

  /** 照明功率密度 LPD 建議上限 (W/m²)，可於介面調整 */
  LX.DEFAULT_LPD_LIMIT = 8.5;
})((window.LX = window.LX || {}));
