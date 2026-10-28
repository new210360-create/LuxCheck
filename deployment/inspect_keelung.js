const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

console.log('Reading DXF...');
const dxfString = fs.readFileSync('D:/codex/keelung.dxf', 'utf8');
console.log('DXF length:', dxfString.length);

const parser = new DxfParser();
const doc = parser.parseSync(dxfString);
console.log('INSUNITS:', doc.header ? doc.header['$INSUNITS'] : 'none');

const layers = {};
const blocks = {};
const entitiesByType = {};

if (doc.entities) {
  doc.entities.forEach(e => {
    layers[e.layer] = (layers[e.layer] || 0) + 1;
    entitiesByType[e.type] = (entitiesByType[e.type] || 0) + 1;
    if (e.type === 'INSERT') {
      blocks[e.name] = (blocks[e.name] || 0) + 1;
    }
  });
}

console.log('Entities by type:', entitiesByType);
console.log('Active layers count:', Object.keys(layers).length);

// Print all layers sorted
console.log('\n--- ALL LAYERS ---');
Object.entries(layers).sort((a,b) => a[0].localeCompare(b[0])).forEach(([k,v]) => {
  console.log(`Layer: "${k}" (${v})`);
});

console.log('\n--- BLOCKS (INSERTS) ---');
Object.entries(blocks).sort((a,b) => b[1] - a[1]).slice(0, 50).forEach(([k,v]) => {
  console.log(`Block: "${k}" (${v})`);
});

// Also check blocks defined in doc.blocks
if (doc.blocks) {
  console.log('\nTotal defined blocks in doc.blocks:', Object.keys(doc.blocks).length);
  const blockKeys = Object.keys(doc.blocks);
  const matchingBlocks = blockKeys.filter(k => /light|lamp|lum|desk|table|桌|燈|照/i.test(k));
  console.log('Matching block definitions:', matchingBlocks);
}
