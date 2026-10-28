const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);

function getBounds(entities) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  entities.forEach(e => {
    const pts = [];
    if (e.position) pts.push(e.position);
    if (e.center) pts.push(e.center);
    if (e.startPoint) pts.push(e.startPoint);
    if (e.endPoint) pts.push(e.endPoint);
    if (e.vertices) e.vertices.forEach(v => pts.push(v));
    pts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
  });
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

// 1F Lighting Sheet bounds: X in [-30000, -8000], Y in [-2000, 18000]
// 2F Lighting Sheet bounds: X in [-5000, 15000], Y in [-2000, 18000]

[
  { name: '1F 燈具配置區', xMin: -30000, xMax: -8000, yMin: -2000, yMax: 18000 },
  { name: '2F 燈具配置區', xMin: -5000, xMax: 15000, yMin: -2000, yMax: 18000 }
].forEach(sheet => {
  console.log(`\n=================== ${sheet.name} ===================`);
  const sheetEntities = (doc.entities || []).filter(e => {
    const x = e.position?.x ?? e.center?.x ?? e.startPoint?.x ?? (e.vertices ? e.vertices[0].x : NaN);
    const y = e.position?.y ?? e.center?.y ?? e.startPoint?.y ?? (e.vertices ? e.vertices[0].y : NaN);
    return x >= sheet.xMin && x <= sheet.xMax && y >= sheet.yMin && y <= sheet.yMax;
  });
  console.log(`Entities count in ${sheet.name}: ${sheetEntities.length}`);

  // Texts
  const texts = sheetEntities.filter(e => e.type === 'TEXT' || e.type === 'MTEXT').map(e => (e.text || e.string || '').replace(/\\f[^;]+;/g, '').replace(/[{}\\]/g, '').trim()).filter(Boolean);
  const meaningfulTexts = [...new Set(texts.filter(t => !/^[0-9.,+-]+$/.test(t) && t.length > 1))];
  console.log('Room / Annotation texts:', meaningfulTexts);

  // Lights
  const lights = sheetEntities.filter(e => e.layer === '新設-12-燈具');
  const panels = [];
  const downlights = [];
  lights.forEach(e => {
    if (e.type === 'LWPOLYLINE') {
      const xs = e.vertices.map(v => v.x), ys = e.vertices.map(v => v.y);
      const w = Math.round(Math.max(...xs) - Math.min(...xs)), h = Math.round(Math.max(...ys) - Math.min(...ys));
      if (w >= 400 && w <= 800 && h >= 400 && h <= 800) {
        panels.push({ x: +((Math.max(...xs) + Math.min(...xs)) / 2 / 1000).toFixed(3), y: +((Math.max(...ys) + Math.min(...ys)) / 2 / 1000).toFixed(3), w: w/1000, h: h/1000 });
      }
    } else if (e.type === 'CIRCLE') {
      const r = Math.round(e.radius);
      if (r === 50 || r === 75 || r === 45) {
        downlights.push({ x: +(e.center.x / 1000).toFixed(3), y: +(e.center.y / 1000).toFixed(3), r: r/1000 });
      }
    }
  });
  console.log(`Lights: 60x60 平板燈 x ${panels.length} 盞, 崁燈 x ${downlights.length} 盞`);

  // Furniture / Desks
  const furniture = sheetEntities.filter(e => /家具|desk|table/i.test(e.layer));
  console.log(`Furniture entities count: ${furniture.length}`);
  const deskPolys = [];
  furniture.forEach(e => {
    if (e.type === 'LWPOLYLINE' && e.vertices && (e.shape || e.vertices.length >= 4)) {
      const xs = e.vertices.map(v => v.x), ys = e.vertices.map(v => v.y);
      const w = Math.round(Math.max(...xs) - Math.min(...xs)), h = Math.round(Math.max(...ys) - Math.min(...ys));
      // filter typical desk sizes: width/length between 0.6m and 4.0m
      if ((w >= 600 && w <= 4000 && h >= 500 && h <= 2000) || (h >= 600 && h <= 4000 && w >= 500 && w <= 2000)) {
        deskPolys.push({
          x: +((Math.max(...xs) + Math.min(...xs)) / 2 / 1000).toFixed(3),
          y: +((Math.max(...ys) + Math.min(...ys)) / 2 / 1000).toFixed(3),
          w: w / 1000,
          h: h / 1000,
          layer: e.layer
        });
      }
    }
  });
  console.log(`Recognized desk/table rectangles: ${deskPolys.length}`);
  if (deskPolys.length > 0) {
    console.log('Sample desk rectangles (m):', deskPolys.slice(0, 10));
  }

  // Room overall dimensions (from walls/lights bounds)
  const b = getBounds(sheetEntities.filter(e => /牆|柱|新設-10-天花/i.test(e.layer)));
  console.log(`Zone dimension approx: ${(b.w / 1000).toFixed(2)} m x ${(b.h / 1000).toFixed(2)} m`);
});
