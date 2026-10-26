/* =========================================================================
 * photometry.js — 配光資料模型、IES (LM-63) / EULUMDAT (.ldt) 解析、配光產生器
 *
 * 內部統一格式（PhotoTable）：
 *   規則格點  C: 0..360 每 C_STEP 度（含 360 = 0）
 *             γ: 0..180 每 G_STEP 度（0 = 正下方 nadir，180 = 正上方）
 *   cd 值以「每 1000 lm」正規化，實際光強 = cd × (燈具流明 / 1000)
 * ========================================================================= */
(function (LX) {
  'use strict';

  const C_STEP = 5;
  const G_STEP = 1;
  const NC = 360 / C_STEP + 1; // 73
  const NG = 180 / G_STEP + 1; // 181
  const DEG = Math.PI / 180;

  function makeTable() {
    return { data: new Float32Array(NC * NG), beam: 0, downRatio: 1 };
  }

  /** 雙線性內插查詢光強 (cd / klm) */
  function lookup(tbl, cDeg, gDeg) {
    if (gDeg < 0) gDeg = 0;
    if (gDeg > 180) gDeg = 180;
    cDeg = ((cDeg % 360) + 360) % 360;
    const fc = cDeg / C_STEP;
    const fg = gDeg / G_STEP;
    const ic = Math.min(NC - 2, fc | 0);
    const ig = Math.min(NG - 2, fg | 0);
    const tc = fc - ic;
    const tg = fg - ig;
    const d = tbl.data;
    const a = d[ic * NG + ig];
    const b = d[ic * NG + ig + 1];
    const c = d[(ic + 1) * NG + ig];
    const e = d[(ic + 1) * NG + ig + 1];
    return (a * (1 - tg) + b * tg) * (1 - tc) + (c * (1 - tg) + e * tg) * tc;
  }

  /** 對表格積分求光通量 (lm)，回傳 {total, down} */
  function integrate(tbl) {
    const d = tbl.data;
    let total = 0;
    let down = 0;
    const dC = C_STEP * DEG;
    const dG = G_STEP * DEG;
    for (let ic = 0; ic < NC - 1; ic++) {
      for (let ig = 0; ig < NG - 1; ig++) {
        const g0 = ig * G_STEP * DEG;
        const g1 = g0 + dG;
        // 區塊平均光強 × 立體角
        const iAvg = 0.25 * (d[ic * NG + ig] + d[ic * NG + ig + 1] + d[(ic + 1) * NG + ig] + d[(ic + 1) * NG + ig + 1]);
        const sa = dC * (Math.cos(g0) - Math.cos(g1));
        const f = iAvg * sa;
        total += f;
        if (ig * G_STEP < 90) down += f;
      }
    }
    return { total, down };
  }

  function normalizeTo1000(tbl) {
    const { total, down } = integrate(tbl);
    if (total > 0) {
      const k = 1000 / total;
      for (let i = 0; i < tbl.data.length; i++) tbl.data[i] *= k;
      tbl.downRatio = down / total;
    }
    tbl.beam = computeBeam(tbl);
    return tbl;
  }

  /** 光束角：C0 與 C90 平面上，強度降到峰值 50% 的角度 ×2，取平均 */
  function computeBeam(tbl) {
    const planes = [0, 90, 180, 270];
    let sum = 0;
    let n = 0;
    for (const c of planes) {
      let peak = 0;
      let peakG = 0;
      for (let g = 0; g <= 90; g += 0.5) {
        const v = lookup(tbl, c, g);
        if (v > peak) { peak = v; peakG = g; }
      }
      if (peak <= 0) continue;
      let edge = 90;
      for (let g = peakG; g <= 90; g += 0.25) {
        if (lookup(tbl, c, g) < 0.5 * peak) { edge = g; break; }
      }
      sum += edge;
      n++;
    }
    return n ? (2 * sum) / n : 0;
  }

  /* ----------------------------------------------------------------------
   * 產生器：以廣義餘弦 I = I0·cos^n(γ) 建立配光
   *   beam      C0 平面（沿燈具長軸）光束角
   *   beam90    C90 平面光束角（未填 = 同 beam）
   *   upRatio   上照光比例 0..1（直接/間接吊燈）
   * -------------------------------------------------------------------- */
  function exponentForBeam(beamDeg) {
    const half = Math.max(2, Math.min(89, beamDeg / 2));
    return Math.log(0.5) / Math.log(Math.cos(half * DEG));
  }

  function generate(params) {
    const beam0 = params.beam || 90;
    const beam90 = params.beam90 || beam0;
    const up = Math.max(0, Math.min(0.95, params.upRatio || 0));
    const upBeam = params.upBeam || 120;
    const tbl = makeTable();
    const nUp = exponentForBeam(upBeam);
    const half0 = beam0 / 2;
    const half90 = beam90 / 2;
    // 先分別建立下照 / 上照，再依比例組合
    const downT = new Float32Array(NC * NG);
    const upT = new Float32Array(NC * NG);
    for (let ic = 0; ic < NC; ic++) {
      const c = ic * C_STEP * DEG;
      // 橢圓內插半角
      const cc = Math.cos(c), ss = Math.sin(c);
      const half = 1 / Math.sqrt((cc * cc) / (half0 * half0) + (ss * ss) / (half90 * half90));
      const n = exponentForBeam(half * 2);
      for (let ig = 0; ig < NG; ig++) {
        const g = ig * G_STEP;
        if (g < 90) downT[ic * NG + ig] = Math.pow(Math.cos(g * DEG), n);
        else if (g > 90) upT[ic * NG + ig] = Math.pow(Math.cos((180 - g) * DEG), nUp);
      }
    }
    const fD = integrate({ data: downT }).total || 1;
    const fU = integrate({ data: upT }).total || 1;
    for (let i = 0; i < tbl.data.length; i++) {
      tbl.data[i] = (downT[i] / fD) * 1000 * (1 - up) + (up > 0 ? (upT[i] / fU) * 1000 * up : 0);
    }
    return normalizeTo1000(tbl);
  }

  /** 將配光沿 γ 方向縮放到新的光束角（僅下半球），保持下照比例 */
  function scaleBeam(base, newBeam) {
    if (!base.beam || Math.abs(newBeam - base.beam) < 0.5) return base;
    const s = base.beam / newBeam;
    const tbl = makeTable();
    const down = new Float32Array(NC * NG);
    const up = new Float32Array(NC * NG);
    for (let ic = 0; ic < NC; ic++) {
      const c = ic * C_STEP;
      for (let ig = 0; ig < NG; ig++) {
        const g = ig * G_STEP;
        if (g < 90) {
          const gs = g * s;
          down[ic * NG + ig] = gs < 90 ? lookup(base, c, gs) : 0;
        } else if (g > 90) {
          up[ic * NG + ig] = base.data[ic * NG + ig];
        }
      }
    }
    const fD = integrate({ data: down }).total;
    const fU = integrate({ data: up }).total;
    const dr = base.downRatio;
    for (let i = 0; i < tbl.data.length; i++) {
      tbl.data[i] = (fD > 0 ? (down[i] / fD) * 1000 * dr : 0) + (fU > 0 ? (up[i] / fU) * 1000 * (1 - dr) : 0);
    }
    return normalizeTo1000(tbl);
  }

  /* ----------------------------------------------------------------------
   * 由任意 C / γ 角度清單 + 光強陣列（已展開至 0..360）建立規則表格
   * cAngles 必須遞增、涵蓋 0..360；planes[i] 對應 cAngles[i]，長度 = gAngles.length
   * -------------------------------------------------------------------- */
  function resample(cAngles, gAngles, planes) {
    const tbl = makeTable();
    const interp1 = (arr, xs, x) => {
      if (x < xs[0] || x > xs[xs.length - 1]) return 0;
      let i = 0;
      while (i < xs.length - 2 && xs[i + 1] < x) i++;
      const x0 = xs[i], x1 = xs[i + 1];
      const t = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
      return arr[i] * (1 - t) + arr[i + 1] * t;
    };
    for (let ic = 0; ic < NC; ic++) {
      const c = ic * C_STEP;
      // 找出兩側 C 平面
      let j = 0;
      while (j < cAngles.length - 2 && cAngles[j + 1] < c) j++;
      const c0 = cAngles[j], c1 = cAngles[Math.min(j + 1, cAngles.length - 1)];
      const t = c1 > c0 ? Math.max(0, Math.min(1, (c - c0) / (c1 - c0))) : 0;
      const p0 = planes[j], p1 = planes[Math.min(j + 1, planes.length - 1)];
      for (let ig = 0; ig < NG; ig++) {
        const g = ig * G_STEP;
        const v0 = interp1(p0, gAngles, g);
        const v1 = interp1(p1, gAngles, g);
        tbl.data[ic * NG + ig] = Math.max(0, v0 * (1 - t) + v1 * t);
      }
    }
    return tbl;
  }

  /** 依對稱性將部分 C 平面展開為 0..360 */
  function expandSymmetry(hAngles, planes) {
    const last = hAngles[hAngles.length - 1];
    const first = hAngles[0];
    let cs = [], ps = [];
    if (hAngles.length === 1) {
      // 旋轉對稱
      cs = [0, 360];
      ps = [planes[0], planes[0]];
    } else if (first === 0 && Math.abs(last - 90) < 1e-6) {
      // 四象限對稱
      for (let i = 0; i < hAngles.length; i++) { cs.push(hAngles[i]); ps.push(planes[i]); }
      for (let i = hAngles.length - 2; i >= 0; i--) { cs.push(180 - hAngles[i]); ps.push(planes[i]); }
      for (let i = 1; i < hAngles.length; i++) { cs.push(180 + hAngles[i]); ps.push(planes[i]); }
      for (let i = hAngles.length - 2; i >= 0; i--) { cs.push(360 - hAngles[i]); ps.push(planes[i]); }
    } else if (first === 0 && Math.abs(last - 180) < 1e-6) {
      // C0-C180 平面對稱
      for (let i = 0; i < hAngles.length; i++) { cs.push(hAngles[i]); ps.push(planes[i]); }
      for (let i = hAngles.length - 2; i >= 0; i--) { cs.push(360 - hAngles[i]); ps.push(planes[i]); }
    } else if (Math.abs(first - 90) < 1e-6 && Math.abs(last - 270) < 1e-6) {
      // C90-C270 平面對稱（IES 少見格式）
      const tmp = [];
      for (let i = 0; i < hAngles.length; i++) tmp.push([hAngles[i], planes[i]]);
      for (let i = 1; i < hAngles.length - 1; i++) {
        const a = 180 - hAngles[i];
        tmp.push([(a + 360) % 360, planes[i]]);
      }
      tmp.sort((a, b) => a[0] - b[0]);
      tmp.forEach(([c, p]) => { cs.push(c); ps.push(p); });
      if (cs[0] !== 0) { cs.unshift(0); ps.unshift(ps[ps.length - 1]); }
      cs.push(360); ps.push(ps[0]);
    } else {
      // 完整 0..360
      for (let i = 0; i < hAngles.length; i++) { cs.push(hAngles[i]); ps.push(planes[i]); }
      if (cs[cs.length - 1] < 360) { cs.push(360); ps.push(planes[0]); }
    }
    // 去除重複角度
    const C = [], P = [];
    cs.forEach((c, i) => {
      if (C.length && Math.abs(C[C.length - 1] - c) < 1e-6) return;
      C.push(c); P.push(ps[i]);
    });
    return { cAngles: C, planes: P };
  }

  /* ----------------------------------------------------------------------
   * IES LM-63 解析
   * -------------------------------------------------------------------- */
  function parseIES(text, fileName) {
    const lines = text.replace(/\r/g, '').split('\n');
    const meta = {};
    let i = 0;
    for (; i < lines.length; i++) {
      const ln = lines[i].trim();
      const m = ln.match(/^\[(\w+)\]\s*(.*)$/);
      if (m) { meta[m[1].toUpperCase()] = (meta[m[1].toUpperCase()] ? meta[m[1].toUpperCase()] + ' ' : '') + m[2]; continue; }
      if (/^TILT\s*=/i.test(ln)) break;
    }
    if (i >= lines.length) throw new Error('找不到 TILT= 行，非有效 IES 檔');
    const tiltLine = lines[i].trim();
    i++;
    let rest = lines.slice(i).join(' ');
    let nums = rest.split(/[\s,]+/).filter((s) => s.length).map(Number);
    let p = 0;
    if (!/TILT\s*=\s*NONE/i.test(tiltLine)) {
      if (/TILT\s*=\s*INCLUDE/i.test(tiltLine)) {
        p++; // lamp-to-luminaire geometry
        const nT = nums[p++];
        p += nT * 2;
      }
      // TILT=<file> 不支援外部檔，忽略
    }
    const lampCount = nums[p++];
    const lumPerLamp = nums[p++];
    const multiplier = nums[p++];
    const nV = nums[p++];
    const nH = nums[p++];
    p++; // photometric type
    const units = nums[p++];
    const width = nums[p++];
    const length = nums[p++];
    p++; // height
    const ballast = nums[p++];
    p++; // future use
    const inputWatts = nums[p++];
    if (!(nV > 0 && nH > 0)) throw new Error('IES 角度數量錯誤');
    const vA = nums.slice(p, p + nV); p += nV;
    const hA = nums.slice(p, p + nH); p += nH;
    const planes = [];
    for (let h = 0; h < nH; h++) {
      const arr = nums.slice(p, p + nV).map((v) => v * multiplier * (ballast || 1));
      p += nV;
      planes.push(arr);
    }
    if (planes.some((pl) => pl.length !== nV || pl.some((v) => !isFinite(v)))) throw new Error('IES 光強資料不完整');
    // 垂直角若為 90..180（僅上照）或 0..90 皆可由 resample 處理（範圍外 = 0）
    const ex = expandSymmetry(hA, planes);
    const tbl = resample(ex.cAngles, vA, ex.planes);
    const flux = integrate(tbl).total;
    normalizeTo1000(tbl);
    const toM = units === 1 ? 0.3048 : 1;
    const name = (meta.LUMINAIRE || meta.LUMCAT || fileName || 'IES 燈具').trim();
    return {
      table: tbl,
      lumens: Math.round(flux),
      lampLumens: lumPerLamp > 0 ? Math.round(lumPerLamp * lampCount) : null,
      watts: inputWatts > 0 ? inputWatts : null,
      width: Math.abs(width * toM) || 0.1,
      length: Math.abs(length * toM) || 0.1,
      name,
      manufacturer: (meta.MANUFAC || '').trim(),
      catalog: (meta.LUMCAT || '').trim(),
    };
  }

  /* ----------------------------------------------------------------------
   * EULUMDAT (.ldt) 解析
   * -------------------------------------------------------------------- */
  function parseLDT(text, fileName) {
    const L = text.replace(/\r/g, '').split('\n');
    let k = 0;
    const next = () => (L[k++] || '').trim();
    const num = () => parseFloat(next().replace(',', '.'));
    const company = next();
    next(); // Ityp
    const isym = num();
    const mc = num();
    next(); // Dc
    const ng = num();
    next(); // Dg
    next(); // report no.
    const lumName = next();
    const lumNo = next();
    next(); // file name
    next(); // date/user
    const lenMM = num();
    const widMM = num();
    next(); // height
    const laLen = num();
    const laWid = num();
    next(); next(); next(); next(); // heights of luminous area
    next(); // DFF
    const lorl = num();
    const conv = num() || 1;
    next(); // tilt
    const nSets = num();
    let lampFlux = 0;
    let watts = 0;
    let cct = '', cri = '';
    for (let s = 0; s < nSets; s++) {
      num(); // 燈數（負值 = LED 絕對光度）
      next(); // type
      lampFlux += num();
      const ct = next();
      const cr = next();
      if (!cct) cct = ct;
      if (!cri) cri = cr;
      watts += num();
    }
    for (let d = 0; d < 10; d++) next(); // direct ratios
    const cA = [];
    for (let c = 0; c < mc; c++) cA.push(num());
    const gA = [];
    for (let g = 0; g < ng; g++) gA.push(num());
    let mc1 = 1, mc2 = mc;
    if (isym === 1) { mc1 = 1; mc2 = 1; }
    else if (isym === 2) { mc1 = 1; mc2 = mc / 2 + 1; }
    else if (isym === 3) { mc1 = (3 * mc) / 4 + 1; mc2 = mc1 + mc / 2; }
    else if (isym === 4) { mc1 = 1; mc2 = mc / 4 + 1; }
    const nPl = mc2 - mc1 + 1;
    const rawPlanes = [];
    const k0 = lampFlux / 1000;
    for (let pI = 0; pI < nPl; pI++) {
      const arr = [];
      for (let g = 0; g < ng; g++) arr.push(num() * k0 * conv);
      rawPlanes.push(arr);
    }
    if (rawPlanes.some((pl) => pl.some((v) => !isFinite(v)))) throw new Error('LDT 光強資料不完整');
    let hAngles = [];
    let planes = [];
    if (isym === 1) { hAngles = [0]; planes = [rawPlanes[0]]; }
    else if (isym === 3) {
      // 資料為 C270→C360/0→C90；對 C90-C270 平面鏡像：I(C) = I(180 − C)
      const pairs = [];
      for (let pI = 0; pI < nPl; pI++) {
        const c = cA[(mc1 - 1 + pI) % mc];
        pairs.push([c % 360, rawPlanes[pI]]);
        pairs.push([((180 - c) % 360 + 360) % 360, rawPlanes[pI]]);
      }
      pairs.sort((a, b) => a[0] - b[0]);
      pairs.forEach(([c, pl]) => {
        if (hAngles.length && Math.abs(hAngles[hAngles.length - 1] - c) < 1e-6) return;
        hAngles.push(c); planes.push(pl);
      });
      if (hAngles[0] !== 0) { hAngles = [0]; planes = [rawPlanes[0]]; } // 後備
    } else {
      for (let pI = 0; pI < nPl; pI++) { hAngles.push(cA[mc1 - 1 + pI]); planes.push(rawPlanes[pI]); }
    }
    const ex = expandSymmetry(hAngles, planes);
    const tbl = resample(ex.cAngles, gA, ex.planes);
    const flux = integrate(tbl).total;
    normalizeTo1000(tbl);
    return {
      table: tbl,
      lumens: Math.round(flux || (lampFlux * (lorl || 100)) / 100),
      lampLumens: Math.round(lampFlux),
      watts: watts > 0 ? watts : null,
      width: (laWid || widMM || 100) / 1000,
      length: (laLen || lenMM || 100) / 1000,
      name: (lumName || fileName || 'LDT 燈具').trim(),
      manufacturer: company,
      catalog: lumNo,
      cct: parseInt(cct, 10) || null,
      cri: parseInt(cri, 10) || null,
    };
  }

  /** 序列化表格（存入專案 / 燈具庫） */
  function serializeTable(tbl) {
    // 以 0.1 cd 精度存陣列，減少 JSON 大小
    return { b: tbl.beam, dr: tbl.downRatio, d: Array.from(tbl.data, (v) => Math.round(v * 10) / 10) };
  }
  function deserializeTable(o) {
    const tbl = makeTable();
    tbl.data.set(o.d);
    tbl.beam = o.b;
    tbl.downRatio = o.dr;
    return tbl;
  }

  LX.photometry = {
    C_STEP, G_STEP, NC, NG,
    lookup, integrate, generate, scaleBeam, computeBeam,
    parseIES, parseLDT, serializeTable, deserializeTable,
  };
})((window.LX = window.LX || {}));
