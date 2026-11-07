/* Pro-2D+3D 2027 — 3D view (three.js).
 * Rebuilt from the shared model on every change → live 2D⇄3D link.
 * Plan (x, y) maps to 3D (x, −z); Y is up.
 */
(function () {
  const P23 = window.P23, M = P23.model, G = P23.geom;

  class View3D {
    constructor(container) {
      this.el = container;
      const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.outputEncoding = THREE.sRGBEncoding;
      container.appendChild(r.domElement);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 20000);
      this.camera.position.set(16, 14, 16);
      this.controls = new THREE.OrbitControls(this.camera, r.domElement);
      this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
      this.controls.target.set(5, 0, -4);

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 0.75));
      const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 0.85));
      sun.position.set(12, 22, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      this.scene.add(sun); this.scene.add(sun.target);

      this.group = new THREE.Group(); this.scene.add(this.group);
      this.refGroup = new THREE.Group(); this.scene.add(this.refGroup);
      this.objGroup = new THREE.Group(); this.scene.add(this.objGroup);

      this.mats = {
        wall: new THREE.MeshStandardMaterial({ color: 0xe9edf5, roughness: 0.92 }),
        sel: new THREE.MeshStandardMaterial({ color: 0xffb547, roughness: 0.6, emissive: 0x553300 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x8cc8ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.38 }),
        frame: new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.6 }),
        door: new THREE.MeshStandardMaterial({ color: 0x9c6b3e, roughness: 0.7 }),
        floor: new THREE.MeshStandardMaterial({ color: 0x9aa4b8, roughness: 1 }),
        edge: new THREE.LineBasicMaterial({ color: 0x2b3550, transparent: true, opacity: 0.55 }),
        ref: new THREE.LineBasicMaterial({ color: 0x6f86b8 }),
      };
      Object.entries(this.mats).forEach(([k, m]) => (m.name = "P23_" + k));

      this.firstFit = true;
      this._bind();
      new ResizeObserver(() => this.resize()).observe(container);
      M.on("change", () => this.queue());
      M.on("select", () => this.applySelection());
      M.on("load", () => { this.firstFit = true; });
      this.refreshColors();
      this.loop();
    }

    visible() { return this.el.offsetParent !== null && this.el.clientWidth > 0; }
    resize() {
      const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return;
      this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      if (this.firstFit && M.doc.walls.length) { this.fit(); this.firstFit = false; }
    }
    loop() {
      requestAnimationFrame(() => this.loop());
      if (!this.visible()) return;
      if (this._dirty) { this._dirty = false; this.rebuild(); }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
    queue() { this._dirty = true; }

    refreshColors() {
      const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
      this.renderer.setClearColor(new THREE.Color(v("--v3-bg") || "#0e1838"));
      this.mats.wall.color.set(v("--v3-wall") || "#e9edf5");
      this.mats.floor.color.set(v("--v3-floor") || "#9aa4b8");
      this.mats.sel.color.set(v("--cv-sel") || "#ffb547");
      this.mats.ref.color.set(v("--cv-ref") || "#6f86b8");
      if (this.grid) this.scene.remove(this.grid);
      const gc = new THREE.Color(v("--v3-grid") || "#2b3c6c");
      this.grid = new THREE.GridHelper(200, 200, gc, gc); this.grid.position.y = -0.002;
      this.grid.material.transparent = true; this.grid.material.opacity = 0.6;
      this.scene.add(this.grid);
    }

    _bind() {
      const dom = this.renderer.domElement; let down = null;
      dom.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY, b: e.button }));
      dom.addEventListener("pointerup", (e) => {
        if (!down || down.b !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
        const rc = dom.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
        const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
        const hits = ray.intersectObjects(this.group.children, false).filter((h) => h.object.userData.kind);
        const ud = hits.length ? hits[0].object.userData : null;
        M.select(ud ? ud.kind : null, ud ? ud.id : null, "3d");
      });
    }

    /* ---------- build ---------- */
    box(w, h, d, mat, plan, alongDir, y0, ud) {
      const geo = new THREE.BoxGeometry(Math.max(w, 1e-4), Math.max(h, 1e-4), Math.max(d, 1e-4));
      const m = new THREE.Mesh(geo, mat);
      m.position.set(plan.x, y0 + h / 2, -plan.y);
      m.rotation.y = Math.atan2(alongDir.y, alongDir.x);
      m.castShadow = true; m.receiveShadow = true;
      if (ud) { m.userData = Object.assign({ baseMat: mat }, ud); }
      this.group.add(m);
      if (mat !== this.mats.glass) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.mats.edge); e.position.copy(m.position); e.rotation.copy(m.rotation); e.raycast = () => {}; this.group.add(e); }
      return m;
    }
    clear(g) {
      while (g.children.length) { const c = g.children.pop(); if (c.geometry) c.geometry.dispose(); }
    }
    rebuild() {
      this.clear(this.group);
      const walls = M.doc.walls, mats = this.mats;
      for (const w of walls) {
        const L = G.len(w.a, w.b); if (L < 1e-4) continue;
        const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
        const at = (s) => ({ x: w.a.x + u.x * s, y: w.a.y + u.y * s });
        const extA = G.joined(w.a, w, walls) ? w.t / 2 : 0, extB = G.joined(w.b, w, walls) ? w.t / 2 : 0;
        const ops = G.openingsOf(w, M.doc.openings);
        const ud = { kind: "wall", id: w.id };
        let cur = -extA;
        for (const o of ops) {
          const s0 = o.pos - o.w / 2, s1 = o.pos + o.w / 2;
          if (s0 > cur + 1e-4) this.box(s0 - cur, w.h, w.t, mats.wall, at((cur + s0) / 2), u, 0, ud);
          const sill = Math.max(0, o.sill), head = Math.min(w.h, sill + o.h);
          if (sill > 1e-3) this.box(o.w, sill, w.t, mats.wall, at(o.pos), u, 0, ud);
          if (w.h - head > 1e-3) this.box(o.w, w.h - head, w.t, mats.wall, at(o.pos), u, head, ud);
          const oud = { kind: "opening", id: o.id };
          if (o.kind === "window") {
            this.box(o.w, head - sill, 0.02, mats.glass, at(o.pos), u, sill, oud);
            this.box(o.w, 0.05, w.t + 0.04, mats.frame, at(o.pos), u, sill - 0.05 > 0 ? sill - 0.05 : sill, oud);
            this.box(0.05, head - sill, w.t * 0.6, mats.frame, at(o.pos - o.w / 2 + 0.025), u, sill, oud);
            this.box(0.05, head - sill, w.t * 0.6, mats.frame, at(o.pos + o.w / 2 - 0.025), u, sill, oud);
            this.box(0.04, head - sill, 0.04, mats.frame, at(o.pos), u, sill, oud);
          } else {
            this.box(o.w - 0.03, head - 0.01, 0.045, mats.door, at(o.pos), u, 0, oud);
          }
          cur = s1;
        }
        if (L + extB > cur + 1e-4) this.box(L + extB - cur, w.h, w.t, mats.wall, at((cur + L + extB) / 2), u, 0, ud);
      }
      // floor slab
      const b = this.planBounds();
      if (b) {
        const pad = 0.3, fw = b.x1 - b.x0 + pad * 2, fd = b.y1 - b.y0 + pad * 2;
        const f = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.1, fd), mats.floor);
        f.position.set((b.x0 + b.x1) / 2, -0.05, -(b.y0 + b.y1) / 2); f.receiveShadow = true; this.group.add(f);
        const span = Math.max(fw, fd) * 0.8 + 5, sc = this.sun.shadow.camera;
        sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 0.5; sc.far = span * 6; sc.updateProjectionMatrix();
        const cx = (b.x0 + b.x1) / 2, cz = -(b.y0 + b.y1) / 2;
        this.sun.target.position.set(cx, 0, cz); this.sun.position.set(cx + span * 0.6, span * 1.4, cz + span * 0.5);
      }
      this.buildRefs();
      this.applySelection();
      if (this.firstFit && walls.length && this.visible()) { this.fit(); this.firstFit = false; }
    }
    buildRefs() {
      this.clear(this.refGroup);
      const lines = M.doc.refs.lines; if (!lines.length) return;
      const arr = new Float32Array(lines.length * 6);
      lines.forEach((l, i) => { arr.set([l[0], 0.002, -l[1], l[2], 0.002, -l[3]], i * 6); });
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      this.refGroup.add(new THREE.LineSegments(g, this.mats.ref));
    }
    planBounds() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const w of M.doc.walls) for (const p of [w.a, w.b]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      return x0 === Infinity ? null : { x0, y0, x1, y1 };
    }
    applySelection() {
      const sel = M.selection;
      for (const m of this.group.children) {
        if (!m.userData || !m.userData.baseMat) continue;
        const on = sel && m.userData.id === sel.id;
        m.material = on ? (m.userData.baseMat === this.mats.glass ? this.mats.sel : this.mats.sel) : m.userData.baseMat;
      }
    }
    setRefModel(obj) {
      this.clear(this.objGroup);
      if (obj) this.objGroup.add(obj);
      this.fit();
    }

    /* ---------- camera ---------- */
    bbox() {
      const box = new THREE.Box3();
      [this.group, this.objGroup, this.refGroup].forEach((g) => g.children.length && box.expandByObject(g));
      return box.isEmpty() ? null : box;
    }
    fit(top) {
      const box = this.bbox(); const c = new THREE.Vector3(5, 0, -4); let size = 12;
      if (box) { box.getCenter(c); size = box.getSize(new THREE.Vector3()).length(); }
      const d = Math.max(4, size) * 1.25 / Math.min(1, Math.max(0.5, this.camera.aspect));
      this.controls.target.copy(c);
      if (top) this.camera.position.set(c.x, c.y + d * 1.5, c.z + 0.001);
      else this.camera.position.set(c.x + d * 0.75, c.y + d * 0.7, c.z + d * 0.85);
      this.camera.near = Math.max(0.01, d / 2000); this.camera.far = d * 50; this.camera.updateProjectionMatrix();
      this.controls.update();
    }
  }

  P23.View3D = View3D;
})();
