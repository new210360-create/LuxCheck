const fs = require('fs');
const DxfParser = require('D:/codex/APP開發/LuxCheck/vendor/dxf-parser.js');

const dxfString = fs.readFileSync('D:/codex/test_clean.dxf', 'utf8');
const parser = new DxfParser();
const doc = parser.parseSync(dxfString);
const scale = 0.001;

// 1. Extract lights
const lightEntities = (doc.entities || []).filter(e => /燈|light|lamp/i.test(e.layer));
const fixtures = [];
const seenFix = [];

lightEntities.forEach(e => {
  if (e.type === 'LWPOLYLINE' && e.vertices) {
    const xs = e.vertices.map(v => v.x * scale), ys = e.vertices.map(v => v.y * scale);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (w >= 0.4 && w <= 0.8 && h >= 0.4 && h <= 0.8) {
      if (!seenFix.some(p => Math.hypot(p.x - cx, p.y - cy) < 0.2)) {
        seenFix.push({ x: cx, y: cy });
        fixtures.push({
          id: 'p' + fixtures.length,
          typeId: 'dl-panel-6060-ugr19',
          name: '舞光 60×60 平板燈 30W',
          x: cx, y: cy, z: 2.7,
          lm: 3300, w: 30, beam: 85
        });
      }
    }
  } else if (e.type === 'CIRCLE') {
    const cx = e.center.x * scale, cy = e.center.y * scale;
    if (!seenFix.some(p => Math.hypot(p.x - cx, p.y - cy) < 0.2)) {
      seenFix.push({ x: cx, y: cy });
      fixtures.push({
        id: 'd' + fixtures.length,
        typeId: 'dl-95-bd-12w',
        name: '舞光 9.5cm 崁燈 12W',
        x: cx, y: cy, z: 2.7,
        lm: 1050, w: 12, beam: 36
      });
    }
  }
});

console.log(`Extracted fixtures: ${fixtures.length} 盞`);

// 2. Extract walls
const wallLayers = [ 'WALL-IN', '01-結構柱', '02-結構牆', '10-新作牆', '既有-01-結構柱', '既有-02-結構牆' ];
const wallEntities = (doc.entities || []).filter(e => wallLayers.includes(e.layer));
const rawSegments = [];

wallEntities.forEach(e => {
  if (e.type === 'LINE') {
    rawSegments.push([e.vertices[0].x * scale, e.vertices[0].y * scale, e.vertices[1].x * scale, e.vertices[1].y * scale]);
  } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
    const v = e.vertices || [];
    for (let i = 0; i < v.length - 1; i++) {
      rawSegments.push([v[i].x * scale, v[i].y * scale, v[i+1].x * scale, v[i+1].y * scale]);
    }
    if (e.shape && v.length > 2) {
      rawSegments.push([v[v.length-1].x * scale, v[v.length-1].y * scale, v[0].x * scale, v[0].y * scale]);
    }
  }
});

// Filter tiny segments (< 0.05m)
const walls = rawSegments.filter(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) >= 0.05).map(([x1, y1, x2, y2]) => ({
  x1, y1, x2, y2,
  minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
  minY: Math.min(y1, y2), maxY: Math.max(y1, y2),
  height: 2.8
}));

console.log(`Extracted wall segments (≥5cm): ${walls.length} 段`);

// Fast 2D segment-segment intersection test
function intersects(ax, ay, bx, by, cx, cy, dx, dy) {
  const d0 = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d0) < 1e-9) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d0;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d0;
  if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) return t;
  return null;
}

function isOccluded(sx, sy, sz, gx, gy, gz, wallList) {
  const minRx = Math.min(sx, gx), maxRx = Math.max(sx, gx);
  const minRy = Math.min(sy, gy), maxRy = Math.max(sy, gy);

  for (let k = 0; k < wallList.length; k++) {
    const w = wallList[k];
    if (minRx > w.maxX || maxRx < w.minX || minRy > w.maxY || maxRy < w.minY) continue;
    const t = intersects(sx, sy, gx, gy, w.x1, w.y1, w.x2, w.y2);
    if (t !== null) {
      const zRay = sz + t * (gz - sz);
      if (zRay <= w.height) return true; // blocked by wall!
    }
  }
  return false;
}

// Test ray occlusion on a grid of sample points
console.log('Testing wall occlusion speed and realism...');
const t0 = Date.now();
let occludedCount = 0, totalTests = 0;

for (let i = 0; i < fixtures.length; i++) {
  const f = fixtures[i];
  // Sample 200 points across the room
  for (let x = 28; x <= 68; x += 1.0) {
    for (let y = 59; y <= 67; y += 1.0) {
      totalTests++;
      if (isOccluded(f.x, f.y, f.z, x, y, 0.75, walls)) {
        occludedCount++;
      }
    }
  }
}

const dt = Date.now() - t0;
console.log(`Executed ${totalTests} ray-wall tests in ${dt} ms (${(dt/totalTests*1000).toFixed(1)} µs/test)`);
console.log(`Occluded rays: ${occludedCount} / ${totalTests} (${Math.round(occludedCount/totalTests*100)}% blocked by partition walls)`);
