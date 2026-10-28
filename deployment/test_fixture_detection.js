const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);

console.log('Doc entities count:', doc.entities.length);
const lightEntities = doc.entities.filter(e => /燈|light|lamp/i.test(e.layer));
console.log('Light entities count:', lightEntities.length);

// Analyze shapes
let circleCount = 0, panelCount = 0, otherCount = 0;
lightEntities.forEach(e => {
  if (e.type === 'CIRCLE') {
    circleCount++;
  } else if (e.type === 'LWPOLYLINE' && e.vertices) {
    const xs = e.vertices.map(v => v.x), ys = e.vertices.map(v => v.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (w >= 400 && w <= 800 && h >= 400 && h <= 800) panelCount++;
    else otherCount++;
  } else {
    otherCount++;
  }
});

console.log(`Circles (downlights): ${circleCount}, Panels (60x60): ${panelCount}, Others: ${otherCount}`);
