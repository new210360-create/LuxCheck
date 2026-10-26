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
    const max = Math.max(1, result ? result.Emax : 1);
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
      this.heat = result ? buildHeatCanvas(result, opt.colorMode, this.app.project.target.Em) : null;
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
      if (v.isolux && res) this.drawIsolux(ctx, res, pr.target.Em, forPrint);

      // 數值
      if (v.values && res) this.drawValues(ctx, res, forPrint);

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
          const hgt = f.z - room.wp;
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

      // 新增工具預覽
      if (app.tool === 'add' && this.hover && !forPrint) {
        const t = lib.get(app.activeType);
        if (t) {
          const [sx, sy] = this.toScreen(this.hover.sx, this.hover.sy);
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = '#38bdf8';
          const L = Math.max(7, (t.length || 0.1) * this.scale), Wd = Math.max(5, (t.width || 0.1) * this.scale);
          ctx.save(); ctx.translate(sx, sy); ctx.rotate((app.addRot || 0) * DEG);
          ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }

      // 色階圖例
      if (v.heatmap && res) this.drawLegend(ctx, W, H, forPrint);

      // 指北 / 比例尺
      this.drawScaleBar(ctx, W, H, forPrint);
      ctx.restore();
    }

    drawLegend(ctx, W, H, forPrint) {
      const sf = scaleFn(this.app.view.colorMode, this.result, this.app.project.target.Em);
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

    snap(v, e) {
      if (e && e.altKey) return v;
      const s = this.app.view.snap || 0;
      return s > 0 ? Math.round(v / s) * s : v;
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
        const [px, py] = pos(e);
        const app = this.app;
        if (e.button === 1 || e.button === 2 || app.tool === 'pan' || this.spaceDown) {
          this.drag = { kind: 'pan', px, py, ox: this.ox, oy: this.oy };
          return;
        }
        const [wx, wy] = this.toWorld(px, py);
        if (app.tool === 'add') {
          app.addFixtureAt(this.snap(wx, e), this.snap(wy, e));
          return;
        }
        const hit = this.hitTest(px, py);
        if (hit) {
          if (e.shiftKey || e.ctrlKey) {
            if (app.selection.has(hit.id)) app.selection.delete(hit.id); else app.selection.add(hit.id);
            app.onSelectionChanged();
          } else if (!app.selection.has(hit.id)) {
            app.selection = new Set([hit.id]);
            app.onSelectionChanged();
          }
          const sel = app.project.fixtures.filter((f) => app.selection.has(f.id));
          this.drag = { kind: 'move', wx, wy, items: sel.map((f) => ({ f, x: f.x, y: f.y })), anchor: hit, moved: false };
        } else {
          if (!e.shiftKey) { app.selection = new Set(); app.onSelectionChanged(); }
          this.drag = { kind: 'box', x0: px, y0: py, x1: px, y1: py, add: e.shiftKey };
        }
      });

      window.addEventListener('mousemove', (e) => {
        const [px, py] = pos(e);
        const [wx, wy] = this.toWorld(px, py);
        this.hover = { x: wx, y: wy, sx: this.snap(wx, e), sy: this.snap(wy, e) };
        const d = this.drag;
        if (!d) {
          if (e.target === cv) {
            this.app.onHover(wx, wy, sampleLux(this.result, wx, wy));
            if (this.app.tool === 'add') this.draw();
          }
          return;
        }
        if (d.kind === 'pan') {
          this.ox = d.ox + (px - d.px);
          this.oy = d.oy + (py - d.py);
          this.draw();
        } else if (d.kind === 'move') {
          let ddx = wx - d.wx, ddy = wy - d.wy;
          // 以錨點燈具對齊格點
          const a = d.items.find((it) => it.f === d.anchor);
          if (a) { ddx = this.snap(a.x + ddx, e) - a.x; ddy = this.snap(a.y + ddy, e) - a.y; }
          if (Math.abs(ddx) + Math.abs(ddy) > 1e-6) d.moved = true;
          for (const it of d.items) { it.f.x = +(it.x + ddx).toFixed(3); it.f.y = +(it.y + ddy).toFixed(3); }
          this.app.requestCompute(true);
          this.app.onHover(wx, wy, sampleLux(this.result, wx, wy));
        } else if (d.kind === 'box') {
          d.x1 = px; d.y1 = py;
          this.draw();
        }
      });

      window.addEventListener('mouseup', () => {
        const d = this.drag;
        if (!d) return;
        this.drag = null;
        if (d.kind === 'move' && d.moved) {
          this.app.commit('移動燈具');
          this.app.requestCompute(false);
          this.app.onSelectionChanged();
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

  LX.PlanView = PlanView;
  LX.render = { turbo, buildHeatCanvas, sampleLux, scaleFn };
})((window.LX = window.LX || {}));
