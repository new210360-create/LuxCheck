const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);

// Find anchor points (like title block text "永德福 - 基隆廠" or "1:50")
const p1F_Plan = (doc.entities || []).filter(e => (e.text || e.string || '').includes('1 F -平面配置圖') || (e.text || e.string || '').includes('1 F - 平面配置圖'))[0];
const p1F_Light = (doc.entities || []).filter(e => (e.text || e.string || '').includes('1 F - 燈具配置圖'))[0];
console.log('1F Plan title pos:', p1F_Plan ? { x: p1F_Plan.position?.x, y: p1F_Plan.position?.y } : 'none');
console.log('1F Light title pos:', p1F_Light ? { x: p1F_Light.position?.x, y: p1F_Light.position?.y } : 'none');

const p2F_Plan = (doc.entities || []).filter(e => (e.text || e.string || '').includes('2 F - 平面配置圖'))[0];
const p2F_Light = (doc.entities || []).filter(e => (e.text || e.string || '').includes('2 F - 燈具配置圖'))[0];
console.log('2F Plan title pos:', p2F_Plan ? { x: p2F_Plan.position?.x, y: p2F_Plan.position?.y } : 'none');
console.log('2F Light title pos:', p2F_Light ? { x: p2F_Light.position?.x, y: p2F_Light.position?.y } : 'none');

const dy1 = p1F_Plan.position.y - p1F_Light.position.y;
const dx1 = p1F_Plan.position.x - p1F_Light.position.x;
console.log(`1F Delta (Plan -> Light): dx = ${dx1}, dy = ${dy1}`);

const dy2 = p2F_Plan.position.y - p2F_Light.position.y;
const dx2 = p2F_Plan.position.x - p2F_Light.position.x;
console.log(`2F Delta (Plan -> Light): dx = ${dx2}, dy = ${dy2}`);

// Let's inspect all desks in 1F Plan sheet (Y in [50000, 70000], X in [-30000, -8000])
const fur1F = (doc.entities || []).filter(e => {
  const x = e.position?.x ?? e.startPoint?.x ?? (e.vertices ? e.vertices[0].x : NaN);
  const y = e.position?.y ?? e.startPoint?.y ?? (e.vertices ? e.vertices[0].y : NaN);
  return x >= -30000 && x <= -8000 && y >= 50000 && y <= 72000 && /家具|desk|table|櫃/i.test(e.layer);
});
console.log(`\nFurniture in 1F Plan Sheet: ${fur1F.length}`);

// Let's map their positions translated by -dy1 into 1F Light Sheet!
// Let's check desk text labels in 1F Plan sheet:
const planLabels = (doc.entities || []).filter(e => {
  const x = e.position?.x ?? 0;
  const y = e.position?.y ?? 0;
  return x >= -30000 && x <= -8000 && y >= 50000 && y <= 72000 && (e.type === 'TEXT' || e.type === 'MTEXT');
}).map(e => ({
  text: (e.text || e.string || '').replace(/\\f[^;]+;/g, '').replace(/[{}\\]/g, '').trim(),
  x: Math.round(e.position?.x || 0),
  y: Math.round(e.position?.y || 0)
})).filter(t => /辦公|主管|會議|接待|櫃|桌/i.test(t.text));
console.log('1F Plan Desk/Workstation labels:');
planLabels.forEach(l => {
  console.log(`  "${l.text}" at Plan (${(l.x/1000).toFixed(2)}, ${(l.y/1000).toFixed(2)}) -> Light Sheet (${(l.x/1000).toFixed(2)}, ${((l.y - dy1)/1000).toFixed(2)})`);
});

// Same for 2F Plan sheet:
const plan2FLabels = (doc.entities || []).filter(e => {
  const x = e.position?.x ?? 0;
  const y = e.position?.y ?? 0;
  return x >= -5000 && x <= 15000 && y >= 50000 && y <= 72000 && (e.type === 'TEXT' || e.type === 'MTEXT');
}).map(e => ({
  text: (e.text || e.string || '').replace(/\\f[^;]+;/g, '').replace(/[{}\\]/g, '').trim(),
  x: Math.round(e.position?.x || 0),
  y: Math.round(e.position?.y || 0)
})).filter(t => /辦公|主管|會議|接待|櫃|桌|多功能|技師/i.test(t.text));
console.log('\n2F Plan Workstation/Conference labels:');
plan2FLabels.forEach(l => {
  console.log(`  "${l.text}" at Plan (${(l.x/1000).toFixed(2)}, ${(l.y/1000).toFixed(2)}) -> Light Sheet (${(l.x/1000).toFixed(2)}, ${((l.y - dy2)/1000).toFixed(2)})`);
});
