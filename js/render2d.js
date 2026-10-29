/* =========================================================================
 * render2d.js — 平面視圖：照度熱圖、等照度線、燈具、光束範圍、互動
 * ========================================================================= */
(function (LX) {
  'use strict';

  const DEG = Math.PI / 180;

  function turbo(t) {
    t = Math.max(0, Math.min(1, t));
    const r = 0.13572138 + t * (4.6153926 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))));
    const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))));
    const b = 0.1066733 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))));
    return [Math.max(0, Math.min(255, r * 255)) | 0, Math.max(0, Math.min(255, g * 255)) | 0, Math.max(0, Math.min(255, b * 255)) | 0];
  }

  /** 照度 → 色彩比例 t */
  function scaleFn(mode, result, target) {
    if (mode === 'target') {
      const top = target * 2;
      return { t: (v) => v / top, max: top, ticks: [0, target * 0.5, target, target * 1.5, top] };
    }
    const max = Math.max(1, result ? (result.gridMax??result.Emax) : 1);
    const step = niceStep(max / 5);
    const ticks = [];
    for (let v = 0; v <= max + 1e-6; v += step) ticks.push(v);
    return { t: (v) => v / max, max, ticks };
  }
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x || 1)));
    const m = x / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }

  function buildHeatCanvas(result, mode, target) {
    const g = result.grid;
    const c = document.createElement('canvas');
    c.width = g.nx;
    c.height = g.ny;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(g.nx, g.ny);
    const sf = scaleFn(mode, result, target);
    for (let i = 0; i < g.values.length; i++) {
      if (!g.mask[i]) { img.data[i * 4 + 3] = 0; continue; }
      const [r, gg, b] = turbo(sf.t(g.values[i]));
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** 雙線性取樣照度 */
  function sampleLux(result, x, y) {
    if (!result) return null;
    const g = result.grid;
    const fx = (x - g.x0) / g.dx - 0.5;
    const fy = (y - g.y0) / g.dy - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy);
    const get = (ii, jj) => {
      ii = Math.max(0, Math.min(g.nx - 1, ii));
      jj = Math.max(0, Math.min(g.ny - 1, jj));
      const k = jj * g.nx + ii;
      return g.mask[k] ? g.values[k] : null;
    };
    const a = get(i, j), b = get(i + 1, j), c = get(i, j + 1), d = get(i + 1, j + 1);
    const vals = [a, b, c, d];
    if (vals.every((v) => v == null)) return null;
    const fill = vals.find((v) => v != null);
    const [A, B, C, D] = vals.map((v) => (v == null ? fill : v));
    const tx = Math.max(0, Math.min(1, fx - i)), ty = Math.max(0, Math.min(1, fy - j));
    return (A * (1 - tx) + B * tx) * (1 - ty) + (C * (1 - tx) + D * tx) * ty;
  }

  class PlanView {
    constructor(canvas, app) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.app = app;
      this.scale = 20;
      this.ox = 40;
      this.oy = 40;
      this.heat = null;
      this.drag = null;
      this.hover = null;
      this.spaceDown = false;
      this.bind();
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    }

    resize() {
      const p = this.cv.parentElement;
      const dpr = window.devicePixelRatio || 1;
      this.cv.width = p.clientWidth * dpr;
      this.cv.height = p.clientHeight * dpr;
      this.cv.style.width = p.clientWidth + 'px';
      this.cv.style.height = p.clientHeight + 'px';
      this.dpr = dpr;
      if (!this._fitted) { this.fit(); this._fitted = true; }
      this.draw();
    }

    fit() {
      const b = LX.calc.polyBounds(this.app.project.room.polygon);
      const W = this.cv.width / (this.dpr || 1), H = this.cv.height / (this.dpr || 1);
      const pad = 60;
      this.scale = Math.max(2, Math.min((W - pad * 2) / (b.w || 1), (H - pad * 2) / (b.h || 1)));
      this.ox = (W - b.w * this.scale) / 2 - b.minX * this.scale;
      this.oy = (H - b.h * this.scale) / 2 - b.minY * this.scale;
      this.draw();
    }

    toScreen(x, y) { return [x * this.scale + this.ox, y * this.scale + this.oy]; }
    toWorld(px, py) { return [(px - this.ox) / this.scale, (py - this.oy) / this.scale]; }

    setResult(result) {
      this.result = result;
      const opt = this.app.view;
      this.heat = result ? buildHeatCanvas(result, opt.colorMode, result.primaryTarget) : null;
      this.draw();
    }

    /* ------------------------------ 繪圖 ------------------------------ */
    draw(ctxOverride, w, h, forPrint) {
      const ctx = ctxOverride || this.ctx;
      const dpr = ctxOverride ? 1 : this.dpr || 1;
      const W = w || this.cv.width / dpr, H = h || this.cv.height / dpr;
      const app = this.app;
      const pr = app.project;
      const room = pr.room;
      const v = app.view;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = forPrint ? '#ffffff' : '#0f141b';
      ctx.fillRect(0, 0, W, H);

      // 背景格線（1 m）
      if (v.gridLines && !forPrint) {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        const [wx0, wy0] = this.toWorld(0, 0);
        const [wx1, wy1] = this.toWorld(W, H);
        const step = this.scale < 6 ? 10 : this.scale < 15 ? 5 : 1;
        ctx.beginPath();
        for (let x = Math.floor(wx0 / step) * step; x <= wx1; x += step) { const [sx] = this.toScreen(x, 0); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
        for (let y = Math.floor(wy0 / step) * step; y <= wy1; y += step) { const [, sy] = this.toScreen(0, y); ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
        ctx.stroke();
      }

      const poly = room.polygon;
      const path = new Path2D();
      poly.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); i ? path.lineTo(sx, sy) : path.moveTo(sx, sy); });
      path.closePath();

      ctx.fillStyle = forPrint ? '#f3f4f6' : '#1a222d';
      ctx.fill(path);

      // 熱圖
      const res = this.result;
      if (v.heatmap && this.heat && res) {
        ctx.save();
        ctx.clip(path);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const [sx, sy] = this.toScreen(res.grid.x0, res.grid.y0);
        ctx.globalAlpha = 0.92;
        ctx.drawImage(this.heat, sx, sy, res.grid.nx * res.grid.dx * this.scale, res.grid.ny * res.grid.dy * this.scale);
        ctx.restore();
      }

      // 等照度線
      if (v.isolux && res) this.drawIsolux(ctx, res, res.primaryTarget, forPrint);

      // 數值
      if (v.values && res) this.drawValues(ctx, res, forPrint);

      // Imported CAD background & all office desks (CAD + manually added)
      const allDesks = LX.cad && LX.cad.allDesks ? LX.cad.allDesks(pr) : [...(pr.cad?.desks || []), ...(pr.desks || [])];
      if ((pr.cad && v.cad !== false) || allDesks.length) {
        ctx.save(); ctx.clip(path); ctx.lineWidth = forPrint ? 0.8 : 1;
        if (pr.cad && v.cad !== false) {
          ctx.strokeStyle = forPrint ? 'rgba(15,23,42,.55)' : 'rgba(235,245,255,.48)';
          for (const line of pr.cad.background || []) {
            ctx.beginPath(); line.points.forEach(([x, y], i) => { const s = this.toScreen(x, y); i ? ctx.lineTo(...s) : ctx.moveTo(...s); }); if (line.closed) ctx.closePath(); ctx.stroke();
          }
        }
        const deskStatMap = new Map((res?.deskStats || []).map(d => [d.id, d]));
        for (const desk of allDesks) {
          if (!pr.cad && v.cad === false && !desk.manual) continue;
          const isDeskSel = app.selectedDeskId === desk.id && !forPrint;
          ctx.beginPath();
          desk.polygon.forEach(([x, y], i) => { const s = this.toScreen(x, y); i ? ctx.lineTo(...s) : ctx.moveTo(...s); });
          ctx.closePath();
          ctx.fillStyle = isDeskSel ? 'rgba(250,204,21,0.18)' : (forPrint ? 'rgba(3,105,161,0.08)' : 'rgba(56,189,248,0.14)');
          ctx.fill();
          ctx.strokeStyle = isDeskSel ? '#facc15' : (forPrint ? '#0369a1' : '#38bdf8');
          ctx.lineWidth = isDeskSel ? 2.6 : 2;
          ctx.stroke();
          const b = LX.calc.polyBounds(desk.polygon), [x, y] = this.toScreen(b.minX, b.minY);
          if (b.w * this.scale > 42) {
            const st = deskStatMap.get(desk.id);
            ctx.fillStyle = isDeskSel ? '#fef08a' : (forPrint ? '#075985' : '#e0f2fe');
            ctx.font = 'bold 10px system-ui';
            ctx.fillText(`${desk.name} · ${Math.round((desk.height ?? 0.75) * 100)}cm`, x + 4, y + 12);
            if (st && st.n && b.h * this.scale > 26) {
              const ok = st.Eavg >= (pr.target?.Em || 500) && st.coverage >= 80;
              ctx.fillStyle = forPrint ? (ok ? '#15803d' : '#b91c1c') : (ok ? '#4ade80' : '#fbbf24');
              ctx.font = '10px system-ui';
              ctx.fillText(`${Math.round(st.Eavg)} lx · 覆蓋 ${Math.round(st.coverage)}%`, x + 4, y + 24);
            }
          }
        }
        // 隔間牆（真實牆體描繪）
        const allWalls = LX.cad && LX.cad.allWalls ? LX.cad.allWalls(pr) : (pr.cad?.walls || pr.walls || []);
        if (allWalls.length && v.walls !== false) {
          ctx.save();
          ctx.strokeStyle = forPrint ? '#0f172a' : '#cbd5e1';
          ctx.lineWidth = forPrint ? 2.6 : 3.2;
          ctx.lineCap = 'round';
          for (const w of allWalls) {
            const s1 = this.toScreen(w.x1 ?? w.p1[0], w.y1 ?? w.p1[1]);
            const s2 = this.toScreen(w.x2 ?? w.p2[0], w.y2 ?? w.p2[1]);
            ctx.beginPath();
            ctx.moveTo(s1[0], s1[1]);
            ctx.lineTo(s2[0], s2[1]);
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.restore();
      }

      // 牆邊排除帶
      if (room.margin > 0) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = forPrint ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        const inner = insetRect(poly, room.margin);
        if (inner) {
          ctx.beginPath();
          inner.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }

      // 牆
      ctx.strokeStyle = forPrint ? '#111' : '#e5e7eb';
      ctx.lineWidth = 3;
      ctx.stroke(path);

      // 尺寸標註
      this.drawDims(ctx, poly, forPrint);

      // 光束範圍
      const lib = new Map(pr.library.map((t) => [t.id, t]));
      if (v.beams) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        for (const f of pr.fixtures) {
          const hgt = f.z - LX.cad.surfaceAt(pr,f.x,f.y).height;
          if (hgt <= 0) continue;
          const r = hgt * Math.tan(Math.min(85, f.beam / 2) * DEG);
          const off = hgt * Math.tan((f.tilt || 0) * DEG);
          const rr = (f.rot || 0) * DEG;
          const cx = f.x - Math.sin(rr) * off, cy = f.y + Math.cos(rr) * off;
          const [sx, sy] = this.toScreen(cx, cy);
          ctx.strokeStyle = forPrint ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.28)';
          ctx.beginPath();
          ctx.arc(sx, sy, r * this.scale, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 燈具
      const sel = app.selection;
      for (const f of pr.fixtures) {
        const t = lib.get(f.typeId);
        if (!t) continue;
        const [sx, sy] = this.toScreen(f.x, f.y);
        const L = Math.max(7, (t.length || 0.1) * this.scale);
        const Wd = Math.max(t.shape === 'round' ? 7 : 4, (t.width || 0.1) * this.scale);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((f.rot || 0) * DEG);
        const isSel = sel.has(f.id);
        ctx.fillStyle = f.on === false ? '#4b5563' : isSel ? '#38bdf8' : forPrint ? '#fde047' : '#fef9c3';
        ctx.strokeStyle = isSel ? '#e0f2fe' : forPrint ? '#111' : '#111827';
        ctx.lineWidth = isSel ? 2 : 1.2;
        if (t.shape === 'round') {
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(L, Wd) / 2, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        } else {
          ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
          ctx.strokeRect(-L / 2, -Wd / 2, L, Wd);
        }
        if (f.tilt) {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 14); ctx.stroke();
        }
        ctx.restore();
      }

      // UGR 觀察點
      if (v.observers && res && res.ugr && !forPrint) {
        for (const vw of res.ugr.views) {
          const [sx, sy] = this.toScreen(vw.eye[0], vw.eye[1]);
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(Math.atan2(vw.dir[1], vw.dir[0]));
          ctx.fillStyle = '#a78bfa';
          ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#c4b5fd';
          ctx.font = '11px system-ui';
          ctx.fillText('UGR ' + vw.ugr.toFixed(1), sx + 8, sy - 8);
        }
      }

      // 燈具間距尺寸標註
      if (v.spacing !== false && pr.fixtures.length) {
        this.drawFixtureSpacings(ctx, pr, forPrint);
      }

      // 手動尺寸標註線
      this.drawCustomDims(ctx, pr, forPrint);

      // 智慧鎖點導引線與標記
      if (!forPrint && v.osnap !== false) {
        this.drawOsnapGuides(ctx, W, H);
      }

      // 偏移複製預覽
      if (this.drag && this.drag.kind === 'offset' && !forPrint) {
        this.drawOffsetPreview(ctx, lib);
      }

      // 框選
      if (this.drag && this.drag.kind === 'box') {
        const d = this.drag;
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = 'rgba(56,189,248,0.12)';
        ctx.setLineDash([4, 3]);
        ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
        ctx.strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
        ctx.setLineDash([]);
      }

      // 新增燈具預覽
      if (app.tool === 'add' && this.hover && !forPrint) {
        const t = lib.get(app.activeType);
        if (t) {
          const [sx, sy] = this.toScreen(this.hover.sx, this.hover.sy);
          ctx.globalAlpha = 0.65;
          ctx.fillStyle = '#38bdf8';
          const L = Math.max(7, (t.length || 0.1) * this.scale), Wd = Math.max(5, (t.width || 0.1) * this.scale);
          ctx.save(); ctx.translate(sx, sy); ctx.rotate((app.addRot || 0) * DEG);
          ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }

      // 新增辦公桌預覽
      if (app.tool === 'addDesk' && this.hover && !forPrint) {
        const [sx, sy] = this.toScreen(this.hover.sx, this.hover.sy);
        const dL = (app.deskSpec?.L || 1.4) * this.scale;
        const dW = (app.deskSpec?.W || 0.7) * this.scale;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((app.addRot || 0) * DEG);
        ctx.fillStyle = 'rgba(56,189,248,0.25)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(-dL / 2, -dW / 2, dL, dW);
        ctx.strokeRect(-dL / 2, -dW / 2, dL, dW);
        ctx.setLineDash([]);
        ctx.fillStyle = '#e0f2fe';
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`辦公桌 ${(app.deskSpec?.L || 1.4).toFixed(1)}×${(app.deskSpec?.W || 0.7).toFixed(1)}m`, 0, 4);
        ctx.restore();
      }

      // 色階圖例
      if (v.heatmap && res) this.drawLegend(ctx, W, H, forPrint);

      // 指北 / 比例尺
      this.drawScaleBar(ctx, W, H, forPrint);
      ctx.restore();
    }

    drawLegend(ctx, W, H, forPrint) {
      const sf = scaleFn(this.app.view.colorMode, this.result, this.result.primaryTarget);
      const w = 14, h = Math.min(220, H - 80);
      const x = W - 70, y = 20;
      for (let i = 0; i < h; i++) {
        const [r, g, b] = turbo(1 - i / h);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y + i, w, 1);
      }
      ctx.strokeStyle = forPrint ? '#000' : '#fff';
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = forPrint ? '#000' : '#e5e7eb';
      ctx.font = '11px system-ui';
      for (const tk of sf.ticks) {
        const yy = y + h - (tk / sf.max) * h;
        ctx.fillText(Math.round(tk) + ' lx', x + w + 4, yy + 4);
      }
      if (this.app.view.colorMode === 'target') {
        const yy = y + h / 2;
        ctx.strokeStyle = forPrint ? '#000' : '#fff';
        ctx.beginPath(); ctx.moveTo(x - 4, yy); ctx.lineTo(x + w + 2, yy); ctx.stroke();
      }
    }

    drawScaleBar(ctx, W, H, forPrint) {
      const target = 100;
      let m = niceStep(target / this.scale);
      const px = m * this.scale;
      const x = 20, y = H - 24;
      ctx.strokeStyle = forPrint ? '#000' : '#e5e7eb';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + px, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + px, y - 4); ctx.lineTo(x + px, y + 4); ctx.stroke();
      ctx.font = '11px system-ui';
      ctx.fillText(m + ' m', x + px + 6, y + 4);
    }

    drawDims(ctx, poly, forPrint) {
      ctx.save();
      ctx.fillStyle = forPrint ? '#111' : '#9ca3af';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
      const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ax, ay] = poly[j], [bx, by] = poly[i];
        const len = Math.hypot(bx - ax, by - ay);
        if (len * this.scale < 40) continue;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        let nx = -(by - ay) / len, ny = (bx - ax) / len;
        if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
        const [sx, sy] = this.toScreen(mx, my);
        ctx.fillText(len.toFixed(2) + ' m', sx + nx * 16, sy + ny * 16 + 4);
      }
      ctx.restore();
    }

    drawIsolux(ctx, res, target, forPrint) {
      const g = res.grid;
      const levels = this.app.view.colorMode === 'target'
        ? [target * 0.5, target * 0.75, target, target * 1.25, target * 1.5]
        : scaleFn('abs', res, target).ticks.slice(1);
      ctx.save();
      ctx.lineWidth = 1;
      ctx.font = '10px system-ui';
      for (const L of levels) {
        const isT = Math.abs(L - target) < 1e-6;
        ctx.strokeStyle = isT ? (forPrint ? '#000' : '#ffffff') : (forPrint ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)');
        ctx.lineWidth = isT ? 1.8 : 1;
        ctx.beginPath();
        let labelAt = null;
        for (let j = 0; j < g.ny - 1; j++) {
          for (let i = 0; i < g.nx - 1; i++) {
            const k = j * g.nx + i;
            if (!g.mask[k] || !g.mask[k + 1] || !g.mask[k + g.nx] || !g.mask[k + g.nx + 1]) continue;
            const a = g.values[k], b = g.values[k + 1], c = g.values[k + g.nx + 1], d = g.values[k + g.nx];
            const code = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
            if (code === 0 || code === 15) continue;
            const x0 = g.x0 + (i + 0.5) * g.dx, y0 = g.y0 + (j + 0.5) * g.dy;
            const lerp = (p, q) => (L - p) / (q - p || 1e-9);
            const top = [x0 + lerp(a, b) * g.dx, y0];
            const right = [x0 + g.dx, y0 + lerp(b, c) * g.dy];
            const bottom = [x0 + lerp(d, c) * g.dx, y0 + g.dy];
            const left = [x0, y0 + lerp(a, d) * g.dy];
            const segs = MS[code];
            for (const [e1, e2] of segs) {
              const pts = { t: top, r: right, b: bottom, l: left };
              const [p1x, p1y] = this.toScreen(...pts[e1]);
              const [p2x, p2y] = this.toScreen(...pts[e2]);
              ctx.moveTo(p1x, p1y);
              ctx.lineTo(p2x, p2y);
              if (!labelAt && (i + j) % 7 === 3) labelAt = [p1x, p1y];
            }
          }
        }
        ctx.stroke();
        if (labelAt) {
          ctx.fillStyle = forPrint ? '#000' : '#fff';
          ctx.fillText(Math.round(L), labelAt[0] + 2, labelAt[1] - 2);
        }
      }
      ctx.restore();
    }

    drawValues(ctx, res, forPrint) {
      const g = res.grid;
      const cellPx = Math.min(g.dx, g.dy) * this.scale;
      const stride = Math.max(1, Math.ceil(34 / cellPx));
      ctx.save();
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = forPrint ? '#000' : '#0b0f14';
      for (let j = Math.floor(stride / 2); j < g.ny; j += stride) {
        for (let i = Math.floor(stride / 2); i < g.nx; i += stride) {
          const k = j * g.nx + i;
          if (!g.mask[k]) continue;
          const [sx, sy] = this.toScreen(g.x0 + (i + 0.5) * g.dx, g.y0 + (j + 0.5) * g.dy);
          ctx.fillText(Math.round(g.values[k]), sx, sy + 3);
        }
      }
      ctx.restore();
    }

    /** 繪製燈具間距與選取燈具距牆距離標註 */
    drawFixtureSpacings(ctx, pr, forPrint) {
      if (!LX.calc.fixtureSpacings) return;
      const selIds = this.app.selection;
      const selFx = pr.fixtures.find((f) => selIds.has(f.id));
      const { pairs, detail } = LX.calc.fixtureSpacings(pr, selFx);
      ctx.save();
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';

      // 若燈具較多，非選取狀態下僅顯示第一列與第一行代表性間距＋所有與選取燈具相連的間距，避免畫面雜亂
      let minY = Infinity, minX = Infinity;
      for (const f of pr.fixtures) { if (f.y < minY) minY = f.y; if (f.x < minX) minX = f.x; }

      for (const p of pairs) {
        const isSelPair = selIds.has(p.a.id) || selIds.has(p.b.id);
        const isEdgeRep = (p.axis === 'x' && Math.abs(p.a.y - minY) < 0.7) || (p.axis === 'y' && Math.abs(p.a.x - minX) < 0.7);
        if (!isSelPair && pr.fixtures.length > 20 && !isEdgeRep) continue;
        const [x1, y1] = this.toScreen(p.a.x, p.a.y);
        const [x2, y2] = this.toScreen(p.b.x, p.b.y);
        const pxDist = Math.hypot(x2 - x1, y2 - y1);
        if (pxDist < 34) continue;

        ctx.strokeStyle = isSelPair ? (forPrint ? '#0284c7' : '#38bdf8') : (forPrint ? 'rgba(15,23,42,0.5)' : 'rgba(226,232,240,0.45)');
        ctx.lineWidth = isSelPair ? 1.6 : 1;
        ctx.setLineDash(isSelPair ? [] : [3, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const txt = p.dist.toFixed(2) + 'm';
        const tw = ctx.measureText(txt).width + 8;
        ctx.fillStyle = isSelPair ? (forPrint ? '#e0f2fe' : 'rgba(12,74,110,0.92)') : (forPrint ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.82)');
        ctx.fillRect(mx - tw / 2, my - 7, tw, 14);
        if (isSelPair) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.strokeRect(mx - tw / 2, my - 7, tw, 14);
        }
        ctx.fillStyle = isSelPair ? (forPrint ? '#0369a1' : '#7dd3fc') : (forPrint ? '#334155' : '#cbd5e1');
        ctx.fillText(txt, mx, my + 3.5);
      }

      // 選取單一燈具時，畫出至西／北牆邊距參考線
      if (selFx && detail && !forPrint) {
        const b = LX.calc.polyBounds(pr.room.polygon);
        const [sx, sy] = this.toScreen(selFx.x, selFx.y);
        const [wx0] = this.toScreen(b.minX, selFx.y);
        const [, ny0] = this.toScreen(selFx.x, b.minY);
        ctx.strokeStyle = 'rgba(250,204,21,0.55)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1.2;
        if (sx - wx0 > 32) {
          ctx.beginPath(); ctx.moveTo(wx0, sy); ctx.lineTo(sx, sy); ctx.stroke();
          ctx.fillStyle = '#fde047';
          ctx.fillText(`距牆 ${detail.walls.west.toFixed(2)}m`, (wx0 + sx) / 2, sy - 5);
        }
        if (sy - ny0 > 32) {
          ctx.beginPath(); ctx.moveTo(sx, ny0); ctx.lineTo(sx, sy); ctx.stroke();
          ctx.fillStyle = '#fde047';
          ctx.fillText(`${detail.walls.north.toFixed(2)}m`, sx + 22, (ny0 + sy) / 2 + 3);
        }
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    /** 繪製使用者自訂尺寸標註線與量測預覽 */
    drawCustomDims(ctx, pr, forPrint) {
      const dims = [...(pr.dims || [])];
      if (this.app.tool === 'dim' && this.dimStart && this.hover && !forPrint) {
        const [ex, ey] = this.applyOrtho(this.dimStart[0], this.dimStart[1], this.hover.sx, this.hover.sy, this.lastEvent);
        dims.push({ ax: this.dimStart[0], ay: this.dimStart[1], bx: ex, by: ey, preview: true });
      }
      if (!dims.length) return;
      ctx.save();
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      for (const d of dims) {
        const [x1, y1] = this.toScreen(d.ax, d.ay);
        const [x2, y2] = this.toScreen(d.bx, d.by);
        const dist = Math.hypot(d.bx - d.ax, d.by - d.ay);
        if (dist < 1e-4) continue;
        const color = d.preview ? '#fb923c' : (forPrint ? '#b45309' : '#facc15');
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // 端點圓點與尺寸線刻度
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const nx = -Math.sin(ang) * 6, ny = Math.cos(ang) * 6;
        ctx.beginPath();
        ctx.moveTo(x1 - nx, y1 - ny); ctx.lineTo(x1 + nx, y1 + ny);
        ctx.moveTo(x2 - nx, y2 - ny); ctx.lineTo(x2 + nx, y2 + ny);
        ctx.stroke();

        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const dx = Math.abs(d.bx - d.ax), dy = Math.abs(d.by - d.ay);
        const label = dx > 0.02 && dy > 0.02
          ? `${dist.toFixed(2)}m (ΔX ${dx.toFixed(2)}, ΔY ${dy.toFixed(2)})`
          : `${dist.toFixed(2)} m`;
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = forPrint ? '#fef3c7' : 'rgba(15,23,42,0.92)';
        ctx.fillRect(mx - tw / 2, my - 9, tw, 17);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - tw / 2, my - 9, tw, 17);
        ctx.fillStyle = color;
        ctx.fillText(label, mx, my + 3.5);
      }
      ctx.restore();
    }

    /** 繪製智慧鎖點導引線與正交提示 */
    drawOsnapGuides(ctx, W, H) {
      const snaps = this.activeSnaps || [];
      if (!snaps.length && !(this.drag && this.drag.orthoLocked)) return;
      ctx.save();
      for (const s of snaps) {
        if (s.guideX != null) {
          const [sx] = this.toScreen(s.guideX, 0);
          ctx.strokeStyle = 'rgba(56,189,248,0.75)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
        }
        if (s.guideY != null) {
          const [, sy] = this.toScreen(0, s.guideY);
          ctx.strokeStyle = 'rgba(56,189,248,0.75)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
        }
        if (s.x != null && s.y != null) {
          const [px, py] = this.toScreen(s.x, s.y);
          ctx.setLineDash([]);
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 2;
          ctx.strokeRect(px - 5, py - 5, 10, 10);
          ctx.beginPath();
          ctx.moveTo(px - 8, py); ctx.lineTo(px + 8, py);
          ctx.moveTo(px, py - 8); ctx.lineTo(px, py + 8);
          ctx.stroke();
          if (s.label) {
            ctx.font = '10px system-ui';
            const tw = ctx.measureText(s.label).width + 8;
            ctx.fillStyle = 'rgba(20,83,45,0.92)';
            ctx.fillRect(px + 8, py - 18, tw, 15);
            ctx.fillStyle = '#bbf7d0';
            ctx.fillText(s.label, px + 12, py - 7);
          }
        }
      }
      ctx.restore();
    }

    /** 繪製偏移複製即時預覽 */
    drawOffsetPreview(ctx, lib) {
      const d = this.drag;
      if (!d || (Math.abs(d.ddx || 0) + Math.abs(d.ddy || 0) < 1e-4)) return;
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.fillStyle = 'rgba(250,204,21,0.28)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.8;
      if (d.desk) {
        ctx.beginPath();
        d.desk.polygon.forEach(([x, y], i) => {
          const [sx, sy] = this.toScreen(x + d.ddx, y + d.ddy);
          i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
        });
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (d.items) {
        for (const it of d.items) {
          const t = lib.get(it.f.typeId);
          if (!t) continue;
          const [sx, sy] = this.toScreen(it.x + d.ddx, it.y + d.ddy);
          const L = Math.max(7, (t.length || 0.1) * this.scale);
          const Wd = Math.max(t.shape === 'round' ? 7 : 4, (t.width || 0.1) * this.scale);
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate((it.f.rot || 0) * DEG);
          if (t.shape === 'round') {
            ctx.beginPath(); ctx.arc(0, 0, Math.max(L, Wd) / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          } else {
            ctx.fillRect(-L / 2, -Wd / 2, L, Wd); ctx.strokeRect(-L / 2, -Wd / 2, L, Wd);
          }
          ctx.restore();
        }
      }
      const [ax, ay] = this.toScreen(d.wx, d.wy);
      const [bx, by] = this.toScreen(d.wx + d.ddx, d.wy + d.ddy);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      const dist = Math.hypot(d.ddx, d.ddy);
      const label = `偏移複製 ${dist.toFixed(2)}m (ΔX ${d.ddx.toFixed(2)}, ΔY ${d.ddy.toFixed(2)})`;
      ctx.font = 'bold 11px system-ui';
      const tw = ctx.measureText(label).width + 10;
      const mx = (ax + bx) / 2, my = (ay + by) / 2 - 12;
      ctx.fillStyle = 'rgba(15,23,42,0.92)';
      ctx.fillRect(mx - tw / 2, my - 9, tw, 17);
      ctx.strokeRect(mx - tw / 2, my - 9, tw, 17);
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText(label, mx, my + 3);
      ctx.restore();
    }

    /** 高解析度出圖（報告用） */
    renderImage(w, h) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const save = { scale: this.scale, ox: this.ox, oy: this.oy };
      const b = LX.calc.polyBounds(this.app.project.room.polygon);
      const pad = 50;
      this.scale = Math.min((w - pad * 2 - 60) / b.w, (h - pad * 2) / b.h);
      this.ox = (w - 60 - b.w * this.scale) / 2 - b.minX * this.scale;
      this.oy = (h - b.h * this.scale) / 2 - b.minY * this.scale;
      this.draw(c.getContext('2d'), w, h, true);
      Object.assign(this, save);
      return c.toDataURL('image/png');
    }

    /* ------------------------------ 互動 ------------------------------ */
    hitTest(px, py) {
      const pr = this.app.project;
      const lib = new Map(pr.library.map((t) => [t.id, t]));
      for (let i = pr.fixtures.length - 1; i >= 0; i--) {
        const f = pr.fixtures[i];
        const t = lib.get(f.typeId);
        if (!t) continue;
        const [sx, sy] = this.toScreen(f.x, f.y);
        const r = -(f.rot || 0) * DEG;
        const dx = px - sx, dy = py - sy;
        const lx = dx * Math.cos(r) - dy * Math.sin(r);
        const ly = dx * Math.sin(r) + dy * Math.cos(r);
        const L = Math.max(10, (t.length || 0.1) * this.scale) / 2 + 2;
        const W = Math.max(10, (t.width || 0.1) * this.scale) / 2 + 2;
        if (Math.abs(lx) <= L && Math.abs(ly) <= W) return f;
      }
      return null;
    }

    hitTestDesk(wx, wy) {
      const pr = this.app.project;
      const allDesks = LX.cad && LX.cad.allDesks ? LX.cad.allDesks(pr) : [...(pr.cad?.desks || []), ...(pr.desks || [])];
      for (let i = allDesks.length - 1; i >= 0; i--) {
        if (LX.calc.pointInPoly(wx, wy, allDesks[i].polygon)) return allDesks[i];
      }
      return null;
    }

    snap(v, e) {
      if (e && e.altKey) return v;
      const s = this.app.view.snap || 0;
      return s > 0 ? Math.round(v / s) * s : v;
    }

    isOrtho(e) {
      return Boolean(this.app.view.ortho || (e && e.shiftKey));
    }

    applyOrtho(x0, y0, x1, y1, e) {
      if (!this.isOrtho(e)) return [x1, y1, false];
      const dx = x1 - x0, dy = y1 - y0;
      if (Math.abs(dx) >= Math.abs(dy)) return [x1, y0, true];
      return [x0, y1, true];
    }

    /** 智慧鎖點：鎖定辦公桌中心/角點、空間中心、牆角、以及鄰燈 X/Y 對齊線 */
    computeSmartSnap(wx, wy, e, excludeIds) {
      if (e && e.altKey) { this.activeSnaps = []; return [wx, wy]; }
      const v = this.app.view;
      if (v.osnap === false) {
        this.activeSnaps = [];
        return [this.snap(wx, e), this.snap(wy, e)];
      }
      const pr = this.app.project;
      const tol = Math.min(0.45, Math.max(0.08, 11 / this.scale));
      const excl = excludeIds || new Set();
      const snaps = [];

      // 1. 點鎖點候選（桌面中心、桌面角點、空間中心、牆角、燈具中心）
      const ptCands = [];
      const b = LX.calc.polyBounds(pr.room.polygon);
      ptCands.push({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, label: '鎖點：空間中心' });
      for (const [px, py] of pr.room.polygon) ptCands.push({ x: px, y: py, label: '鎖點：牆角' });

      const allDesks = LX.cad && LX.cad.allDesks ? LX.cad.allDesks(pr) : [...(pr.cad?.desks || []), ...(pr.desks || [])];
      for (const d of allDesks) {
        if (excl.has(d.id)) continue;
        const db = LX.calc.polyBounds(d.polygon);
        ptCands.push({ x: (db.minX + db.maxX) / 2, y: (db.minY + db.maxY) / 2, label: `鎖點：${d.name}中心` });
        for (const [px, py] of d.polygon) ptCands.push({ x: px, y: py, label: `鎖點：${d.name}角點` });
      }
      if (this.app.tool === 'dim') {
        for (const f of pr.fixtures) ptCands.push({ x: f.x, y: f.y, label: `鎖點：燈具 ${f.id}` });
      }

      let bestPt = null, bestDist = tol;
      for (const c of ptCands) {
        const d = Math.hypot(wx - c.x, wy - c.y);
        if (d < bestDist) { bestDist = d; bestPt = c; }
      }
      if (bestPt) {
        this.activeSnaps = [{ x: bestPt.x, y: bestPt.y, guideX: bestPt.x, guideY: bestPt.y, label: bestPt.label }];
        return [+bestPt.x.toFixed(3), +bestPt.y.toFixed(3)];
      }

      // 2. 軸向對齊鎖點（對齊其他燈具 X 或 Y 座標、桌面中心軸線）
      let sx = this.snap(wx, e), sy = this.snap(wy, e);
      let bestX = tol * 0.85, bestY = tol * 0.85;
      let snapX = null, snapY = null;
      for (const f of pr.fixtures) {
        if (excl.has(f.id)) continue;
        const dx = Math.abs(wx - f.x), dy = Math.abs(wy - f.y);
        if (dx < bestX) { bestX = dx; snapX = { val: f.x, refY: f.y, label: '對齊鄰燈 X' }; }
        if (dy < bestY) { bestY = dy; snapY = { val: f.y, refX: f.x, label: '對齊鄰燈 Y' }; }
      }
      for (const d of allDesks) {
        if (excl.has(d.id)) continue;
        const db = LX.calc.polyBounds(d.polygon);
        const cx = (db.minX + db.maxX) / 2, cy = (db.minY + db.maxY) / 2;
        if (Math.abs(wx - cx) < bestX) { bestX = Math.abs(wx - cx); snapX = { val: cx, refY: cy, label: `對齊${d.name}中心 X` }; }
        if (Math.abs(wy - cy) < bestY) { bestY = Math.abs(wy - cy); snapY = { val: cy, refX: cx, label: `對齊${d.name}中心 Y` }; }
      }
      if (snapX) { sx = +snapX.val.toFixed(3); snaps.push({ x: sx, y: sy, guideX: sx, label: snapX.label }); }
      if (snapY) { sy = +snapY.val.toFixed(3); snaps.push({ x: sx, y: sy, guideY: sy, label: snapY.label }); }
      this.activeSnaps = snaps;
      return [sx, sy];
    }

    bind() {
      const cv = this.cv;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const [px, py] = pos(e);
        const [wx, wy] = this.toWorld(px, py);
        const k = Math.exp(-e.deltaY * 0.0015);
        this.scale = Math.max(1, Math.min(600, this.scale * k));
        this.ox = px - wx * this.scale;
        this.oy = py - wy * this.scale;
        this.draw();
      }, { passive: false });

      cv.addEventListener('mousedown', (e) => {
        this.lastEvent = e;
        const [px, py] = pos(e);
        const app = this.app;
        if (e.button === 1 || e.button === 2 || app.tool === 'pan' || this.spaceDown) {
          this.drag = { kind: 'pan', px, py, ox: this.ox, oy: this.oy };
          return;
        }
        const [wx, wy] = this.toWorld(px, py);
        const [sx, sy] = this.computeSmartSnap(wx, wy, e);

        if (app.tool === 'add') {
          app.addFixtureAt(sx, sy);
          return;
        }
        if (app.tool === 'addDesk') {
          if (app.addDeskAt) app.addDeskAt(sx, sy);
          return;
        }
        if (app.tool === 'dim') {
          if (!this.dimStart) {
            this.dimStart = [sx, sy];
          } else {
            const [ex, ey] = this.applyOrtho(this.dimStart[0], this.dimStart[1], sx, sy, e);
            if (Math.hypot(ex - this.dimStart[0], ey - this.dimStart[1]) > 0.02) {
              app.project.dims = app.project.dims || [];
              app.project.dims.push({ ax: this.dimStart[0], ay: this.dimStart[1], bx: ex, by: ey });
              app.commit('新增尺寸標註');
              if (app.updateDimUI) app.updateDimUI();
            }
            this.dimStart = null;
          }
          this.draw();
          return;
        }

        const hit = this.hitTest(px, py);
        if (hit) {
          app.selectedDeskId = null;
          if (e.shiftKey || e.ctrlKey) {
            if (app.selection.has(hit.id)) app.selection.delete(hit.id); else app.selection.add(hit.id);
            app.onSelectionChanged();
          } else if (!app.selection.has(hit.id)) {
            app.selection = new Set([hit.id]);
            app.onSelectionChanged();
          }
          const sel = app.project.fixtures.filter((f) => app.selection.has(f.id));
          if (app.tool === 'offset') {
            this.drag = { kind: 'offset', wx: hit.x, wy: hit.y, items: sel.map((f) => ({ f, x: f.x, y: f.y })), ddx: 0, ddy: 0 };
          } else {
            this.drag = { kind: 'move', wx, wy, items: sel.map((f) => ({ f, x: f.x, y: f.y })), anchor: hit, moved: false };
          }
          return;
        }

        // 檢查是否點選到辦公桌
        const hitDesk = this.hitTestDesk(wx, wy);
        if (hitDesk) {
          app.selection = new Set();
          app.selectedDeskId = hitDesk.id;
          app.onSelectionChanged();
          const db = LX.calc.polyBounds(hitDesk.polygon);
          const cx = (db.minX + db.maxX) / 2, cy = (db.minY + db.maxY) / 2;
          if (app.tool === 'offset') {
            this.drag = { kind: 'offset', wx: cx, wy: cy, desk: hitDesk, ddx: 0, ddy: 0 };
          } else {
            this.drag = { kind: 'moveDesk', wx, wy, cx, cy, desk: hitDesk, origPoly: hitDesk.polygon.map((p) => [p[0], p[1]]), moved: false };
          }
          return;
        }

        if (app.tool === 'offset' && app.selection.size) {
          const sel = app.project.fixtures.filter((f) => app.selection.has(f.id));
          this.drag = { kind: 'offset', wx: sx, wy: sy, items: sel.map((f) => ({ f, x: f.x, y: f.y })), ddx: 0, ddy: 0 };
          return;
        }

        app.selectedDeskId = null;
        if (!e.shiftKey) { app.selection = new Set(); app.onSelectionChanged(); }
        this.drag = { kind: 'box', x0: px, y0: py, x1: px, y1: py, add: e.shiftKey };
      });

      window.addEventListener('mousemove', (e) => {
        this.lastEvent = e;
        const [px, py] = pos(e);
        const [wx, wy] = this.toWorld(px, py);
        const d = this.drag;
        const excl = d && d.items ? new Set(d.items.map((it) => it.f.id)) : (d && d.desk ? new Set([d.desk.id]) : null);
        const [sx, sy] = this.computeSmartSnap(wx, wy, e, excl);
        this.hover = { x: wx, y: wy, sx, sy };

        if (!d) {
          if (e.target === cv) {
            this.app.onHover(wx, wy, sampleLux(this.result, wx, wy));
            if (this.app.tool === 'add' || this.app.tool === 'addDesk' || this.app.tool === 'dim' || (this.activeSnaps && this.activeSnaps.length)) {
              this.draw();
            }
          }
          return;
        }
        if (d.kind === 'pan') {
          this.ox = d.ox + (px - d.px);
          this.oy = d.oy + (py - d.py);
          this.draw();
        } else if (d.kind === 'move') {
          let ddx = wx - d.wx, ddy = wy - d.wy;
          const a = d.items.find((it) => it.f === d.anchor);
          if (a) {
            let [tx, ty, ortho] = this.applyOrtho(a.x, a.y, a.x + ddx, a.y + ddy, e);
            const [snx, sny] = this.computeSmartSnap(tx, ty, e, excl);
            if (ortho) {
              [tx, ty] = this.applyOrtho(a.x, a.y, snx, sny, e);
            } else {
              tx = snx; ty = sny;
            }
            ddx = tx - a.x; ddy = ty - a.y;
          }
          if (Math.abs(ddx) + Math.abs(ddy) > 1e-6) d.moved = true;
          for (const it of d.items) { it.f.x = +(it.x + ddx).toFixed(3); it.f.y = +(it.y + ddy).toFixed(3); }
          this.app.requestCompute(true);
          this.app.onHover(wx, wy, sampleLux(this.result, wx, wy));
        } else if (d.kind === 'moveDesk') {
          let ddx = wx - d.wx, ddy = wy - d.wy;
          let [tx, ty] = this.applyOrtho(d.cx, d.cy, d.cx + ddx, d.cy + ddy, e);
          const [snx, sny] = this.computeSmartSnap(tx, ty, e, excl);
          if (this.isOrtho(e)) [tx, ty] = this.applyOrtho(d.cx, d.cy, snx, sny, e);
          else { tx = snx; ty = sny; }
          ddx = tx - d.cx; ddy = ty - d.cy;
          if (Math.abs(ddx) + Math.abs(ddy) > 1e-6) d.moved = true;
          d.desk.polygon = d.origPoly.map(([x, y]) => [+(x + ddx).toFixed(3), +(y + ddy).toFixed(3)]);
          this.app.requestCompute(true);
        } else if (d.kind === 'offset') {
          let [tx, ty] = this.applyOrtho(d.wx, d.wy, sx, sy, e);
          d.ddx = +(tx - d.wx).toFixed(3);
          d.ddy = +(ty - d.wy).toFixed(3);
          this.draw();
        } else if (d.kind === 'box') {
          d.x1 = px; d.y1 = py;
          this.draw();
        }
      });

      window.addEventListener('mouseup', () => {
        const d = this.drag;
        if (!d) return;
        this.drag = null;
        this.activeSnaps = [];
        if (d.kind === 'move' && d.moved) {
          this.app.commit('移動燈具');
          this.app.requestCompute(false);
          this.app.onSelectionChanged();
        } else if (d.kind === 'moveDesk' && d.moved) {
          this.app.commit('移動辦公桌');
          this.app.requestCompute(false);
          this.app.onSelectionChanged();
        } else if (d.kind === 'offset' && (Math.abs(d.ddx) + Math.abs(d.ddy) > 0.05)) {
          if (d.desk && this.app.offsetCopyDesk) {
            this.app.offsetCopyDesk(d.desk, d.ddx, d.ddy, 1);
          } else if (this.app.offsetCopySelected) {
            this.app.offsetCopySelected(d.ddx, d.ddy, 1);
          }
        } else if (d.kind === 'box') {
          const [ax, ay] = this.toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
          const [bx, by] = this.toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
          if (Math.abs(d.x1 - d.x0) > 3 || Math.abs(d.y1 - d.y0) > 3) {
            const s = d.add ? new Set(this.app.selection) : new Set();
            for (const f of this.app.project.fixtures) if (f.x >= ax && f.x <= bx && f.y >= ay && f.y <= by) s.add(f.id);
            this.app.selection = s;
            this.app.onSelectionChanged();
          }
          this.draw();
        } else {
          this.draw();
        }
      });

      window.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { this.spaceDown = true; e.preventDefault(); } });
      window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.spaceDown = false; });
    }
  }

  // 等照度線 marching squares 線段表（角點：a 左上, b 右上, c 右下, d 左下）
  const MS = {
    1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']],
    5: [['l', 't'], ['b', 'r']], 6: [['t', 'b']], 7: [['l', 't']], 8: [['l', 't']],
    9: [['t', 'b']], 10: [['t', 'r'], ['l', 'b']], 11: [['t', 'r']], 12: [['l', 'r']],
    13: [['b', 'r']], 14: [['l', 'b']],
  };

  /** 僅對矩形 / 軸向多邊形做近似內縮（顯示用） */
  function insetRect(poly, m) {
    // 以角平分線方式內縮（適用簡單凸/凹直角多邊形）
    const n = poly.length;
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) area += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
    const sign = area > 0 ? 1 : -1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
      const e1 = norm([p1[0] - p0[0], p1[1] - p0[1]]);
      const e2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
      const n1 = [-e1[1] * sign, e1[0] * sign];
      const n2 = [-e2[1] * sign, e2[0] * sign];
      const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]);
      const cos = bis[0] * n1[0] + bis[1] * n1[1];
      if (Math.abs(cos) < 1e-3) return null;
      out.push([p1[0] + (bis[0] * m) / cos, p1[1] + (bis[1] * m) / cos]);
    }
    return out;
  }
  function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

  /** DIALux 經典彩虹假色彩 (0.0=藍, 0.2=青, 0.4=綠, 0.6=黃, 0.8=橘, 0.95=紅, 1.0=白) */
  function dialuxColor(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [
      [0.0,  [10, 20, 140]],
      [0.18, [0, 180, 240]],
      [0.36, [20, 215, 60]],
      [0.55, [250, 230, 10]],
      [0.72, [255, 125, 0]],
      [0.88, [235, 25, 25]],
      [1.0,  [255, 255, 255]]
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const s1 = stops[i], s2 = stops[i + 1];
      if (t >= s1[0] && t <= s2[0]) {
        const f = (t - s1[0]) / (s2[0] - s1[0]);
        return [
          Math.round(s1[1][0] + f * (s2[1][0] - s1[1][0])),
          Math.round(s1[1][1] + f * (s2[1][1] - s1[1][1])),
          Math.round(s1[1][2] + f * (s2[1][2] - s1[1][2]))
        ];
      }
    }
    return [255, 255, 255];
  }

  /** 生成高解析度 3D 照度偽彩色畫布貼圖（支援平滑漸層、等照度線與數值標註） */
  function buildFalseColorCanvas(result, opts) {
    if (!result || !result.grid) return null;
    opts = opts || {};
    const g = result.grid;
    const mode = opts.mode || 'target';
    const target = opts.target || result.primaryTarget || 500;
    const palette = opts.palette || 'dialux';
    const showIsolines = opts.isolux !== false;
    const showValues = opts.values === true;
    const colormapFn = palette === 'turbo' ? turbo : dialuxColor;
    const sf = scaleFn(mode, result, target);

    // 1. 低解析原始網格
    const cLow = document.createElement('canvas');
    cLow.width = g.nx;
    cLow.height = g.ny;
    const ctxLow = cLow.getContext('2d');
    const imgData = ctxLow.createImageData(g.nx, g.ny);
    for (let i = 0; i < g.values.length; i++) {
      if (!g.mask[i]) {
        imgData.data[i * 4 + 3] = 0;
        continue;
      }
      const [r, gg, b] = colormapFn(sf.t(g.values[i]));
      imgData.data[i * 4] = r;
      imgData.data[i * 4 + 1] = gg;
      imgData.data[i * 4 + 2] = b;
      imgData.data[i * 4 + 3] = 255;
    }
    ctxLow.putImageData(imgData, 0, 0);

    // 2. 升頻至高解析平滑畫布 (1024 - 1536 px)
    const maxRes = opts.resolution || 1024;
    const aspect = (g.ny * g.dy) / (g.nx * g.dx || 1);
    const w = aspect <= 1 ? maxRes : Math.max(256, Math.round(maxRes / aspect));
    const h = aspect <= 1 ? Math.max(256, Math.round(maxRes * aspect)) : maxRes;
    const cHigh = document.createElement('canvas');
    cHigh.width = w;
    cHigh.height = h;
    const ctx = cHigh.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cLow, 0, 0, w, h);

    // 3. 在 3D 貼圖上繪製清晰的等照度線 (Isolux lines)
    if (showIsolines) {
      const levels = mode === 'target'
        ? [target * 0.25, target * 0.5, target * 0.75, target, target * 1.25, target * 1.5, target * 2]
        : sf.ticks.slice(1);

      ctx.save();
      for (const L of levels) {
        const isTarget = Math.abs(L - target) < 1e-4;
        ctx.strokeStyle = isTarget ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = isTarget ? 2.8 : 1.2;
        ctx.beginPath();
        let labelPt = null;

        for (let j = 0; j < g.ny - 1; j++) {
          for (let i = 0; i < g.nx - 1; i++) {
            const k = j * g.nx + i;
            if (!g.mask[k] || !g.mask[k + 1] || !g.mask[k + g.nx] || !g.mask[k + g.nx + 1]) continue;
            const a = g.values[k], b = g.values[k + 1], c = g.values[k + g.nx + 1], d = g.values[k + g.nx];
            const code = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
            if (code === 0 || code === 15) continue;

            const lerp = (p, q) => (L - p) / (q - p || 1e-9);
            const x0 = (i + 0.5) / g.nx, y0 = (j + 0.5) / g.ny;
            const top = [x0 + lerp(a, b) / g.nx, y0];
            const right = [x0 + 1 / g.nx, y0 + lerp(b, c) / g.ny];
            const bottom = [x0 + lerp(d, c) / g.nx, y0 + 1 / g.ny];
            const left = [x0, y0 + lerp(a, d) / g.ny];

            const segs = MS[code];
            if (!segs) continue;
            for (const [e1, e2] of segs) {
              const pts = { t: top, r: right, b: bottom, l: left };
              const p1 = pts[e1], p2 = pts[e2];
              ctx.moveTo(p1[0] * w, p1[1] * h);
              ctx.lineTo(p2[0] * w, p2[1] * h);
              if (!labelPt && (i + j) % 8 === 4) labelPt = [p1[0] * w, p1[1] * h];
            }
          }
        }
        ctx.stroke();

        if (labelPt) {
          ctx.save();
          const txt = isTarget ? `${Math.round(L)} lx ★` : `${Math.round(L)} lx`;
          ctx.font = isTarget ? 'bold 14px system-ui, sans-serif' : '11px system-ui, sans-serif';
          const tm = ctx.measureText(txt);
          const pw = tm.width + 8, ph = 18;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.fillRect(labelPt[0] - pw / 2, labelPt[1] - ph / 2, pw, ph);
          ctx.strokeStyle = isTarget ? '#facc15' : 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(labelPt[0] - pw / 2, labelPt[1] - ph / 2, pw, ph);
          ctx.fillStyle = isTarget ? '#facc15' : '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, labelPt[0], labelPt[1]);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 4. 若開啟數值顯示，將關鍵點照度打印到貼圖上
    if (showValues) {
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0f172a';
      const stride = Math.max(1, Math.round(Math.max(g.nx, g.ny) / 16));
      for (let j = Math.floor(stride / 2); j < g.ny; j += stride) {
        for (let i = Math.floor(stride / 2); i < g.nx; i += stride) {
          const k = j * g.nx + i;
          if (!g.mask[k]) continue;
          const px = ((i + 0.5) / g.nx) * w;
          const py = ((j + 0.5) / g.ny) * h;
          ctx.fillText(Math.round(g.values[k]), px, py);
        }
      }
      ctx.restore();
    }

    return cHigh;
  }

  LX.PlanView = PlanView;
  LX.render = { turbo, dialuxColor, buildHeatCanvas, buildFalseColorCanvas, sampleLux, scaleFn, MS };
})((window.LX = window.LX || {}));
