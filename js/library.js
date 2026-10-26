/* =========================================================================
 * library.js — 預設常用辦公燈具庫（通用規格，非特定品牌）
 *   gen: 以產生器建立配光參數；iesTable: 匯入的配光表（序列化）
 *   mount: 'recessed' 崁入（燈具高度 = 天花高度）/ 'pendant' 吊掛 / 'surface' 吸頂 / 'track' 軌道
 * ========================================================================= */
(function (LX) {
  'use strict';

  const DEFAULT_LIBRARY = [
    {
      id: 'panel-6060-36', name: 'LED 平板燈 60×60', category: '平板燈',
      lumens: 3600, watts: 36, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 110 },
    },
    {
      id: 'panel-6060-ugr19', name: 'LED 防眩平板燈 60×60 (UGR<19)', category: '平板燈',
      lumens: 3400, watts: 30, cct: 4000, cri: 85, ugrClass: '<19',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 85 },
    },
    {
      id: 'panel-30120-40', name: 'LED 平板燈 30×120', category: '平板燈',
      lumens: 4000, watts: 40, cct: 4000, cri: 80, ugrClass: '<22',
      length: 1.2, width: 0.3, mount: 'recessed', shape: 'rect',
      gen: { beam: 110, beam90: 105 },
    },
    {
      id: 'troffer-3x-t8', name: 'LED 輕鋼架燈 (3 管等效) 60×60', category: '輕鋼架燈',
      lumens: 4200, watts: 42, cct: 5000, cri: 80, ugrClass: '<22',
      length: 0.6, width: 0.6, mount: 'recessed', shape: 'rect',
      gen: { beam: 95, beam90: 80 },
    },
    {
      id: 'linear-pend-dir-ind', name: 'LED 線型吊燈 直接/間接 240cm', category: '線型燈',
      lumens: 7200, watts: 60, cct: 4000, cri: 90, ugrClass: '<19',
      length: 2.4, width: 0.07, mount: 'pendant', shape: 'rect', suspension: 0.8,
      gen: { beam: 100, beam90: 70, upRatio: 0.35, upBeam: 120 },
    },
    {
      id: 'linear-pend-120', name: 'LED 線型吊燈 直接 120cm', category: '線型燈',
      lumens: 3800, watts: 32, cct: 4000, cri: 90, ugrClass: '<19',
      length: 1.2, width: 0.06, mount: 'pendant', shape: 'rect', suspension: 0.8,
      gen: { beam: 100, beam90: 65 },
    },
    {
      id: 'linear-recessed-120', name: 'LED 崁入線型燈 120cm', category: '線型燈',
      lumens: 3200, watts: 30, cct: 4000, cri: 85, ugrClass: '<22',
      length: 1.2, width: 0.075, mount: 'recessed', shape: 'rect',
      gen: { beam: 110, beam90: 90 },
    },
    {
      id: 'downlight-15-60', name: 'LED 防眩崁燈 Φ15cm 15W', category: '崁燈',
      lumens: 1500, watts: 15, cct: 4000, cri: 90, ugrClass: '<19',
      length: 0.15, width: 0.15, mount: 'recessed', shape: 'round',
      gen: { beam: 60 },
    },
    {
      id: 'downlight-20-90', name: 'LED 崁燈 Φ20cm 22W', category: '崁燈',
      lumens: 2200, watts: 22, cct: 4000, cri: 80, ugrClass: '<22',
      length: 0.2, width: 0.2, mount: 'recessed', shape: 'round',
      gen: { beam: 90 },
    },
    {
      id: 'downlight-10-36', name: 'LED 重點崁燈 Φ10cm 9W', category: '崁燈',
      lumens: 850, watts: 9, cct: 3000, cri: 90, ugrClass: '<16',
      length: 0.1, width: 0.1, mount: 'recessed', shape: 'round',
      gen: { beam: 36 },
    },
    {
      id: 'track-20-24', name: 'LED 軌道燈 20W 24°', category: '軌道燈',
      lumens: 1900, watts: 20, cct: 3000, cri: 95, ugrClass: '—',
      length: 0.1, width: 0.1, mount: 'track', shape: 'round', suspension: 0.15,
      gen: { beam: 24 },
    },
    {
      id: 'highbay-ufo-100', name: 'LED 天井燈 100W (挑高大廳)', category: '天井燈',
      lumens: 14000, watts: 100, cct: 5000, cri: 80, ugrClass: '—',
      length: 0.3, width: 0.3, mount: 'pendant', shape: 'round', suspension: 0.5,
      gen: { beam: 90 },
    },
  ];

  LX.DEFAULT_LIBRARY = DEFAULT_LIBRARY;
})((window.LX = window.LX || {}));
