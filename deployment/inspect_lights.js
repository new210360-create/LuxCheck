const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);

// Inspect text layers to see space names / room names
console.log('--- TEXT & ROOM LABELS ---');
const texts = [];
if (doc.entities) {
  doc.entities.forEach(e => {
    if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const txt = (e.text || e.string || '').trim();
      if (txt && !/^[0-9.,+-]+$/.test(txt)) {
        texts.push({ layer: e.layer, text: txt, x: Math.round(e.position?.x || e.startPoint?.x || 0), y: Math.round(e.position?.y || e.startPoint?.y || 0) });
      }
    }
  });
}
console.log('Total texts:', texts.length);
const roomTexts = texts.filter(t => /辦公|會議|主管|廠|室|區|門廳|休憩|接待|茶水|展|倉/i.test(t.text));
console.log('Room/Space name candidates:');
roomTexts.forEach(t => console.log(`  [${t.layer}] "${t.text}" at (${t.x}, ${t.y})`));

// Inspect entities on '新設-12-燈具'
console.log('\n--- LIGHTING LAYER: 新設-12-燈具 ---');
const lightEntities = (doc.entities || []).filter(e => e.layer === '新設-12-燈具');
console.log('Total light entities:', lightEntities.length);
const lightTypes = {};
lightEntities.forEach(e => {
  lightTypes[e.type] = (lightTypes[e.type] || 0) + 1;
});
console.log('Light entity types:', lightTypes);

// Sample light entities
console.log('Sample CIRCLE / LWPOLYLINE on light layer:');
const circles = lightEntities.filter(e => e.type === 'CIRCLE');
console.log(`Circles count: ${circles.length}. Sample radii (mm):`, circles.slice(0, 10).map(c => Math.round(c.radius)));
const radiiCount = {};
circles.forEach(c => {
  const r = Math.round(c.radius);
  radiiCount[r] = (radiiCount[r] || 0) + 1;
});
console.log('Radii distribution (radius in mm):', radiiCount);

// Check polygons/rectangles on light layer
const polylines = lightEntities.filter(e => e.type === 'LWPOLYLINE');
console.log(`Polylines count: ${polylines.length}`);
polylines.slice(0, 10).forEach((p, idx) => {
  const pts = p.vertices || [];
  console.log(`  Polyline #${idx+1}: closed=${p.shape}, vertices=${pts.length}`);
  if (pts.length === 4 || pts.length === 5) {
    const xs = pts.map(v => v.x), ys = pts.map(v => v.y);
    const w = Math.round(Math.max(...xs) - Math.min(...xs));
    const h = Math.round(Math.max(...ys) - Math.min(...ys));
    console.log(`    Bounding size: ${w} mm x ${h} mm`);
  }
});

// Check bounding box of all light entities
const lx = lightEntities.map(e => e.position?.x || e.center?.x || (e.vertices ? e.vertices[0].x : 0)).filter(Boolean);
const ly = lightEntities.map(e => e.position?.y || e.center?.y || (e.vertices ? e.vertices[0].y : 0)).filter(Boolean);
console.log('Light entities bounding box (mm):', {
  minX: Math.min(...lx), maxX: Math.max(...lx),
  minY: Math.min(...ly), maxY: Math.max(...ly),
  width: (Math.max(...lx) - Math.min(...lx)),
  height: (Math.max(...ly) - Math.min(...ly))
});

// Inspect '新設-13-燈具標註'
console.log('\n--- LIGHTING ANNOTATIONS: 新設-13-燈具標註 ---');
const lightNotes = (doc.entities || []).filter(e => e.layer === '新設-13-燈具標註');
lightNotes.forEach(e => {
  console.log(`  [${e.type}] text: "${e.text || e.string}"`);
});
