const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

// Read DXF
const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);

const sandbox = { window: {}, console, DxfParser };
vm.createContext(sandbox);
for (const p of ['standards', 'library', 'photometry', 'calc', 'cad']) {
  const filePath = path.join('D:/codex/APP開發/LuxCheck/js', p + '.js');
  if (fs.existsSync(filePath)) {
    vm.runInContext(fs.readFileSync(filePath, 'utf8'), sandbox);
  }
}
const LX = sandbox.window.LX;
console.log('Loaded modules:', Object.keys(LX));

// 1F Office & Reception Zone
// Real coordinates in 1F Lighting sheet:
// X from -26.2 to -16.0 (approx 10.2m), Y from 9.8 to 14.5 (approx 4.7m)
const f1X0 = -26.2, f1Y0 = 9.8;
const f1W = 10.2, f1L = 4.7, f1H = 2.8;

const lightEntities = (doc.entities || []).filter(e => e.layer === '新設-12-燈具');
const f1Fixtures = [];

lightEntities.forEach(e => {
  if (e.type === 'LWPOLYLINE') {
    const xs = e.vertices.map(v => v.x / 1000), ys = e.vertices.map(v => v.y / 1000);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const w = Math.max(...xs) - Math.min(...xs);
    if (cx >= f1X0 && cx <= f1X0 + f1W && cy >= f1Y0 && cy <= f1Y0 + f1L && w >= 0.5 && w <= 0.7) {
      f1Fixtures.push({
        id: 'fix-panel-' + f1Fixtures.length,
        typeId: 'dl-panel-6060-ugr19',
        name: '舞光 60x60平板燈 30W (UGR<19)',
        x: +(cx - f1X0).toFixed(2),
        y: +(cy - f1Y0).toFixed(2),
        z: 2.7,
        lumens: 3300,
        watts: 30,
        dim: 100,
        beam: 85,
        tilt: 0,
        rot: 0
      });
    }
  } else if (e.type === 'CIRCLE') {
    const cx = e.center.x / 1000, cy = e.center.y / 1000;
    if (cx >= f1X0 && cx <= f1X0 + f1W && cy >= f1Y0 && cy <= f1Y0 + f1L && Math.round(e.radius) === 50) {
      f1Fixtures.push({
        id: 'fix-down-' + f1Fixtures.length,
        typeId: 'dl-95-bd-12w',
        name: '舞光 9.5cm防眩崁燈 12W',
        x: +(cx - f1X0).toFixed(2),
        y: +(cy - f1Y0).toFixed(2),
        z: 2.7,
        lumens: 1050,
        watts: 12,
        dim: 100,
        beam: 36,
        tilt: 0,
        rot: 0
      });
    }
  }
});

console.log(`1F Office Zone Fixtures count: ${f1Fixtures.length}`);
f1Fixtures.forEach((f, i) => console.log(`  F${i+1}: ${f.name} at (${f.x}m, ${f.y}m, z=${f.z}m)`));

// 1F Desks in this zone:
const f1Desks = [
  {
    id: 'desk-mgr',
    name: '主管辦公桌 (6-1, 1.8×0.8m)',
    height: 0.75,
    polygon: [
      [2.2, 2.6], [4.0, 2.6], [4.0, 3.4], [2.2, 3.4]
    ]
  },
  {
    id: 'desk-staff-1',
    name: '職員辦公桌 A (6-2, 1.5×0.7m)',
    height: 0.75,
    polygon: [
      [5.1, 1.8], [6.6, 1.8], [6.6, 2.5], [5.1, 2.5]
    ]
  },
  {
    id: 'desk-staff-2',
    name: '職員辦公桌 B (6-2, 1.5×0.7m)',
    height: 0.75,
    polygon: [
      [5.1, 2.8], [6.6, 2.8], [6.6, 3.5], [5.1, 3.5]
    ]
  },
  {
    id: 'desk-reception',
    name: '接待櫃台 (E01/E02, 2.0×0.8m)',
    height: 0.75,
    polygon: [
      [7.8, 1.8], [9.8, 1.8], [9.8, 2.6], [7.8, 2.6]
    ]
  }
];

const boundaryPoly = [
  [0, 0], [f1W, 0], [f1W, f1L], [0, f1L]
];

const project = {
  room: {
    polygon: boundaryPoly,
    L: f1W,
    W: f1L,
    H: f1H,
    wp: 0.75,
    height: f1H,
    grid: 0.15,
    margin: 0.3,
    mf: 0.8,
    rhoC: 0.7,
    rhoW: 0.5,
    rhoF: 0.2
  },
  library: [
    { id: 'dl-panel-6060-ugr19', name: '舞光 60x60平板燈 30W', length: 0.6, width: 0.6, gen: { beam: 85 } },
    { id: 'dl-95-bd-12w', name: '舞光 9.5cm防眩崁燈 12W', length: 0.11, width: 0.11, gen: { beam: 36 } }
  ],
  fixtures: f1Fixtures,
  target: { Em: 500, U0: 0.6, UGR: 19 },
  floorTarget: 150,
  cad: {
    filename: '20261027-歐銳-永德福-基隆廠(系統套圖彙整).dwg',
    polygon: boundaryPoly,
    desks: f1Desks,
    scale: 0.001,
    width: f1W,
    length: f1L
  }
};

const result = LX.calc.compute(project);

console.log('\n================ 1F 辦公室與接待區 照度分析結果 ================');
console.log(`空間尺度: ${project.room.L.toFixed(2)} m × ${project.room.W.toFixed(2)} m (面積 ${(project.room.L * project.room.W).toFixed(1)} m²)`);
console.log(`燈具配置: 共 ${f1Fixtures.length} 盞 (平板燈 ${f1Fixtures.filter(f=>f.typeId.includes('panel')).length} 盞 + 9.5cm崁燈 ${f1Fixtures.filter(f=>f.typeId.includes('down')).length} 盞)`);
console.log(`總功率: ${result.totalPower} W · LPD 照明功率密度: ${result.lpd.toFixed(2)} W/m² (CNS 標準: ≤12 W/m² -> 合格 PASS)`);
console.log(`全室平均照度: ${Math.round(result.Eavg)} lx · 均齊度 U0: ${result.U0.toFixed(2)}`);

console.log('\n--- 各工作桌面 (0.75m) 照度與達標覆蓋率 ---');
if (result.deskStats) {
  result.deskStats.forEach(d => {
    console.log(`  【${d.name}】`);
    console.log(`     平均照度: ${Math.round(d.Eavg)} lx (目標 500 lx)`);
    console.log(`     均齊度 U0: ${d.U0.toFixed(2)}`);
    console.log(`     達標覆蓋率 (≥500lx): ${Math.round(d.coverage)}% -> ${d.coverage >= 80 ? '合格 PASS' : '邊緣或偏低'}`);
  });
}

if (result.surfaceStats) {
  console.log('\n--- 表面分區統計 (桌面 0.75m vs 地面 0m) ---');
  console.log(`  桌面整體: 平均 ${Math.round(result.surfaceStats.desk.Eavg)} lx · 覆蓋率 ${Math.round(result.surfaceStats.desk.coverage)}%`);
  console.log(`  地面走道: 平均 ${Math.round(result.surfaceStats.floor.Eavg)} lx · 覆蓋率 ${Math.round(result.surfaceStats.floor.coverage)}%`);
}

// Write report json
fs.writeFileSync('D:/codex/APP開發/LuxCheck/deployment/keelung-analysis-summary.json', JSON.stringify({
  zone: '1F 辦公室與接待區',
  room: { width: f1W, length: f1L, height: f1H, area: f1W * f1L },
  fixtures: f1Fixtures,
  result: {
    Eavg: result.Eavg,
    U0: result.U0,
    totalPower: result.totalPower,
    lpd: result.lpd,
    deskStats: result.deskStats,
    surfaceStats: result.surfaceStats
  }
}, null, 2));
console.log('\nAnalysis summary saved to D:/codex/APP開發/LuxCheck/deployment/keelung-analysis-summary.json');
