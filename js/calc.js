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

  /** 單點水平照度（直接光） */
  function directAt(sources, x, y, z) {
    let e = 0;
    for (const s of sources) {
      const dx = x - s.x, dy = y - s.y, dz = z - s.z;
      if (dz >= 0) continue;
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
    const sp = opts.spacing || chooseSpacing(room, b);
    const nx = Math.max(2, Math.round(b.w / sp));
    const ny = Math.max(2, Math.round(b.h / sp));
    const dx = b.w / nx, dy = b.h / ny;
    const values = new Float32Array(nx * ny);
    const mask = new Uint8Array(nx * ny); // 0 外部, 1 房間內, 2 計算區（排除牆邊帶）
    const margin = room.margin || 0;
    const zw = room.wp;
    const sources = buildSources(project);

    for (let j = 0; j < ny; j++) {
      const y = b.minY + (j + 0.5) * dy;
      for (let i = 0; i < nx; i++) {
        const x = b.minX + (i + 0.5) * dx;
        if (!pointInPoly(x, y, poly)) continue;
        mask[j * nx + i] = margin > 0 && distToPoly(x, y, poly) < margin ? 1 : 2;
      }
    }

    // 直接光
    for (const s of sources) {
      const dz = zw - s.z;
      if (dz >= 0) continue;
      const dz2 = dz * dz;
      for (let j = 0; j < ny; j++) {
        const yy = b.minY + (j + 0.5) * dy - s.y;
        for (let i = 0; i < nx; i++) {
          const idx = j * nx + i;
          if (!mask[idx]) continue;
          const xx = b.minX + (i + 0.5) * dx - s.x;
          const d2 = xx * xx + yy * yy + dz2;
          const I = intensityToward(s, xx, yy, dz)[0];
          if (I > 0) values[idx] += (I * (-dz / Math.sqrt(d2))) / d2;
        }
      }
    }

    // 間接光（積分球近似）
    const area = polyArea(poly);
    const perim = polyPerimeter(poly);
    const cell = dx * dy;
    let fluxWP = 0;
    for (let i = 0; i < values.length; i++) if (mask[i]) fluxWP += values[i] * cell;
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
    let sum = 0, n = 0, mn = Infinity, mx = 0;
    for (let i = 0; i < values.length; i++) {
      if (mask[i] !== 2) continue;
      const v = values[i];
      sum += v; n++;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!n) {
      // 計算區過小時退回整個房間
      for (let i = 0; i < values.length; i++) {
        if (!mask[i]) continue;
        const v = values[i];
        sum += v; n++; if (v < mn) mn = v; if (v > mx) mx = v;
      }
    }
    const Eavg = n ? sum / n : 0;
    if (!isFinite(mn)) mn = 0;

    const totalW = project.fixtures.reduce((a, f) => a + (f.on === false ? 0 : f.watts * (f.dim == null ? 1 : f.dim / 100)), 0);
    const totalLm = project.fixtures.reduce((a, f) => a + (f.on === false ? 0 : f.lumens * (f.dim == null ? 1 : f.dim / 100)), 0);
    const ugr = opts.skipUGR ? null : computeUGR(project, sources, Eind, b);

    return {
      grid: { nx, ny, dx, dy, x0: b.minX, y0: b.minY, values, mask },
      bounds: b,
      Eavg, Emin: mn, Emax: mx,
      U0: Eavg > 0 ? mn / Eavg : 0,
      Ud: mx > 0 ? mn / mx : 0,
      Edirect: nIn ? Edsum / nIn : 0,
      Eind,
      area, perim,
      totalW, totalLm,
      lpd: area > 0 ? totalW / area : 0,
      lpd100: Eavg > 0 && area > 0 ? (totalW / area) / (Eavg / 100) : 0,
      count: project.fixtures.filter((f) => f.on !== false).length,
      ugr,
      sources: sources.length,
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
    const target = opts.target || project.target.Em;
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

  LX.calc = {
    compute, autoLayout, makeFixture, defaultMountHeight, directAt, buildSources,
    tableFor, baseTable, clearCache,
    polyArea, polyPerimeter, polyBounds, pointInPoly, distToPoly,
  };
})((window.LX = window.LX || {}));
