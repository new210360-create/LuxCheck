const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);

const lightEntities = doc.entities.filter(e => /燈|light|lamp/i.test(e.layer));

// Deduplicate circles with same center
const downlights = [];
lightEntities.filter(e => e.type === 'CIRCLE').forEach(c => {
  const existing = downlights.find(d => Math.hypot(d.x - c.center.x, d.y - c.center.y) < 50); // within 50mm
  if (!existing) {
    downlights.push({ x: c.center.x, y: c.center.y, r: c.radius, layer: c.layer });
  } else {
    // keep larger radius
    if (c.radius > existing.r) existing.r = c.radius;
  }
});

console.log(`Unique downlights after center dedup: ${downlights.length}`);
console.log('Sample radii of unique downlights:', downlights.slice(0, 10).map(d => Math.round(d.r)));
