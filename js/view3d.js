/* =========================================================================
 * view3d.js — 3D 檢視（Three.js r147，CDN 載入；離線時自動停用）
 *   平面座標 (x, y) → three (x, z)；高度 → three y
 * ========================================================================= */
(function (LX) {
  'use strict';

  class View3D {
    constructor(container, app) {
      this.el = container;
      this.app = app;
      this.ready = false;
      if (!window.THREE) {
        container.innerHTML = '<div class="empty3d">3D 檢視需要網路載入 Three.js（目前無法載入）。2D 計算功能不受影響。</div>';
        return;
      }
      const T = window.THREE;
      this.T = T;
      this.renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.setClearColor(0x0f141b);
      container.appendChild(this.renderer.domElement);
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(50, 1, 0.1, 1000);
      this.controls = new T.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.scene.add(new T.AmbientLight(0xffffff, 0.75));
      const dl = new T.DirectionalLight(0xffffff, 0.35);
      dl.position.set(10, 30, 15);
      this.scene.add(dl);
      this.group = new T.Group();
      this.scene.add(this.group);
      this.ready = true;
      new ResizeObserver(() => this.resize()).observe(container);
      const loop = () => {
        requestAnimationFrame(loop);
        if (!this.visible) return;
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      };
      loop();
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
      if (v) { this.resize(); this.rebuild(); }
    }

    rebuild() {
      if (!this.ready || !this.visible) return;
      const T = this.T;
      const pr = this.app.project;
      const room = pr.room;
      const res = this.app.result;
      const g = this.group;
      while (g.children.length) {
        const c = g.children.pop();
        c.geometry && c.geometry.dispose();
        if (c.material) { c.material.map && c.material.map.dispose(); c.material.dispose(); }
      }
      const b = LX.calc.polyBounds(room.polygon);
      const shape = new T.Shape();
      room.polygon.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
      const allDesks = LX.cad && LX.cad.allDesks ? LX.cad.allDesks(pr) : (pr.cad?.desks || []);
      const zoneMode = LX.cad && LX.cad.hasZoneMode ? LX.cad.hasZoneMode(pr) : !!pr.cad;
      if(zoneMode)for(const desk of allDesks) {
        const hole=new T.Path();desk.polygon.forEach(([x,y],i)=>i?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);
      }

      // 工作面 + 熱圖貼圖
      let floorMat;
      if (res) {
        const heat = LX.render.buildHeatCanvas(res, this.app.view.colorMode, res.primaryTarget);
        const tex = new T.CanvasTexture(heat);
        tex.minFilter = T.LinearFilter;
        tex.magFilter = T.LinearFilter;
        floorMat = new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide });
      } else floorMat = new T.MeshLambertMaterial({ color: 0x334155, side: T.DoubleSide });
      const fGeo = new T.ShapeGeometry(shape);
      // 設定 UV 對應到計算格點範圍
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
      floor.rotation.x = Math.PI / 2; // shape (x,y) → (x, 0, y)
      floor.position.y = zoneMode?0.006:room.wp;
      g.add(floor);

      if(zoneMode)for(const desk of allDesks) {
        const dh=desk.height??0.75;
        const ds=new T.Shape();desk.polygon.forEach(([x,y],i)=>i?ds.lineTo(x,y):ds.moveTo(x,y));ds.closePath();
        const geo=new T.ShapeGeometry(ds),positions=geo.attributes.position,duv=new Float32Array(positions.count*2);
        for(let i=0;i<positions.count;i++){duv[i*2]=(positions.getX(i)-gx0)/gw;duv[i*2+1]=1-(positions.getY(i)-gy0)/gh;}
        geo.setAttribute('uv',new T.BufferAttribute(duv,2));
        const top=new T.Mesh(geo,floorMat.clone());top.rotation.x=Math.PI/2;top.position.y=dh;top.userData.kind='desk';g.add(top);
        const rim=new T.LineLoop(new T.BufferGeometry().setFromPoints(desk.polygon.map(([x,y])=>new T.Vector3(x,dh+0.005,y))),new T.LineBasicMaterial({color:0x38bdf8}));g.add(rim);
        const center=desk.polygon.reduce((s,p)=>[s[0]+p[0]/desk.polygon.length,s[1]+p[1]/desk.polygon.length],[0,0]);
        for(const [x,y] of desk.polygon.slice(0,4)){
          const leg=new T.Mesh(new T.CylinderGeometry(0.022,0.022,dh-0.03,6),new T.MeshLambertMaterial({color:0x64748b}));leg.position.set(x*0.9+center[0]*0.1,(dh-0.03)/2,y*0.9+center[1]*0.1);g.add(leg);
        }
      }

      // 地板
      const fl = new T.Mesh(new T.ShapeGeometry(shape), new T.MeshLambertMaterial({ color: 0x1f2937, side: T.DoubleSide }));
      fl.rotation.x = Math.PI / 2;
      fl.position.y = -0.01;
      g.add(fl);

      // 牆
      const wallMat = new T.MeshLambertMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false });
      const edgeMat = new T.LineBasicMaterial({ color: 0x94a3b8 });
      const pts = room.polygon;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const wall = new T.Mesh(new T.PlaneGeometry(len, room.height), wallMat);
        wall.position.set((a[0] + c[0]) / 2, room.height / 2, (a[1] + c[1]) / 2);
        wall.rotation.y = -Math.atan2(c[1] - a[1], c[0] - a[0]);
        g.add(wall);
        const eg = new T.BufferGeometry().setFromPoints([
          new T.Vector3(a[0], 0, a[1]), new T.Vector3(a[0], room.height, a[1]),
          new T.Vector3(c[0], room.height, c[1]), new T.Vector3(c[0], 0, c[1]),
        ]);
        g.add(new T.Line(eg, edgeMat));
      }

      // 燈具
      const lib = new Map(pr.library.map((t) => [t.id, t]));
      const lampOn = new T.MeshBasicMaterial({ color: 0xfffbe6 });
      const lampOff = new T.MeshBasicMaterial({ color: 0x4b5563 });
      const wireMat = new T.LineBasicMaterial({ color: 0x64748b });
      const showBeams = this.app.view.beams;
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
          const hgt = f.z - LX.cad.surfaceAt(pr,f.x,f.y).height;
          if (hgt > 0) {
            const r = hgt * Math.tan(Math.min(80, f.beam / 2) * Math.PI / 180);
            const cone = new T.Mesh(
              new T.ConeGeometry(r, hgt, 24, 1, true),
              new T.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.07, depthWrite: false, side: T.DoubleSide })
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

      // 天花線框
      const ceil = new T.LineLoop(
        new T.BufferGeometry().setFromPoints(pts.map(([x, y]) => new T.Vector3(x, room.height, y))),
        edgeMat
      );
      g.add(ceil);

      if (!this._camSet || this._camKey !== b.w + 'x' + b.h) {
        const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
        const d = Math.max(b.w, b.h);
        this.camera.position.set(cx - d * 0.55, d * 0.75, cy + d * 0.85);
        this.controls.target.set(cx, room.wp, cy);
        this._camSet = true;
        this._camKey = b.w + 'x' + b.h;
      }
    }
  }

  LX.View3D = View3D;
})((window.LX = window.LX || {}));
