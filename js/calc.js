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

  /** 單點水平照度（直接光，可納入隔間牆遮光） */
  function directAt(sources, x, y, z, walls) {
    let e = 0;
    for (const s of sources) {
      const dx = x - s.x, dy = y - s.y, dz = z - s.z;
      if (dz >= 0) continue;
      if (walls && walls.length && isBlockedByWall(s.x, s.y, s.z, x, y, z, walls)) continue;
      const d2 = dx * dx + dy * dy + dz * dz;
      const I = intensityToward(s, dx, dy, dz)[0];
      e += (I * (-dz / Math.sqrt(d2))) / d2;
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
    const heights = new Float32Array(nx * ny);
    const surfaceKinds = new Uint8Array(nx * ny);
    const deskIds = new Array(nx * ny);
    const floorDirect = zoneMode ? new Float32Array(nx * ny) : null;
    const mask = new Uint8Array(nx * ny); // 0 外部, 1 房間內, 2 計算區（排除牆邊帶）
    const margin = room.margin || 0;
    const zw = room.wp;
    const sources = buildSources(project);
    const walls = (project.calcWalls !== false && project.view?.walls !== false)
      ? (LX.cad && LX.cad.allWalls ? LX.cad.allWalls(project) : (project.cad?.walls || project.walls || []))
      : [];

    for (let j = 0; j < ny; j++) {
      const y = b.minY + (j + 0.5) * dy;
      for (let i = 0; i < nx; i++) {
        const x = b.minX + (i + 0.5) * dx;
        if (!pointInPoly(x, y, poly)) continue;
        mask[j * nx + i] = margin > 0 && distToPoly(x, y, poly) < margin ? 1 : 2;
        const surface = zoneMode && LX.cad ? LX.cad.surfaceAt(project, x, y) : { height: zw, kind: 'uniform' };
        heights[j * nx + i] = surface.height;
        surfaceKinds[j * nx + i] = surface.kind === 'desk' ? 1 : 0;
        deskIds[j * nx + i] = surface.desk?.id || null;
      }
    }

    // 直接光（納入隔間牆遮蔽）
    for (const s of sources) {
      for (let j = 0; j < ny; j++) {
        const yPt = b.minY + (j + 0.5) * dy;
        const yy = yPt - s.y;
        for (let i = 0; i < nx; i++) {
          const idx = j * nx + i;
          if (!mask[idx]) continue;
          const xPt = b.minX + (i + 0.5) * dx;
          const dz = heights[idx] - s.z;
          if (dz >= 0) continue;
          if (walls.length && isBlockedByWall(s.x, s.y, s.z, xPt, yPt, heights[idx], walls)) continue;
          const dz2 = dz * dz;
          const xx = xPt - s.x;
          const d2 = xx * xx + yy * yy + dz2;
          const I = intensityToward(s, xx, yy, dz)[0];
          if (I > 0) values[idx] += (I * (-dz / Math.sqrt(d2))) / d2;
          if (floorDirect) {
            if (!walls.length || !isBlockedByWall(s.x, s.y, s.z, xPt, yPt, 0, walls)) {
              const fdz = -s.z, fd2 = xx * xx + yy * yy + fdz * fdz;
              const fi = surfaceKinds[idx] ? intensityToward(s, xx, yy, fdz)[0] : I;
              if (fi > 0) floorDirect[idx] += (fi * (-fdz / Math.sqrt(fd2))) / fd2;
            }
          }
        }
      }
    }

    // 間接光（積分球近似）
    const area = polyArea(poly);
    const perim = polyPerimeter(poly);
    const cell = dx * dy;
    let fluxWP = 0;
    for (let i = 0; i < values.length; i++) if (mask[i]) fluxWP += (floorDirect ? floorDirect[i] : values[i]) * cell;
    let fluxDown = 0, fluxUp = 0;
    for (const s of sources) {
      const total = s.k * 1000;
      const dr = s.tilted ? Math.min(1, s.tbl.downRatio) : s.tbl.downRatio;
      fluxDown += total * dr;
      fluxUp += total * (1 - dr);
    }
    const Ac = area, Af = area, Aw = perim * Math.max(0.1, room.height - zw);
    const Atot = Ac + Af + Aw;
    const rhoAvg = (Ac * room.rhoC + Aw * room.rhoW + Af * room.rhoF) / Atot;
    const fluxWall = Math.max(0, fluxDown - fluxWP);
    const first = room.rhoF * Math.min(fluxWP, fluxDown) + room.rhoW * fluxWall + room.rhoC * fluxUp;
    const Eind = sources.length ? first / (Atot * (1 - rhoAvg)) : 0;
    let Edsum = 0, nIn = 0;
    for (let i = 0; i < values.length; i++) {
      if (mask[i]) { Edsum += values[i]; nIn++; values[i] += Eind; }
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
      if (v >= deskTarget * 0.95) passN++;
      if (v >= deskTarget * 0.8) beamN++;
    }
    if (!n) {
      // 計算區過小時退回整個房間
      for (let i = 0; i < values.length; i++) {
        if (!mask[i]) continue;
        const v = values[i];
        sum += v; n++; if (v < mn) mn = v; if (v > mx) mx = v;
        if (v >= deskTarget * 0.95) passN++;
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
    const deskStats = allDesks.map(d => ({ ...blank(), id: d.id, name: d.name, height: d.height ?? 0.75, manual: !!d.manual }));
    const deskMap = new Map(deskStats.map(d => [d.id, d]));
    function accumulate(s, v, tgt) {
      if (!s) return;
      s.n++; s.sum += v;
      s.Emin = Math.min(s.Emin, v);
      s.Emax = Math.max(s.Emax, v);
      if (v >= tgt * 0.95) s.passN++;
      if (v >= tgt * 0.8) s.beamN++;
    }
    if (zoneMode) {
      for (let i = 0; i < values.length; i++) if (mask[i]) {
        // Desk tasks retain edge samples, while wall exclusion applies to floor circulation.
        if (surfaceKinds[i]) {
          accumulate(surfaceStats.desk, values[i], deskTarget);
          accumulate(deskMap.get(deskIds[i]), values[i], deskTarget);
        } else if (mask[i] === 2) {
          accumulate(surfaceStats.floor, values[i], flTarget);
        }
      }
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
    const totalW = project.fixtures.reduce((a, f) => a + (f.on === false ? 0 : f.watts * (f.dim == null ? 1 : f.dim / 100)), 0);
    const totalLm = project.fixtures.reduce((a, f) => a + (f.on === false ? 0 : f.lumens * (f.dim == null ? 1 : f.dim / 100)), 0);
    const ugr = opts.skipUGR ? null : computeUGR(project, sources, Eind, b);

    return {
      grid: { nx, ny, dx, dy, x0: b.minX, y0: b.minY, values, mask, heights, surfaceKinds },
      surfaceStats, deskStats, gridMax, zoneMode,
      primaryTarget: zoneMode && !allDesks.length ? flTarget : project.target.Em,
      primaryU0: zoneMode && !allDesks.length ? 0.4 : project.target.U0,
      bounds: b,
      Eavg, Emin: mn, Emax: mx,
      U0: Eavg > 0 ? mn / Eavg : 0,
      Ud: mx > 0 ? mn / mx : 0,
      coverage, beamCoverage,
      Edirect: zoneMode ? Math.max(0, Eavg - Eind) : (nIn ? Edsum / nIn : 0),
      Eind,
      area, perim,
      totalW, totalLm,
      lpd: area > 0 ? totalW / area : 0,
      lpd100: Eavg > 0 && area > 0 ? (totalW / area) / (Eavg / 100) : 0,
      count: project.fixtures.filter((f) => f.on !== false).length,
      ugr,
      sources: sources.length,
      lightSources: sources,
      spacing: Math.max(dx, dy),
    };
  }

  /* ---------------- UGR ---------------- */
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
    compute, autoLayout, layoutOverDesks, fixtureSpacings, makeFixture, defaultMountHeight, directAt, buildSources,
    tableFor, baseTable, clearCache,
    polyArea, polyPerimeter, polyBounds, pointInPoly, distToPoly,
  };
})((window.LX = window.LX || {}));
