/* Pro3D-2027 for iPad — the 3D model viewer (the approved iPad mock-up).
 * One WebGL canvas, three views drawn with scissor rectangles:
 *   left   = the 3D view (perspective, OrbitControls: 1 finger orbit, 2 fingers pan / pinch zoom)
 *   right  = two locked elevations (orthographic: front/back/left/right/top, ↺ ↻ roll 90°, fit)
 * Section cut on X/Y/Z: the 3D view keeps the WHOLE model and shows a translucent red plane, its
 * frame and thin red cut lines (hidden where the model is in front); only the chosen pane is cut.
 * World: metres, Z up (Y-up formats — glTF/SKP→GLB/IFC/OBJ — are turned +90° about X). */
(function () {
  "use strict";
  const P = window.P23;
  P.addText({
    t_undo: "เลิกทำ", t_redo: "ทำซ้ำ", t_orbit: "หมุน", t_pan: "มือเลื่อน", t_zoom: "ซูม", t_fit: "ดูทั้งหมด",
    t_dist: "วัดระยะ", t_angle: "วัดมุม", t_area: "หาพื้นที่", t_hide: "ซ่อน", t_show: "แสดงทั้งหมด", t_xray: "โปร่งแสง",
    cut: "ตัด section:", ax_x: "แกน X", ax_y: "แกน Y", ax_z: "แกน Z", flip: "⇄ กลับด้าน", show_in: "แสดงในจอ:",
    p_top: "บน", p_bottom: "ล่าง", cut_off: "✕ ปิด", unit: "หน่วย:", u_m: "เมตร", u_in: "นิ้ว", cut_at: "ตัดที่ {v}",
    gest: "☝️ 1 นิ้ว ลาก = หมุน  ·  ✌️ 2 นิ้ว = เลื่อน / ถ่างซูม\nแตะ 2 ครั้ง = ดูทั้งหมด",
    clear_meas: "ล้างการวัด", elev: "รูปด้าน", s_front: "หน้า", s_back: "หลัง", s_left: "ซ้าย", s_right: "ขวา", s_top: "บน",
    fitp: "พอดีจอ", cutmark: "✂ ตัด", empty_t: "ยังไม่ได้เปิดโมเดล",
    empty_s: "แตะ \"เปิดไฟล์\" เพื่อเลือกจากแอปไฟล์ / iCloud / AirDrop — SKP, IGZ, IFC, OBJ, GLB/glTF, DWG/DXF\nหรือแตะ \"บ้านตัวอย่าง\"",
    h_dist1: "แตะจุดแรก", h_dist2: "แตะจุดที่สอง", h_ang1: "แตะจุดปลายแรก", h_ang2: "แตะจุดยอดมุม", h_ang3: "แตะจุดปลายที่สอง",
    h_area: "แตะพื้นผิวที่ต้องการหาพื้นที่", h_hide: "แตะชิ้นที่ต้องการซ่อน", nothing: "ไม่โดนชิ้นงาน",
    hidden_n: "ซ่อนแล้ว {n} ชิ้น", shown_all: "แสดงทั้งหมดแล้ว", xray_on: "โปร่งแสง: เปิด", xray_off: "โปร่งแสง: ปิด",
    info: "{name} · {n} ชิ้น · {tri} สามเหลี่ยม · กว้าง {w} × ยาว {d} × สูง {h}", dae_no: "ยังเปิด DAE ไม่ได้ — ส่งออกเป็น SKP, GLB หรือ OBJ แทน",
  }, {
    t_undo: "Undo", t_redo: "Redo", t_orbit: "Orbit", t_pan: "Pan", t_zoom: "Zoom", t_fit: "Extents",
    t_dist: "Distance", t_angle: "Angle", t_area: "Area", t_hide: "Hide", t_show: "Show all", t_xray: "X-ray",
    cut: "Section:", ax_x: "X axis", ax_y: "Y axis", ax_z: "Z axis", flip: "⇄ Flip", show_in: "Show in:",
    p_top: "Top", p_bottom: "Bottom", cut_off: "✕ Off", unit: "Units:", u_m: "Metres", u_in: "Inches", cut_at: "Cut at {v}",
    gest: "☝️ 1 finger drag = orbit  ·  ✌️ 2 fingers = pan / pinch zoom\nDouble-tap = extents",
    clear_meas: "Clear measurements", elev: "Elevation", s_front: "Front", s_back: "Back", s_left: "Left", s_right: "Right", s_top: "Top",
    fitp: "Fit", cutmark: "✂ cut", empty_t: "No model open yet",
    empty_s: "Tap \"Open file\" to pick from Files / iCloud / AirDrop — SKP, IGZ, IFC, OBJ, GLB/glTF, DWG/DXF\nor tap \"Sample house\"",
    h_dist1: "Tap the first point", h_dist2: "Tap the second point", h_ang1: "Tap the first end", h_ang2: "Tap the corner", h_ang3: "Tap the second end",
    h_area: "Tap the surface to measure", h_hide: "Tap the part to hide", nothing: "Nothing there",
    hidden_n: "{n} hidden", shown_all: "Everything shown", xray_on: "X-ray on", xray_off: "X-ray off",
    info: "{name} · {n} parts · {tri} triangles · {w} × {d} × {h}", dae_no: "DAE cannot be opened yet — export SKP, GLB or OBJ instead",
  });

  const $ = (id) => document.getElementById(id);
  THREE.Object3D.DefaultUp.set(0, 0, 1);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------- state ---------- */
  const S = {
    model: null, box: new THREE.Box3(), center: V3(0, 0, 0), radius: 10, tris: 0, parts: 0,
    tool: "orbit", unit: P.store.get("unit3d", "m"), xray: false,
    cut: { axis: null, t: 0.5, flip: false, pane: +P.store.get("cutpane", "0") },
    undo: [], redo: [], meas: [], pick: [], scanKey: "",
  };

  /* ---------- renderer and scene ---------- */
  const canvas = $("gl"), body = $("body");
  const R = new THREE.WebGLRenderer({ canvas, antialias: true });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  R.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9890, 0.8); hemi.position.set(0, 0, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.7); scene.add(sun, sun.target);
  const L_CUT = 1, L_MEAS = 2, L_EDGE = 3, L_MARK = 4;   // L_MARK: the cut line seen in the other pane                 // layer 0 = model faces

  // the 3D view
  const mv = $("mv");
  const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  cam.layers.enable(L_CUT); cam.layers.enable(L_MEAS); cam.layers.enable(L_EDGE);
  cam.position.set(-10, -12, 8);
  const ctl = new THREE.OrbitControls(cam, mv);
  ctl.screenSpacePanning = true; ctl.zoomSpeed = 1.2; ctl.rotateSpeed = 0.9;
  ctl.addEventListener("change", () => { requestRender(); hideGest(); });

  // the two elevations
  const SIDES = {
    front: { d: V3(0, 1, 0), up: V3(0, 0, 1) }, back: { d: V3(0, -1, 0), up: V3(0, 0, 1) },
    left: { d: V3(1, 0, 0), up: V3(0, 0, 1) }, right: { d: V3(-1, 0, 0), up: V3(0, 0, 1) },
    top: { d: V3(0, 0, -1), up: V3(0, 1, 0) },
  };
  const panes = [...document.querySelectorAll(".pane")].map((el, i) => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    c.layers.enable(L_MEAS); c.layers.enable(L_EDGE);
    return { i, el, view: el.querySelector(".pv"), head: el.querySelector(".ph"), cam: c,
             side: P.store.get("pane" + i, i === 0 ? "front" : "right"), roll: 0, half: 10, ctr: V3(0, 0, 0) };
  });

  /* ---------- drawing (on demand) ---------- */
  let pending = false;
  function requestRender() { if (!pending) { pending = true; requestAnimationFrame(render); } }
  P.requestRender = requestRender;
  let bg = new THREE.Color("#d9dce2");
  function readTheme() { bg = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--view3d").trim() || "#d9dce2"); requestRender(); }
  function rectOf(el) {
    const a = el.getBoundingClientRect(), b = canvas.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height, H: b.height };
  }
  function viewport(r) {
    const y = r.H - r.y - r.h;
    R.setViewport(r.x, y, r.w, r.h); R.setScissor(r.x, y, r.w, r.h);
  }
  function lightFrom(c, target) {
    sun.position.copy(c.position).sub(target).normalize().add(V3(0.25, -0.15, 0.6)).multiplyScalar(S.radius * 3).add(target);
    sun.target.position.copy(target); sun.target.updateMatrixWorld();
  }
  function render() {
    pending = false;
    const w = body.clientWidth, h = body.clientHeight;
    if (canvas.width !== Math.round(w * R.getPixelRatio()) || canvas.height !== Math.round(h * R.getPixelRatio())) R.setSize(w, h, false);
    R.setScissorTest(true); R.setClearColor(bg, 1);
    // 3D view: the whole model + cut plane, frame and cut lines
    const rm = rectOf(mv);
    cam.aspect = rm.w / Math.max(rm.h, 1); cam.updateProjectionMatrix();
    viewport(rm); R.clear();
    R.clippingPlanes = [];
    if (S.cut.axis) updateScan();
    lightFrom(cam, ctl.target);
    R.render(scene, cam);
    // elevations
    for (const p of panes) {
      const r = rectOf(p.view);
      if (r.w < 2 || r.h < 2) continue;
      const a = r.w / r.h;
      p.cam.left = -p.half * a; p.cam.right = p.half * a; p.cam.top = p.half; p.cam.bottom = -p.half; p.cam.updateProjectionMatrix();
      viewport(r); R.clear();
      R.clippingPlanes = S.cut.axis && S.cut.pane === p.i ? [plane] : [];
      // the pane that is not cut shows where the cut is: a red line that follows the slider
      const mark = S.cut.axis && S.cut.pane !== p.i && Math.abs((SIDES[p.side] || SIDES.front).d.dot(AX[S.cut.axis])) < 0.5;
      if (mark) p.cam.layers.enable(L_MARK); else p.cam.layers.disable(L_MARK);
      lightFrom(p.cam, p.ctr);
      R.render(scene, p.cam);
    }
    R.clippingPlanes = [];
    R.setScissorTest(false);
    placeLabels(rm);
  }

  /* ---------- the 3D view's gestures: tool modes ---------- */
  function setTool(t) {
    S.tool = t; S.pick = []; clearTemp();
    document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
    ctl.touches.ONE = t === "pan" ? THREE.TOUCH.PAN : t === "zoom" ? -1 : THREE.TOUCH.ROTATE;
    ctl.mouseButtons.LEFT = t === "pan" ? THREE.MOUSE.PAN : t === "zoom" ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
    hint();
  }
  function hint() {
    const t = S.tool, n = S.pick.length;
    const k = t === "dist" ? (n ? "h_dist2" : "h_dist1") : t === "angle" ? ["h_ang1", "h_ang2", "h_ang3"][n] : t === "area" ? "h_area" : t === "hide" ? "h_hide" : null;
    const ro = $("readout");
    if (k) { ro.textContent = P.t(k); ro.classList.add("show"); }
    else if (!S.meas.length) ro.classList.remove("show");
  }
  // one-finger zoom (the Zoom tool on a touch screen): drag up = closer
  (function () {
    let id = null, y0 = 0;
    mv.addEventListener("pointerdown", (e) => { if (S.tool === "zoom" && e.pointerType !== "mouse" && id == null) { id = e.pointerId; y0 = e.clientY; } });
    mv.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const k = Math.exp((e.clientY - y0) * 0.006); y0 = e.clientY;
      cam.position.sub(ctl.target).multiplyScalar(k).add(ctl.target); ctl.update();
    });
    const end = (e) => { if (e.pointerId === id) id = null; };
    mv.addEventListener("pointerup", end); mv.addEventListener("pointercancel", end);
  })();

  /* taps (a short touch that did not move) on any view: measuring, hiding; double-tap = fit */
  function onTaps(el, view) {
    const downs = new Map(); let last = null;
    el.addEventListener("pointerdown", (e) => downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), multi: downs.size > 0 }));
    const up = (e) => {
      const d = downs.get(e.pointerId); downs.delete(e.pointerId);
      if (!d || d.multi || downs.size) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 450) return;
      const now = performance.now(), nav = ["orbit", "pan", "zoom"].includes(S.tool);
      if (nav && last && now - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) { last = null; view === "main" ? fit() : fitPane(panes[view]); return; }
      last = { t: now, x: e.clientX, y: e.clientY };
      if (!nav) tap(view, e.clientX, e.clientY);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", (e) => downs.delete(e.pointerId));
  }

  /* the elevations' gestures: 1 finger = pan, 2 fingers = pan + pinch zoom, wheel = zoom */
  function paneGestures(p) {
    const el = p.view, ptrs = new Map();
    let prev = null;
    const basisOf = () => { const r = V3(1, 0, 0).applyQuaternion(p.cam.quaternion), u = V3(0, 1, 0).applyQuaternion(p.cam.quaternion); return [r, u]; };
    function zoomAt(k, sx, sy) {           // k < 1 = closer; keep the point under (sx, sy) still
      const b = el.getBoundingClientRect(), [r, u] = basisOf();
      const nx = ((sx - b.left) / b.width) * 2 - 1, ny = 1 - ((sy - b.top) / b.height) * 2, a = b.width / b.height;
      const d = p.half * (1 - k);
      p.ctr.addScaledVector(r, nx * a * d).addScaledVector(u, ny * d);
      p.half = Math.max(p.half * k, S.radius * 1e-4);
      placePane(p);
    }
    function panBy(dx, dy) {
      const b = el.getBoundingClientRect(), [r, u] = basisOf(), s = (2 * p.half) / b.height;
      p.ctr.addScaledVector(r, -dx * s).addScaledVector(u, dy * s); placePane(p);
    }
    const state = () => {
      const v = [...ptrs.values()];
      if (v.length === 1) return { x: v[0].x, y: v[0].y, d: 0 };
      return { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2, d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) };
    };
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); prev = state(); hideGest(); });
    el.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = state();
      if (prev && ptrs.size <= 2) {
        if (S.tool === "zoom" && ptrs.size === 1) zoomAt(Math.exp((s.y - prev.y) * 0.006), prev.x, prev.y);
        else {
          panBy(s.x - prev.x, s.y - prev.y);
          if (ptrs.size === 2 && prev.d > 0 && s.d > 0) zoomAt(prev.d / s.d, s.x, s.y);
        }
      }
      prev = s;
    });
    const end = (e) => { ptrs.delete(e.pointerId); prev = ptrs.size ? state() : null; };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
  }

  function placePane(p) {
    const sd = SIDES[p.side] || SIDES.front;
    const up = sd.up.clone().applyAxisAngle(sd.d, (-p.roll * Math.PI) / 2);
    p.cam.up.copy(up);
    p.cam.position.copy(p.ctr).addScaledVector(sd.d, -S.radius * 4);
    p.cam.near = S.radius * 0.01; p.cam.far = S.radius * 10;
    p.cam.lookAt(p.ctr); p.cam.updateMatrixWorld();
    requestRender();
  }
  function fitPane(p) {
    const sd = SIDES[p.side] || SIDES.front;
    p.ctr.copy(S.center);
    placePane(p);
    // the box's extent across the pane's right/up axes
    const r = V3(1, 0, 0).applyQuaternion(p.cam.quaternion), u = V3(0, 1, 0).applyQuaternion(p.cam.quaternion);
    let rx = 0, uy = 0;
    const b = S.box;
    for (let i = 0; i < 8; i++) {
      const c = V3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).sub(S.center);
      rx = Math.max(rx, Math.abs(c.dot(r))); uy = Math.max(uy, Math.abs(c.dot(u)));
    }
    const el = rectOf(p.view), a = el.w / Math.max(el.h, 1);
    p.half = Math.max(uy, rx / Math.max(a, 1e-3), S.radius * 0.01) * 1.08;
    void sd; placePane(p);
  }
  function buildPaneHead(p) {
    const h = p.head; h.innerHTML = "";
    const lab = document.createElement("b"); lab.textContent = P.t("elev"); h.appendChild(lab);
    for (const s of ["front", "back", "left", "right", "top"]) {
      const b = document.createElement("button"); b.textContent = P.t("s_" + s); b.classList.toggle("on", p.side === s);
      b.onclick = () => { p.side = s; p.roll = 0; P.store.set("pane" + p.i, s); if (S.cut.axis) setCut(); else buildPaneHead(p); fitPane(p); };
      h.appendChild(b);
    }
    const rl = document.createElement("button"); rl.textContent = "↺"; rl.onclick = () => { p.roll = (p.roll + 3) % 4; fitPane(p); };
    const rr = document.createElement("button"); rr.textContent = "↻"; rr.onclick = () => { p.roll = (p.roll + 1) % 4; fitPane(p); };
    h.append(rl, rr);
    if (S.cut.axis && S.cut.pane === p.i) { const c = document.createElement("button"); c.className = "cut"; c.textContent = P.t("cutmark"); c.disabled = true; h.appendChild(c); }
    const f = document.createElement("button"); f.className = "r"; f.textContent = P.t("fitp"); f.onclick = () => fitPane(p);
    h.appendChild(f);
  }

  /* ---------- fitting the 3D view ---------- */
  function fit() {
    if (!S.model) return;
    // a flat drawing (DWG/DXF) is looked at from above, a model from the front-left corner
    const flat = S.box.max.z - S.box.min.z < S.radius * 0.01;
    const dir = flat ? V3(0, -0.0001, 1).normalize() : V3(-0.62, -0.78, 0.55).normalize();
    const dist = S.radius / Math.sin((cam.fov * Math.PI) / 360) * 1.05;
    ctl.target.copy(S.center);
    cam.position.copy(S.center).addScaledVector(dir, dist);
    cam.near = Math.max(S.radius / 2000, 0.001); cam.far = S.radius * 200; cam.updateProjectionMatrix();
    ctl.maxDistance = S.radius * 60;
    ctl.update(); requestRender();
  }

  /* ---------- picking ---------- */
  const ray = new THREE.Raycaster(); ray.layers.set(0);
  function pickAt(view, sx, sy) {
    if (!S.model) return null;
    const el = view === "main" ? mv : panes[view].view, c = view === "main" ? cam : panes[view].cam;
    const b = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((sx - b.left) / b.width) * 2 - 1, 1 - ((sy - b.top) / b.height) * 2);
    ray.setFromCamera(ndc, c);
    const cutHere = view !== "main" && S.cut.axis && S.cut.pane === view;
    const hits = ray.intersectObject(S.model, true).filter((h) => h.object.isMesh && visibleChain(h.object) && h.face && (!cutHere || plane.distanceToPoint(h.point) >= -1e-6));
    if (!hits.length) return null;
    const h = hits[0];
    // snap to a corner of the touched triangle when it is within 18 px
    const g = h.object.geometry, pos = g.attributes.position, idx = g.index;
    const ids = [h.face.a, h.face.b, h.face.c];
    let best = null, bd = 18;
    for (const i of ids) {
      const w = V3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(h.object.matrixWorld);
      const s = w.clone().project(c), px = ((s.x + 1) / 2) * b.width + b.left, py = ((1 - s.y) / 2) * b.height + b.top;
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = w; }
    }
    void idx;
    return { hit: h, point: best || h.point.clone(), snapped: !!best };
  }
  const visibleChain = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };

  /* ---------- measuring ---------- */
  const measG = new THREE.Group(); measG.layers.set(L_MEAS); scene.add(measG);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff3b3b, depthTest: false, transparent: true });
  const dotMat = new THREE.PointsMaterial({ color: 0xff3b3b, size: 10, sizeAttenuation: false, depthTest: false, transparent: true });
  const areaMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.45, depthTest: false, side: THREE.DoubleSide });
  let temp = null;
  function onLayer(o, l) { o.traverse((q) => q.layers.set(l)); o.renderOrder = 10; return o; }
  function linePts(pts) { return onLayer(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat), L_MEAS); }
  function dots(pts) { return onLayer(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), dotMat), L_MEAS); }
  function clearTemp() { if (temp) { measG.remove(temp); temp = null; requestRender(); } }
  function showTemp(pts) { clearTemp(); temp = new THREE.Group(); temp.add(dots(pts)); if (pts.length > 1) temp.add(linePts(pts)); measG.add(temp); requestRender(); }

  function addMeas(m) {
    act(() => { measG.add(m.obj); S.meas.push(m); }, () => { measG.remove(m.obj); S.meas.splice(S.meas.indexOf(m), 1); });
    showReadout(m);
  }
  function measText(m) {
    if (m.kind === "dist") return P.fmtLen(m.v, S.unit);
    if (m.kind === "angle") return m.v.toFixed(2) + "°";
    return P.fmtArea(m.v, S.unit);
  }
  function showReadout(m) {
    const ro = $("readout");
    if (!m) { ro.classList.remove("show"); return; }
    const pre = m.kind === "dist" ? P.t("t_dist") : m.kind === "angle" ? P.t("t_angle") : P.t("t_area");
    let s = pre + ": " + measText(m);
    if (m.kind === "dist") { const d = m.d; s += "  (ΔX " + P.fmtLen(Math.abs(d.x), S.unit) + " · ΔY " + P.fmtLen(Math.abs(d.y), S.unit) + " · ΔZ " + P.fmtLen(Math.abs(d.z), S.unit) + ")"; }
    ro.textContent = s; ro.classList.add("show");
  }
  const labels = new Map();
  function placeLabels(rm) {
    const keep = new Set();
    for (const m of S.meas) {
      keep.add(m);
      let el = labels.get(m);
      if (!el) { el = document.createElement("div"); el.className = "lbl"; $("main").appendChild(el); labels.set(m, el); }
      el.textContent = measText(m);
      const s = m.at.clone().project(cam);
      const vis = s.z < 1 && Math.abs(s.x) < 1.05 && Math.abs(s.y) < 1.05;
      el.style.display = vis ? "" : "none";
      el.style.left = ((s.x + 1) / 2) * rm.w + "px"; el.style.top = ((1 - s.y) / 2) * rm.h + "px";
    }
    for (const [m, el] of labels) if (!keep.has(m)) { el.remove(); labels.delete(m); }
    $("done").classList.toggle("show", S.meas.length > 0);
  }

  function tap(view, sx, sy) {
    const r = pickAt(view, sx, sy);
    if (!r) { P.toast(P.t("nothing"), 1200); return; }
    const t = S.tool;
    if (t === "hide") {
      const o = entityOf(r.hit.object);
      act(() => { o.visible = false; }, () => { o.visible = true; });
      dirtyScan(); requestRender(); return;
    }
    if (t === "area") { areaOf(r.hit); return; }
    S.pick.push(r.point);
    if (t === "dist" && S.pick.length === 2) {
      const [a, b] = S.pick; S.pick = []; clearTemp();
      const g = new THREE.Group(); g.add(linePts([a, b]), dots([a, b]));
      addMeas({ kind: "dist", v: a.distanceTo(b), d: b.clone().sub(a), at: a.clone().lerp(b, 0.5), obj: g });
    } else if (t === "angle" && S.pick.length === 3) {
      const [a, o, b] = S.pick; S.pick = []; clearTemp();
      const u = a.clone().sub(o), w = b.clone().sub(o);
      const ang = (u.angleTo(w) * 180) / Math.PI;
      const g = new THREE.Group(); g.add(linePts([a, o, b]), dots([a, o, b]));
      addMeas({ kind: "angle", v: isFinite(ang) ? ang : 0, at: o.clone(), obj: g });
    } else showTemp(S.pick);
    hint();
  }
  /* the part to hide: the touched mesh, or its group (an IGZ group / SketchUp component holding
     several material meshes) — but never a group that is a large share of the model (a SKP file
     often keeps everything under one or two nodes, and that hid the whole model) */
  function entityOf(mesh) {
    const p = mesh.parent;
    if (!p || p === S.model || p === S.model.children[0]) return mesh;
    let meshes = 0; p.traverse((q) => { if (q.isMesh) meshes++; });
    const d = new THREE.Box3().setFromObject(p).getSize(V3(0, 0, 0)).length();
    return meshes <= 40 && d < S.radius * 2 * 0.35 ? p : mesh;
  }

  /* area: the touched face = the connected coplanar triangles (edge neighbours) of that mesh */
  const adjCache = new WeakMap();
  function adjacency(g) {
    if (adjCache.has(g)) return adjCache.get(g);
    const pos = g.attributes.position, idx = g.index, nt = idx ? idx.count / 3 : pos.count / 3;
    const vi = (t, k) => (idx ? idx.getX(3 * t + k) : 3 * t + k);
    g.computeBoundingSphere();
    const q = Math.max(g.boundingSphere.radius, 1e-6) * 1e-6, keyOf = new Map(), vk = new Int32Array(nt * 3);
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
      const i = vi(t, k), s = Math.round(pos.getX(i) / q) + "," + Math.round(pos.getY(i) / q) + "," + Math.round(pos.getZ(i) / q);
      let id = keyOf.get(s); if (id == null) { id = keyOf.size; keyOf.set(s, id); } vk[3 * t + k] = id;
    }
    const edges = new Map();
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
      const a = vk[3 * t + k], b = vk[3 * t + ((k + 1) % 3)], e = a < b ? a + "_" + b : b + "_" + a;
      let l = edges.get(e); if (!l) edges.set(e, (l = [])); l.push(t);
    }
    const res = { nt, vi, vk, edges }; adjCache.set(g, res); return res;
  }
  function areaOf(hit) {
    const mesh = hit.object, g = mesh.geometry, A = adjacency(g), pos = g.attributes.position;
    const P3 = (t, k) => { const i = A.vi(t, k); return V3(pos.getX(i), pos.getY(i), pos.getZ(i)); };
    const nrm = (t) => { const a = P3(t, 0); return P3(t, 1).sub(a).cross(P3(t, 2).sub(a)); };
    const t0 = hit.faceIndex, n0 = nrm(t0).normalize(), d0 = n0.dot(P3(t0, 0));
    const tol = Math.max(g.boundingSphere.radius, 1e-3) * 1e-4;
    const seen = new Set([t0]), stack = [t0], tris = [];
    while (stack.length) {
      const t = stack.pop(); tris.push(t);
      for (let k = 0; k < 3; k++) {
        const a = A.vk[3 * t + k], b = A.vk[3 * t + ((k + 1) % 3)], e = a < b ? a + "_" + b : b + "_" + a;
        for (const u of A.edges.get(e) || []) {
          if (seen.has(u)) continue;
          const n = nrm(u); if (n.lengthSq() === 0) { seen.add(u); continue; }
          n.normalize();
          if (Math.abs(n.dot(n0)) > 0.9995 && Math.abs(n0.dot(P3(u, 0)) - d0) < tol) { seen.add(u); stack.push(u); }
        }
      }
    }
    const M = mesh.matrixWorld, out = [];
    let area = 0; const cen = V3(0, 0, 0);
    for (const t of tris) {
      const a = P3(t, 0).applyMatrix4(M), b = P3(t, 1).applyMatrix4(M), c = P3(t, 2).applyMatrix4(M);
      const ar = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      area += ar; cen.addScaledVector(a.clone().add(b).add(c), ar / 3);
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    if (area > 0) cen.multiplyScalar(1 / area); else cen.copy(hit.point);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    const obj = onLayer(new THREE.Mesh(geo, areaMat), L_MEAS);
    addMeas({ kind: "area", v: area, at: cen, obj });
    requestRender();
  }

  /* ---------- undo / redo (hide, show all, X-ray, measurements) ---------- */
  function act(doIt, undoIt) { doIt(); S.undo.push({ doIt, undoIt }); S.redo = []; undoButtons(); requestRender(); }
  function undoButtons() { $("bUndo").disabled = !S.undo.length; $("bRedo").disabled = !S.redo.length; }
  $("bUndo").onclick = () => { const a = S.undo.pop(); if (a) { a.undoIt(); S.redo.push(a); } undoButtons(); dirtyScan(); requestRender(); showReadout(S.meas[S.meas.length - 1]); };
  $("bRedo").onclick = () => { const a = S.redo.pop(); if (a) { a.doIt(); S.undo.push(a); } undoButtons(); dirtyScan(); requestRender(); showReadout(S.meas[S.meas.length - 1]); };
  $("bShow").onclick = () => {
    if (!S.model) return;
    const hid = []; S.model.traverse((o) => { if (!o.visible && !o.userData.p23keep) hid.push(o); });
    if (!hid.length) { P.toast(P.t("shown_all"), 1200); return; }
    act(() => hid.forEach((o) => (o.visible = true)), () => hid.forEach((o) => (o.visible = false)));
    dirtyScan(); P.toast(P.t("shown_all"), 1200);
  };
  function setXray(on) {
    S.xray = on; $("bXray").classList.toggle("on", on);
    if (!S.model) return;
    const mats = new Set(); S.model.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => mats.add(m)); });
    for (const m of mats) {
      if (!m.userData.p23) m.userData.p23 = { t: m.transparent, o: m.opacity, dw: m.depthWrite };
      const s = m.userData.p23;
      if (on) { m.transparent = true; m.opacity = Math.min(s.o, 0.3); m.depthWrite = false; }
      else { m.transparent = s.t; m.opacity = s.o; m.depthWrite = s.dw; }
      m.needsUpdate = true;
    }
    requestRender();
  }
  $("bXray").onclick = () => { const v = !S.xray; act(() => setXray(v), () => setXray(!v)); P.toast(P.t(v ? "xray_on" : "xray_off"), 1200); };
  $("doneBtn").onclick = () => {
    const ms = S.meas.slice();
    act(() => { ms.forEach((m) => measG.remove(m.obj)); S.meas = S.meas.filter((m) => !ms.includes(m)); }, () => { ms.forEach((m) => measG.add(m.obj)); S.meas.push(...ms); });
    showReadout(null); hint();
  };

  /* ---------- section cut ---------- */
  const plane = new THREE.Plane(V3(-1, 0, 0), 0);
  const cutG = new THREE.Group(); scene.add(cutG);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const redMat = new THREE.LineBasicMaterial({ color: 0xe01010 });
  const markMat = new THREE.LineBasicMaterial({ color: 0xff1a1a, depthTest: false, transparent: true });
  let fillMesh = null, frame = null, scanLines = null;
  const AX = { x: V3(1, 0, 0), y: V3(0, 1, 0), z: V3(0, 0, 1) };
  /* the kept side: the half beyond the cut as the cut pane looks at it (so the pane shows the cut
     surface); a pane looking across the axis keeps the side below; "flip" keeps the other half */
  function setPlane(a, v) {
    const n = AX[a].clone(), p = panes[S.cut.pane], d = (SIDES[p.side] || SIDES.front).d;
    let s = Math.abs(d.dot(n)) > 0.5 ? Math.sign(d.dot(n)) : -1;
    if (S.cut.flip && (a === "z" || Math.abs(d.dot(n)) <= 0.5)) s = -s;
    n.multiplyScalar(s); plane.set(n, -s * v);
  }
  function cutValue() { const a = S.cut.axis; return S.box.min[a] + (S.box.max[a] - S.box.min[a]) * S.cut.t; }
  /* the cut pane turns to look straight at the cut (like Pro3D on the PC): X → left/right,
     Y → front/back, Z → top; "flip" turns it round to the other half */
  function faceCut() {
    const a = S.cut.axis; if (!a) return;
    const p = panes[S.cut.pane], want = { x: S.cut.flip ? "right" : "left", y: S.cut.flip ? "back" : "front", z: "top" }[a];
    if (p.side !== want) { p.side = want; p.roll = 0; P.store.set("pane" + p.i, want); p.refit = true; }
  }
  function setCut(face) {
    if (face) faceCut();
    const a = S.cut.axis;
    document.querySelectorAll("[data-axis]").forEach((b) => b.classList.toggle("on", b.dataset.axis === a));
    document.querySelectorAll("[data-cutpane]").forEach((b) => b.classList.toggle("on", !!a && +b.dataset.cutpane === S.cut.pane));
    $("bCutOff").classList.toggle("on", !a);
    $("cutS").disabled = !a; $("bFlip").disabled = !a; $("bFlip").classList.toggle("on", !!a && S.cut.flip);
    $("cutS").value = Math.round(S.cut.t * 1000);
    panes.forEach(buildPaneHead);
    while (cutG.children.length) cutG.remove(cutG.children[0]);
    fillMesh = frame = scanLines = null;
    $("cutAt").textContent = "";
    if (!a || !S.model) { requestRender(); return; }
    const v = cutValue(), n = AX[a];
    setPlane(a, v);
    $("cutAt").textContent = P.t("cut_at", { v: P.fmtLen(v, S.unit) });
    // the plane: the model box's cross-section, 4 % larger
    const b = S.box.clone().expandByScalar(S.radius * 0.04), o = ["x", "y", "z"].filter((q) => q !== a);
    const corner = (i, j) => { const p = V3(0, 0, 0); p[a] = v; p[o[0]] = i ? b.max[o[0]] : b.min[o[0]]; p[o[1]] = j ? b.max[o[1]] : b.min[o[1]]; return p; };
    const c = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
    const fg = new THREE.BufferGeometry().setFromPoints([c[0], c[1], c[2], c[0], c[2], c[3]]);
    fillMesh = new THREE.Mesh(fg, fillMat); fillMesh.renderOrder = 5;
    frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c), redMat);
    for (const o2 of [fillMesh, frame]) { o2.layers.set(L_CUT); cutG.add(o2); }
    const mark = new THREE.LineLoop(frame.geometry, markMat); mark.layers.set(L_MARK); mark.renderOrder = 20; cutG.add(mark);
    dirtyScan(); requestRender();
    for (const p of panes) if (p.refit) { p.refit = false; fitPane(p); }
  }
  function dirtyScan() { S.scanKey = ""; requestRender(); }
  /* the thin red lines where the plane meets the model's triangles (plane ∩ every visible triangle) */
  function updateScan() {
    if (!S.model || !S.cut.axis) return;
    const key = plane.normal.toArray().join(",") + "|" + plane.constant;
    if (key === S.scanKey) return;
    S.scanKey = key;
    const out = [], a = V3(0, 0, 0), b = V3(0, 0, 0), c = V3(0, 0, 0), n = plane.normal, k = plane.constant;
    const pa = V3(0, 0, 0), pb = V3(0, 0, 0);
    S.model.updateMatrixWorld(true);
    S.model.traverse((o) => {
      if (!o.isMesh || !visibleChain(o)) return;
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      // quick reject: the mesh's world box does not reach the plane
      const wb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (!plane.intersectsBox(wb)) return;
      const pos = g.attributes.position, idx = g.index, nt = (idx ? idx.count : pos.count) / 3, M = o.matrixWorld;
      for (let t = 0; t < nt; t++) {
        const i0 = idx ? idx.getX(3 * t) : 3 * t, i1 = idx ? idx.getX(3 * t + 1) : 3 * t + 1, i2 = idx ? idx.getX(3 * t + 2) : 3 * t + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(M); b.fromBufferAttribute(pos, i1).applyMatrix4(M); c.fromBufferAttribute(pos, i2).applyMatrix4(M);
        const da = n.dot(a) + k, db = n.dot(b) + k, dc = n.dot(c) + k;
        if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;
        let m = 0;
        const cross = (p, q, dp, dq) => {
          if ((dp > 0) === (dq > 0) || dp === dq) return;
          const s = dp / (dp - dq), r = m ? pb : pa;
          r.copy(p).lerp(q, s); m++;
        };
        cross(a, b, da, db); if (m < 2) cross(b, c, db, dc); if (m < 2) cross(c, a, dc, da);
        if (m === 2) out.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      }
    });
    if (scanLines) { cutG.remove(scanLines); scanLines.geometry.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    scanLines = new THREE.LineSegments(g, redMat); scanLines.layers.set(L_CUT); scanLines.renderOrder = 4;
    cutG.add(scanLines);
  }
  document.querySelectorAll("[data-axis]").forEach((b) => (b.onclick = () => {
    if (!S.model) return;
    if (S.cut.axis !== b.dataset.axis) S.cut.t = 0.5;
    S.cut.axis = b.dataset.axis; setCut(true);
  }));
  $("bCutOff").onclick = () => { S.cut.axis = null; setCut(); };
  $("bFlip").onclick = () => { S.cut.flip = !S.cut.flip; setCut(true); };
  document.querySelectorAll("[data-cutpane]").forEach((b) => (b.onclick = () => {
    S.cut.pane = +b.dataset.cutpane; P.store.set("cutpane", S.cut.pane);
    if (!S.cut.axis && S.model) S.cut.axis = "x";
    setCut(true);
  }));
  // dragging the slider: the plane follows at once; the cut lines follow each frame (big models: on release)
  $("cutS").addEventListener("input", (e) => {
    S.cut.t = +e.target.value / 1000;
    if (S.tris > 1500000) { moveCutOnly(); return; }
    setCut();
  });
  $("cutS").addEventListener("change", (e) => { S.cut.t = +e.target.value / 1000; setCut(); });
  function moveCutOnly() {
    const a = S.cut.axis, v = cutValue(), n = AX[a];
    setPlane(a, v);
    $("cutAt").textContent = P.t("cut_at", { v: P.fmtLen(v, S.unit) });
    const old = fillMesh && fillMesh.geometry.attributes.position;
    if (old) { for (let i = 0; i < old.count; i++) old.setComponent(i, "xyz".indexOf(a), v); old.needsUpdate = true; }
    const fo = frame && frame.geometry.attributes.position;
    if (fo) { for (let i = 0; i < fo.count; i++) fo.setComponent(i, "xyz".indexOf(a), v); fo.needsUpdate = true; }
    if (scanLines) scanLines.visible = false;
    S.scanKey = plane.normal.toArray().join(",") + "|" + plane.constant;   // skip the scan while dragging
    requestRender();
  }

  /* ---------- units ---------- */
  function setUnit(u) {
    S.unit = u; P.store.set("unit3d", u);
    document.querySelectorAll("[data-unit]").forEach((b) => b.classList.toggle("on", b.dataset.unit === u));
    if (S.cut.axis) $("cutAt").textContent = P.t("cut_at", { v: P.fmtLen(cutValue(), u) });
    showReadout(S.meas[S.meas.length - 1]); hint(); requestRender();
  }
  document.querySelectorAll("[data-unit]").forEach((b) => (b.onclick = () => setUnit(b.dataset.unit)));

  /* ---------- opening ---------- */
  let gltf = null, skp = null, ifcApi = null;
  const glbToGroup = (ab) => new Promise((res, rej) => { gltf = gltf || new THREE.GLTFLoader(); gltf.parse(ab, "", (g) => res(g.scene), rej); });
  async function loadSkp(buf) {
    P.needHttp();
    if (!skp) skp = await import(P.url("vendor/openskp/openskp.mjs"));
    const glb = skp.toGLB(skp.buildScene(buf));
    return glbToGroup(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength));
  }
  async function loadIfc(buf) {
    P.needHttp();
    if (!ifcApi) {
      if (!window.WebIFC) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/web-ifc/web-ifc-api-iife.js"; s.onload = res; s.onerror = () => rej(new Error("web-ifc failed to load")); document.head.appendChild(s); });
      ifcApi = new WebIFC.IfcAPI(); ifcApi.SetWasmPath(P.url("vendor/web-ifc/"), true); await ifcApi.Init();
    }
    const api = ifcApi, id = api.OpenModel(new Uint8Array(buf), { COORDINATE_TO_ORIGIN: true });
    const group = new THREE.Group(), mats = new Map();
    api.StreamAllMeshes(id, (mesh) => {
      const pgs = mesh.geometries;
      for (let i = 0; i < pgs.size(); i++) {
        const pg = pgs.get(i), geo = api.GetGeometry(id, pg.geometryExpressID);
        const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()), ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
        geo.delete();
        const pos = new Float32Array(v.length / 2), nor = new Float32Array(v.length / 2);
        for (let k = 0, j = 0; k < v.length; k += 6, j += 3) { pos[j] = v[k]; pos[j + 1] = v[k + 1]; pos[j + 2] = v[k + 2]; nor[j] = v[k + 3]; nor[j + 1] = v[k + 4]; nor[j + 2] = v[k + 5]; }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(ix), 1));
        const c = pg.color, key = [c.x, c.y, c.z, c.w].map((q) => q.toFixed(3)).join(",");
        if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(c.x, c.y, c.z), roughness: 0.85, transparent: c.w < 1, opacity: c.w, side: THREE.DoubleSide }));
        const m = new THREE.Mesh(g, mats.get(key)); m.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation)); m.name = "IFC #" + mesh.expressID;
        group.add(m);
      }
    });
    api.CloseModel(id);
    return group;
  }
  function dxfToGroup(buf) {
    const d = P.dxf.read(buf), sp = d.spaces[0], k = d.units || 0.001, g = new THREE.Group(), byCol = new Map();
    for (const [key, arr] of sp.segs) {
      const [ln, col] = key.split("\u0001"), L = d.layers[ln];
      if (L && !L.on) continue;
      let c = col || (L && L.color) || "#202020";
      if (!/^#/.test(c) || /^#(f{6}|fff)$/i.test(c)) c = "#202020";
      let a = byCol.get(c); if (!a) byCol.set(c, (a = []));
      for (let i = 0; i < arr.length; i += 4) a.push(arr[i] * k, arr[i + 1] * k, 0, arr[i + 2] * k, arr[i + 3] * k, 0);
    }
    for (const [c, a] of byCol) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: c })));
    }
    return g;
  }
  async function openBuffer(name, buf) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    let group, yUp = true;
    if (ext === "igz" || ext === "json") { group = (await P.igz.read(buf)).group; yUp = false; }
    else if (ext === "skp") group = await loadSkp(buf);
    else if (ext === "glb" || ext === "gltf") group = await glbToGroup(buf);
    else if (ext === "obj") group = new THREE.OBJLoader().parse(new TextDecoder().decode(buf));
    else if (ext === "ifc") group = await loadIfc(buf);
    else if (ext === "dwg" || ext === "dxf") { group = dxfToGroup(ext === "dwg" ? await P.dwgToDxf(buf) : buf); yUp = false; }
    else if (ext === "dae") throw new Error(P.t("dae_no"));
    else throw new Error(P.t("unsupported", { ext: "." + ext }));
    setModel(group, yUp, name);
  }
  function setModel(group, yUp, name) {
    if (S.model) { scene.remove(S.model); S.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    for (const m of S.meas) measG.remove(m.obj);
    S.meas = []; S.undo = []; S.redo = []; S.pick = []; clearTemp(); undoButtons(); showReadout(null);
    const root = new THREE.Group(); root.name = "model";
    if (yUp) group.rotation.x = Math.PI / 2;
    root.add(group); scene.add(root); S.model = root;
    root.updateMatrixWorld(true);
    // materials: both sides, faces pushed back a little so lines (edges, cut lines) draw on top
    let tris = 0, parts = 0; const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      meshes.push(o); parts++;
      const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      for (const m of [].concat(o.material)) {
        m.side = THREE.DoubleSide; m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1;
        if (m.map) m.map.anisotropy = 4;
        m.needsUpdate = true;
      }
    });
    S.tris = tris; S.parts = parts;
    // edges (the SketchUp look) when the model is not too heavy for an iPad
    if (tris < 700000) {
      const em = new THREE.LineBasicMaterial({ color: 0x2a2d33, transparent: true, opacity: 0.75 });
      const cache = new Map();
      for (const o of meshes) {
        let eg = cache.get(o.geometry);
        if (!eg) { eg = new THREE.EdgesGeometry(o.geometry, 25); cache.set(o.geometry, eg); }
        const l = new THREE.LineSegments(eg, em); l.layers.set(L_EDGE); l.userData.p23keep = true; l.raycast = () => {};
        o.add(l);
      }
    }
    S.box.setFromObject(root);
    if (S.box.isEmpty()) S.box.set(V3(-1, -1, -1), V3(1, 1, 1));
    S.box.getCenter(S.center);
    S.radius = Math.max(S.box.getSize(V3(0, 0, 0)).length() / 2, 0.01);
    if (S.xray) setXray(true);
    S.cut.axis = null; setCut();
    $("empty").style.display = "none";
    fit(); panes.forEach(fitPane);
    const sz = S.box.getSize(V3(0, 0, 0));
    P.toast(P.t("info", { name, n: parts.toLocaleString(), tri: Math.round(tris).toLocaleString(), w: P.fmtLen(sz.x, S.unit), d: P.fmtLen(sz.y, S.unit), h: P.fmtLen(sz.z, S.unit) }), 5000);
  }
  async function openFile(file) {
    if (!file) return;
    P.busy(P.t("loading", { name: file.name })); await P.nextFrame();
    try { await openBuffer(file.name, await file.arrayBuffer()); }
    catch (err) { console.error(err); P.toast(P.t("failed", { err: err.message || err }), 6000); }
    finally { P.busy(null); }
  }
  async function openSample() {
    P.busy(P.t("loading", { name: P.t("sample") })); await P.nextFrame();
    try { const r = await fetch("sample.igz"); if (!r.ok) throw new Error("HTTP " + r.status); await openBuffer("sample.igz", await r.arrayBuffer()); }
    catch (err) { console.error(err); P.toast(P.t("failed", { err: err.message || err }), 6000); }
    finally { P.busy(null); }
  }
  $("bOpen").onclick = async () => openFile(await P.pickFile(".skp,.igz,.ifc,.obj,.glb,.gltf,.dwg,.dxf,.dae"));
  $("bSample").onclick = openSample;
  $("bFit").onclick = fit;
  document.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

  /* ---------- start ---------- */
  let gestHidden = false;
  function hideGest() { if (!gestHidden && S.model) { gestHidden = true; setTimeout(() => $("gest").classList.add("hide"), 2500); } }
  onTaps(mv, "main");
  panes.forEach((p) => { onTaps(p.view, p.i); paneGestures(p); });
  P.onTheme.push(readTheme);
  P.onLang.push(() => { panes.forEach(buildPaneHead); setCut(); hint(); });
  new ResizeObserver(() => requestRender()).observe(body);
  window.addEventListener("resize", requestRender);
  P.boot();
  readTheme(); setUnit(S.unit); setTool("orbit"); setCut();
  panes.forEach((p) => { buildPaneHead(p); placePane(p); });
  requestRender();
  P.pro3d = { S, openBuffer, openFile, openSample, fit, fitPane, panes, setTool, tap, plane, cam, ctl, setCut };   // tests
})();
