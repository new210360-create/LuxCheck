const fs = require('fs');
const path = require('path');

// Read analysis summary
const summary = JSON.parse(fs.readFileSync('D:/codex/APP開發/LuxCheck/deployment/keelung-analysis-summary.json', 'utf8'));

// Load default library
const libCode = fs.readFileSync('D:/codex/APP開發/LuxCheck/js/library.js', 'utf8');
const vm = require('vm');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(libCode, sandbox);
const defaultLibrary = sandbox.window.LX.DEFAULT_LIBRARY;

const f1W = 10.2, f1L = 4.7, f1H = 2.8;

const boundaryPoly = [
  [0, 0], [f1W, 0], [f1W, f1L], [0, f1L]
];

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

const project = {
  version: 1,
  name: '永德福 - 基隆廠 1F辦公室與接待區（施工圖帶入）',
  cad: {
    filename: '20261027-歐銳-永德福-基隆廠(系統套圖彙整).dwg',
    width: f1W,
    length: f1L,
    scale: 0.001,
    origin: [-26.2, 14.5],
    polygon: boundaryPoly,
    desks: f1Desks
  },
  room: {
    shape: 'rect',
    L: f1W,
    W: f1L,
    H: f1H,
    height: f1H,
    wp: 0,
    margin: 0.3,
    mf: 0.8,
    rhoC: 0.7,
    rhoW: 0.5,
    rhoF: 0.2,
    grid: 0,
    polygon: boundaryPoly
  },
  standardId: 'office-open',
  target: { Em: 500, UGR: 19, U0: 0.6, Ra: 80 },
  floorTarget: 150,
  lpdLimit: 12.0,
  library: defaultLibrary,
  fixtures: summary.fixtures.map((f, i) => ({
    id: 'f' + (i + 1),
    typeId: f.typeId,
    name: f.name,
    x: f.x,
    y: f.y,
    z: f.z,
    lumens: f.lumens,
    watts: f.watts,
    dim: 100,
    beam: f.beam,
    tilt: f.tilt,
    rot: f.rot
  }))
};

fs.writeFileSync('D:/codex/APP開發/LuxCheck/samples/keelung-project.json', JSON.stringify(project, null, 2), 'utf8');
console.log('Saved samples/keelung-project.json! Fixtures count:', project.fixtures.length);
