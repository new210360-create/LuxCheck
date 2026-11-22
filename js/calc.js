/* =========================================================================
 * calc.js — 照度計算引擎
 *   直接光：逐點法 (Point-by-Point)，配光表雙線性內插，線型燈具分段
 *   間接光：積分球（分光通量）近似 — 均勻加在工作面
 *   UGR：CIE 117 公式 + Guth 位置指數，觀察者位於各牆中點、眼高 1.2 m
 * ========================================================================= */
(function (LX) {
  'use strict';

  const P = LX.photometry;
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  /* ---------------- 幾何工具 ---------------- */
  function polyArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
    return Math.abs(a / 2);
  }
  function polyPerimeter(poly) {
    let s = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
    return s;
  }
  function polyBounds(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distToPoly(x, y, poly) {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
      const vx = bx - ax, vy = by - ay;
      const L2 = vx * vx + vy * vy || 1e-9;
      let t = ((x - ax) * vx + (y - ay) * vy) / L2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (ax + t * vx), y - (ay + t * vy)));
    }
    return best;
  }

  /* ---------------- 配光表快取 ---------------- */
  const tableCache = new Map();
  function baseTable(type) {
    const key = type.id + '|base|' + (type._rev || 0);
    if (tableCache.has(key)) return tableCache.get(key);
    let tbl;
    if (type.table) tbl = P.deserializeTable(type.table);
    else tbl = P.generate(type.gen || { beam: 90 });
    tableCache.set(key, tbl);
    return tbl;
  }
  function tableFor(type, beam) {
    const base = baseTable(type);
    if (!beam || Math.abs(beam - base.beam) < 0.5) return base;
    const key = type.id + '|' + (type._rev || 0) + '|' + Math.round(beam * 2) / 2;
    if (tableCache.has(key)) return tableCache.get(key);
    let tbl;
    if (type.table) tbl = P.scaleBeam(base, beam);
    else {
      // 產生器型：等比例縮放兩個平面的光束角
      const g = Object.assign({}, type.gen);
      const k = beam / base.beam;
      g.beam = (g.beam || 90) * k;
      if (g.beam90) g.beam90 *= k;
      tbl = P.generate(g);
    }
    tableCache.set(key, tbl);
    return tbl;
  }
  function clearCache(typeId) {
    for (const k of Array.from(tableCache.keys())) if (!typeId || k.startsWith(typeId + '|')) tableCache.delete(k);
  }

  /* ---------------- 光源展開 ---------------- */
  function buildSources(project) {
    const lib = new Map(project.library.map((t) => [t.id, t]));
    const mf = project.room.mf;
    const out = [];
    for (const f of project.fixtures) {
      const type = lib.get(f.typeId);
      if (!type || f.on === false) continue;
      const tbl = tableFor(type, f.beam);
      const flux = f.lumens * (f.dim == null ? 1 : f.dim / 100) * mf;
      const len = type.length || 0.1;
      const nSeg = len > 0.5 ? Math.ceil(len / 0.4) : 1;
      const r = (f.rot || 0) * DEG;
      const t = (f.tilt || 0) * DEG;
      const cr = Math.cos(r), sr = Math.sin(r), ct = Math.cos(t), st = Math.sin(t);
      for (let s = 0; s < nSeg; s++) {
        const off = nSeg > 1 ? (-len / 2 + (len * (s + 0.5)) / nSeg) : 0;
        out.push({
          x: f.x + off * cr, y: f.y + off * sr, z: f.z,
          k: flux / 1000 / nSeg, tbl, cr, sr, ct, st, tilted: Math.abs(t) > 1e-6,
          area: (type.length || 0.1) * (type.width || 0.1) / nSeg,
          fixture: f,
        });
      }
    }
    return out;
  }

  /** 光源在方向 (dx,dy,dz) 的光強 (cd)；回傳 [I, gammaDeg] */
  function intensityToward(src, dx, dy, dz) {
    const x1 = dx * src.cr + dy * src.sr;
    let y1 = -dx * src.sr + dy * src.cr;
    let z1 = dz;
    if (src.tilted) {
      const y2 = y1 * src.ct + z1 * src.st;
      const z2 = -y1 * src.st + z1 * src.ct;
      y1 = y2; z1 = z2;
    }
    const d = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1) || 1e-9;
    const g = Math.acos(Math.max(-1, Math.min(1, -z1 / d))) * RAD;
    const c = Math.atan2(y1, x1) * RAD;
    return [P.lookup(src.tbl, c, g) * src.k, g];
  }

  function rayIntersectsWall(ax, ay, bx, by, cx, cy, dx, dy) {
    const d0 = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(d0) < 1e-9) return null;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d0;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d0;
    if (t > 0.002 && t < 0.998 && u > 0.002 && u < 0.998) return t;
    return null;
  }

  function isBlockedByWall(sx, sy, sz, gx, gy, gz, walls) {
    const minRx = Math.min(sx, gx), maxRx = Math.max(sx, gx);
    const minRy = Math.min(sy, gy), maxRy = Math.max(sy, gy);
    for (let k = 0; k < walls.length; k++) {
      const w = walls[k];
      if (minRx > (w.maxX ?? Math.max(w.x1, w.x2)) || maxRx < (w.minX ?? Math.min(w.x1, w.x2)) ||
          minRy > (w.maxY ?? Math.max(w.y1, w.y2)) || maxRy < (w.minY ?? Math.min(w.y1, w.y2))) continue;
      const t = rayIntersectsWall(sx, sy, gx, gy, w.x1 ?? w.p1[0], w.y1 ?? w.p1[1], w.x2 ?? w.p2[0], w.y2 ?? w.p2[1]);
      if (t !== null) {
        const zRay = sz + t * (gz - sz);
        if (zRay <= (w.height ?? 2.8)) return true;
      }
    }
    return false;
  }

  /** 建立隔間牆 2D 均勻空間網格索引（DDA 射線加速，將 O(W) 降至 O(√W)） */
  function buildWallIndex(walls, b) {
    const n = walls ? walls.length : 0;
    if (!n) return null;
    const x1 = new Float64Array(n), y1 = new Float64Array(n);
    const x2 = new Float64Array(n), y2 = new Float64Array(n);
    const minX = new Float64Array(n), maxX = new Float64Array(n);
    const minY = new Float64Array(n), maxY = new Float64Array(n);
    const h = new Float64Array(n);
    let gMinX = b.minX, gMaxX = b.maxX, gMinY = b.minY, gMaxY = b.maxY;
    for (let k = 0; k < n; k++) {
      const w = walls[k];
      const ax = w.x1 ?? w.p1[0], ay = w.y1 ?? w.p1[1];
      const bx = w.x2 ?? w.p2[0], by = w.y2 ?? w.p2[1];
      x1[k] = ax; y1[k] = ay; x2[k] = bx; y2[k] = by;
      const loX = ax < bx ? ax : bx, hiX = ax > bx ? ax : bx;
      const loY = ay < by ? ay : by, hiY = ay > by ? ay : by;
      minX[k] = loX; maxX[k] = hiX; minY[k] = loY; maxY[k] = hiY;
      h[k] = w.height ?? 2.8;
      if (loX < gMinX) gMinX = loX;
      if (hiX > gMaxX) gMaxX = hiX;
      if (loY < gMinY) gMinY = loY;
      if (hiY > gMaxY) gMaxY = hiY;
    }
    if (n <= 12) {
      return { n, useGrid: false, x1, y1, x2, y2, minX, maxX, minY, maxY, h };
    }
    gMinX -= 0.05; gMaxX += 0.05; gMinY -= 0.05; gMaxY += 0.05;
    const gw = Math.max(0.1, gMaxX - gMinX), gh = Math.max(0.1, gMaxY - gMinY);
    const dim = Math.max(6, Math.min(28, Math.ceil(Math.sqrt(n) * 1.4)));
    const gx = Math.max(4, Math.round(dim * Math.sqrt(gw / gh)));
    const gy = Math.max(4, Math.round(dim * Math.sqrt(gh / gw)));
    const invDx = gx / gw, invDy = gy / gh;
    const totalCells = gx * gy;
    const counts = new Uint32Array(totalCells);
    for (let k = 0; k < n; k++) {
      const i0 = Math.max(0, Math.min(gx - 1, Math.floor((minX[k] - gMinX) * invDx)));
      const i1 = Math.max(0, Math.min(gx - 1, Math.floor((maxX[k] - gMinX) * invDx)));
      const j0 = Math.max(0, Math.min(gy - 1, Math.floor((minY[k] - gMinY) * invDy)));
      const j1 = Math.max(0, Math.min(gy - 1, Math.floor((maxY[k] - gMinY) * invDy)));
      for (let j = j0; j <= j1; j++) {
        const row = j * gx;
        for (let i = i0; i <= i1; i++) counts[row + i]++;
      }
    }
    const offsets = new Uint32Array(totalCells + 1);
    for (let c = 0; c < totalCells; c++) offsets[c + 1] = offsets[c] + counts[c];
    const items = new Uint32Array(offsets[totalCells]);
    const cursor = new Uint32Array(offsets);
    for (let k = 0; k < n; k++) {
      const i0 = Math.max(0, Math.min(gx - 1, Math.floor((minX[k] - gMinX) * invDx)));
      const i1 = Math.max(0, Math.min(gx - 1, Math.floor((maxX[k] - gMinX) * invDx)));
      const j0 = Math.max(0, Math.min(gy - 1, Math.floor((minY[k] - gMinY) * invDy)));
      const j1 = Math.max(0, Math.min(gy - 1, Math.floor((maxY[k] - gMinY) * invDy)));
      for (let j = j0; j <= j1; j++) {
        const row = j * gx;
        for (let i = i0; i <= i1; i++) items[cursor[row + i]++] = k;
      }
    }
    return {
      n, useGrid: true, x1, y1, x2, y2, minX, maxX, minY, maxY, h,
      gMinX, gMinY, gx, gy, invDx, invDy, dx: gw / gx, dy: gh / gy,
      offsets, items, stamp: new Uint32Array(n), curStamp: 0
    };
  }

  function isBlockedByWallIdx(sx, sy, sz, ex, ey, ez, wi) {
    const minRx = sx < ex ? sx : ex, maxRx = sx > ex ? sx : ex;
    const minRy = sy < ey ? sy : ey, maxRy = sy > ey ? sy : ey;
    const rx = ex - sx, ry = ey - sy, rz = ez - sz;
    const wx1 = wi.x1, wy1 = wi.y1, wx2 = wi.x2, wy2 = wi.y2;
    const wMinX = wi.minX, wMaxX = wi.maxX, wMinY = wi.minY, wMaxY = wi.maxY, wH = wi.h;

    if (!wi.useGrid) {
      for (let k = 0; k < wi.n; k++) {
        if (minRx > wMaxX[k] || maxRx < wMinX[k] || minRy > wMaxY[k] || maxRy < wMinY[k]) continue;
        const cx = wx1[k], cy = wy1[k], dx = wx2[k] - cx, dy = wy2[k] - cy;
        const d0 = rx * dy - ry * dx;
        if (d0 > -1e-9 && d0 < 1e-9) continue;
        const ax = cx - sx, ay = cy - sy;
        const t = (ax * dy - ay * dx) / d0;
        if (t <= 0.002 || t >= 0.998) continue;
        const u = (ax * ry - ay * rx) / d0;
        if (u > 0.002 && u < 0.998 && (sz + t * rz) <= wH[k]) return true;
      }
      return false;
    }

    let ix = Math.floor((sx - wi.gMinX) * wi.invDx);
    let iy = Math.floor((sy - wi.gMinY) * wi.invDy);
    let ix1 = Math.floor((ex - wi.gMinX) * wi.invDx);
    let iy1 = Math.floor((ey - wi.gMinY) * wi.invDy);
    if (ix < 0) ix = 0; else if (ix >= wi.gx) ix = wi.gx - 1;
    if (iy < 0) iy = 0; else if (iy >= wi.gy) iy = wi.gy - 1;
    if (ix1 < 0) ix1 = 0; else if (ix1 >= wi.gx) ix1 = wi.gx - 1;
    if (iy1 < 0) iy1 = 0; else if (iy1 >= wi.gy) iy1 = wi.gy - 1;

    let st = ++wi.curStamp;
    if (st === 0xffffffff) { wi.stamp.fill(0); st = wi.curStamp = 1; }
    const stamp = wi.stamp, offsets = wi.offsets, items = wi.items, gx = wi.gx;

    const stepX = ix1 > ix ? 1 : ix1 < ix ? -1 : 0;
    const stepY = iy1 > iy ? 1 : iy1 < iy ? -1 : 0;
    let tMaxX = stepX ? (((wi.gMinX + (ix + (stepX > 0 ? 1 : 0)) * wi.dx) - sx) / rx) : Infinity;
    let tMaxY = stepY ? (((wi.gMinY + (iy + (stepY > 0 ? 1 : 0)) * wi.dy) - sy) / ry) : Infinity;
    const tDeltaX = stepX ? Math.abs(wi.dx / rx) : Infinity;
    const tDeltaY = stepY ? Math.abs(wi.dy / ry) : Infinity;
    const maxSteps = Math.abs(ix1 - ix) + Math.abs(iy1 - iy) + 2;

    for (let step = 0; step < maxSteps; step++) {
      const c = iy * gx + ix;
      const start = offsets[c], end = offsets[c + 1];
      for (let p = start; p < end; p++) {
        const k = items[p];
        if (stamp[k] === st) continue;
        stamp[k] = st;
        if (minRx > wMaxX[k] || maxRx < wMinX[k] || minRy > wMaxY[k] || maxRy < wMinY[k]) continue;
        const cx = wx1[k], cy = wy1[k], dx = wx2[k] - cx, dy = wy2[k] - cy;
        const d0 = rx * dy - ry * dx;
        if (d0 > -1e-9 && d0 < 1e-9) continue;
        const ax = cx - sx, ay = cy - sy;
        const t = (ax * dy - ay * dx) / d0;
        if (t <= 0.002 || t >= 0.998) continue;
        const u = (ax * ry - ay * rx) / d0;
        if (u > 0.002 && u < 0.998 && (sz + t * rz) <= wH[k]) return true;
      }
      if (ix === ix1 && iy === iy1) break;
      if (tMaxX < tMaxY) {
        tMaxX += tDeltaX;
        ix += stepX;
        if (ix < 0 || ix >= gx) break;
      } else {
        tMaxY += tDeltaY;
        iy += stepY;
        if (iy < 0 || iy >= wi.gy) break;
      }
    }
    return false;
  }

  /** 單點水平照度（直接光，可納入隔間牆遮光；支援傳入 walls 陣列或 buildWallIndex 加速索引） */
  function directAt(sources, x, y, z, walls) {
    let e = 0;
    const useIdx = walls && typeof walls.n === 'number';
    const hasWalls = useIdx ? walls.n > 0 : (walls && walls.length > 0);
    for (let si = 0; si < sources.length; si++) {
      const s = sources[si];
      const dx = x - s.x, dy = y - s.y, dz = z - s.z;
      if (dz >= 0) continue;
      if (hasWalls) {
        if (useIdx ? isBlockedByWallIdx(s.x, s.y, s.z, x, y, z, walls) : isBlockedByWall(s.x, s.y, s.z, x, y, z, walls)) continue;
      }
      const d2 = dx * dx + dy * dy + dz * dz;
      const I = intensityToward(s, dx, dy, dz)[0];
      if (I > 0) e += (I * (-dz / Math.sqrt(d2))) / d2;
    }
    return e;
  }

  /* ---------------- 主計算 ---------------- */
  function chooseSpacing(room, b) {
    if (room.grid && room.grid > 0) return room.grid;
    const area = b.w * b.h;
    let s = Math.sqrt(area / 9000);
    s = Math.max(0.1, Math.min(1, s));
    return Math.round(s * 20) / 20 || 0.1;
  }

  function compute(project, opts) {
    opts = opts || {};
    const room = project.room;
    const poly = room.polygon;
    const b = polyBounds(poly);
    const allDesks = LX.cad && LX.cad.allDesks ? LX.cad.allDesks(project) : [...(project.cad?.desks || []), ...(project.desks || [])];
    const zoneMode = LX.cad && LX.cad.hasZoneMode ? LX.cad.hasZoneMode(project) : Boolean(project.cad || allDesks.length);
    let sp = opts.spacing || chooseSpacing(room, b);
    if (zoneMode && !room.grid && !opts.spacing) {
      const deskSize = Math.min(...allDesks.map(d => { const db = polyBounds(d.polygon); return Math.min(db.w, db.h); }), 1.5);
      sp = Math.max(Math.sqrt(b.w * b.h / 60000), Math.min(sp, Math.max(0.05, deskSize / 3)));
    }
    const nx = Math.max(2, Math.round(b.w / sp));
    const ny = Math.max(2, Math.round(b.h / sp));
    if (nx * ny > 250000) throw Error('計算格點超過 250,000 點，請加大格點間距或縮小空間。');
    const dx = b.w / nx, dy = b.h / ny;
    const values = new Float32Array(nx * ny);
    const indirect = new Float32Array(nx * ny);
    const heights = new Float32Array(nx * ny);
    const surfaceKinds = new Uint8Array(nx * ny);
    const floorDirect = zoneMode ? new Float32Array(nx * ny) : null;
    const mask = new Uint8Array(nx * ny); // 0 外部, 1 房間內, 2 計算區（排除牆邊帶）
    const margin = room.margin || 0;
    const zw = room.wp;
    const sources = buildSources(project);
    const walls = (project.calcWalls !== false && opts.walls !== false && project.view?.walls !== false)
      ? (LX.cad && LX.cad.allWalls ? LX.cad.allWalls(project) : (project.cad?.walls || project.walls || []))
      : [];
    const wallIdx = buildWallIndex(walls, b);
    const deskBoxes = zoneMode ? allDesks.map((d) => ({ poly: d.polygon, b: polyBounds(d.polygon), h: d.height ?? 0.75 })) : null;
    const isRectRoom = poly.length === 4 && Math.abs(polyArea(poly) - b.w * b.h) < 1e-4;

    for (let j = 0; j < ny; j++) {
      const y = b.minY + (j + 0.5) * dy;
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const x = b.minX + (i + 0.5) * dx;
        if (!isRectRoom && !pointInPoly(x, y, poly)) continue;
        const idx = row + i;
        mask[idx] = margin > 0 && distToPoly(x, y, poly) < margin ? 1 : 2;
        if (!zoneMode) {
          heights[idx] = zw;
          surfaceKinds[idx] = 0;
        } else {
          let hitDesk = null;
          for (let d = 0; d < deskBoxes.length; d++) {
            const db = deskBoxes[d];
            if (x >= db.b.minX && x <= db.b.maxX && y >= db.b.minY && y <= db.b.maxY && pointInPoly(x, y, db.poly)) {
              hitDesk = db;
              break;
            }
          }
          heights[idx] = hitDesk ? hitDesk.h : 0;
          surfaceKinds[idx] = hitDesk ? 1 : 0;
        }
      }
    }

    // 直接光（納入隔間牆 DDA 空間網格加速遮蔽；地面格點共用射線與配光查詢）
    for (const s of sources) {
      const sx = s.x, sy = s.y, sz = s.z;
      for (let j = 0; j < ny; j++) {
        const yPt = b.minY + (j + 0.5) * dy;
        const yy = yPt - sy;
        const yy2 = yy * yy;
        const row = j * nx;
        for (let i = 0; i < nx; i++) {
          const idx = row + i;
          if (!mask[idx]) continue;
          const xPt = b.minX + (i + 0.5) * dx;
          const xx = xPt - sx;
          const hz = heights[idx];
          if (floorDirect && hz === 0) {
            if (sz > 0 && (!wallIdx || !isBlockedByWallIdx(sx, sy, sz, xPt, yPt, 0, wallIdx))) {
              const fz = -sz, fd2 = xx * xx + yy2 + fz * fz;
              const I = intensityToward(s, xx, yy, fz)[0];
              if (I > 0) {
                const e = (I * (-fz / Math.sqrt(fd2))) / fd2;
                floorDirect[idx] += e;
                values[idx] += e;
              }
            }
          } else {
            if (floorDirect && sz > 0 && (!wallIdx || !isBlockedByWallIdx(sx, sy, sz, xPt, yPt, 0, wallIdx))) {
              const fz = -sz, fd2 = xx * xx + yy2 + fz * fz;
              const fi = intensityToward(s, xx, yy, fz)[0];
              if (fi > 0) floorDirect[idx] += (fi * (-fz / Math.sqrt(fd2))) / fd2;
            }
            const dz = hz - sz;
            if (dz >= 0) continue;
            if (wallIdx && isBlockedByWallIdx(sx, sy, sz, xPt, yPt, hz, wallIdx)) continue;
            const d2 = xx * xx + yy2 + dz * dz;
            const I = intensityToward(s, xx, yy, dz)[0];
            if (I > 0) values[idx] += (I * (-dz / Math.sqrt(d2))) / d2;
          }
        }
      }
    }

    // =========================================================================
    // 間接光（多房間隔間獨立漫射 Zonal RCR / 全區單室積分球）
    // =========================================================================
    const cell = dx * dy;
    const Hcav = Math.max(0.1, room.height - (zoneMode ? 0 : zw));
    const useZonalRcr = walls.length > 0 && opts.zonalRcr !== false;
    let zonesResult = [];
    let EindGlobal = 0;
    let Edsum = 0, nIn = 0;

    if (useZonalRcr) {
      // 預先快取格點右鄰(bit 1)與下鄰(bit 2)是否被隔間牆阻斷，BFS 與周長統計共用 O(1) 查詢
      const edgeBlocked = new Uint8Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const cy = b.minY + (j + 0.5) * dy;
        const row = j * nx;
        for (let i = 0; i < nx; i++) {
          const idx = row + i;
          if (!mask[idx]) continue;
          const cx = b.minX + (i + 0.5) * dx;
          let flags = 0;
          if (i + 1 < nx && mask[idx + 1] && isBlockedByWallIdx(cx, cy, 0, cx + dx, cy, 0, wallIdx)) flags |= 1;
          if (j + 1 < ny && mask[idx + nx] && isBlockedByWallIdx(cx, cy, 0, cx, cy + dy, 0, wallIdx)) flags |= 2;
          edgeBlocked[idx] = flags;
        }
      }

      // 1. 利用 BFS 依照隔間牆切分實體獨立房間分區 (Zonal Connected Components)
      const zoneMap = new Int32Array(nx * ny).fill(-1);
      const q = new Int32Array(nx * ny);
      let nextZone = 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const idx = j * nx + i;
          if (!mask[idx] || zoneMap[idx] !== -1) continue;
          const zId = nextZone++;
          let qh = 0, qt = 0;
          q[qt++] = idx;
          zoneMap[idx] = zId;
          while (qh < qt) {
            const cur = q[qh++];
            const ci = cur % nx, cj = (cur - ci) / nx;
            if (ci + 1 < nx && mask[cur + 1] && zoneMap[cur + 1] === -1 && !(edgeBlocked[cur] & 1)) {
              zoneMap[cur + 1] = zId; q[qt++] = cur + 1;
            }
            if (ci > 0 && mask[cur - 1] && zoneMap[cur - 1] === -1 && !(edgeBlocked[cur - 1] & 1)) {
              zoneMap[cur - 1] = zId; q[qt++] = cur - 1;
            }
            if (cj + 1 < ny && mask[cur + nx] && zoneMap[cur + nx] === -1 && !(edgeBlocked[cur] & 2)) {
              zoneMap[cur + nx] = zId; q[qt++] = cur + nx;
            }
            if (cj > 0 && mask[cur - nx] && zoneMap[cur - nx] === -1 && !(edgeBlocked[cur - nx] & 2)) {
              zoneMap[cur - nx] = zId; q[qt++] = cur - nx;
            }
          }
        }
      }

      // 2. 統計各房間幾何指標、RCR 室指數與光源歸屬
      const zoneStats = [];
      for (let z = 0; z < nextZone; z++) {
        zoneStats.push({
          id: z,
          cellCount: 0,
          boundaryLength: 0,
          fluxWP: 0,
          sources: [],
          directSum: 0,
          Eind: 0
        });
      }

      // 累計各格點直射通量與邊界周長（完全重用 edgeBlocked，零重複射線檢測）
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        for (let i = 0; i < nx; i++) {
          const idx = row + i;
          const zId = zoneMap[idx];
          if (zId === -1) continue;
          const zs = zoneStats[zId];
          zs.cellCount++;
          const dVal = floorDirect ? floorDirect[idx] : values[idx];
          zs.fluxWP += dVal * cell;
          zs.directSum += values[idx];

          if (i + 1 >= nx || !mask[idx + 1] || zoneMap[idx + 1] !== zId || (edgeBlocked[idx] & 1)) zs.boundaryLength += dy;
          if (i === 0 || !mask[idx - 1] || zoneMap[idx - 1] !== zId || (edgeBlocked[idx - 1] & 1)) zs.boundaryLength += dy;
          if (j + 1 >= ny || !mask[idx + nx] || zoneMap[idx + nx] !== zId || (edgeBlocked[idx] & 2)) zs.boundaryLength += dx;
          if (j === 0 || !mask[idx - nx] || zoneMap[idx - nx] !== zId || (edgeBlocked[idx - nx] & 2)) zs.boundaryLength += dx;
        }
      }

      // 判斷燈具光源落入哪一個房間分區
      for (const s of sources) {
        const si = Math.floor((s.x - b.minX) / dx);
        const sj = Math.floor((s.y - b.minY) / dy);
        let sZone = -1;
        if (si >= 0 && si < nx && sj >= 0 && sj < ny) {
          sZone = zoneMap[sj * nx + si];
        }
        if (sZone === -1) {
          let minDist = Infinity;
          for (let j = Math.max(0, sj - 3); j <= Math.min(ny - 1, sj + 3); j++) {
            for (let i = Math.max(0, si - 3); i <= Math.min(nx - 1, si + 3); i++) {
              const z = zoneMap[j * nx + i];
              if (z === -1) continue;
              const cx = b.minX + (i + 0.5) * dx, cy = b.minY + (j + 0.5) * dy;
              const dist = Math.hypot(cx - s.x, cy - s.y);
              if (dist < minDist && !isBlockedByWallIdx(s.x, s.y, s.z, cx, cy, 0, wallIdx)) {
                minDist = dist;
                sZone = z;
              }
            }
          }
        }
        if (sZone !== -1 && zoneStats[sZone]) {
          zoneStats[sZone].sources.push(s);
        }
      }

      // 3. 計算各房間獨立的 RCR 與反射 Eind
      let totalFirstFlux = 0, totalAreaAll = 0;
      for (const zs of zoneStats) {
        if (!zs.cellCount) continue;
        const zArea = zs.cellCount * cell;
        const zPerim = zs.boundaryLength;
        // Room Cavity Ratio (RCR) = 2.5 * Perimeter * Hcav / Area
        const rcr = zArea > 0 ? (2.5 * zPerim * Hcav) / zArea : 1;
        const zAw = zPerim * Hcav;
        const zAtot = 2 * zArea + zAw;
        const zRhoAvg = (zArea * room.rhoC + zAw * room.rhoW + zArea * room.rhoF) / (zAtot || 1);

        let zFluxDown = 0, zFluxUp = 0;
        for (const s of zs.sources) {
          const total = s.k * 1000;
          const dr = s.tilted ? Math.min(1, s.tbl.downRatio) : s.tbl.downRatio;
          zFluxDown += total * dr;
          zFluxUp += total * (1 - dr);
        }

        const zFluxWall = Math.max(0, zFluxDown - zs.fluxWP);
        const zFirst = room.rhoF * Math.min(zs.fluxWP, zFluxDown) + room.rhoW * zFluxWall + room.rhoC * zFluxUp;
        totalFirstFlux += zFirst;
        totalAreaAll += zArea;

        // 若該房間有光源或直射光通量，計算該房間獨立反射漫射；若全無燈光且無直射，漫射為 0
        zs.Eind = (zs.sources.length || zs.fluxWP > 1)
          ? zFirst / (zAtot * Math.max(0.1, 1 - zRhoAvg))
          : 0;

        zs.area = zArea;
        zs.perimeter = zPerim;
        zs.rcr = rcr;
        zs.fixturesCount = new Set(zs.sources.map(source => source.fixture)).size;
      }

      // 4. 將各房間獨立 Eind 疊加至該分區格點
      for (let i = 0; i < values.length; i++) {
        if (!mask[i]) continue;
        const zId = zoneMap[i];
        const eind = (zId !== -1 && zoneStats[zId]) ? zoneStats[zId].Eind : 0;
        Edsum += values[i];
        nIn++;
        values[i] += eind;
        indirect[i] = eind;
      }

      // 整理過濾出有效房間分區清單（依面積排序）
      zonesResult = zoneStats
        .filter(z => z.cellCount >= 4 && z.area >= 1.0)
        .sort((a, b) => b.area - a.area)
        .map((z, idx) => ({
          id: `zone-${idx + 1}`,
          name: `隔間分區 ${idx + 1}`,
          area: +(z.area).toFixed(1),
          perimeter: +(z.perimeter).toFixed(1),
          rcr: +(z.rcr).toFixed(2),
          fixturesCount: z.fixturesCount,
          Eind: Math.round(z.Eind),
          EdirAvg: Math.round(z.directSum / (z.cellCount || 1))
        }));

      EindGlobal = totalAreaAll > 0 ? (zoneStats.reduce((acc, z) => acc + z.Eind * (z.area || 0), 0) / totalAreaAll) : 0;

    } else {
      // 傳統全區單一漫射模式
      const area = polyArea(poly);
      const perim = polyPerimeter(poly);
      let fluxWP = 0;
      for (let i = 0; i < values.length; i++) if (mask[i]) fluxWP += (floorDirect ? floorDirect[i] : values[i]) * cell;
      let fluxDown = 0, fluxUp = 0;
      for (const s of sources) {
        const total = s.k * 1000;
        const dr = s.tilted ? Math.min(1, s.tbl.downRatio) : s.tbl.downRatio;
        fluxDown += total * dr;
        fluxUp += total * (1 - dr);
      }
      const Ac = area, Af = area, Aw = perim * Hcav;
      const Atot = Ac + Af + Aw;
      const rhoAvg = (Ac * room.rhoC + Aw * room.rhoW + Af * room.rhoF) / Atot;
      const fluxWall = Math.max(0, fluxDown - fluxWP);
      const first = room.rhoF * Math.min(fluxWP, fluxDown) + room.rhoW * fluxWall + room.rhoC * fluxUp;
      const Eind = sources.length ? first / (Atot * (1 - rhoAvg)) : 0;
      EindGlobal = Eind;
      for (let i = 0; i < values.length; i++) {
        if (mask[i]) { Edsum += values[i]; nIn++; values[i] += Eind; indirect[i] = Eind; }
      }
    }

    // 統計（計算區）
    const deskTarget = project.target?.Em || 500;
    const flTarget = project.floorTarget || 100;
    let sum = 0, n = 0, mn = Infinity, mx = 0, passN = 0, beamN = 0;
    for (let i = 0; i < values.length; i++) {
      if (mask[i] !== 2) continue;
      const v = values[i];
      sum += v; n++;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      if (v >= deskTarget) passN++;
      if (v >= deskTarget * 0.8) beamN++;
    }
    if (!n) {
      // 計算區過小時退回整個房間
      for (let i = 0; i < values.length; i++) {
        if (!mask[i]) continue;
        const v = values[i];
        sum += v; n++; if (v < mn) mn = v; if (v > mx) mx = v;
        if (v >= deskTarget) passN++;
        if (v >= deskTarget * 0.8) beamN++;
      }
    }
    let Eavg = n ? sum / n : 0;
    if (!isFinite(mn)) mn = 0;
    let coverage = n ? (passN / n) * 100 : 0;
    let beamCoverage = n ? (beamN / n) * 100 : 0;

    // CAD / Manual Desks use actual desk polygons at 0.75 m; remaining samples are at floor level.
    const blank = () => ({ n: 0, sum: 0, Emin: Infinity, Emax: 0, Eavg: 0, U0: 0, passN: 0, beamN: 0, coverage: 0, beamCoverage: 0 });
    const surfaceStats = { desk: blank(), floor: blank() };
    const deskStats = allDesks.map(d => ({ ...blank(), id: d.id, name: d.name, height: 0.75, manual: !!d.manual }));
    function accumulate(s, v, tgt) {
      if (!s) return;
      s.n++; s.sum += v;
      s.Emin = Math.min(s.Emin, v);
      s.Emax = Math.max(s.Emax, v);
      if (v >= tgt) s.passN++;
      if (v >= tgt * 0.8) s.beamN++;
    }
    if (zoneMode) {
      for (let i = 0; i < values.length; i++) if (mask[i]) {
        // Desk tasks retain edge samples, while wall exclusion applies to floor circulation.
        if (!surfaceKinds[i] && mask[i] === 2) {
          accumulate(surfaceStats.floor, values[i], flTarget);
        }
      }
      // Separate equal-area desktop quadrature from the display grid. A shared
      // lattice lets overlapping desks have individual results without counting
      // their shared area twice in the combined desktop result.
      const boxes = allDesks.map(d => polyBounds(d.polygon));
      const small = Math.min(0.2, ...boxes.map(db => Math.min(db.w, db.h)));
      const deskSpacing = Math.max(Math.sqrt(boxes.reduce((a, db) => a + db.w * db.h, 0) / 200000), Math.min(0.05, small / 4));
      const seen = new Map();
      for (let di = 0; di < allDesks.length; di++) {
        const d = allDesks[di], db = boxes[di], stat = deskStats[di];
        for (let j = Math.floor(db.minY / deskSpacing); j < Math.ceil(db.maxY / deskSpacing); j++) {
          for (let i = Math.floor(db.minX / deskSpacing); i < Math.ceil(db.maxX / deskSpacing); i++) {
            const x = (i + 0.5) * deskSpacing, y = (j + 0.5) * deskSpacing;
            if (!pointInPoly(x, y, d.polygon) || !pointInPoly(x, y, poly)) continue;
            const key = i + ',' + j;
            let v = seen.get(key);
            if (v === undefined) {
              const gi = Math.min(nx - 1, Math.max(0, Math.floor((x - b.minX) / dx)));
              const gj = Math.min(ny - 1, Math.max(0, Math.floor((y - b.minY) / dy)));
              v = directAt(sources, x, y, 0.75, wallIdx) + indirect[gj * nx + gi];
              seen.set(key, v);
              accumulate(surfaceStats.desk, v, deskTarget);
            }
            accumulate(stat, v, deskTarget);
          }
        }
        stat.sampleSpacing = deskSpacing;
        stat.sampleArea = stat.n * deskSpacing * deskSpacing;
      }
      surfaceStats.desk.sampleSpacing = deskSpacing;
      surfaceStats.desk.sampleArea = seen.size * deskSpacing * deskSpacing;
      for (const s of [surfaceStats.desk, surfaceStats.floor, ...deskStats]) {
        s.Eavg = s.n ? s.sum / s.n : 0;
        s.Emin = s.n ? s.Emin : 0;
        s.U0 = s.Eavg ? s.Emin / s.Eavg : 0;
        s.coverage = s.n ? (s.passN / s.n) * 100 : 0;
        s.beamCoverage = s.n ? (s.beamN / s.n) * 100 : 0;
      }
      const primary = allDesks.length ? surfaceStats.desk : surfaceStats.floor;
      Eavg = primary.Eavg; mn = primary.Emin; mx = primary.Emax;
      coverage = primary.coverage; beamCoverage = primary.beamCoverage;
    }

    let gridMax = 0; for (let i = 0; i < values.length; i++) if (mask[i]) gridMax = Math.max(gridMax, values[i]);
    const roomArea = polyArea(poly);
    const totalW = project.fixtures.reduce((a, f) => a + (f.on === false ? 0 : f.watts * (f.dim == null ? 1 : f.dim / 100)), 0);
    const totalLm = project.fixtures.reduce((a, f) => a + (f.on === false ? 0 : f.lumens * (f.dim == null ? 1 : f.dim / 100)), 0);
    const ugr = opts.skipUGR ? null : computeUGR(project, sources, EindGlobal, b);

    return {
      grid: { nx, ny, dx, dy, x0: b.minX, y0: b.minY, values, indirect, mask, heights, surfaceKinds },
      walls,
      surfaceStats, deskStats, gridMax, zoneMode,
      primaryTarget: zoneMode && !allDesks.length ? flTarget : project.target.Em,
      primaryU0: zoneMode && !allDesks.length ? 0.4 : project.target.U0,
      bounds: b,
      Eavg, Emin: mn, Emax: mx,
      U0: Eavg > 0 ? mn / Eavg : 0,
      Ud: mx > 0 ? mn / mx : 0,
      coverage, beamCoverage,
      Edirect: zoneMode ? Math.max(0, Eavg - EindGlobal) : (nIn ? Edsum / nIn : 0),
      Eind: EindGlobal,
      zones: zonesResult,
      zonalRcr: useZonalRcr,
      area: roomArea,
      perim: room.polygon ? polyPerimeter(room.polygon) : 2 * (b.w + b.h),
      totalW, totalLm,
      lpd: roomArea > 0 ? totalW / roomArea : 0,
      lpd100: Eavg > 0 && roomArea > 0 ? (totalW / roomArea) / (Eavg / 100) : 0,
      count: project.fixtures.filter((f) => f.on !== false).length,
      ugr,
      sources: sources.length,
      lightSources: sources,
      walls,
      wallIdx,
      spacing: Math.max(dx, dy),
    };
  }

  /* ---------------- UGR ---------------- */
  function pointAt(result, x, y, z) {
    const g = result.grid;
    const i = Math.floor((x - g.x0) / g.dx), j = Math.floor((y - g.y0) / g.dy);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null;
    return directAt(result.lightSources, x, y, z, result.wallIdx || result.walls) + g.indirect[j * g.nx + i];
  }

  function guthP(tauDeg, sigmaDeg) {
    const t = tauDeg, s = sigmaDeg;
    const lnP = (35.2 - 0.31889 * t - 1.22 * Math.exp((-2 * t) / 9)) * 1e-3 * s + (21 + 0.26667 * t - 0.002963 * t * t) * 1e-5 * s * s;
    return Math.exp(lnP);
  }

  function ugrForView(sources, eye, dir, Lb) {
    // dir: 單位水平視線方向 [dx, dy]
    const fx = dir[0], fy = dir[1];
    const lx = -fy, ly = fx; // 側向
    let sum = 0;
    for (const s of sources) {
      const rx = s.x - eye[0], ry = s.y - eye[1], rz = s.z - eye[2];
      const R = rx * fx + ry * fy; // 前方距離
      const H = rz;
      if (R <= 0.05 || H <= 0.05) continue;
      const T = rx * lx + ry * ly;
      const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
      // 從燈具看向眼睛
      const [I, g] = intensityToward(s, -rx, -ry, -rz);
      if (I <= 0 || g >= 89.5) continue;
      const Ap = s.area * Math.cos(g * DEG);
      if (Ap <= 1e-6) continue;
      const L = I / Ap;
      const omega = Ap / (dist * dist);
      const sigma = Math.acos(Math.max(-1, Math.min(1, R / dist))) * RAD;
      const tau = Math.atan2(Math.abs(T), H) * RAD;
      const p = guthP(tau, sigma);
      sum += (L * L * omega) / (p * p);
    }
    if (sum <= 0) return 0;
    return 8 * Math.log10((0.25 / Lb) * sum);
  }

  function computeUGR(project, sources, Eind, b) {
    if (!sources.length) return null;
    const poly = project.room.polygon;
    const eyeH = 1.2;
    const Lb = Math.max(5, Eind / Math.PI);
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const off = 0.6;
    const views = [
      { name: '西→東', eye: [b.minX + off, cy, eyeH], dir: [1, 0] },
      { name: '東→西', eye: [b.maxX - off, cy, eyeH], dir: [-1, 0] },
      { name: '北→南', eye: [cx, b.minY + off, eyeH], dir: [0, 1] },
      { name: '南→北', eye: [cx, b.maxY - off, eyeH], dir: [0, -1] },
    ].filter((v) => pointInPoly(v.eye[0], v.eye[1], poly));
    const res = views.map((v) => Object.assign(v, { ugr: ugrForView(sources, v.eye, v.dir, Lb) }));
    if (!res.length) return null;
    const max = res.reduce((a, v) => Math.max(a, v.ugr), -Infinity);
    return { value: Math.max(0, max), views: res, Lb };
  }

  /* ---------------- 自動佈燈 ---------------- */
  function gridLayout(project, type, nx, ny, opts) {
    const poly = project.room.polygon;
    const b = polyBounds(poly);
    const out = [];
    const sx = b.w / nx, sy = b.h / ny;
    const rot = opts.rot != null ? opts.rot : (b.w >= b.h ? 0 : 90);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = b.minX + (i + 0.5) * sx;
        const y = b.minY + (j + 0.5) * sy;
        if (!pointInPoly(x, y, poly)) continue;
        if (distToPoly(x, y, poly) < Math.min(0.3, Math.min(sx, sy) / 2)) continue;
        out.push(makeFixture(project, type, x, y, { rot, z: opts.z }));
      }
    }
    return out;
  }

  let fxSeq = 1;
  function makeFixture(project, type, x, y, o) {
    o = o || {};
    const z = o.z != null ? o.z : defaultMountHeight(project, type);
    return {
      id: 'F' + Date.now().toString(36) + (fxSeq++).toString(36),
      typeId: type.id,
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      z,
      lumens: type.lumens,
      watts: type.watts,
      beam: Math.round(baseTable(type).beam),
      rot: o.rot || 0,
      tilt: 0,
      dim: 100,
      on: true,
    };
  }

  function defaultMountHeight(project, type) {
    const H = project.room.height;
    if (type.mount === 'pendant' || type.mount === 'track') return Math.round((H - (type.suspension || 0.8)) * 100) / 100;
    return H;
  }

  function autoLayout(project, type, opts) {
    opts = opts || {};
    const b = polyBounds(project.room.polygon);
    if (opts.nx && opts.ny) return gridLayout(project, type, opts.nx, opts.ny, opts);
    const target = opts.target || (project.cad&&!project.cad.desks.length?(project.floorTarget||100):project.target.Em);
    const targetU0 = opts.targetU0 || 0;
    const aspect = b.w / b.h;
    const rot = opts.rot != null ? opts.rot : (b.w >= b.h ? 0 : 90);
    const len = type.length || 0.1;
    // 候選陣列
    const cands = [];
    const seen = new Set();
    for (let nx = 1; nx <= 80; nx++) {
      for (const d of [-1, 0, 1]) {
        const ny = Math.max(1, Math.round(nx / aspect) + d);
        const key = nx + 'x' + ny;
        if (seen.has(key)) continue;
        seen.add(key);
        // 線型燈具：沿長軸不可重疊
        const along = rot === 0 ? b.w / nx : b.h / ny;
        if (along < len * 1.05) continue;
        cands.push({ nx, ny, n: nx * ny });
      }
    }
    cands.sort((a, c) => a.n - c.n);
    // 以光通量法估算起點，UF≈0.55
    const est = (target * polyArea(project.room.polygon)) / (type.lumens * 0.55 * project.room.mf);
    let start = Math.max(0, cands.findIndex((c) => c.n >= est * 0.6));
    const tmp = Object.assign({}, project);
    const spacing = Math.max(0.25, Math.sqrt((b.w * b.h) / 2500));
    let best = null;
    let fallback = null;
    for (let k = start; k < cands.length && k < start + 60; k++) {
      const c = cands[k];
      const fx = gridLayout(project, type, c.nx, c.ny, Object.assign({}, opts, { rot }));
      if (!fx.length) continue;
      tmp.fixtures = fx;
      const r = compute(tmp, { spacing, skipUGR: true });
      if (r.Eavg >= target && !fallback) fallback = fx;
      if (r.Eavg >= target && r.U0 >= targetU0) { best = fx; break; }
    }
    return best || fallback || gridLayout(project, type, cands[Math.min(cands.length - 1, start)].nx, cands[Math.min(cands.length - 1, start)].ny, Object.assign({}, opts, { rot }));
  }

  /** 依辦公桌中心對位佈燈（自動在每張辦公桌上方配置燈具並補足目標照度與覆蓋率） */
  function layoutOverDesks(project, type, opts) {
    opts = opts || {};
    const desks = LX.cad && LX.cad.allDesks ? LX.cad.allDesks(project) : [...(project.cad?.desks || []), ...(project.desks || [])];
    if (!desks.length) return autoLayout(project, type, opts);
    const poly = project.room.polygon;
    const b = polyBounds(poly);
    const target = opts.target || project.target?.Em || 500;
    const rot = opts.rot != null ? opts.rot : (b.w >= b.h ? 0 : 90);
    const zMount = opts.z != null ? opts.z : defaultMountHeight(project, type);
    const hgt = Math.max(0.5, zMount - 0.75);
    const tbl = baseTable(type);
    const i0 = Math.max(50, P.lookup(tbl, 0, 0) * (type.lumens / 1000) * (project.room.mf || 0.8));
    const singlePeakLux = i0 / (hgt * hgt);
    // 估算每張辦公桌需要對位幾盞燈才能達到目標照度與 ≥80% 覆蓋率
    const basePerDesk = Math.max(1, Math.min(6, Math.ceil((target * 1.15) / Math.max(50, singlePeakLux))));

    const buildForCount = (mult) => {
      const out = [];
      for (const d of desks) {
        const db = polyBounds(d.polygon);
        const cx = (db.minX + db.maxX) / 2, cy = (db.minY + db.maxY) / 2;
        const horiz = db.w >= db.h;
        const nL = Math.max(mult, Math.round(Math.max(db.w, db.h) / 1.3) * mult);
        if (nL <= 1) {
          if (pointInPoly(cx, cy, poly)) out.push(makeFixture(project, type, cx, cy, { rot, z: opts.z }));
        } else {
          // 沿桌面長軸與寬軸均勻對位配置
          const nx = horiz ? Math.ceil(nL / (mult > 2 ? 2 : 1)) : (mult > 2 ? 2 : 1);
          const ny = horiz ? (mult > 2 ? 2 : 1) : Math.ceil(nL / (mult > 2 ? 2 : 1));
          const spanX = Math.max(db.w * 0.85, (nx - 1) * 0.65);
          const spanY = Math.max(db.h * 0.85, (ny - 1) * 0.65);
          for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
              const px = nx === 1 ? cx : cx - spanX / 2 + (spanX * i) / (nx - 1);
              const py = ny === 1 ? cy : cy - spanY / 2 + (spanY * j) / (ny - 1);
              if (pointInPoly(px, py, poly)) out.push(makeFixture(project, type, px, py, { rot, z: opts.z }));
            }
          }
        }
      }
      return out;
    };

    const tmp = Object.assign({}, project);
    const spacing = Math.max(0.25, Math.sqrt((b.w * b.h) / 2500));
    let best = null;
    for (let m = basePerDesk; m <= basePerDesk + 4; m++) {
      const fx = buildForCount(m);
      if (!fx.length) continue;
      best = fx;
      tmp.fixtures = fx;
      const r = compute(tmp, { spacing, skipUGR: true });
      if (r.Eavg >= target && r.coverage >= 80) break;
    }
    return best && best.length ? best : autoLayout(project, type, opts);
  }

  /** 計算燈具間距（鄰燈 X/Y 向間距、距牆距離、以及全圖相鄰燈距線段） */
  function fixtureSpacings(project, targetFixture) {
    const fxs = (project.fixtures || []).filter((f) => f.on !== false);
    const b = polyBounds(project.room.polygon);
    const rowTol = 0.65, colTol = 0.65;
    const pairs = [];
    const seen = new Set();

    for (const a of fxs) {
      let bestRight = null, bestDown = null;
      for (const c of fxs) {
        if (c.id === a.id) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        if (dx > 0.05 && Math.abs(dy) <= rowTol) {
          if (!bestRight || dx < bestRight.dist) bestRight = { a, b: c, dist: Math.hypot(dx, dy), dx, dy, axis: 'x' };
        }
        if (dy > 0.05 && Math.abs(dx) <= colTol) {
          if (!bestDown || dy < bestDown.dist) bestDown = { a, b: c, dist: Math.hypot(dx, dy), dx, dy, axis: 'y' };
        }
      }
      for (const p of [bestRight, bestDown]) {
        if (!p) continue;
        const key = [p.a.id, p.b.id].sort().join('|') + '|' + p.axis;
        if (!seen.has(key)) { seen.add(key); pairs.push(p); }
      }
    }

    let detail = null;
    if (targetFixture) {
      const f = targetFixture;
      let left = null, right = null, up = null, down = null, nearest = null;
      for (const c of fxs) {
        if (c.id === f.id) continue;
        const dx = c.x - f.x, dy = c.y - f.y, d = Math.hypot(dx, dy);
        if (!nearest || d < nearest.dist) nearest = { f: c, dist: d, dx, dy };
        if (dx < -0.05 && Math.abs(dy) <= rowTol && (!left || -dx < left.dist)) left = { f: c, dist: Math.hypot(dx, dy), dx: -dx };
        if (dx > 0.05 && Math.abs(dy) <= rowTol && (!right || dx < right.dist)) right = { f: c, dist: Math.hypot(dx, dy), dx };
        if (dy < -0.05 && Math.abs(dx) <= colTol && (!up || -dy < up.dist)) up = { f: c, dist: Math.hypot(dx, dy), dy: -dy };
        if (dy > 0.05 && Math.abs(dx) <= colTol && (!down || dy < down.dist)) down = { f: c, dist: Math.hypot(dx, dy), dy };
      }
      detail = {
        left, right, up, down, nearest,
        walls: {
          west: +(f.x - b.minX).toFixed(2),
          east: +(b.maxX - f.x).toFixed(2),
          north: +(f.y - b.minY).toFixed(2),
          south: +(b.maxY - f.y).toFixed(2),
          poly: +distToPoly(f.x, f.y, project.room.polygon).toFixed(2),
        },
      };
    }
    return { pairs, detail };
  }

  LX.calc = {
    compute, pointAt, autoLayout, layoutOverDesks, fixtureSpacings, makeFixture, defaultMountHeight, directAt, buildSources,
    tableFor, baseTable, clearCache,
    polyArea, polyPerimeter, polyBounds, pointInPoly, distToPoly,
  };
})((window.LX = window.LX || {}));
