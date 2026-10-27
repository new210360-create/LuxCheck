/* =========================================================================
 * main.js — 應用程式狀態、介面綁定、復原、存檔、匯入匯出
 * ========================================================================= */
(function (LX) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const STORE_KEY = 'luxcheck.project.v1';
  const fmt = (v, d = 0) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d));

  /* ------------------------------------------------------------------ */
  function rectPoly(L, W) { return [[0, 0], [L, 0], [L, W], [0, W]]; }
  function lPoly(L, W, cl, cw) {
    cl = Math.min(cl, L - 0.5); cw = Math.min(cw, W - 0.5);
    return [[0, 0], [L, 0], [L, W - cw], [L - cl, W - cw], [L - cl, W], [0, W]];
  }

  function defaultProject() {
    const std = LX.STANDARDS.find((s) => s.id === 'office-open');
    const pr = {
      version: 1,
      name: '開放式辦公室（範例）',
      room: {
        shape: 'rect', L: 30, W: 18, cutL: 10, cutW: 6,
        polygon: rectPoly(30, 18),
        height: 3.0, wp: 0.75, margin: 0.5, mf: 0.8,
        rhoC: 0.7, rhoW: 0.5, rhoF: 0.2, grid: 0,
      },
      standardId: std.id,
      target: { Em: std.Em, UGR: std.UGR, U0: std.U0, Ra: std.Ra },
      lpdLimit: LX.DEFAULT_LPD_LIMIT,
      library: clone(LX.DEFAULT_LIBRARY),
      fixtures: [],
    };
    const type = pr.library.find((t) => t.id === 'dl-panel-6060-ugr19') || pr.library[0];
    pr.fixtures = LX.calc.autoLayout(pr, type, { targetU0: std.U0 });
    return pr;
  }

  /* ------------------------------------------------------------------ */
  const app = {
    project: null,
    selection: new Set(),
    tool: 'select',
    activeType: null,
    activeCat: 'all',
    addRot: 0,
    view: { heatmap: true, isolux: true, values: false, beams: false, observers: true, colorMode: 'target', snap: 0.05, mode: '2d' },
    result: null,
    undoStack: [],
    redoStack: [],

    init() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
      this.project = saved && saved.room && saved.library ? saved : defaultProject();
      // 同步最新舞光預設燈具庫
      for (const d of LX.DEFAULT_LIBRARY) {
        if (!this.project.library.some((x) => x.id === d.id)) {
          this.project.library.push(clone(d));
        }
      }
      this.activeType = (this.project.library.find((t) => t.id === 'dl-panel-6060-ugr19') || this.project.library[0]).id;
      this.plan = new LX.PlanView($('plan'), this);
      this.v3d = new LX.View3D($('wrap3d'), this);
      bindUI();
      this.refreshAll();
      this.undoStack = [this.snapshot()];
    },

    snapshot() {
      const p = this.project;
      return JSON.stringify({ name: p.name, room: p.room, standardId: p.standardId, target: p.target, lpdLimit: p.lpdLimit, fixtures: p.fixtures });
    },
    commit() {
      const s = this.snapshot();
      if (this.undoStack[this.undoStack.length - 1] === s) return;
      this.undoStack.push(s);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
      this.autosave();
    },
    restore(s) {
      Object.assign(this.project, JSON.parse(s));
      const ids = new Set(this.project.fixtures.map((f) => f.id));
      this.selection = new Set([...this.selection].filter((id) => ids.has(id)));
      this.refreshAll();
    },
    undo() {
      if (this.undoStack.length < 2) return;
      this.redoStack.push(this.undoStack.pop());
      this.restore(this.undoStack[this.undoStack.length - 1]);
    },
    redo() {
      const s = this.redoStack.pop();
      if (!s) return;
      this.undoStack.push(s);
      this.restore(s);
    },
    autosave() {
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.project)); } catch (e) { console.warn('自動儲存失敗', e); }
      }, 500);
    },

    refreshAll() {
      fillRoomUI();
      fillStdUI();
      renderLibrary();
      fillTypeSelects();
      this.onSelectionChanged();
      this.requestCompute(false);
    },

    /* ---------- 計算排程 ---------- */
    requestCompute(fast) {
      this._fast = fast;
      if (!this._pending) {
        this._pending = true;
        requestAnimationFrame(() => { this._pending = false; this.runCompute(this._fast); });
      }
      clearTimeout(this._fullT);
      if (fast) this._fullT = setTimeout(() => this.runCompute(false), 350);
    },
    runCompute(fast) {
      const t0 = performance.now();
      const pr = this.project;
      const b = LX.calc.polyBounds(pr.room.polygon);
      let opts = {};
      if (fast) {
        opts = { spacing: Math.max(0.3, Math.sqrt((b.w * b.h) / 2500)), skipUGR: true };
      }
      const res = LX.calc.compute(pr, opts);
      if (fast && this.result) res.ugr = this.result.ugr;
      this.result = res;
      const dt = performance.now() - t0;
      this.plan.setResult(res);
      renderResults();
      $('stCalc').textContent = `${res.grid.nx}×${res.grid.ny} 點 · ${res.sources} 光源 · ${dt.toFixed(0)} ms${fast ? '（預覽）' : ''}`;
      if (!fast) {
        if (this.view.mode === '3d') this.v3d.rebuild();
        this.autosave();
      }
    },

    /* ---------- 燈具操作 ---------- */
    typeById(id) { return this.project.library.find((t) => t.id === id); },
    selected() { return this.project.fixtures.filter((f) => this.selection.has(f.id)); },

    addFixtureAt(x, y) {
      const t = this.typeById(this.activeType);
      if (!t) return;
      if (!LX.calc.pointInPoly(x, y, this.project.room.polygon)) return;
      const f = LX.calc.makeFixture(this.project, t, x, y, { rot: this.addRot });
      this.project.fixtures.push(f);
      this.selection = new Set([f.id]);
      this.commit();
      this.onSelectionChanged();
      this.requestCompute(false);
    },
    deleteSelected() {
      if (!this.selection.size) return;
      this.project.fixtures = this.project.fixtures.filter((f) => !this.selection.has(f.id));
      this.selection.clear();
      this.commit();
      this.onSelectionChanged();
      this.requestCompute(false);
    },
    duplicateSelected() {
      const sel = this.selected();
      if (!sel.length) return;
      const ns = new Set();
      for (const f of sel) {
        const t = this.typeById(f.typeId);
        const n = Object.assign(LX.calc.makeFixture(this.project, t, f.x + 0.6, f.y + 0.6), clone(f));
        n.id = LX.calc.makeFixture(this.project, t, 0, 0).id;
        n.x = +(f.x + 0.6).toFixed(3); n.y = +(f.y + 0.6).toFixed(3);
        this.project.fixtures.push(n);
        ns.add(n.id);
      }
      this.selection = ns;
      this.commit();
      this.onSelectionChanged();
      this.requestCompute(false);
    },
    nudge(dx, dy) {
      const sel = this.selected();
      if (!sel.length) return;
      sel.forEach((f) => { f.x = +(f.x + dx).toFixed(3); f.y = +(f.y + dy).toFixed(3); });
      this.onSelectionChanged();
      this.requestCompute(true);
      clearTimeout(this._nudgeT);
      this._nudgeT = setTimeout(() => this.commit(), 400);
    },
    rotateSelected() {
      const sel = this.selected();
      if (sel.length) {
        sel.forEach((f) => { f.rot = ((f.rot || 0) + 90) % 360; });
        this.commit();
        this.onSelectionChanged();
        this.requestCompute(false);
      } else if (this.tool === 'add') {
        this.addRot = (this.addRot + 90) % 360;
        this.plan.draw();
      }
    },

    onSelectionChanged() {
      fillSelectionUI();
      renderPolar();
      this.plan.draw();
    },
    onHover(x, y, lux) {
      $('stPos').textContent = `x ${x.toFixed(2)} m, y ${y.toFixed(2)} m`;
      $('stLux').textContent = lux == null ? '— lx' : `${Math.round(lux)} lx`;
    },
  };
  LX.app = app;

  /* ======================= 空間設定 ======================= */
  function fillRoomUI() {
    const r = app.project.room;
    $('projName').value = app.project.name;
    $('roomShape').value = r.shape;
    $('roomL').value = r.L; $('roomW').value = r.W;
    $('cutL').value = r.cutL; $('cutW').value = r.cutW;
    $('roomH').value = r.height; $('roomWp').value = r.wp;
    $('roomMargin').value = r.margin; $('roomMf').value = r.mf;
    $('polyText').value = r.polygon.map((p) => p.join(', ')).join('\n');
    ['rhoC', 'rhoW', 'rhoF'].forEach((k) => { $(k).value = r[k]; $(k + 'v').textContent = Math.round(r[k] * 100) + '%'; });
    $('gridSel').value = String(r.grid || 0);
    $('rectFields').classList.toggle('hidden', r.shape === 'custom');
    $('lFields').classList.toggle('hidden', r.shape !== 'L');
    $('polyFields').classList.toggle('hidden', r.shape !== 'custom');
  }

  function applyRoomFromUI(refit) {
    const r = app.project.room;
    const oldH = r.height;
    r.shape = $('roomShape').value;
    r.L = Math.max(1, +$('roomL').value || r.L);
    r.W = Math.max(1, +$('roomW').value || r.W);
    r.cutL = Math.max(0, +$('cutL').value || 0);
    r.cutW = Math.max(0, +$('cutW').value || 0);
    r.height = Math.max(2, +$('roomH').value || r.height);
    r.wp = Math.max(0, Math.min(r.height - 0.5, +$('roomWp').value));
    r.margin = Math.max(0, +$('roomMargin').value || 0);
    r.mf = Math.max(0.3, Math.min(1, +$('roomMf').value || 0.8));
    r.grid = +$('gridSel').value || 0;
    if (r.shape === 'rect') r.polygon = rectPoly(r.L, r.W);
    else if (r.shape === 'L') r.polygon = lPoly(r.L, r.W, r.cutL || r.L / 3, r.cutW || r.W / 3);
    // 天花高度變更時，崁入 / 吸頂燈跟著天花移動，吊燈維持吊掛長度
    if (Math.abs(oldH - r.height) > 1e-6) {
      for (const f of app.project.fixtures) {
        if (Math.abs(f.z - oldH) < 1e-6) f.z = r.height;
        else f.z = Math.max(r.wp + 0.3, +(f.z + (r.height - oldH)).toFixed(2));
      }
    }
    fillRoomUI();
    app.commit();
    if (refit) app.plan.fit();
    app.requestCompute(false);
    fillSelectionUI();
  }

  /* ======================= 標準 ======================= */
  function fillStdUI() {
    const sel = $('stdSel');
    if (!sel.options.length) {
      LX.STANDARDS.forEach((s) => sel.add(new Option(`${s.name}（${s.Em} lx）`, s.id)));
    }
    const p = app.project;
    sel.value = p.standardId;
    $('tEm').value = p.target.Em; $('tUGR').value = p.target.UGR;
    $('tU0').value = p.target.U0; $('tRa').value = p.target.Ra;
    $('tLpd').value = p.lpdLimit;
  }

  /* ======================= 結果 ======================= */
  function cls(ok, warn) { return ok ? 'ok' : warn ? 'warn' : 'bad'; }

  function evaluate(res) {
    const p = app.project, t = p.target;
    const types = new Set(p.fixtures.map((f) => f.typeId));
    const minRa = Math.min(...[...types].map((id) => (app.typeById(id) || {}).cri || 0));
    const ugr = res.ugr ? res.ugr.value : null;
    return {
      Em: { ok: res.Eavg >= t.Em, warn: res.Eavg >= t.Em * 0.95 },
      U0: { ok: res.U0 >= t.U0, warn: res.U0 >= t.U0 - 0.05 },
      UGR: { ok: ugr == null || ugr <= t.UGR, warn: ugr != null && ugr <= t.UGR + 1 },
      Ra: { ok: !isFinite(minRa) || minRa >= t.Ra, warn: false, v: isFinite(minRa) ? minRa : null },
      LPD: { ok: !p.lpdLimit || res.lpd <= p.lpdLimit, warn: res.lpd <= p.lpdLimit * 1.05 },
    };
  }

  function renderResults() {
    const res = app.result;
    const p = app.project, t = p.target;
    if (!res) return;
    const ev = evaluate(res);
    const ugr = res.ugr ? res.ugr.value : null;
    const k = (label, val, unit, sub, c, wide) =>
      `<div class="kpi ${c || ''} ${wide ? 'wide' : ''}"><div class="k">${label}</div><div class="v">${val}<small>${unit}</small></div><div class="t">${sub}</div></div>`;
    $('kpis').innerHTML = [
      k('平均照度 Em', fmt(res.Eavg), 'lx', `目標 ≥ ${t.Em} lx`, cls(ev.Em.ok, ev.Em.warn)),
      k('均齊度 U₀', fmt(res.U0, 2), '', `目標 ≥ ${t.U0}　(Emin ${fmt(res.Emin)} lx)`, cls(ev.U0.ok, ev.U0.warn)),
      k('統一眩光 UGR', ugr == null ? '—' : fmt(ugr, 1), '', `上限 ≤ ${t.UGR}（估算）`, ugr == null ? '' : cls(ev.UGR.ok, ev.UGR.warn)),
      k('演色性 Ra', ev.Ra.v == null ? '—' : ev.Ra.v, '', `目標 ≥ ${t.Ra}`, ev.Ra.v == null ? '' : cls(ev.Ra.ok, false)),
      k('功率密度 LPD', fmt(res.lpd, 2), 'W/m²', `上限 ≤ ${p.lpdLimit}　(${fmt(res.lpd100, 2)} W/m²/100lx)`, cls(ev.LPD.ok, ev.LPD.warn)),
      k('最大照度', fmt(res.Emax), 'lx', `Emin/Emax ${fmt(res.Ud, 2)}`, ''),
      k('燈具 / 總功率', `${res.count} 盞 · ${fmt(res.totalW)}`, 'W', `總光通量 ${fmt(res.totalLm / 1000, 1)} klm · 面積 ${fmt(res.area, 1)} m²`, '', true),
      k('直接 / 間接', `${fmt(res.Edirect)} / ${fmt(res.Eind)}`, 'lx', `MF ${p.room.mf} · 反射 ${Math.round(p.room.rhoC * 100)}/${Math.round(p.room.rhoW * 100)}/${Math.round(p.room.rhoF * 100)}`, '', true),
    ].join('');
    const allOk = ev.Em.ok && ev.U0.ok && ev.UGR.ok && ev.Ra.ok && ev.LPD.ok;
    const ov = $('overall');
    ov.className = 'badge ' + (res.count ? (allOk ? 'ok' : 'bad') : 'warn');
    ov.textContent = res.count ? (allOk ? '全部合格' : '未通過') : '尚無燈具';
    $('advice').innerHTML = advise(res, ev).map((a) => `<li class="${a.ok ? 'ok' : ''}">${a.t}</li>`).join('');
  }

  function advise(res, ev) {
    const p = app.project, t = p.target;
    const out = [];
    if (!res.count) return [{ t: '請使用「自動佈燈」或「放置燈具」工具開始配置。' }];
    const avgLm = res.totalLm / res.count;
    if (!ev.Em.ok) {
      const ratio = t.Em / Math.max(1, res.Eavg);
      out.push({ t: `平均照度不足 ${fmt((ratio - 1) * 100)}%：建議增加約 ${Math.ceil(res.count * (ratio - 1))} 盞，或將單燈流明提高至約 ${fmt(avgLm * ratio)} lm。` });
    } else if (res.Eavg > t.Em * 1.25) {
      const dim = Math.max(10, Math.round((t.Em / res.Eavg) * 100 / 5) * 5);
      out.push({ t: `照度高出目標 ${fmt((res.Eavg / t.Em - 1) * 100)}%：可調光至約 ${dim}%（省約 ${fmt(res.totalW * (1 - dim / 100))} W）或減少燈數。` });
    }
    if (!ev.U0.ok) {
      const hm = averageMountHeight() - p.room.wp;
      const sp = Math.sqrt(res.area / res.count);
      out.push({ t: `均齊度不足：平均燈距約 ${fmt(sp, 2)} m、燈具距工作面 ${fmt(hm, 2)} m（距高比 ${fmt(sp / Math.max(0.1, hm), 2)}）。建議縮小燈距、改用較寬光束角，或於牆邊補燈。` });
    }
    if (!ev.UGR.ok) out.push({ t: `眩光 UGR ${fmt(res.ugr.value, 1)} 超過上限 ${t.UGR}：建議改用 UGR<19 防眩型燈具、降低單燈流明或改為直接/間接照明。` });
    if (!ev.Ra.ok) out.push({ t: `部分燈具演色性 Ra ${ev.Ra.v} 低於要求 ${t.Ra}，請更換高演色燈具。` });
    if (!ev.LPD.ok) out.push({ t: `LPD ${fmt(res.lpd, 2)} W/m² 超過上限：建議採用更高光效燈具（目前平均 ${fmt(res.totalLm / Math.max(1, res.totalW))} lm/W）或調光。` });
    if (!out.length) out.push({ ok: true, t: '✓ 所有檢核項目皆符合目標值。' });
    return out;
  }
  function averageMountHeight() {
    const f = app.project.fixtures;
    return f.length ? f.reduce((a, x) => a + x.z, 0) / f.length : app.project.room.height;
  }

  /* ======================= 選取燈具 ======================= */
  const selFields = [
    ['sZ', 'sZr', 'z', 2], ['sLm', 'sLmr', 'lumens', 0], ['sW', 'sWr', 'watts', 1],
    ['sB', 'sBr', 'beam', 0], ['sT', 'sTr', 'tilt', 0], ['sR', 'sRr', 'rot', 0], ['sD', 'sDr', 'dim', 0],
  ];

  function fillSelectionUI() {
    const sel = app.selected();
    $('selSection').classList.toggle('hidden', !sel.length);
    if (!sel.length) return;
    const f0 = sel[0];
    const mixed = (key) => sel.some((f) => f[key] !== f0[key]);
    $('selCount').textContent = sel.length > 1 ? `已選 ${sel.length} 盞（多選時數值同步套用）` : f0.id;
    $('sType').value = mixed('typeId') ? '' : f0.typeId;
    $('sXrow').style.display = $('sYrow').style.display = sel.length === 1 ? '' : 'none';
    $('sX').value = f0.x.toFixed(2);
    $('sY').value = f0.y.toFixed(2);
    $('sZr').max = app.project.room.height;
    $('sZr').min = Math.max(0.5, app.project.room.wp + 0.2);
    for (const [num, rng, key, d] of selFields) {
      const v = f0[key] == null ? (key === 'dim' ? 100 : 0) : f0[key];
      $(num).value = (+v).toFixed(d);
      $(num).style.fontStyle = mixed(key) ? 'italic' : '';
      $(num).title = mixed(key) ? '多選數值不同（顯示第一盞）' : '';
      const r = $(rng);
      if (key === 'lumens') r.max = Math.max(20000, v * 1.5);
      if (key === 'watts') r.max = Math.max(200, v * 1.5);
      r.value = v;
    }
    $('sOn').checked = f0.on !== false;
    const eff = f0.watts > 0 ? f0.lumens / f0.watts : 0;
    $('sEff').textContent = `光效 ${fmt(eff)} lm/W · 距工作面 ${fmt(f0.z - app.project.room.wp, 2)} m`;
  }

  function applySelField(key, value, final) {
    const sel = app.selected();
    if (!sel.length || !isFinite(value)) return;
    for (const f of sel) {
      if (key === 'z') value = Math.max(app.project.room.wp + 0.1, Math.min(app.project.room.height, value));
      f[key] = value;
    }
    if (final) { app.commit(); fillSelectionUI(); }
    else {
      const f0 = sel[0];
      $('sEff').textContent = `光效 ${fmt(f0.watts > 0 ? f0.lumens / f0.watts : 0)} lm/W · 距工作面 ${fmt(f0.z - app.project.room.wp, 2)} m`;
    }
    renderPolar();
    app.requestCompute(!final);
  }

  /* ======================= 燈具庫 ======================= */
  function typeBeam(t) { return Math.round(LX.calc.baseTable(t).beam); }

  function renderLibrary() {
    const allLib = app.project.library;
    const cat = app.activeCat || 'all';
    const lib = cat === 'all' ? allLib : allLib.filter((t) => t.category === cat);
    $('libCount').textContent = `${lib.length} / ${allLib.length} 款`;
    const counts = {};
    app.project.fixtures.forEach((f) => { counts[f.typeId] = (counts[f.typeId] || 0) + 1; });
    $('libList').innerHTML = lib.map((t) => `
      <div class="lib-item ${t.id === app.activeType ? 'on' : ''}" data-id="${t.id}">
        <div class="n">${esc(t.name)}${t.source ? `<span class="tag">${t.source}</span>` : ''}${counts[t.id] ? `<span class="tag" style="background:#14532d;color:#bbf7d0">×${counts[t.id]}</span>` : ''}</div>
        <div class="ops"><button data-op="edit" title="編輯">✎</button><button data-op="del" title="刪除">✕</button></div>
        <div class="m">${t.cutout ? esc(t.cutout) + ' · ' : ''}${t.lumens} lm · ${t.watts} W · ${typeBeam(t)}° · ${t.cct || '—'}K · Ra${t.cri || '—'}</div>
      </div>`).join('');
  }
  function mountName(m) { return { recessed: '崁入', surface: '吸頂', pendant: '吊掛', track: '軌道' }[m] || m; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function fillTypeSelects() {
    const lib = app.project.library;
    for (const id of ['autoType', 'sType']) {
      const s = $(id);
      const keep = s.value;
      s.innerHTML = (id === 'sType' ? '<option value="">（混合）</option>' : '') + lib.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
      s.value = lib.some((t) => t.id === keep) ? keep : id === 'autoType' ? app.activeType : '';
    }
    if (!$('autoType').value) $('autoType').value = app.activeType;
  }

  function setActiveType(id) {
    app.activeType = id;
    $('autoType').value = id;
    renderLibrary();
    renderPolar();
  }

  /** 單燈距離光照圖（1m / 2m / 3m 光錐直徑與中心照度 + 地面光斑分布） */
  function renderConeChart() {
    const cv = $('coneChart');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const sel = app.selected();
    const f = sel[0];
    const t = app.typeById(f ? f.typeId : app.activeType);
    if (!t) return;
    const lumens = (f ? f.lumens : t.lumens) * (f && f.dim != null ? f.dim / 100 : 1);
    const beam = f ? f.beam : typeBeam(t);
    const tilt = f ? (f.tilt || 0) : 0;
    const tbl = LX.calc.tableFor(t, beam);
    const I0 = Math.max(1, LX.photometry.lookup(tbl, 0, 0) * (lumens / 1000));
    const halfRad = Math.min(82, Math.max(5, beam / 2)) * Math.PI / 180;

    // 左側：1m / 2m / 3m 光錐照度圖
    const cx = 86, topY = 18, botY = H - 22, coneH = botY - topY;
    const maxR = 64;
    const r3 = Math.min(maxR, Math.tan(halfRad) * 32);

    // 光錐漸層填色
    const grad = ctx.createLinearGradient(cx, topY, cx, botY);
    grad.addColorStop(0, 'rgba(253, 224, 71, 0.85)');
    grad.addColorStop(0.45, 'rgba(250, 204, 21, 0.35)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.08)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(cx - r3, botY);
    ctx.lineTo(cx + r3, botY);
    ctx.closePath();
    ctx.fill();

    // 光錐邊界線
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, topY); ctx.lineTo(cx - r3, botY);
    ctx.moveTo(cx, topY); ctx.lineTo(cx + r3, botY);
    ctx.stroke();

    // 燈具發光點
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(cx, topY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(lumens)} lm · ${Math.round(beam)}°`, cx, 11);

    // 1m, 2m, 3m 截面橢圓與數值
    [1, 2, 3].forEach((d) => {
      const y = topY + (d / 3) * coneH;
      const rx = (d / 3) * r3;
      const dia = 2 * d * Math.tan(halfRad);
      const emax = Math.round(I0 / (d * d));
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, y, Math.max(4, rx), 4, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'right';
      ctx.fillText(`${d}m`, cx - rx - 5, y + 3);
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'center';
      ctx.fillText(`${emax} lx`, cx, y - 5);
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(`Ø${dia.toFixed(1)}m`, cx + rx + 4, y + 3);
    });

    // 右側：單燈於工作面高度之地面光斑熱圖 (4m × 4m)
    const fx0 = 186, fy0 = 22, fSize = 88;
    const hMount = Math.max(0.5, (f ? f.z : LX.calc.defaultMountHeight(app.project, t)) - app.project.room.wp);
    const N = 44, span = 4.0; // -2m .. +2m
    const off = document.createElement('canvas');
    off.width = N; off.height = N;
    const octx = off.getContext('2d');
    const img = octx.createImageData(N, N);
    const eCenter = I0 / (hMount * hMount);
    const tiltRad = tilt * Math.PI / 180;
    const ct = Math.cos(tiltRad), st = Math.sin(tiltRad);
    for (let j = 0; j < N; j++) {
      const wy = ((j + 0.5) / N - 0.5) * span;
      for (let i = 0; i < N; i++) {
        const wx = ((i + 0.5) / N - 0.5) * span;
        const dz = -hMount;
        const d2 = wx * wx + wy * wy + dz * dz;
        const dist = Math.sqrt(d2);
        const y2 = wy * ct + dz * st;
        const z2 = -wy * st + dz * ct;
        const gDeg = Math.acos(Math.max(-1, Math.min(1, -z2 / dist))) * 180 / Math.PI;
        const cDeg = Math.atan2(y2, wx) * 180 / Math.PI;
        const I = LX.photometry.lookup(tbl, cDeg, gDeg) * (lumens / 1000);
        const E = (I * (hMount / dist)) / d2;
        const [r, g, b] = LX.render.turbo(E / Math.max(100, eCenter));
        const idx = (j * N + i) * 4;
        img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.drawImage(off, fx0, fy0, fSize, fSize);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(fx0, fy0, fSize, fSize);

    // 光斑資訊文字
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.font = '10px system-ui';
    ctx.fillText(`工作面光斑 (4×4m)`, fx0 + fSize / 2, fy0 - 5);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`距桌面 h=${hMount.toFixed(2)}m`, fx0 + fSize / 2, fy0 + fSize + 14);
    ctx.fillStyle = '#fde047';
    ctx.fillText(`中心 ${Math.round(eCenter)} lx`, fx0 + fSize / 2, fy0 + fSize + 28);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`光圈 Ø${(2 * hMount * Math.tan(halfRad)).toFixed(2)}m`, fx0 + fSize / 2, fy0 + fSize + 42);
    if (t.cutout) {
      ctx.fillStyle = '#a7f3d0';
      ctx.fillText(t.cutout, fx0 + fSize / 2, fy0 + fSize + 56);
    }
  }

  /** 配光曲線（極座標） */
  function renderPolar() {
    renderConeChart();
    const cv = $('polar');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const sel = app.selected();
    const f = sel[0];
    const t = app.typeById(f ? f.typeId : app.activeType);
    if (!t) return;
    const lumens = f ? f.lumens : t.lumens;
    const tbl = LX.calc.tableFor(t, f ? f.beam : null);
    const cx = W / 2, cy = H / 2 - 4, R = Math.min(W, H) / 2 - 18;
    let max = 0;
    for (let g = 0; g <= 180; g += 2) for (const c of [0, 90, 180, 270]) max = Math.max(max, LX.photometry.lookup(tbl, c, g));
    max *= lumens / 1000;
    const step = niceStep(max / 4);
    const top = Math.ceil(max / step) * step || 1;
    ctx.strokeStyle = '#243041';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px system-ui';
    for (let v = step; v <= top + 1e-6; v += step) {
      ctx.beginPath(); ctx.arc(cx, cy, (v / top) * R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillText(Math.round(v) + ' cd', cx + 3, cy + (v / top) * R - 2);
    }
    for (let a = 0; a < 360; a += 30) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(a * Math.PI / 180), cy + R * Math.sin(a * Math.PI / 180)); ctx.stroke();
    }
    const curve = (cA, cB, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      for (let g = 0; g <= 180; g += 1) {
        const r = (LX.photometry.lookup(tbl, cA, g) * lumens / 1000 / top) * R;
        const a = g * Math.PI / 180;
        const x = cx + r * Math.sin(a), y = cy + r * Math.cos(a);
        g ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      for (let g = 180; g >= 0; g -= 1) {
        const r = (LX.photometry.lookup(tbl, cB, g) * lumens / 1000 / top) * R;
        const a = g * Math.PI / 180;
        ctx.lineTo(cx - r * Math.sin(a), cy + r * Math.cos(a));
      }
      ctx.stroke();
    };
    curve(0, 180, '#f87171');
    curve(90, 270, '#60a5fa');
    ctx.lineWidth = 1;
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px system-ui';
    ctx.fillText(`${t.name.slice(0, 22)} · ${Math.round(tbl.beam)}°`, 6, H - 4);
  }
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x || 1)));
    const m = x / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }

  /* ----- 燈具型號編輯對話框 ----- */
  let editingType = null;
  function openTypeDialog(t) {
    editingType = t || null;
    const isNew = !t;
    t = t || { name: '自訂燈具', category: '自訂', lumens: 3000, watts: 30, cct: 4000, cri: 80, length: 0.6, width: 0.6, shape: 'rect', mount: 'recessed', suspension: 0.8, gen: { beam: 100 } };
    $('typeDlgTitle').textContent = isNew ? '新增燈具型號' : '編輯燈具型號';
    $('tName').value = t.name; $('tCat').value = t.category || ''; $('tBrand').value = [t.manufacturer, t.catalog].filter(Boolean).join(' ');
    $('tLm').value = t.lumens; $('tW').value = t.watts; $('tCct').value = t.cct || ''; $('tCri').value = t.cri || '';
    $('tLen').value = t.length; $('tWid').value = t.width; $('tShape').value = t.shape || 'rect';
    $('tMount').value = t.mount || 'recessed'; $('tSusp').value = t.suspension || 0.8;
    const gen = !t.table;
    document.querySelectorAll('.gen-only').forEach((el) => el.classList.toggle('hidden', !gen));
    if (gen) {
      $('tBeam').value = (t.gen && t.gen.beam) || 90;
      $('tBeam90').value = (t.gen && t.gen.beam90) || '';
      $('tUp').value = Math.round(((t.gen && t.gen.upRatio) || 0) * 100);
      $('tPhotoInfo').textContent = '配光：以光束角產生之通用配光曲線（可匯入廠商 IES / LDT 取得精確配光）。';
    } else {
      $('tPhotoInfo').textContent = `配光：${t.source || '匯入'} 配光檔 · 光束角 ${typeBeam(t)}° · 下照比例 ${Math.round(LX.calc.baseTable(t).downRatio * 100)}%。流明變更時配光形狀不變，光強等比例縮放。`;
    }
    $('typeDlg').returnValue = '';
    $('typeDlg').showModal();
  }

  function saveTypeDialog() {
    const lib = app.project.library;
    let t = editingType;
    const isNew = !t;
    if (isNew) { t = { id: 'custom-' + Date.now().toString(36), gen: {} }; }
    const old = { lumens: t.lumens, watts: t.watts, beam: isNew ? null : typeBeam(t) };
    t.name = $('tName').value.trim() || '自訂燈具';
    t.category = $('tCat').value.trim();
    t.lumens = +$('tLm').value || 1000;
    t.watts = +$('tW').value || 10;
    t.cct = +$('tCct').value || null;
    t.cri = +$('tCri').value || null;
    t.length = Math.max(0.02, +$('tLen').value || 0.1);
    t.width = Math.max(0.02, +$('tWid').value || 0.1);
    t.shape = $('tShape').value;
    t.mount = $('tMount').value;
    t.suspension = +$('tSusp').value || 0;
    if (!t.table) {
      t.gen = { beam: +$('tBeam').value || 90 };
      if (+$('tBeam90').value) t.gen.beam90 = +$('tBeam90').value;
      const up = (+$('tUp').value || 0) / 100;
      if (up > 0) { t.gen.upRatio = up; t.gen.upBeam = 120; }
    }
    t._rev = (t._rev || 0) + 1;
    LX.calc.clearCache(t.id);
    if (isNew) lib.push(t);
    else {
      // 沿用預設值的燈具同步更新
      const nb = typeBeam(t);
      for (const f of app.project.fixtures) {
        if (f.typeId !== t.id) continue;
        if (f.lumens === old.lumens) f.lumens = t.lumens;
        if (f.watts === old.watts) f.watts = t.watts;
        if (old.beam != null && Math.abs(f.beam - old.beam) < 1) f.beam = nb;
      }
    }
    setActiveType(t.id);
    fillTypeSelects();
    app.commit();
    app.requestCompute(false);
  }

  /* ----- IES / LDT 匯入 ----- */
  async function importPhotometry(files) {
    const msgs = [];
    for (const file of files) {
      try {
        const text = await file.text();
        const isLdt = /\.ldt$/i.test(file.name);
        const r = isLdt ? LX.photometry.parseLDT(text, file.name) : LX.photometry.parseIES(text, file.name);
        const isRound = Math.abs(r.width - r.length) < 0.01 && r.length <= 0.3;
        const t = {
          id: 'imp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: r.name.slice(0, 60),
          category: '匯入',
          manufacturer: r.manufacturer,
          catalog: r.catalog,
          source: isLdt ? 'LDT' : 'IES',
          lumens: r.lumens,
          watts: r.watts || Math.round(r.lumens / 120),
          cct: r.cct || 4000,
          cri: r.cri || 80,
          length: +Math.max(0.05, r.length).toFixed(3),
          width: +Math.max(0.03, r.width).toFixed(3),
          shape: isRound ? 'round' : 'rect',
          mount: r.table.downRatio < 0.85 ? 'pendant' : 'recessed',
          suspension: 0.8,
          table: LX.photometry.serializeTable(r.table),
        };
        app.project.library.push(t);
        setActiveType(t.id);
        msgs.push(`✓ ${file.name}：${t.name}，${t.lumens} lm，${t.watts} W，光束角 ${Math.round(r.table.beam)}°`);
      } catch (e) {
        console.error(e);
        msgs.push(`✗ ${file.name}：${e.message}`);
      }
    }
    fillTypeSelects();
    renderLibrary();
    app.autosave();
    alert('配光檔匯入結果：\n\n' + msgs.join('\n') + '\n\n提示：選取燈具庫中的型號後，可用「放置燈具」或「自動佈燈」配置。');
  }

  /* ======================= 檔案 ======================= */
  function download(name, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function safeName() { return (app.project.name || 'project').replace(/[\\/:*?"<>|]/g, '_'); }

  function bomRows() {
    const groups = new Map();
    for (const f of app.project.fixtures) {
      const t = app.typeById(f.typeId);
      if (!t) continue;
      const key = [f.typeId, f.lumens, f.watts, f.beam, f.z].join('|');
      const g = groups.get(key) || { t, f, n: 0 };
      g.n++;
      groups.set(key, g);
    }
    return [...groups.values()];
  }

  function exportBOM() {
    const rows = [['項次', '型號名稱', '類別', '廠牌/型號', '數量', '單燈流明(lm)', '單燈瓦數(W)', '光束角(°)', '色溫(K)', 'Ra', '安裝方式', '安裝高度(m)', '小計瓦數(W)', '小計流明(lm)']];
    bomRows().forEach((g, i) => {
      const { t, f, n } = g;
      rows.push([i + 1, t.name, t.category || '', [t.manufacturer, t.catalog].filter(Boolean).join(' '), n, f.lumens, f.watts, f.beam, t.cct || '', t.cri || '', mountName(t.mount), f.z, +(n * f.watts).toFixed(1), n * f.lumens]);
    });
    const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`${safeName()}_燈具清單.csv`, csv, 'text/csv;charset=utf-8');
  }

  LX.bomRows = bomRows;
  LX.evaluate = evaluate;
  LX.advise = advise;
  LX.mountName = mountName;

  /* ======================= 綁定 ======================= */
  function bindUI() {
    $('projName').addEventListener('change', (e) => { app.project.name = e.target.value; app.commit(); });

    // 空間
    ['roomShape', 'roomL', 'roomW', 'cutL', 'cutW'].forEach((id) => $(id).addEventListener('change', () => applyRoomFromUI(true)));
    ['roomH', 'roomWp', 'roomMargin', 'roomMf', 'gridSel'].forEach((id) => $(id).addEventListener('change', () => applyRoomFromUI(false)));
    ['rhoC', 'rhoW', 'rhoF'].forEach((id) => {
      $(id).addEventListener('input', (e) => {
        app.project.room[id] = +e.target.value;
        $(id + 'v').textContent = Math.round(e.target.value * 100) + '%';
        app.requestCompute(true);
      });
      $(id).addEventListener('change', () => { app.commit(); app.requestCompute(false); });
    });
    $('btnApplyPoly').addEventListener('click', () => {
      const pts = $('polyText').value.split('\n').map((l) => l.split(/[,\s]+/).filter(Boolean).map(Number)).filter((p) => p.length >= 2 && p.every(isFinite));
      if (pts.length < 3) { alert('至少需要 3 個頂點'); return; }
      const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
      app.project.room.polygon = pts.map((p) => [+(p[0] - minX).toFixed(3), +(p[1] - minY).toFixed(3)]);
      app.project.room.shape = 'custom';
      fillRoomUI();
      app.commit();
      app.plan.fit();
      app.requestCompute(false);
    });

    // 標準
    $('stdSel').addEventListener('change', (e) => {
      const s = LX.STANDARDS.find((x) => x.id === e.target.value);
      const p = app.project;
      p.standardId = s.id;
      if (s.id !== 'custom') {
        p.target = { Em: s.Em, UGR: s.UGR, U0: s.U0, Ra: s.Ra };
        p.room.wp = s.wp;
      }
      fillStdUI(); fillRoomUI();
      app.commit();
      app.plan.setResult(app.result);
      app.requestCompute(false);
    });
    [['tEm', 'Em'], ['tUGR', 'UGR'], ['tU0', 'U0'], ['tRa', 'Ra']].forEach(([id, k]) => $(id).addEventListener('change', (e) => {
      app.project.target[k] = +e.target.value;
      app.project.standardId = 'custom';
      $('stdSel').value = 'custom';
      app.commit();
      app.requestCompute(false);
    }));
    $('tLpd').addEventListener('change', (e) => { app.project.lpdLimit = +e.target.value; app.commit(); renderResults(); });

    // 自動佈燈
    const syncAutoMode = () => $('autoGridFields').classList.toggle('hidden', $('autoMode').value !== 'grid');
    $('autoMode').addEventListener('change', syncAutoMode);
    syncAutoMode();
    $('autoType').addEventListener('change', (e) => setActiveType(e.target.value));
    $('btnAuto').addEventListener('click', () => {
      const t = app.typeById($('autoType').value);
      if (!t) return;
      const opts = { targetU0: app.project.target.U0 };
      const rv = $('autoRot').value;
      if (rv !== 'auto') opts.rot = +rv;
      if ($('autoZ').value !== '') opts.z = Math.min(app.project.room.height, Math.max(app.project.room.wp + 0.3, +$('autoZ').value));
      if ($('autoMode').value === 'grid') { opts.nx = Math.max(1, +$('autoNx').value | 0); opts.ny = Math.max(1, +$('autoNy').value | 0); }
      $('busy').classList.remove('hidden');
      setTimeout(() => {
        const t0 = performance.now();
        app.project.fixtures = LX.calc.autoLayout(app.project, t, opts);
        app.selection.clear();
        app.commit();
        app.onSelectionChanged();
        renderLibrary();
        app.runCompute(false);
        $('busy').classList.add('hidden');
        const r = app.result;
        $('autoInfo').textContent = `已配置 ${r.count} 盞 ${t.name}，Em ${fmt(r.Eavg)} lx、U₀ ${fmt(r.U0, 2)}（${fmt(performance.now() - t0)} ms）`;
      }, 20);
    });
    $('btnClear').addEventListener('click', () => {
      if (!app.project.fixtures.length || !confirm('確定清除全部燈具？')) return;
      app.project.fixtures = [];
      app.selection.clear();
      app.commit();
      app.onSelectionChanged();
      renderLibrary();
      app.requestCompute(false);
    });

    // 工具列
    document.querySelectorAll('#toolSeg button').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => setViewMode(b.dataset.view)));
    [['vHeat', 'heatmap'], ['vIso', 'isolux'], ['vVal', 'values'], ['vBeam', 'beams'], ['vObs', 'observers']].forEach(([id, k]) => {
      $(id).checked = app.view[k];
      $(id).addEventListener('change', (e) => { app.view[k] = e.target.checked; app.plan.draw(); if (k === 'beams') app.v3d.rebuild(); });
    });
    $('vColor').addEventListener('change', (e) => { app.view.colorMode = e.target.value; app.plan.setResult(app.result); app.v3d.rebuild(); });
    $('vSnap').addEventListener('change', (e) => { app.view.snap = +e.target.value; });
    $('btnFit').addEventListener('click', () => app.plan.fit());

    // 選取燈具
    for (const [num, rng, key] of selFields) {
      $(rng).addEventListener('input', (e) => { $(num).value = e.target.value; applySelField(key, +e.target.value, false); });
      $(rng).addEventListener('change', (e) => applySelField(key, +e.target.value, true));
      $(num).addEventListener('input', (e) => { if (e.target.value !== '') { $(rng).value = e.target.value; applySelField(key, +e.target.value, false); } });
      $(num).addEventListener('change', (e) => applySelField(key, +e.target.value, true));
    }
    ['sX', 'sY'].forEach((id) => $(id).addEventListener('change', (e) => {
      const f = app.selected()[0];
      if (!f) return;
      f[id === 'sX' ? 'x' : 'y'] = +e.target.value;
      app.commit(); app.requestCompute(false); app.plan.draw();
    }));
    $('sOn').addEventListener('change', (e) => { app.selected().forEach((f) => { f.on = e.target.checked; }); app.commit(); app.requestCompute(false); app.plan.draw(); });
    $('sType').addEventListener('change', (e) => {
      const t = app.typeById(e.target.value);
      if (!t) return;
      for (const f of app.selected()) {
        f.typeId = t.id; f.lumens = t.lumens; f.watts = t.watts; f.beam = typeBeam(t);
        f.z = LX.calc.defaultMountHeight(app.project, t);
      }
      app.commit(); app.onSelectionChanged(); renderLibrary(); app.requestCompute(false);
    });
    $('btnApplyType').addEventListener('click', () => {
      const sel = app.selected();
      if (!sel.length) return;
      const f0 = sel[0];
      const keys = ['z', 'lumens', 'watts', 'beam', 'tilt', 'dim', 'on'];
      let n = 0;
      for (const f of app.project.fixtures) {
        if (f.typeId !== f0.typeId) continue;
        keys.forEach((k) => { f[k] = f0[k]; });
        n++;
      }
      app.commit(); app.requestCompute(false);
      $('selCount').textContent = `已套用到 ${n} 盞同型號燈具`;
    });
    $('btnDup').addEventListener('click', () => app.duplicateSelected());
    $('btnDel').addEventListener('click', () => app.deleteSelected());

    // 批次
    $('btnGlobal').addEventListener('click', () => {
      const z = $('gZ').value, d = $('gD').value;
      for (const f of app.project.fixtures) {
        if (z !== '') f.z = Math.max(app.project.room.wp + 0.1, Math.min(app.project.room.height, +z));
        if (d !== '') f.dim = Math.max(0, Math.min(100, +d));
      }
      app.commit(); app.onSelectionChanged(); app.requestCompute(false);
    });

    // 燈具庫分類切換
    if ($('catTabs')) {
      $('catTabs').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-cat]');
        if (!b) return;
        app.activeCat = b.dataset.cat;
        document.querySelectorAll('#catTabs button').forEach((x) => x.classList.toggle('on', x === b));
        renderLibrary();
      });
    }
    $('libList').addEventListener('click', (e) => {
      const item = e.target.closest('.lib-item');
      if (!item) return;
      const id = item.dataset.id;
      const op = e.target.dataset.op;
      const t = app.typeById(id);
      if (op === 'edit') openTypeDialog(t);
      else if (op === 'del') {
        const used = app.project.fixtures.filter((f) => f.typeId === id).length;
        if (used) { alert(`此型號仍有 ${used} 盞燈具使用中，請先刪除或更換。`); return; }
        if (!confirm(`刪除燈具型號「${t.name}」？`)) return;
        app.project.library = app.project.library.filter((x) => x.id !== id);
        if (app.activeType === id) app.activeType = app.project.library[0] && app.project.library[0].id;
        fillTypeSelects(); renderLibrary(); renderPolar(); app.autosave();
      } else setActiveType(id);
    });
    $('libList').addEventListener('dblclick', (e) => {
      const item = e.target.closest('.lib-item');
      if (item) { setActiveType(item.dataset.id); setTool('add'); }
    });
    $('btnNewType').addEventListener('click', () => openTypeDialog(null));
    $('typeDlg').addEventListener('close', () => { if ($('typeDlg').returnValue === 'ok') saveTypeDialog(); });
    $('btnImport').addEventListener('click', () => $('filePhoto').click());
    $('filePhoto').addEventListener('change', (e) => { if (e.target.files.length) importPhotometry([...e.target.files]); e.target.value = ''; });
    $('btnLibExport').addEventListener('click', () => download('LuxCheck_燈具庫.json', JSON.stringify(app.project.library), 'application/json'));
    $('btnLibImport').addEventListener('click', () => $('fileLib').click());
    $('fileLib').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const arr = JSON.parse(await f.text());
        if (!Array.isArray(arr)) throw new Error('格式錯誤');
        let n = 0;
        for (const t of arr) {
          if (!t.id || !t.name) continue;
          const i = app.project.library.findIndex((x) => x.id === t.id);
          if (i >= 0) app.project.library[i] = t; else app.project.library.push(t);
          LX.calc.clearCache(t.id);
          n++;
        }
        fillTypeSelects(); renderLibrary(); app.autosave();
        alert(`已匯入 ${n} 款燈具`);
      } catch (err) { alert('燈具庫匯入失敗：' + err.message); }
    });
    $('btnLibReset').addEventListener('click', () => {
      if (!confirm('還原預設燈具（保留匯入及自訂型號）？')) return;
      for (const d of LX.DEFAULT_LIBRARY) {
        const i = app.project.library.findIndex((x) => x.id === d.id);
        if (i >= 0) app.project.library[i] = clone(d); else app.project.library.push(clone(d));
        LX.calc.clearCache(d.id);
      }
      fillTypeSelects(); renderLibrary(); app.requestCompute(false);
    });

    // 檔案
    $('btnNew').addEventListener('click', () => {
      if (!confirm('建立新專案？（目前專案將被取代，建議先儲存）')) return;
      const lib = app.project.library;
      app.project = defaultProject();
      // 保留使用者匯入的燈具
      lib.filter((t) => !LX.DEFAULT_LIBRARY.some((d) => d.id === t.id)).forEach((t) => app.project.library.push(t));
      app.project.name = '未命名專案';
      app.selection.clear();
      app.commit();
      app.refreshAll();
      app.plan.fit();
    });
    $('btnSave').addEventListener('click', () => download(`${safeName()}.luxcheck.json`, JSON.stringify(app.project), 'application/json'));
    $('btnOpen').addEventListener('click', () => $('fileProject').click());
    $('fileProject').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const p = JSON.parse(await f.text());
        if (!p.room || !p.library || !p.fixtures) throw new Error('非 LuxCheck 專案檔');
        LX.calc.clearCache();
        app.project = p;
        app.selection.clear();
        app.undoStack = [app.snapshot()];
        app.redoStack = [];
        app.refreshAll();
        app.plan.fit();
      } catch (err) { alert('開啟失敗：' + err.message); }
    });
    $('btnUndo').addEventListener('click', () => app.undo());
    $('btnRedo').addEventListener('click', () => app.redo());
    $('btnBom').addEventListener('click', exportBOM);
    $('btnPng').addEventListener('click', () => {
      const url = app.plan.renderImage(2400, 1600);
      fetch(url).then((r) => r.blob()).then((b) => download(`${safeName()}_照度分布.png`, b));
    });
    $('btnReport').addEventListener('click', () => LX.report.open(app));

    // 鍵盤
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || $('typeDlg').open) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const step = e.shiftKey ? 0.5 : 0.1;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); }
      else if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); app.redo(); }
      else if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); app.duplicateSelected(); }
      else if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); app.selection = new Set(app.project.fixtures.map((f) => f.id)); app.onSelectionChanged(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); app.deleteSelected(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); app.nudge(-step, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); app.nudge(step, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); app.nudge(0, -step); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); app.nudge(0, step); }
      else if (e.key === 'Escape') { app.selection.clear(); setTool('select'); app.onSelectionChanged(); }
      else if (!ctrl && e.key.toLowerCase() === 'r') app.rotateSelected();
      else if (!ctrl && e.key.toLowerCase() === 'v') setTool('select');
      else if (!ctrl && e.key.toLowerCase() === 'a') setTool('add');
      else if (!ctrl && e.key.toLowerCase() === 'h') setTool('pan');
      else if (!ctrl && e.key.toLowerCase() === 'f') app.plan.fit();
    });
  }

  function setTool(t) {
    app.tool = t;
    document.querySelectorAll('#toolSeg button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    $('plan').style.cursor = t === 'pan' ? 'grab' : t === 'add' ? 'copy' : 'crosshair';
    app.plan.draw();
  }
  function setViewMode(m) {
    app.view.mode = m;
    document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === m));
    $('wrap2d').classList.toggle('hidden', m !== '2d');
    $('wrap3d').classList.toggle('hidden', m !== '3d');
    app.v3d.setVisible(m === '3d');
  }

  window.addEventListener('DOMContentLoaded', () => app.init());
})((window.LX = window.LX || {}));
