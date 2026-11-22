/* =========================================================================
 * view3d.js — 3D 照度偽彩色投影與擬真空間檢視（Three.js）
 *   平面座標 (x, y) → three (x, z)；高度 → three y
 *   支援：高解析 3D 照度偽彩色投影、等照度線、垂直隔間牆投影、
 *         DIALux 經典色階標尺 HUD、3D 游標即時光學探針、擬真材質模式
 * ========================================================================= */
(function (LX) {
  'use strict';

  function makeTextSprite(T, text, bg, fg) {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 70;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg || 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(4, 4, 172, 62, 10);
    else ctx.rect(4, 4, 172, 62);
    ctx.fill();
    ctx.strokeStyle = fg || '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = fg || '#facc15';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 90, 35);
    const tex = new T.CanvasTexture(canvas);
    const spriteMat = new T.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new T.Sprite(spriteMat);
    sprite.scale.set(0.85, 0.33, 1);
    return sprite;
  }

  class View3D {
    constructor(container, app) {
      this.el = container;
      this.app = app;
      this.ready = false;
      this.falseColor = true;      // 3D 偽彩色模式 (true: 偽彩色, false: 擬真材質)
      this.palette = 'dialux';     // 'dialux' | 'turbo'
      this.showIsolux = true;      // 3D 表面等照度線
      this.wallFalseColor = true;  // 3D 隔間牆偽彩色投影
      this.probeTargets = [];      // 可探針檢測的網格物件
      this.pins = [];              // 使用者點選打點標籤

      if (!window.THREE) {
        container.innerHTML = '<div class="empty3d">3D 檢視需要載入 Three.js。2D 計算功能不受影響。</div>';
        return;
      }
      const T = window.THREE;
      this.T = T;

      // WebGL 渲染器
      this.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.setClearColor(0x0a0f18);
      container.appendChild(this.renderer.domElement);

      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(48, 1, 0.1, 1000);
      this.controls = new T.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;

      // 擬真環境光
      this.ambLight = new T.AmbientLight(0xffffff, 0.7);
      this.scene.add(this.ambLight);
      this.dirLight = new T.DirectionalLight(0xffffff, 0.4);
      this.dirLight.position.set(15, 35, 20);
      this.scene.add(this.dirLight);

      this.group = new T.Group();
      this.scene.add(this.group);

      this.pinGroup = new T.Group();
      this.scene.add(this.pinGroup);

      // 游標探針射線檢測
      this.raycaster = new T.Raycaster();
      this.mouse = new T.Vector2();

      // 游標 3D 鎖點光圈
      const ringGeo = new T.RingGeometry(0.12, 0.16, 32);
      ringGeo.rotateX(-Math.PI / 2);
      this.probeMarker = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0x38bdf8, side: T.DoubleSide, depthTest: false }));
      this.probeMarker.visible = false;
      this.scene.add(this.probeMarker);

      this.ready = true;
      this.initHUD();
      this.initEvents();

      new ResizeObserver(() => this.resize()).observe(container);

      const loop = () => {
        requestAnimationFrame(loop);
        if (!this.visible) return;
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      };
      loop();
    }

    initHUD() {
      // 3D 浮動色階與控制面板
      let legend = this.el.querySelector('#hud3dLegend');
      if (!legend) {
        legend = document.createElement('div');
        legend.id = 'hud3dLegend';
        legend.className = 'hud3d-legend';
        legend.innerHTML = `
          <div class="hud3d-title">
            <span>3D 照度偽彩色投影</span>
            <small style="font-size:10px;color:#94a3b8;font-weight:normal" id="hud3dPalName">DIALux</small>
          </div>
          <div class="hud3d-kpis">
            <div class="hud3d-kpi"><span>平均 E<sub>avg</sub></span><strong id="hud3dEavg">— lx</strong></div>
            <div class="hud3d-kpi"><span>均勻度 U₀</span><strong id="hud3dU0">—</strong></div>
            <div class="hud3d-kpi"><span>最大／最小</span><strong id="hud3dMinMax">— / — lx</strong></div>
          </div>
          <div class="hud3d-bar-wrap">
            <div class="hud3d-bar" id="hud3dBar"></div>
            <div class="hud3d-ticks" id="hud3dTicks"></div>
          </div>
          <div class="hud3d-controls">
            <button id="btn3dMode" class="hud-btn on" title="切換 3D 偽彩色 / 擬真建築材質">偽彩色</button>
            <button id="btn3dIso" class="hud-btn on" title="切換 3D 表面等照度線">等高線</button>
            <button id="btn3dWallFc" class="hud-btn on" title="切換 3D 隔間牆垂直面偽彩色投影">牆面投影</button>
            <button id="btn3dPal" class="hud-btn" title="切換色盤 (DIALux 經典 / Google Turbo)">切換色盤</button>
          </div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94a3b8">
            <span>點擊 3D 表面可釘選照度</span>
            <a href="#" id="btn3dClearPins" style="color:#38bdf8;text-decoration:none">清除標籤</a>
          </div>
        `;
        this.el.appendChild(legend);
      }

      // 3D 游標即時點測卡片
      let probe = this.el.querySelector('#hud3dProbe');
      if (!probe) {
        probe = document.createElement('div');
        probe.id = 'hud3dProbe';
        probe.className = 'hud3d-probe hidden';
        probe.innerHTML = `
          <div class="probe-title">📍 3D 即時點測</div>
          <div class="probe-coord" id="probeCoord">X: — m, Y: — m (高 — m)</div>
          <div class="probe-lux"><span id="probeLux">—</span> <small>lx</small></div>
          <div class="probe-status" id="probeStatus">—</div>
        `;
        this.el.appendChild(probe);
      }

      // 按鈕事件綁定
      const btnMode = this.el.querySelector('#btn3dMode');
      const btnIso = this.el.querySelector('#btn3dIso');
      const btnWallFc = this.el.querySelector('#btn3dWallFc');
      const btnPal = this.el.querySelector('#btn3dPal');
      const btnClearPins = this.el.querySelector('#btn3dClearPins');

      if (btnMode) {
        btnMode.onclick = () => {
          this.falseColor = !this.falseColor;
          btnMode.classList.toggle('on', this.falseColor);
          btnMode.textContent = this.falseColor ? '偽彩色' : '擬真材質';
          if (this.app.view) this.app.view.heatmap = this.falseColor;
          const chk = document.getElementById('vHeat');
          if (chk) chk.checked = this.falseColor;
          this.rebuild();
        };
      }
      if (btnIso) {
        btnIso.onclick = () => {
          this.showIsolux = !this.showIsolux;
          btnIso.classList.toggle('on', this.showIsolux);
          if (this.app.view) this.app.view.isolux = this.showIsolux;
          const chk = document.getElementById('vIso');
          if (chk) chk.checked = this.showIsolux;
          this.rebuild();
        };
      }
      if (btnWallFc) {
        btnWallFc.onclick = () => {
          this.wallFalseColor = !this.wallFalseColor;
          btnWallFc.classList.toggle('on', this.wallFalseColor);
          this.rebuild();
        };
      }
      if (btnPal) {
        btnPal.onclick = () => {
          this.palette = this.palette === 'dialux' ? 'turbo' : 'dialux';
          const lbl = this.el.querySelector('#hud3dPalName');
          if (lbl) lbl.textContent = this.palette === 'dialux' ? 'DIALux' : 'Turbo';
          this.rebuild();
        };
      }
      if (btnClearPins) {
        btnClearPins.onclick = (e) => {
          e.preventDefault();
          this.clearPins();
        };
      }
    }

    initEvents() {
      const cv = this.renderer.domElement;
      cv.addEventListener('pointermove', (e) => {
        if (!this.visible || !this.app.result) return;
        const rect = cv.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycastProbe(e);
      });

      cv.addEventListener('pointerleave', () => {
        this.probeMarker.visible = false;
        const probe = this.el.querySelector('#hud3dProbe');
        if (probe) probe.classList.add('hidden');
      });

      cv.addEventListener('click', (e) => {
        if (!this.visible || !this.app.result) return;
        const rect = cv.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.probeTargets, false);
        if (hits.length) {
          const hit = hits[0];
          const wx = hit.point.x, wy = hit.point.z, wz = hit.point.y;
          const lux = LX.calc.pointAt(this.app.result, wx, wy, hit.object.userData?.desk ? 0.75 : (this.app.result.zoneMode ? 0 : this.app.project.room.wp)) || 0;
          const deskName = hit.object.userData?.desk?.name;
          this.addPin(wx, wy, wz, lux, deskName);
        }
      });
    }

    raycastProbe(e) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObjects(this.probeTargets, false);
      const probe = this.el.querySelector('#hud3dProbe');
      const pCoord = this.el.querySelector('#probeCoord');
      const pLux = this.el.querySelector('#probeLux');
      const pStatus = this.el.querySelector('#probeStatus');

      if (hits.length) {
        const hit = hits[0];
        const wx = hit.point.x, wy = hit.point.z, wz = hit.point.y;
        this.probeMarker.position.set(wx, wz + 0.005, wy);
        this.probeMarker.visible = true;

        const res = this.app.result;
        const isDesk = !!hit.object.userData?.desk;
        const zCalc = isDesk ? 0.75 : (res.zoneMode ? 0 : this.app.project.room.wp);
        const lux = LX.calc.pointAt(res, wx, wy, zCalc) || 0;
        const target = isDesk ? this.app.project.target.Em : (res.zoneMode ? (this.app.project.floorTarget || 100) : res.primaryTarget);
        const desk = hit.object.userData?.desk;

        if (probe) {
          probe.classList.remove('hidden');
          pCoord.textContent = `X: ${wx.toFixed(2)}m, Y: ${wy.toFixed(2)}m (計算高 ${zCalc.toFixed(2)}m)`;
          pLux.textContent = Math.round(lux);
          const ratio = Math.round((lux / target) * 100);
          if (isDesk) {
            const ok = lux >= target;
            pStatus.className = `probe-status ${ok ? '' : 'fail'}`;
            pStatus.textContent = `${desk.name} · ${ok ? '達標 ✓' : '不足 ✗'} (${ratio}% 標準 ${target} lx)`;
          } else {
            pStatus.className = 'probe-status';
            pStatus.textContent = `一般地面 · 相對工作標準 ${ratio}%`;
          }
        }

        // 同步底端狀態列
        const stPos = document.getElementById('stPos');
        const stLux = document.getElementById('stLux');
        if (stPos) stPos.textContent = `3D: x ${wx.toFixed(2)}, y ${wy.toFixed(2)}, z ${wz.toFixed(2)}`;
        if (stLux) stLux.textContent = `${Math.round(lux)} lx`;
      } else {
        this.probeMarker.visible = false;
        if (probe) probe.classList.add('hidden');
      }
    }

    addPin(wx, wy, wz, lux, deskName) {
      const T = this.T;
      const label = `${deskName ? deskName + ': ' : ''}${Math.round(lux)} lx`;
      const sprite = makeTextSprite(T, label);
      sprite.position.set(wx, wz + 0.35, wy);
      const poleGeo = new T.BufferGeometry().setFromPoints([
        new T.Vector3(wx, wz, wy),
        new T.Vector3(wx, wz + 0.35, wy)
      ]);
      const pole = new T.Line(poleGeo, new T.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }));
      const g = new T.Group();
      g.add(pole);
      g.add(sprite);
      this.pinGroup.add(g);
      this.pins.push(g);
    }

    clearPins() {
      while (this.pins.length) {
        const p = this.pins.pop();
        this.pinGroup.remove(p);
      }
    }

    updateHUD(res) {
      const eAvg = this.el.querySelector('#hud3dEavg');
      const u0 = this.el.querySelector('#hud3dU0');
      const minMax = this.el.querySelector('#hud3dMinMax');
      const bar = this.el.querySelector('#hud3dBar');
      const ticksWrap = this.el.querySelector('#hud3dTicks');
      if (!eAvg || !res) return;

      eAvg.textContent = `${Math.round(res.Eavg || 0)} lx`;
      u0.textContent = res.U0 ? res.U0.toFixed(2) : '—';
      minMax.textContent = `${Math.round(res.Emax || 0)} / ${Math.round(res.Emin || 0)} lx`;

      // 色階條樣式
      if (bar) {
        if (this.palette === 'dialux') {
          bar.style.background = 'linear-gradient(to top, #0a148c 0%, #00b4f0 18%, #14d73c 36%, #fae60a 55%, #ff7d00 72%, #eb1919 88%, #ffffff 100%)';
        } else {
          bar.style.background = 'linear-gradient(to top, #0d0887 0%, #46039f 15%, #7201a8 30%, #9c179e 45%, #bd3786 55%, #d8576b 65%, #ed7953 75%, #fb9f3a 85%, #fdca26 95%, #f0f921 100%)';
        }
      }

      // 產生刻度
      if (ticksWrap) {
        const mode = this.app.view?.colorMode || 'target';
        const target = res.primaryTarget || 500;
        const sf = LX.render.scaleFn(mode, res, target);
        const ticks = sf.ticks.slice(0, 6);
        ticksWrap.innerHTML = ticks.map((t) => {
          const isTarget = Math.abs(t - target) < 1e-3;
          return `<div class="hud3d-tick ${isTarget ? 'target' : ''}">${Math.round(t)} lx ${isTarget ? '★' : ''}</div>`;
        }).join('');
      }
    }

    resize() {
      if (!this.ready) return;
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    setVisible(v) {
      this.visible = v;
      if (v) {
        this.resize();
        this.rebuild();
      }
    }

    rebuild() {
      if (!this.ready || !this.visible) return;
      const T = this.T;
      const pr = this.app.project;
      const room = pr.room;
      const res = this.app.result;
      const g = this.group;

      // 同步視圖開關
      if (this.app.view) {
        this.falseColor = this.app.view.heatmap !== false;
        this.showIsolux = this.app.view.isolux !== false;
      }
      const btnMode = this.el.querySelector('#btn3dMode');
      if (btnMode) {
        btnMode.classList.toggle('on', this.falseColor);
        btnMode.textContent = this.falseColor ? '偽彩色' : '擬真材質';
      }
      const btnIso = this.el.querySelector('#btn3dIso');
      if (btnIso) btnIso.classList.toggle('on', this.showIsolux);

      // 清除舊物件與貼圖
      while (g.children.length) {
        const c = g.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material && c.material !== this._sharedLegMat) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      }
      this.probeTargets = [];

      const b = LX.calc.polyBounds(room.polygon);
      const shape = new T.Shape();
      room.polygon.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
      const allDesks = LX.cad && LX.cad.allDesks ? LX.cad.allDesks(pr) : (pr.cad?.desks || []);
      const zoneMode = LX.cad && LX.cad.hasZoneMode ? LX.cad.hasZoneMode(pr) : !!pr.cad;

      // 若在辦公桌模式，在地板挖出辦公桌的洞，讓工作面立體浮現
      if (zoneMode) {
        for (const desk of allDesks) {
          const hole = new T.Path();
          desk.polygon.forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
          hole.closePath();
          shape.holes.push(hole);
        }
      }

      // 1. 生成 3D 照度偽彩色貼圖（高解析度 + 平滑等照度線）
      let floorMat;
      let falseColorTex = null;
      if (res && this.falseColor) {
        const fcCanvas = LX.render.buildFalseColorCanvas(res, {
          mode: this.app.view.colorMode,
          target: res.primaryTarget,
          palette: this.palette,
          isolux: this.showIsolux,
          values: this.app.view.values,
          resolution: 1280
        });
        falseColorTex = new T.CanvasTexture(fcCanvas);
        falseColorTex.minFilter = T.LinearMipmapLinearFilter;
        falseColorTex.magFilter = T.LinearFilter;
        falseColorTex.generateMipmaps = true;
        if (this.renderer.capabilities.getMaxAnisotropy) {
          falseColorTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        }
        floorMat = new T.MeshBasicMaterial({ map: falseColorTex, side: T.DoubleSide });
      } else {
        // 擬真建築地面材質（精緻深灰石紋質感）
        floorMat = new T.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.85,
          metalness: 0.08,
          side: T.DoubleSide
        });
      }

      // UV 座標映射到物理空間
      const fGeo = new T.ShapeGeometry(shape);
      const pos = fGeo.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      const gx0 = res ? res.grid.x0 : b.minX, gy0 = res ? res.grid.y0 : b.minY;
      const gw = res ? res.grid.nx * res.grid.dx : b.w, gh = res ? res.grid.ny * res.grid.dy : b.h;
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) - gx0) / gw;
        uv[i * 2 + 1] = 1 - (pos.getY(i) - gy0) / gh;
      }
      fGeo.setAttribute('uv', new T.BufferAttribute(uv, 2));

      const floor = new T.Mesh(fGeo, floorMat);
      floor.rotation.x = Math.PI / 2;
      floor.position.y = zoneMode ? 0.006 : room.wp;
      floor.userData.kind = 'floor';
      g.add(floor);
      this.probeTargets.push(floor);

      // 2. 3D 辦公桌面偽彩色獨立投影
      const deskStatMap = new Map((res?.deskStats || []).map((d) => [d.id, d]));
      const targetLux = res ? (res.primaryTarget || 500) : 500;

      if (zoneMode) {
        for (const desk of allDesks) {
          const dh = 0.75;
          const ds = new T.Shape();
          desk.polygon.forEach(([x, y], i) => (i ? ds.lineTo(x, y) : ds.moveTo(x, y)));
          ds.closePath();

          const geo = new T.ShapeGeometry(ds);
          const positions = geo.attributes.position;
          const duv = new Float32Array(positions.count * 2);
          for (let i = 0; i < positions.count; i++) {
            duv[i * 2] = (positions.getX(i) - gx0) / gw;
            duv[i * 2 + 1] = 1 - (positions.getY(i) - gy0) / gh;
          }
          geo.setAttribute('uv', new T.BufferAttribute(duv, 2));

          let deskMat;
          if (this.falseColor && falseColorTex) {
            deskMat = new T.MeshBasicMaterial({ map: falseColorTex, side: T.DoubleSide });
          } else {
            deskMat = new T.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5, metalness: 0.1 });
          }

          const top = new T.Mesh(geo, deskMat);
          top.rotation.x = Math.PI / 2;
          top.position.y = dh;
          top.userData.kind = 'desk';
          top.userData.desk = desk;
          g.add(top);
          this.probeTargets.push(top);

          // 桌面達標外框光圈 (綠色合格，琥珀色未達標)
          const st = deskStatMap.get(desk.id);
          const ok = st ? (st.Eavg >= targetLux && st.coverage >= 80) : true;
          const rimColor = this.falseColor ? (ok ? 0x10b981 : 0xf59e0b) : 0x0284c7;
          const rim = new T.LineLoop(
            new T.BufferGeometry().setFromPoints(desk.polygon.map(([x, y]) => new T.Vector3(x, dh + 0.004, y))),
            new T.LineBasicMaterial({ color: rimColor, linewidth: 2 })
          );
          g.add(rim);

          // 桌腳（共用幾何與材質減少 Draw Calls）
          if (!this._sharedLegMat) this._sharedLegMat = new T.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });
          const legGeo = new T.CylinderGeometry(0.02, 0.02, dh - 0.02, 8);
          const center = desk.polygon.reduce((s, p) => [s[0] + p[0] / desk.polygon.length, s[1] + p[1] / desk.polygon.length], [0, 0]);
          for (const [x, y] of desk.polygon.slice(0, 4)) {
            const leg = new T.Mesh(legGeo, this._sharedLegMat);
            leg.position.set(x * 0.92 + center[0] * 0.08, (dh - 0.02) / 2, y * 0.92 + center[1] * 0.08);
            g.add(leg);
          }
        }
      }

      // 3. 室內基底樓板
      const fl = new T.Mesh(new T.ShapeGeometry(shape), new T.MeshLambertMaterial({ color: 0x0f172a, side: T.DoubleSide }));
      fl.rotation.x = Math.PI / 2;
      fl.position.y = -0.01;
      g.add(fl);

      // 4. 隔間牆偽彩色垂直投影與建築實體（批次合併網格 + 頂點色彩，將數百次 Draw Call 壓縮為 1 次）
      const allWalls = LX.cad && LX.cad.allWalls ? LX.cad.allWalls(pr) : (pr.cad?.walls || pr.walls || []);
      const edgeMat = new T.LineBasicMaterial({ color: 0x475569 });
      const validWalls = [];
      for (const w of allWalls) {
        const x1 = w.x1 ?? w.p1[0], y1 = w.y1 ?? w.p1[1];
        const x2 = w.x2 ?? w.p2[0], y2 = w.y2 ?? w.p2[1];
        if (Math.hypot(x2 - x1, y2 - y1) >= 0.1) validWalls.push({ x1, y1, x2, y2, h: w.height || room.height || 2.8 });
      }
      if (validWalls.length) {
        const useWallFc = Boolean(this.falseColor && this.wallFalseColor && res);
        const bands = useWallFc ? 4 : 1;
        const sf = useWallFc ? LX.render.scaleFn(this.app.view.colorMode, res, res.primaryTarget) : null;
        const colormap = useWallFc ? (this.palette === 'dialux' ? LX.render.dialuxColor : LX.render.turbo) : null;
        const posArr = new Float32Array(validWalls.length * bands * 6 * 3);
        const colArr = useWallFc ? new Float32Array(validWalls.length * bands * 6 * 3) : null;
        const edgeArr = new Float32Array(validWalls.length * 6 * 3);
        let pi = 0, ci = 0, ei = 0;

        for (let wi = 0; wi < validWalls.length; wi++) {
          const { x1, y1, x2, y2, h } = validWalls[wi];
          const eBot1 = useWallFc ? (LX.render.sampleLux(res, x1, y1) || 0) : 0;
          const eBot2 = useWallFc ? (LX.render.sampleLux(res, x2, y2) || 0) : 0;

          for (let bi = 0; bi < bands; bi++) {
            const v0 = bi / bands, v1 = (bi + 1) / bands;
            const z0 = h * v0, z1 = h * v1;
            // 三角形 1: (x1,z0,y1) -> (x2,z0,y2) -> (x2,z1,y2)
            posArr[pi++] = x1; posArr[pi++] = z0; posArr[pi++] = y1;
            posArr[pi++] = x2; posArr[pi++] = z0; posArr[pi++] = y2;
            posArr[pi++] = x2; posArr[pi++] = z1; posArr[pi++] = y2;
            // 三角形 2: (x1,z0,y1) -> (x2,z1,y2) -> (x1,z1,y1)
            posArr[pi++] = x1; posArr[pi++] = z0; posArr[pi++] = y1;
            posArr[pi++] = x2; posArr[pi++] = z1; posArr[pi++] = y2;
            posArr[pi++] = x1; posArr[pi++] = z1; posArr[pi++] = y1;

            if (useWallFc) {
              const hf0 = 0.5 + 0.5 * Math.pow(1 - v0, 0.7);
              const hf1 = 0.5 + 0.5 * Math.pow(1 - v1, 0.7);
              const c10 = colormap(sf.t(eBot1 * hf0));
              const c20 = colormap(sf.t(eBot2 * hf0));
              const c21 = colormap(sf.t(eBot2 * hf1));
              const c11 = colormap(sf.t(eBot1 * hf1));
              colArr[ci++] = c10[0] / 255; colArr[ci++] = c10[1] / 255; colArr[ci++] = c10[2] / 255;
              colArr[ci++] = c20[0] / 255; colArr[ci++] = c20[1] / 255; colArr[ci++] = c20[2] / 255;
              colArr[ci++] = c21[0] / 255; colArr[ci++] = c21[1] / 255; colArr[ci++] = c21[2] / 255;
              colArr[ci++] = c10[0] / 255; colArr[ci++] = c10[1] / 255; colArr[ci++] = c10[2] / 255;
              colArr[ci++] = c21[0] / 255; colArr[ci++] = c21[1] / 255; colArr[ci++] = c21[2] / 255;
              colArr[ci++] = c11[0] / 255; colArr[ci++] = c11[1] / 255; colArr[ci++] = c11[2] / 255;
            }
          }
          // 邊線：左柱、頂線、右柱
          edgeArr[ei++] = x1; edgeArr[ei++] = 0; edgeArr[ei++] = y1;
          edgeArr[ei++] = x1; edgeArr[ei++] = h; edgeArr[ei++] = y1;
          edgeArr[ei++] = x1; edgeArr[ei++] = h; edgeArr[ei++] = y1;
          edgeArr[ei++] = x2; edgeArr[ei++] = h; edgeArr[ei++] = y2;
          edgeArr[ei++] = x2; edgeArr[ei++] = h; edgeArr[ei++] = y2;
          edgeArr[ei++] = x2; edgeArr[ei++] = 0; edgeArr[ei++] = y2;
        }

        const wallGeo = new T.BufferGeometry();
        wallGeo.setAttribute('position', new T.BufferAttribute(posArr, 3));
        if (useWallFc) wallGeo.setAttribute('color', new T.BufferAttribute(colArr, 3));
        else wallGeo.computeVertexNormals();
        const wallMat = useWallFc
          ? new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, transparent: true, opacity: 0.88 })
          : new T.MeshLambertMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.6, side: T.DoubleSide });
        g.add(new T.Mesh(wallGeo, wallMat));

        const edgeGeo = new T.BufferGeometry();
        edgeGeo.setAttribute('position', new T.BufferAttribute(edgeArr, 3));
        g.add(new T.LineSegments(edgeGeo, edgeMat));
      }

      // 外周建築牆
      const extWallMat = new T.MeshLambertMaterial({ color: 0x64748b, transparent: true, opacity: 0.25, side: T.DoubleSide, depthWrite: false });
      const pts = room.polygon;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const wall = new T.Mesh(new T.PlaneGeometry(len, room.height), extWallMat);
        wall.position.set((a[0] + c[0]) / 2, room.height / 2, (a[1] + c[1]) / 2);
        wall.rotation.y = -Math.atan2(c[1] - a[1], c[0] - a[0]);
        g.add(wall);
        const eg = new T.BufferGeometry().setFromPoints([
          new T.Vector3(a[0], 0, a[1]), new T.Vector3(a[0], room.height, a[1]),
          new T.Vector3(c[0], room.height, c[1]), new T.Vector3(c[0], 0, c[1]),
        ]);
        g.add(new T.Line(eg, edgeMat));
      }

      // 5. 燈具與 3D 光錐
      const lib = new Map(pr.library.map((t) => [t.id, t]));
      const lampOn = new T.MeshBasicMaterial({ color: 0xfffbe6 });
      const lampOff = new T.MeshBasicMaterial({ color: 0x4b5563 });
      const wireMat = new T.LineBasicMaterial({ color: 0x64748b });
      const showBeams = this.app.view?.beams;

      for (const f of pr.fixtures) {
        const t = lib.get(f.typeId);
        if (!t) continue;
        const geo = t.shape === 'round'
          ? new T.CylinderGeometry((t.length || 0.1) / 2, (t.length || 0.1) / 2, 0.04, 20)
          : new T.BoxGeometry(t.length || 0.1, 0.04, t.width || 0.1);
        const m = new T.Mesh(geo, f.on === false ? lampOff : lampOn);
        m.position.set(f.x, f.z - 0.02, f.y);
        m.rotation.y = -(f.rot || 0) * Math.PI / 180;
        m.rotateX(-(f.tilt || 0) * Math.PI / 180);
        g.add(m);

        if (f.z < room.height - 0.01) {
          const wg = new T.BufferGeometry().setFromPoints([new T.Vector3(f.x, f.z, f.y), new T.Vector3(f.x, room.height, f.y)]);
          g.add(new T.Line(wg, wireMat));
        }

        if (showBeams && f.on !== false) {
          const hgt = f.z - (LX.cad ? LX.cad.surfaceAt(pr, f.x, f.y).height : 0.75);
          if (hgt > 0) {
            const r = hgt * Math.tan(Math.min(80, f.beam / 2) * Math.PI / 180);
            const cone = new T.Mesh(
              new T.ConeGeometry(r, hgt, 24, 1, true),
              new T.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.08, depthWrite: false, side: T.DoubleSide })
            );
            const pivot = new T.Group();
            pivot.position.set(f.x, f.z, f.y);
            pivot.rotation.y = -(f.rot || 0) * Math.PI / 180;
            const inner = new T.Group();
            inner.rotation.x = -(f.tilt || 0) * Math.PI / 180;
            cone.position.y = -hgt / 2;
            inner.add(cone);
            pivot.add(inner);
            g.add(pivot);
          }
        }
      }

      // 天花輪廓線
      const ceil = new T.LineLoop(
        new T.BufferGeometry().setFromPoints(pts.map(([x, y]) => new T.Vector3(x, room.height, y))),
        edgeMat
      );
      g.add(ceil);

      // 相機定位
      if (!this._camSet || this._camKey !== b.w + 'x' + b.h) {
        const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
        const d = Math.max(b.w, b.h);
        this.camera.position.set(cx - d * 0.55, d * 0.75, cy + d * 0.85);
        this.controls.target.set(cx, room.wp, cy);
        this._camSet = true;
        this._camKey = b.w + 'x' + b.h;
      }

      // 更新 HUD 色階標尺
      this.updateHUD(res);
    }
  }

  LX.View3D = View3D;
})((window.LX = window.LX || {}));
