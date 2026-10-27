/* =========================================================================
 * library.js — 舞光 (DanceLight) 常用室內與商辦燈具資料庫 + 通用辦公燈具
 *   涵蓋：9.5cm 崁燈、12cm 崁燈、15cm 崁燈、投射燈/軌道燈/盒燈、平板燈
 *   規格依據舞光公開型錄主流數值（自然光 4000K / 白光 6000K 代表值），
 *   支援於介面中任意微調流明、瓦數、光束角、安裝高度與傾角。
 * ========================================================================= */
(function (LX) {
  'use strict';

  const DEFAULT_LIBRARY = [
    /* ==================== 1. 舞光 平板燈系列 ==================== */
    {
      id: 'dl-panel-6060-25w', name: '【舞光】節能標章平板燈 60×60 25W', category: '平板燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-PA25N (節標款)',
      cutout: '輕鋼架 60×60cm', lumens: 3250, watts: 25, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 115 },
    },
    {
      id: 'dl-panel-6060-ugr19', name: '【舞光】低眩光防眩平板燈 60×60 30W (UGR<19)', category: '平板燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-PA30-UGR19',
      cutout: '輕鋼架 60×60cm', lumens: 3300, watts: 30, cct: 4000, cri: 85, ugrClass: '<19',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 85 },
    },
    {
      id: 'dl-panel-6060-40w', name: '【舞光】高光效柔光平板燈 60×60 40W', category: '平板燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-PA40N',
      cutout: '輕鋼架 60×60cm', lumens: 4000, watts: 40, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 120 },
    },
    {
      id: 'dl-panel-30120-40w', name: '【舞光】長型柔光平板燈 120×30 40W', category: '平板燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-PA1230-40N',
      cutout: '輕鋼架 120×30cm', lumens: 4000, watts: 40, cct: 4000, cri: 80, ugrClass: '<22',
      length: 1.2, width: 0.3, mount: 'recessed', shape: 'rect',
      gen: { beam: 115, beam90: 105 },
    },

    /* ==================== 2. 舞光 9.5cm 崁燈系列 ==================== */
    {
      id: 'dl-95-thor-9w', name: '【舞光】9.5cm 索爾崁燈 9W (廣角均光)', category: '9.5cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'LED-95D9N (索爾)',
      cutout: '開孔 Φ9.5cm', lumens: 800, watts: 9, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.115, width: 0.115, mount: 'recessed', shape: 'round',
      gen: { beam: 100 },
    },
    {
      id: 'dl-95-bohr-10w', name: '【舞光】9.5cm 波爾防眩崁燈 10W (深防眩)', category: '9.5cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL10B95 (波爾)',
      cutout: '開孔 Φ9.5cm', lumens: 850, watts: 10, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.11, width: 0.11, mount: 'recessed', shape: 'round',
      gen: { beam: 36 },
    },
    {
      id: 'dl-95-bd-12w', name: '【舞光】9.5cm 黑鑽石可調角度崁燈 12W', category: '9.5cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL12BD95 (黑鑽石)',
      cutout: '開孔 Φ9.5cm', lumens: 1050, watts: 12, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.11, width: 0.11, mount: 'recessed', shape: 'round',
      gen: { beam: 36 },
    },
    {
      id: 'dl-95-stretch-12w', name: '【舞光】9.5cm 拉伸投射崁燈 12W (24°)', category: '9.5cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL12S95 (拉伸款)',
      cutout: '開孔 Φ9.5cm', lumens: 960, watts: 12, cct: 3000, cri: 90, ugrClass: '<16',
      length: 0.11, width: 0.11, mount: 'recessed', shape: 'round',
      gen: { beam: 24 },
    },

    /* ==================== 3. 舞光 12cm 崁燈系列 ==================== */
    {
      id: 'dl-120-thor-12w', name: '【舞光】12cm 索爾崁燈 12W (廣角均光)', category: '12cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'LED-12D12N (索爾)',
      cutout: '開孔 Φ12cm', lumens: 1150, watts: 12, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.145, width: 0.145, mount: 'recessed', shape: 'round',
      gen: { beam: 110 },
    },
    {
      id: 'dl-120-bohr-12w', name: '【舞光】12cm 波爾防眩崁燈 12W (Ra90)', category: '12cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL12B12 (波爾)',
      cutout: '開孔 Φ12cm', lumens: 1080, watts: 12, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.14, width: 0.14, mount: 'recessed', shape: 'round',
      gen: { beam: 60 },
    },
    {
      id: 'dl-120-odin-15w', name: '【舞光】12cm 奧丁高亮崁燈 15W', category: '12cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL15OD12 (奧丁)',
      cutout: '開孔 Φ12cm', lumens: 1450, watts: 15, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.145, width: 0.145, mount: 'recessed', shape: 'round',
      gen: { beam: 105 },
    },

    /* ==================== 4. 舞光 15cm 崁燈系列 ==================== */
    {
      id: 'dl-150-thor-15w', name: '【舞光】15cm 索爾崁燈 15W (基礎廣角)', category: '15cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'LED-15D15N (索爾)',
      cutout: '開孔 Φ15cm', lumens: 1500, watts: 15, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.175, width: 0.175, mount: 'recessed', shape: 'round',
      gen: { beam: 115 },
    },
    {
      id: 'dl-150-bohr-16w', name: '【舞光】15cm 波爾深防眩崁燈 16W (UGR<19)', category: '15cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL16B15 (波爾)',
      cutout: '開孔 Φ15cm', lumens: 1520, watts: 16, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.17, width: 0.17, mount: 'recessed', shape: 'round',
      gen: { beam: 65 },
    },
    {
      id: 'dl-150-odin-18w', name: '【舞光】15cm 奧丁商空高亮崁燈 18W', category: '15cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL18OD15 (奧丁)',
      cutout: '開孔 Φ15cm', lumens: 1800, watts: 18, cct: 4000, cri: 85, ugrClass: '<22',
      length: 0.175, width: 0.175, mount: 'recessed', shape: 'round',
      gen: { beam: 110 },
    },

    /* ==================== 5. 舞光 投射燈 / 軌道燈 / 盒燈系列 ==================== */
    {
      id: 'dl-tr-cupid-15w', name: '【舞光】邱比特軌道投射燈 15W 36°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-TRCP15 (邱比特)',
      cutout: '二線軌道', lumens: 1200, watts: 15, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.08, width: 0.08, mount: 'track', shape: 'round', suspension: 0.15,
      gen: { beam: 36 },
    },
    {
      id: 'dl-tr-cupid-20w', name: '【舞光】邱比特軌道投射燈 20W 36°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-TRCP20 (邱比特)',
      cutout: '二線軌道', lumens: 1500, watts: 20, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.09, width: 0.09, mount: 'track', shape: 'round', suspension: 0.15,
      gen: { beam: 36 },
    },
    {
      id: 'dl-tr-cupid-30w', name: '【舞光】邱比特商空軌道投射燈 30W 36°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-TRCP30 (邱比特)',
      cutout: '二線軌道', lumens: 2250, watts: 30, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.10, width: 0.10, mount: 'track', shape: 'round', suspension: 0.18,
      gen: { beam: 36 },
    },
    {
      id: 'dl-tr-bd-12w-24', name: '【舞光】黑鑽石窄角軌道投射燈 12W 24°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-TRBD12 (黑鑽石)',
      cutout: '二線軌道', lumens: 1000, watts: 12, cct: 3000, cri: 90, ugrClass: '<16',
      length: 0.075, width: 0.075, mount: 'track', shape: 'round', suspension: 0.15,
      gen: { beam: 24 },
    },
    {
      id: 'dl-box-ar111-15w', name: '【舞光】AR111 單燈防眩盒燈 15W 24°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-BX111-15W',
      cutout: '開孔 15×15cm', lumens: 1200, watts: 15, cct: 3000, cri: 90, ugrClass: '<16',
      length: 0.17, width: 0.17, mount: 'recessed', shape: 'rect',
      gen: { beam: 24 },
    },
    {
      id: 'dl-box-ar111-30w', name: '【舞光】AR111 雙燈防眩盒燈 30W (2×15W)', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-BX111-2x15W',
      cutout: '開孔 30×15cm', lumens: 2400, watts: 30, cct: 4000, cri: 90, ugrClass: '<16',
      length: 0.32, width: 0.17, mount: 'recessed', shape: 'rect',
      gen: { beam: 24, beam90: 30 },
    },

    /* ==================== 6. 線型吊燈 / 挑高天井燈 ==================== */
    {
      id: 'linear-pend-dir-ind', name: 'LED 辦公線型吊燈 直接/間接 240cm 60W', category: '線型燈',
      manufacturer: '通用商辦', catalog: 'LP-240-60W',
      cutout: '吊掛式', lumens: 7200, watts: 60, cct: 4000, cri: 90, ugrClass: '<19',
      length: 2.4, width: 0.07, mount: 'pendant', shape: 'rect', suspension: 0.6,
      gen: { beam: 100, beam90: 70, upRatio: 0.35, upBeam: 120 },
    },
  ];

  LX.DEFAULT_LIBRARY = DEFAULT_LIBRARY;
})((window.LX = window.LX || {}));
