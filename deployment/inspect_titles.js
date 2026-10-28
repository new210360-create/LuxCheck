const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);

// Find all drawing titles (usually text containing '配置圖', '平面圖', '天花', '燈具')
const titles = [];
(doc.entities || []).forEach(e => {
  if (e.type === 'TEXT' || e.type === 'MTEXT') {
    const txt = (e.text || e.string || '').replace(/\\f[^;]+;/g, '').replace(/[{}\\]/g, '').trim();
    if (/配置圖|平面圖|圖名|1F|2F|燈具/i.test(txt) && txt.length < 50) {
      titles.push({
        layer: e.layer,
        text: txt,
        x: Math.round(e.position?.x || e.startPoint?.x || 0),
        y: Math.round(e.position?.y || e.startPoint?.y || 0)
      });
    }
  }
});

console.log('--- DRAWING TITLES IN DWG ---');
titles.forEach(t => console.log(`  [${t.layer}] "${t.text}" at (${t.x}, ${t.y})`));

// Check where 1F vs 2F 燈具 are located
const lightEntities = (doc.entities || []).filter(e => e.layer === '新設-12-燈具');
console.log('\n--- LIGHT ENTITIES DISTRIBUTION ---');
const panels = [];
const downlights = [];

lightEntities.forEach(e => {
  if (e.type === 'LWPOLYLINE') {
    const pts = e.vertices || [];
    const xs = pts.map(v => v.x), ys = pts.map(v => v.y);
    const w = Math.round(Math.max(...xs) - Math.min(...xs));
    const h = Math.round(Math.max(...ys) - Math.min(...ys));
    if (w >= 500 && w <= 700 && h >= 500 && h <= 700) {
      panels.push({
        x: Math.round((Math.max(...xs) + Math.min(...xs)) / 2),
        y: Math.round((Math.max(...ys) + Math.min(...ys)) / 2),
        w, h
      });
    }
  } else if (e.type === 'CIRCLE') {
    const r = Math.round(e.radius);
    if (r === 50 || r === 75 || r === 45) { // outer ring of downlight
      downlights.push({
        x: Math.round(e.center.x),
        y: Math.round(e.center.y),
        r
      });
    }
  }
});

console.log(`Detected 60x60 Panels count: ${panels.length}`);
console.log(`Detected Downlights (outer circle r=50/75) count: ${downlights.length}`);

// Sample positions
console.log('Sample Panels (x, y mm):', panels.slice(0, 10));
console.log('Sample Downlights (x, y mm):', downlights.slice(0, 10));

// Check clustering / X and Y ranges
const allLights = [...panels, ...downlights];
const minX = Math.min(...allLights.map(l => l.x)), maxX = Math.max(...allLights.map(l => l.x));
const minY = Math.min(...allLights.map(l => l.y)), maxY = Math.max(...allLights.map(l => l.y));
console.log(`Lights coordinate bounds (mm): X: [${minX}, ${maxX}], Y: [${minY}, ${maxY}]`);
