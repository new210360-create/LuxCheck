const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);

// Let's inspect the 1F lighting drawing area (around Y in [0, 20000], X in [-30000, -10000])
// and 2F lighting drawing area (around Y in [0, 20000], X in [-5000, 15000])
// But wait! Where are the furniture in the lighting drawing vs the furniture in the plan drawing?
// Let's check the Y-offsets between "1F - 平面配置圖" (Y=56493) and "1F - 燈具配置圖" (Y=4461)
const dy1F = 56493 - 4461; // 52032 mm = 52.032 m offset!
console.log('1F Y-offset between Plan and Lighting:', dy1F);

// Let's verify if the architectural boundary / walls are repeated at each drawing sheet,
// or if each drawing sheet contains its own copy of walls!
const wallEntities = (doc.entities || []).filter(e => /牆|柱|wall|col/i.test(e.layer));
console.log('Total wall/column entities:', wallEntities.length);

// Group wall entities by Y-cluster
const yBuckets = {};
wallEntities.forEach(e => {
  const y = Math.round((e.position?.y || e.startPoint?.y || (e.vertices ? e.vertices[0].y : 0)) / 10000) * 10;
  yBuckets[y] = (yBuckets[y] || 0) + 1;
});
console.log('Wall entities count by Y (x1000 mm):', yBuckets);

// Let's find out which sheet has BOTH furniture and lighting, or if lighting is on Y≈4461 and furniture on Y≈56493 or Y≈-29894!
const furEntities = (doc.entities || []).filter(e => /家具|desk|table/i.test(e.layer));
console.log('\nTotal furniture entities:', furEntities.length);
const furYBuckets = {};
furEntities.forEach(e => {
  const y = Math.round((e.position?.y || e.startPoint?.y || (e.vertices ? e.vertices[0].y : 0)) / 10000) * 10;
  furYBuckets[y] = (furYBuckets[y] || 0) + 1;
});
console.log('Furniture entities count by Y (x1000 mm):', furYBuckets);

// Check if furniture is present in Y ≈ [0, 20000] (the lighting plan sheet!)
const furInLightingSheet = furEntities.filter(e => {
  const y = e.position?.y || e.startPoint?.y || (e.vertices ? e.vertices[0].y : 0);
  return y > -5000 && y < 20000;
});
console.log('Furniture entities physically inside Lighting Sheet (Y: -5k ~ 20k):', furInLightingSheet.length);

// Check furniture in Plan sheet (Y: 45k ~ 70k)
const furInPlanSheet = furEntities.filter(e => {
  const y = e.position?.y || e.startPoint?.y || (e.vertices ? e.vertices[0].y : 0);
  return y > 45000 && y < 75000;
});
console.log('Furniture entities in Plan Sheet (Y: 45k ~ 75k):', furInPlanSheet.length);
