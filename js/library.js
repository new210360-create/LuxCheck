/* =========================================================================
 * library.js — 舞光 (DanceLight) 常用室內與商辦燈具資料庫 + 通用辦公燈具 + 燈具小樣圖 SVG
 *   涵蓋：9.5cm 崁燈、12cm 崁燈、15cm 崁燈、投射燈/軌道燈/盒燈、平板燈
 *   同時保留既有通用燈具 ID 以相容舊案件與自動化測試。
 * ========================================================================= */
(function (LX) {
  'use strict';

  const DEFAULT_LIBRARY = [
    /* ==================== 1. 舞光 平板燈系列 ==================== */
    {
      id: 'dl-panel-6060-25w', name: '【舞光】節能標章平板燈 60×60 25W', category: '平板燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-PA25N (節標款)',
      cutout: '輕鋼架 60×60cm', thumbKind: 'panel-6060',
      lumens: 3250, watts: 25, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 115 },
    },
    {
      id: 'dl-panel-6060-ugr19', name: '【舞光】低眩光防眩平板燈 60×60 30W (UGR<19)', category: '平板燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-PA30-UGR19',
      cutout: '輕鋼架 60×60cm', thumbKind: 'panel-ugr19',
      lumens: 3300, watts: 30, cct: 4000, cri: 85, ugrClass: '<19',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 85 },
    },
    {
      id: 'dl-panel-6060-40w', name: '【舞光】高光效柔光平板燈 60×60 40W', category: '平板燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-PA40N',
      cutout: '輕鋼架 60×60cm', thumbKind: 'panel-6060',
      lumens: 4000, watts: 40, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 120 },
    },
    {
      id: 'dl-panel-30120-40w', name: '【舞光】長型柔光平板燈 120×30 40W', category: '平板燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-PA1230-40N',
      cutout: '輕鋼架 120×30cm', thumbKind: 'panel-12030',
      lumens: 4000, watts: 40, cct: 4000, cri: 80, ugrClass: '<22',
      length: 1.2, width: 0.3, mount: 'recessed', shape: 'rect',
      gen: { beam: 115, beam90: 105 },
    },

    /* ==================== 2. 舞光 9.5cm 崁燈系列 ==================== */
    {
      id: 'dl-95-thor-9w', name: '【舞光】9.5cm 索爾崁燈 9W (廣角均光)', category: '9.5cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'LED-95D9N (索爾)',
      cutout: '開孔 Φ9.5cm', thumbKind: 'dl-wide-95',
      lumens: 800, watts: 9, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.115, width: 0.115, mount: 'recessed', shape: 'round',
      gen: { beam: 100 },
    },
    {
      id: 'dl-95-bohr-10w', name: '【舞光】9.5cm 波爾防眩崁燈 10W (深防眩)', category: '9.5cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL10B95 (波爾)',
      cutout: '開孔 Φ9.5cm', thumbKind: 'dl-deep-95',
      lumens: 850, watts: 10, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.11, width: 0.11, mount: 'recessed', shape: 'round',
      gen: { beam: 36 },
    },
    {
      id: 'dl-95-bd-12w', name: '【舞光】9.5cm 黑鑽石可調角度崁燈 12W', category: '9.5cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL12BD95 (黑鑽石)',
      cutout: '開孔 Φ9.5cm', thumbKind: 'dl-gimbal-95',
      lumens: 1050, watts: 12, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.11, width: 0.11, mount: 'recessed', shape: 'round',
      gen: { beam: 36 },
    },
    {
      id: 'dl-95-stretch-12w', name: '【舞光】9.5cm 拉伸投射崁燈 12W (24°)', category: '9.5cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL12S95 (拉伸款)',
      cutout: '開孔 Φ9.5cm', thumbKind: 'dl-pull-95',
      lumens: 960, watts: 12, cct: 3000, cri: 90, ugrClass: '<16',
      length: 0.11, width: 0.11, mount: 'recessed', shape: 'round',
      gen: { beam: 24 },
    },

    /* ==================== 3. 舞光 12cm 崁燈系列 ==================== */
    {
      id: 'dl-120-thor-12w', name: '【舞光】12cm 索爾崁燈 12W (廣角均光)', category: '12cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'LED-12D12N (索爾)',
      cutout: '開孔 Φ12cm', thumbKind: 'dl-wide-120',
      lumens: 1150, watts: 12, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.145, width: 0.145, mount: 'recessed', shape: 'round',
      gen: { beam: 110 },
    },
    {
      id: 'dl-120-bohr-12w', name: '【舞光】12cm 波爾防眩崁燈 12W (Ra90)', category: '12cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL12B12 (波爾)',
      cutout: '開孔 Φ12cm', thumbKind: 'dl-deep-120',
      lumens: 1080, watts: 12, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.14, width: 0.14, mount: 'recessed', shape: 'round',
      gen: { beam: 60 },
    },
    {
      id: 'dl-120-odin-15w', name: '【舞光】12cm 奧丁高亮崁燈 15W', category: '12cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL15OD12 (奧丁)',
      cutout: '開孔 Φ12cm', thumbKind: 'dl-wide-120',
      lumens: 1450, watts: 15, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.145, width: 0.145, mount: 'recessed', shape: 'round',
      gen: { beam: 105 },
    },

    /* ==================== 4. 舞光 15cm 崁燈系列 ==================== */
    {
      id: 'dl-150-thor-15w', name: '【舞光】15cm 索爾崁燈 15W (基礎廣角)', category: '15cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'LED-15D15N (索爾)',
      cutout: '開孔 Φ15cm', thumbKind: 'dl-wide-150',
      lumens: 1500, watts: 15, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.175, width: 0.175, mount: 'recessed', shape: 'round',
      gen: { beam: 115 },
    },
    {
      id: 'dl-150-bohr-16w', name: '【舞光】15cm 波爾深防眩崁燈 16W (UGR<19)', category: '15cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL16B15 (波爾)',
      cutout: '開孔 Φ15cm', thumbKind: 'dl-deep-150',
      lumens: 1520, watts: 16, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.17, width: 0.17, mount: 'recessed', shape: 'round',
      gen: { beam: 65 },
    },
    {
      id: 'dl-150-odin-18w', name: '【舞光】15cm 奧丁商空高亮崁燈 18W', category: '15cm崁燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-DL18OD15 (奧丁)',
      cutout: '開孔 Φ15cm', thumbKind: 'dl-wide-150',
      lumens: 1800, watts: 18, cct: 4000, cri: 85, ugrClass: '<22',
      length: 0.175, width: 0.175, mount: 'recessed', shape: 'round',
      gen: { beam: 110 },
    },

    /* ==================== 5. 舞光 投射燈 / 軌道燈 / 盒燈系列 ==================== */
    {
      id: 'dl-tr-cupid-15w', name: '【舞光】邱比特軌道投射燈 15W 36°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-TRCP15 (邱比特)',
      cutout: '二線軌道', thumbKind: 'track-spot',
      lumens: 1200, watts: 15, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.08, width: 0.08, mount: 'track', shape: 'round', suspension: 0.15,
      gen: { beam: 36 },
    },
    {
      id: 'dl-tr-cupid-20w', name: '【舞光】邱比特軌道投射燈 20W 36°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-TRCP20 (邱比特)',
      cutout: '二線軌道', thumbKind: 'track-spot',
      lumens: 1500, watts: 20, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.09, width: 0.09, mount: 'track', shape: 'round', suspension: 0.15,
      gen: { beam: 36 },
    },
    {
      id: 'dl-tr-cupid-30w', name: '【舞光】邱比特商空軌道投射燈 30W 36°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-TRCP30 (邱比特)',
      cutout: '二線軌道', thumbKind: 'track-spot',
      lumens: 2250, watts: 30, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.10, width: 0.10, mount: 'track', shape: 'round', suspension: 0.18,
      gen: { beam: 36 },
    },
    {
      id: 'dl-tr-bd-12w-24', name: '【舞光】黑鑽石窄角軌道投射燈 12W 24°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-TRBD12 (黑鑽石)',
      cutout: '二線軌道', thumbKind: 'track-dark',
      lumens: 1000, watts: 12, cct: 3000, cri: 90, ugrClass: '<16',
      length: 0.075, width: 0.075, mount: 'track', shape: 'round', suspension: 0.15,
      gen: { beam: 24 },
    },
    {
      id: 'dl-box-ar111-15w', name: '【舞光】AR111 單燈防眩盒燈 15W 24°', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-BX111-15W',
      cutout: '開孔 15×15cm', thumbKind: 'box-1',
      lumens: 1200, watts: 15, cct: 3000, cri: 90, ugrClass: '<16',
      length: 0.17, width: 0.17, mount: 'recessed', shape: 'rect',
      gen: { beam: 24 },
    },
    {
      id: 'dl-box-ar111-30w', name: '【舞光】AR111 雙燈防眩盒燈 30W (2×15W)', category: '投射燈',
      manufacturer: '舞光 DanceLight', catalog: 'D-BX111-2x15W',
      cutout: '開孔 30×15cm', thumbKind: 'box-2',
      lumens: 2400, watts: 30, cct: 4000, cri: 90, ugrClass: '<16',
      length: 0.32, width: 0.17, mount: 'recessed', shape: 'rect',
      gen: { beam: 24, beam90: 30 },
    },

    /* ==================== 6. 通用辦公燈具（相容既有案件） ==================== */
    {
      id: 'panel-6060-36', name: 'LED 平板燈 60×60', category: '平板燈',
      cutout: '輕鋼架 60×60cm', thumbKind: 'panel-6060',
      lumens: 3600, watts: 36, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 110 },
    },
    {
      id: 'panel-6060-ugr19', name: 'LED 防眩平板燈 60×60 (UGR<19)', category: '平板燈',
      cutout: '輕鋼架 60×60cm', thumbKind: 'panel-ugr19',
      lumens: 3400, watts: 30, cct: 4000, cri: 85, ugrClass: '<19',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 85 },
    },
    {
      id: 'panel-30120-40', name: 'LED 平板燈 30×120', category: '平板燈',
      cutout: '輕鋼架 120×30cm', thumbKind: 'panel-12030',
      lumens: 4000, watts: 40, cct: 4000, cri: 80, ugrClass: '<22',
      length: 1.2, width: 0.3, mount: 'recessed', shape: 'rect',
      gen: { beam: 110, beam90: 105 },
    },
    {
      id: 'troffer-3x-t8', name: 'LED 輕鋼架燈 (3 管等效) 60×60', category: '平板燈',
      cutout: '輕鋼架 60×60cm', thumbKind: 'troffer',
      lumens: 4200, watts: 42, cct: 5000, cri: 80, ugrClass: '<22',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 95, beam90: 80 },
    },
    {
      id: 'linear-pend-dir-ind', name: 'LED 線型吊燈 直接/間接 240cm', category: '線型燈',
      cutout: '懸吊式', thumbKind: 'linear-pendant',
      lumens: 7200, watts: 60, cct: 4000, cri: 90, ugrClass: '<19',
      length: 2.4, width: 0.07, mount: 'pendant', shape: 'rect', suspension: 0.8,
      gen: { beam: 100, beam90: 70, upRatio: 0.35, upBeam: 120 },
    },
    {
      id: 'linear-pend-120', name: 'LED 線型吊燈 直接 120cm', category: '線型燈',
      cutout: '懸吊式', thumbKind: 'linear-pendant',
      lumens: 3800, watts: 32, cct: 4000, cri: 90, ugrClass: '<19',
      length: 1.2, width: 0.06, mount: 'pendant', shape: 'rect', suspension: 0.8,
      gen: { beam: 100, beam90: 65 },
    },
    {
      id: 'linear-recessed-120', name: 'LED 崁入線型燈 120cm', category: '線型燈',
      cutout: '崁入條燈', thumbKind: 'panel-12030',
      lumens: 3200, watts: 30, cct: 4000, cri: 85, ugrClass: '<22',
      length: 1.2, width: 0.075, mount: 'recessed', shape: 'rect',
      gen: { beam: 110, beam90: 90 },
    },
    {
      id: 'downlight-15-60', name: 'LED 防眩崁燈 Φ15cm 15W', category: '15cm崁燈',
      cutout: '開孔 Φ15cm', thumbKind: 'dl-deep-150',
      lumens: 1500, watts: 15, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.15, width: 0.15, mount: 'recessed', shape: 'round',
      gen: { beam: 60 },
    },
    {
      id: 'downlight-20-90', name: 'LED 崁燈 Φ20cm 22W', category: '15cm崁燈',
      cutout: '開孔 Φ20cm', thumbKind: 'dl-wide-150',
      lumens: 2200, watts: 22, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.2, width: 0.2, mount: 'recessed', shape: 'round',
      gen: { beam: 90 },
    },
    {
      id: 'downlight-10-36', name: 'LED 重點崁燈 Φ10cm 9W', category: '9.5cm崁燈',
      cutout: '開孔 Φ10cm', thumbKind: 'dl-deep-95',
      lumens: 850, watts: 9, cct: 3000, cri: 90, ugrClass: '<16',
      length: 0.1, width: 0.1, mount: 'recessed', shape: 'round',
      gen: { beam: 36 },
    },
    {
      id: 'track-20-24', name: 'LED 軌道燈 20W 24°', category: '投射燈',
      cutout: '二線軌道', thumbKind: 'track-spot',
      lumens: 1900, watts: 20, cct: 3000, cri: 95, ugrClass: '—',
      length: 0.1, width: 0.1, mount: 'track', shape: 'round', suspension: 0.15,
      gen: { beam: 24 },
    },
    {
      id: 'highbay-ufo-100', name: 'LED 天井燈 100W (挑高大廳)', category: '天井燈',
      cutout: '懸吊式', thumbKind: 'highbay',
      lumens: 14000, watts: 100, cct: 5000, cri: 80, ugrClass: '—',
      length: 0.3, width: 0.3, mount: 'pendant', shape: 'round', suspension: 0.5,
      gen: { beam: 90 },
    },
  ];

  /**
   * 產生燈具小樣圖 SVG（顯示外觀結構、開孔尺寸、彈簧夾、燈杯與光束）
   */
  function fixtureThumbSvg(t, size) {
    size = size || 46;
    const k = t.thumbKind || inferThumbKind(t);
    let body = '';
    if (k === 'panel-6060' || k === 'panel-ugr19') {
      const ugr = k === 'panel-ugr19';
      body = `
        <polygon points="8,27 24,33 40,27 40,43 8,43" fill="url(#lxGlow)" opacity="0.55"/>
        <polygon points="6,16 24,9 42,16 24,24" fill="#cbd5e1" stroke="#64748b" stroke-width="1"/>
        <polygon points="9,16 24,10.5 39,16 24,22" fill="${ugr ? '#fef9c3' : '#fffbeb'}" stroke="#94a3b8" stroke-width="0.6"/>
        ${ugr ? '<line x1="16" y1="13.5" x2="32" y2="19" stroke="#cbd5e1" stroke-width="0.6"/><line x1="32" y1="13.5" x2="16" y2="19" stroke="#cbd5e1" stroke-width="0.6"/>' : ''}
        <text x="24" y="42" text-anchor="middle" fill="#93c5fd" font-size="8.5" font-weight="700">${ugr ? 'UGR<19' : '60×60'}</text>`;
    } else if (k === 'panel-12030') {
      body = `
        <polygon points="5,24 43,24 45,42 3,42" fill="url(#lxGlow)" opacity="0.5"/>
        <polygon points="4,17 16,11 44,18 32,24" fill="#cbd5e1" stroke="#64748b" stroke-width="1"/>
        <polygon points="7,17 16.5,12.5 41,18.2 31.5,22.5" fill="#fffbeb"/>
        <text x="24" y="42" text-anchor="middle" fill="#93c5fd" font-size="8.5" font-weight="700">120×30</text>`;
    } else if (k === 'troffer') {
      body = `
        <polygon points="7,24 41,24 44,42 4,42" fill="url(#lxGlow)" opacity="0.5"/>
        <rect x="7" y="10" width="34" height="14" rx="2" fill="#94a3b8" stroke="#475569" stroke-width="1"/>
        <rect x="10" y="12.5" width="28" height="2.2" rx="1" fill="#fef08a"/>
        <rect x="10" y="16" width="28" height="2.2" rx="1" fill="#fef08a"/>
        <rect x="10" y="19.5" width="28" height="2.2" rx="1" fill="#fef08a"/>
        <text x="24" y="42" text-anchor="middle" fill="#93c5fd" font-size="8.5" font-weight="700">輕鋼架</text>`;
    } else if (k.startsWith('dl-')) {
      const is95 = k.endsWith('95');
      const is120 = k.endsWith('120');
      const rRx = is95 ? 11 : is120 ? 13 : 15;
      const tag = is95 ? 'Φ9.5cm' : is120 ? 'Φ12cm' : 'Φ15cm';
      const deep = k.includes('deep');
      const gimbal = k.includes('gimbal') || k.includes('pull');
      const coneW = deep || gimbal ? 11 : 19;
      body = `
        <!-- 光錐 -->
        <polygon points="${24 - rRx * 0.65},23 ${24 + rRx * 0.65},23 ${24 + coneW},42 ${24 - coneW},42" fill="url(#lxGlow)" opacity="${deep || gimbal ? 0.85 : 0.55}"/>
        <!-- 兩側橘色彈簧耳扣 -->
        <path d="M${24 - rRx - 1},16 L${24 - rRx - 6},10 L${24 - rRx - 3},19" fill="none" stroke="#fb923c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M${24 + rRx + 1},16 L${24 + rRx + 6},10 L${24 + rRx + 3},19" fill="none" stroke="#fb923c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- 散熱燈體 -->
        <path d="M${24 - rRx * 0.78},19 L${24 - rRx * 0.6},9 L${24 + rRx * 0.6},9 L${24 + rRx * 0.78},19 Z" fill="${deep ? '#334155' : '#cbd5e1'}" stroke="#64748b" stroke-width="0.9"/>
        <!-- 崁燈外框面環 -->
        <ellipse cx="24" cy="20" rx="${rRx}" ry="4.5" fill="#f1f5f9" stroke="#64748b" stroke-width="1"/>
        <!-- 發光面 / 防眩黑杯 -->
        <ellipse cx="24" cy="20.2" rx="${rRx * 0.76}" ry="3.2" fill="${deep ? '#0f172a' : gimbal ? '#1e293b' : '#fef9c3'}"/>
        ${deep || gimbal ? `<ellipse cx="${gimbal ? 25.5 : 24}" cy="19.8" rx="${rRx * 0.42}" ry="1.8" fill="#fde047"/>` : ''}
        <text x="24" y="42.5" text-anchor="middle" fill="#fde047" font-size="8.5" font-weight="700">${tag}</text>`;
    } else if (k === 'track-spot' || k === 'track-dark') {
      const dark = k === 'track-dark';
      body = `
        <!-- 軌道條 -->
        <rect x="6" y="5" width="36" height="3.5" rx="1" fill="#334155" stroke="#64748b" stroke-width="0.7"/>
        <rect x="20" y="8.5" width="8" height="3.5" fill="${dark ? '#1e293b' : '#cbd5e1'}"/>
        <line x1="24" y1="12" x2="21" y2="18" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
        <!-- 投射光束 -->
        <polygon points="22,25 30,20 43,41 15,43" fill="url(#lxGlow)" opacity="0.85"/>
        <!-- 燈筒 -->
        <g transform="translate(23,19) rotate(-25)">
          <rect x="-5" y="-5" width="10" height="13" rx="2" fill="${dark ? '#0f172a' : '#e2e8f0'}" stroke="#64748b" stroke-width="1"/>
          <ellipse cx="0" cy="8" rx="5" ry="2" fill="#fde047"/>
        </g>
        <text x="24" y="43" text-anchor="middle" fill="#fca5a5" font-size="8.5" font-weight="700">軌道投射</text>`;
    } else if (k === 'box-1' || k === 'box-2') {
      const dual = k === 'box-2';
      body = `
        <polygon points="9,24 39,24 43,42 5,42" fill="url(#lxGlow)" opacity="0.75"/>
        <rect x="${dual ? 5 : 10}" y="9" width="${dual ? 38 : 28}" height="15" rx="2" fill="#1e293b" stroke="#94a3b8" stroke-width="1.2"/>
        <rect x="${dual ? 7.5 : 13}" y="11.5" width="${dual ? 33 : 22}" height="10" fill="#090d14"/>
        ${dual
          ? '<circle cx="17" cy="16.5" r="4.5" fill="#94a3b8" stroke="#fde047" stroke-width="1.2"/><circle cx="17" cy="16.5" r="1.6" fill="#fde047"/><circle cx="31" cy="16.5" r="4.5" fill="#94a3b8" stroke="#fde047" stroke-width="1.2"/><circle cx="31" cy="16.5" r="1.6" fill="#fde047"/>'
          : '<circle cx="24" cy="16.5" r="5.5" fill="#94a3b8" stroke="#fde047" stroke-width="1.3"/><circle cx="24" cy="16.5" r="2" fill="#fde047"/>'}
        <text x="24" y="42.5" text-anchor="middle" fill="#fcd34d" font-size="8.5" font-weight="700">${dual ? 'AR111雙燈' : 'AR111盒燈'}</text>`;
    } else if (k === 'linear-pendant') {
      body = `
        <polygon points="7,18 41,18 44,9 4,9" fill="url(#lxGlow)" opacity="0.35"/>
        <polygon points="6,21 42,21 46,41 2,41" fill="url(#lxGlow)" opacity="0.65"/>
        <line x1="13" y1="4" x2="13" y2="18" stroke="#94a3b8" stroke-width="1"/>
        <line x1="35" y1="4" x2="35" y2="18" stroke="#94a3b8" stroke-width="1"/>
        <rect x="6" y="17.5" width="36" height="4" rx="1.5" fill="#e2e8f0" stroke="#64748b" stroke-width="0.9"/>
        <rect x="8" y="20" width="32" height="1.5" fill="#fef08a"/>
        <text x="24" y="42.5" text-anchor="middle" fill="#93c5fd" font-size="8.5" font-weight="700">線型吊燈</text>`;
    } else {
      // highbay / default
      body = `
        <polygon points="10,23 38,23 45,42 3,42" fill="url(#lxGlow)" opacity="0.7"/>
        <circle cx="24" cy="8" r="2.2" fill="none" stroke="#94a3b8" stroke-width="1.2"/>
        <path d="M12,21 L17,11 L31,11 L36,21 Z" fill="#475569" stroke="#94a3b8" stroke-width="1"/>
        <ellipse cx="24" cy="21" rx="13" ry="3.2" fill="#fef08a" stroke="#64748b" stroke-width="1"/>
        <text x="24" y="42.5" text-anchor="middle" fill="#fde047" font-size="8.5" font-weight="700">天井燈</text>`;
    }

    return `<svg class="fx-thumb" width="${size}" height="${size}" viewBox="0 0 48 46" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="lxGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fde047" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.05"/>
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="47" height="45" rx="6" fill="#0b1118" stroke="#243041"/>
      ${body}
    </svg>`;
  }

  function inferThumbKind(t) {
    const cat = t.category || '';
    if (cat.includes('9.5')) return (t.gen && t.gen.beam <= 65) ? 'dl-deep-95' : 'dl-wide-95';
    if (cat.includes('12')) return (t.gen && t.gen.beam <= 65) ? 'dl-deep-120' : 'dl-wide-120';
    if (cat.includes('15') || cat === '崁燈') return (t.gen && t.gen.beam <= 65) ? 'dl-deep-150' : 'dl-wide-150';
    if (t.mount === 'track' || cat.includes('投射') || cat.includes('軌道')) return 'track-spot';
    if (t.mount === 'pendant' && (t.length || 0) > 0.8) return 'linear-pendant';
    if ((t.length || 0) >= 1.0 && (t.width || 0) <= 0.4) return 'panel-12030';
    if (t.shape === 'round') return 'dl-wide-150';
    return 'panel-6060';
  }

  LX.DEFAULT_LIBRARY = DEFAULT_LIBRARY;
  LX.fixtureThumbSvg = fixtureThumbSvg;
})((window.LX = window.LX || {}));
