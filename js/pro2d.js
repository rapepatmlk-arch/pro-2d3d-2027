/* Pro2D-2027 for iPad — reading drawings: DWG (LibreDWG WASM), DXF, PDF (pdf.js).
 * Touch: one finger pans (or measures, with a measuring tool), two fingers pan + pinch-zoom,
 * double tap fits. Layers on/off, layouts, find text, black/white paper, measure distance /
 * angle / area with endpoint snapping, read out in mm / m / inches. */
(function () {
  "use strict";
  const P = window.P23;
  P.addText({
    t_pan: "มือเลื่อน", t_zoom: "ซูม", t_fit: "ดูทั้งหมด", t_zwin: "ซูมกรอบ", t_dist: "วัดระยะ", t_angle: "วัดมุม", t_area: "หาพื้นที่",
    t_layers: "Layer", t_find: "ค้นหาข้อความ", t_bg: "พื้นขาว/ดำ", drawing: "แบบ:", show_in: "แสดงผลวัด:", u_mm: "มม.", u_m: "เมตร", u_in: "นิ้ว",
    empty_t: "Pro2D-2027 สำหรับ iPad", empty_s: "กด \"เปิดไฟล์\" เพื่ออ่านแบบ DWG / DXF / PDF จากแอปไฟล์ iCloud หรือ AirDrop\nนิ้วเดียวเลื่อน · สองนิ้วถ่างซูม · แตะสองครั้งดูทั้งหมด",
    t_layers_h: "Layer (แตะเพื่อเปิด/ปิด)", all_on: "เปิดทั้งหมด", find_next: "ถัดไป", area_done: "✓ จบ คำนวณพื้นที่",
    m_dist: "แตะจุดเริ่ม แล้วแตะจุดปลาย (ดูดจุดปลายเส้นให้)", m_angle: "แตะจุดยอดมุม แล้วแตะปลายแขนทั้งสองข้าง", m_area: "แตะมุมของพื้นที่ทีละจุด แล้วกด \"จบ\"",
    m_zwin: "ลากกรอบบริเวณที่จะซูม", r_dist: "ระยะ {v}", r_angle: "มุม {v}°", r_area: "พื้นที่ {v} · เส้นรอบรูป {p}",
    find_none: "ไม่พบ \"{q}\"", find_hit: "พบ {i}/{n}", units_note: "หน่วยในแบบ: {u}", units_unknown: "ไม่ระบุ (ถือเป็นมิลลิเมตร)",
    pdf_note: "PDF หน้า {p}/{n} — วัดเป็นขนาดบนกระดาษ", big: "แบบใหญ่มาก แสดง {n} เส้นแรก",
  }, {
    t_pan: "Pan", t_zoom: "Zoom", t_fit: "Extents", t_zwin: "Window", t_dist: "Distance", t_angle: "Angle", t_area: "Area",
    t_layers: "Layers", t_find: "Find text", t_bg: "Paper", drawing: "Drawing:", show_in: "Readout:", u_mm: "mm", u_m: "m", u_in: "in",
    empty_t: "Pro2D-2027 for iPad", empty_s: "Press \"Open file\" to read a DWG / DXF / PDF from Files, iCloud or AirDrop\nOne finger pans · two fingers pinch-zoom · double tap fits",
    t_layers_h: "Layers (tap to turn on/off)", all_on: "All on", find_next: "Next", area_done: "✓ Done: area",
    m_dist: "Tap the start, then the end (line ends snap)", m_angle: "Tap the vertex, then the end of each arm", m_area: "Tap the corners one by one, then press \"Done\"",
    m_zwin: "Drag a box to zoom into", r_dist: "Distance {v}", r_angle: "Angle {v}°", r_area: "Area {v} · perimeter {p}",
    find_none: "\"{q}\" not found", find_hit: "Found {i}/{n}", units_note: "Drawing unit: {u}", units_unknown: "not set (taken as mm)",
    pdf_note: "PDF page {p}/{n} — measures are paper size", big: "Very large drawing: the first {n} lines are shown",
  });

  const cv = document.getElementById("cv"), body = document.getElementById("body");
  const ctx = cv.getContext("2d");
  const off = document.createElement("canvas"), octx = off.getContext("2d");
  const S = {
    doc: null, space: 0, pdf: null, pdfImg: null, view: { s: 1, x: 0, y: 0 }, dpr: 1, w: 1, h: 1,
    tool: "pan", unit: P.store.get("unit2d", "m"), white: P.store.get("paper", "0") === "1",
    pts: [], hover: null, snapGrid: null, find: { q: "", hits: [], i: -1 }, cache: null, dirty: true,
  };

  /* ---------- view ---------- */
  function resize() {
    const r = body.getBoundingClientRect();
    S.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    S.w = Math.max(1, r.width); S.h = Math.max(1, r.height);
    cv.width = off.width = Math.round(S.w * S.dpr); cv.height = off.height = Math.round(S.h * S.dpr);
    S.cache = null; draw();
  }
  const toScreen = (x, y) => [x * S.view.s + S.view.x, S.h - (y * S.view.s + S.view.y)];
  const toWorld = (sx, sy) => [(sx - S.view.x) / S.view.s, (S.h - sy - S.view.y) / S.view.s];
  function space() { return S.doc ? S.doc.spaces[S.space] : null; }
  function fit() {
    let b = null;
    if (S.pdfImg) b = { minx: 0, miny: 0, maxx: S.pdfImg.wmm, maxy: S.pdfImg.hmm };
    else { const sp = space(); if (sp && !sp.empty) b = sp.fit || sp; }
    if (!b) return;
    const w = Math.max(b.maxx - b.minx, 1e-6), h = Math.max(b.maxy - b.miny, 1e-6);
    const s = Math.min((S.w * 0.92) / w, (S.h * 0.88) / h);
    S.view = { s, x: S.w / 2 - ((b.minx + b.maxx) / 2) * s, y: S.h / 2 - ((b.miny + b.maxy) / 2) * s };
    S.cache = null; draw();
  }

  /* ---------- drawing ---------- */
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function paper() { return S.white ? "#ffffff" : css("--canvas2d") || "#0e1838"; }
  function ink() { return S.white ? "#000000" : "#ffffff"; }
  function colorFor(c) {
    if (!c) return ink();
    if (S.white && /^#(f[0-9a-f]){3}$|^#ffff00$|^#ffffff$/i.test(c)) return c === "#ffffff" || c === "#ffff00" ? "#806000" : c;
    return c;
  }
  function renderScene(g, vs) {
    g.save();
    g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    g.fillStyle = paper(); g.fillRect(0, 0, S.w, S.h);
    if (S.pdfImg) {
      const [x0, y0] = toScreen(0, S.pdfImg.hmm);
      g.drawImage(S.pdfImg.canvas, x0, y0, S.pdfImg.wmm * vs.s, S.pdfImg.hmm * vs.s);
      g.restore(); return;
    }
    const sp = space(); if (!sp) { g.restore(); return; }
    const layers = S.doc.layers;
    const vis = (key) => { const ln = key.split("\u0001")[0]; const L = layers[ln]; return !L || L.on; };
    // world → screen: X = x*s + vx, Y = H - (y*s + vy)
    const a = vs.s, ex = vs.x, fy = S.h - vs.y;
    g.lineWidth = 1; g.lineCap = "round";
    // fills
    for (const [key, polys] of sp.fills) {
      if (!vis(key)) continue;
      g.fillStyle = colorFor(key.split("\u0001")[1] || null); g.globalAlpha = 0.55;
      g.beginPath();
      for (const p of polys) { g.moveTo(p[0] * a + ex, fy - p[1] * a); for (let k = 2; k < p.length; k += 2) g.lineTo(p[k] * a + ex, fy - p[k + 1] * a); g.closePath(); }
      g.fill(); g.globalAlpha = 1;
    }
    // lines (culled to the screen)
    const wx0 = -ex / a, wx1 = (S.w - ex) / a, wy0 = (fy - S.h) / a, wy1 = fy / a;
    for (const [key, arr] of sp.segs) {
      if (!vis(key)) continue;
      g.strokeStyle = colorFor(key.split("\u0001")[1] || null);
      g.beginPath();
      for (let k = 0; k < arr.length; k += 4) {
        const x1 = arr[k], y1 = arr[k + 1], x2 = arr[k + 2], y2 = arr[k + 3];
        if ((x1 < wx0 && x2 < wx0) || (x1 > wx1 && x2 > wx1) || (y1 < wy0 && y2 < wy0) || (y1 > wy1 && y2 > wy1)) continue;
        g.moveTo(x1 * a + ex, fy - y1 * a); g.lineTo(x2 * a + ex, fy - y2 * a);
      }
      g.stroke();
    }
    // texts
    g.textBaseline = "alphabetic";
    for (const t of sp.texts) {
      const L = layers[t.layer]; if (L && !L.on) continue;
      const px = t.h * a; if (px < 2.2) continue;
      const X = t.x * a + ex, Y = fy - t.y * a;
      if (X < -2000 || X > S.w + 2000 || Y < -2000 || Y > S.h + 2000) continue;
      g.save(); g.translate(X, Y); g.rotate(-t.r); if (t.wf && t.wf !== 1) g.scale(t.wf, 1);
      g.fillStyle = colorFor(t.color);
      g.font = `${px * 1.08}px "Cordia New","Sukhumvit Set","Thonburi","Leelawadee UI",sans-serif`;
      g.textAlign = ["left", "center", "right"][t.ha] || "left";
      const n = t.lines.length, lh = px * 1.45;
      let y0 = 0;
      if (t.va === 3) y0 = px;                         // top
      else if (t.va === 2) y0 = px / 2 - ((n - 1) * lh) / 2;
      else if (t.va === 1) y0 = -((n - 1) * lh);       // bottom
      else y0 = 0;                                     // baseline
      for (let k = 0; k < n; k++) g.fillText(t.lines[k], 0, y0 + k * lh);
      g.restore();
    }
    g.restore();
  }
  let renderTimer = null;
  function draw() {
    // during a gesture the last full picture moves as a bitmap; the real redraw follows when it stops
    if (S.cache && S.gesturing) {
      const c = S.cache, k = S.view.s / c.s;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = paper(); ctx.fillRect(0, 0, cv.width, cv.height);
      const dx = (S.view.x - c.x * k) * S.dpr, dy = (S.h - S.view.y - (S.h - c.y) * k) * S.dpr;
      ctx.setTransform(k, 0, 0, k, dx, dy);
      ctx.drawImage(off, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      overlay(); return;
    }
    renderScene(octx, S.view);
    S.cache = { s: S.view.s, x: S.view.x, y: S.view.y };
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(off, 0, 0);
    overlay();
  }
  function settle() { clearTimeout(renderTimer); renderTimer = setTimeout(() => { S.gesturing = false; draw(); }, 140); }

  /* ---------- measuring overlay ---------- */
  function unitM() { if (S.pdfImg) return 0.001; return (S.doc && S.doc.units) || 0.001; }
  function overlay() {
    const g = ctx; g.save(); g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    const pts = S.pts.slice(); if (S.hover && S.pts.length && S.tool !== "zwin") pts.push(S.hover);
    if (pts.length) {
      g.strokeStyle = "#ff4d4d"; g.lineWidth = 2.5; g.setLineDash([8, 6]);
      g.beginPath();
      if (S.tool === "angle" && pts.length >= 2) {
        const v = toScreen(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) { const q = toScreen(pts[k][0], pts[k][1]); g.moveTo(v[0], v[1]); g.lineTo(q[0], q[1]); }
      } else {
        pts.forEach((p, k) => { const q = toScreen(p[0], p[1]); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
        if (S.tool === "area" && pts.length > 2) g.closePath();
      }
      g.stroke(); g.setLineDash([]);
      if (S.tool === "area" && pts.length > 2) { g.fillStyle = "rgba(255,77,77,.15)"; g.fill(); }
      g.fillStyle = "#ff4d4d";
      for (const p of S.pts) { const q = toScreen(p[0], p[1]); g.beginPath(); g.arc(q[0], q[1], 5, 0, Math.PI * 2); g.fill(); }
    }
    if (S.snapMark) { const q = toScreen(S.snapMark[0], S.snapMark[1]); g.strokeStyle = "#3ecf8e"; g.lineWidth = 2; g.strokeRect(q[0] - 7, q[1] - 7, 14, 14); }
    if (S.zrect) { const r = S.zrect; g.strokeStyle = css("--accent"); g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1])); g.setLineDash([]); }
    if (S.find.i >= 0 && S.find.hits[S.find.i]) { const t = S.find.hits[S.find.i], q = toScreen(t.x, t.y); g.strokeStyle = "#3ecf8e"; g.lineWidth = 3; g.beginPath(); g.arc(q[0], q[1], 22, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }
  function readout(text) { const el = document.getElementById("readout"); el.textContent = text || ""; el.classList.toggle("show", !!text); }
  function updateReadout() {
    const u = unitM(), pts = S.pts.slice(); if (S.hover && pts.length) pts.push(S.hover);
    if (S.tool === "dist" && pts.length >= 2) { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); readout(P.t("r_dist", { v: P.fmtLen(L * u, S.unit) })); }
    else if (S.tool === "angle" && pts.length >= 3) {
      const a1 = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]), a2 = Math.atan2(pts[2][1] - pts[0][1], pts[2][0] - pts[0][0]);
      let d = Math.abs(((a2 - a1) * 180) / Math.PI) % 360; if (d > 180) d = 360 - d; readout(P.t("r_angle", { v: d.toFixed(2) }));
    } else if (S.tool === "area" && pts.length >= 3) {
      let A = 0, per = 0; for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); }
      readout(P.t("r_area", { v: P.fmtArea((Math.abs(A) / 2) * u * u, S.unit), p: P.fmtLen(per * u, S.unit) }));
    }
  }
  /* endpoint snapping: a grid of every segment end, built when a measuring tool is first used */
  function snapGrid() {
    const sp = space(); if (!sp) return null;
    if (S.snapGrid && S.snapGrid.sp === sp) return S.snapGrid;
    const cell = Math.max(sp.maxx - sp.minx, sp.maxy - sp.miny) / 400 || 1, map = new Map();
    const add = (x, y) => { const k = Math.floor(x / cell) + ":" + Math.floor(y / cell); let b = map.get(k); if (!b) map.set(k, (b = [])); b.push(x, y); };
    for (const [key, arr] of sp.segs) { const L = S.doc.layers[key.split("\u0001")[0]]; if (L && !L.on) continue; for (let k = 0; k < arr.length; k += 2) add(arr[k], arr[k + 1]); }
    return (S.snapGrid = { sp, cell, map });
  }
  function snap(wx, wy) {
    if (S.pdfImg) return [wx, wy];
    const G = snapGrid(); if (!G) return [wx, wy];
    const r = 16 / S.view.s, cx = Math.floor(wx / G.cell), cy = Math.floor(wy / G.cell), rr = Math.ceil(r / G.cell);
    let best = null, bd = r * r;
    for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) {
      const b = G.map.get(cx + i + ":" + (cy + j)); if (!b) continue;
      for (let k = 0; k < b.length; k += 2) { const d = (b[k] - wx) ** 2 + (b[k + 1] - wy) ** 2; if (d < bd) { bd = d; best = [b[k], b[k + 1]]; } }
    }
    S.snapMark = best;
    return best || [wx, wy];
  }

  /* ---------- touch / mouse ---------- */
  const ptrs = new Map();
  let gesture = null, lastTap = 0;
  function localXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, localXY(e));
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { kind: "pinch", d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view: { ...S.view } };
      S.gesturing = true; S.hover = null; return;
    }
    const p = localXY(e);
    const now = Date.now();
    if (now - lastTap < 300 && ["pan", "zoom"].includes(S.tool)) { fit(); lastTap = 0; return; }
    lastTap = now;
    gesture = { kind: "one", start: p, last: p, moved: false, view: { ...S.view } };
    if (S.tool === "zwin") S.zrect = [p[0], p[1], p[0], p[1]];
  });
  cv.addEventListener("pointermove", (e) => {
    const p = localXY(e);
    if (!ptrs.has(e.pointerId)) {                      // a mouse hovering: preview the measure
      if (["dist", "angle", "area"].includes(S.tool) && S.pts.length) { const w = toWorld(p[0], p[1]); S.hover = snap(w[0], w[1]); updateReadout(); draw(); }
      return;
    }
    ptrs.set(e.pointerId, p);
    if (!gesture) return;
    if (gesture.kind === "pinch" && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const k = d / gesture.d, v = gesture.view, s = v.s * k;
      // the world point under the old centre stays under the new centre
      const wx = (gesture.c[0] - v.x) / v.s, wy = (S.h - gesture.c[1] - v.y) / v.s;
      S.view = { s, x: c[0] - wx * s, y: S.h - c[1] - wy * s };
      draw(); return;
    }
    const dx = p[0] - gesture.last[0], dy = p[1] - gesture.last[1];
    if (Math.hypot(p[0] - gesture.start[0], p[1] - gesture.start[1]) > 6) gesture.moved = true;
    gesture.last = p;
    if (S.tool === "pan" || (S.tool !== "zoom" && S.tool !== "zwin" && gesture.moved && !["dist", "angle", "area"].includes(S.tool))) {
      S.gesturing = true; S.view.x += dx; S.view.y -= dy; draw();
    } else if (S.tool === "zoom") {
      S.gesturing = true;
      const k = Math.exp(-dy * 0.01), c = gesture.start, v = S.view;
      const wx = (c[0] - v.x) / v.s, wy = (S.h - c[1] - v.y) / v.s; const s = v.s * k;
      S.view = { s, x: c[0] - wx * s, y: S.h - c[1] - wy * s }; draw();
    } else if (S.tool === "zwin") { S.zrect[2] = p[0]; S.zrect[3] = p[1]; draw(); }
    else if (["dist", "angle", "area"].includes(S.tool) && S.pts.length) { const w = toWorld(p[0], p[1]); S.hover = snap(w[0], w[1]); updateReadout(); draw(); }
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (gesture && gesture.kind === "pinch") { if (ptrs.size === 0) { gesture = null; settle(); } return; }
    if (!gesture) return;
    const g = gesture; gesture = null;
    if (S.tool === "zwin" && S.zrect) {
      const r = S.zrect; S.zrect = null;
      if (Math.abs(r[2] - r[0]) > 10 && Math.abs(r[3] - r[1]) > 10) {
        const a = toWorld(Math.min(r[0], r[2]), Math.max(r[1], r[3])), b = toWorld(Math.max(r[0], r[2]), Math.min(r[1], r[3]));
        const s = Math.min(S.w / (b[0] - a[0]), S.h / (b[1] - a[1]));
        S.view = { s, x: S.w / 2 - ((a[0] + b[0]) / 2) * s, y: S.h / 2 - ((a[1] + b[1]) / 2) * s };
      }
      draw(); return;
    }
    if (["dist", "angle", "area"].includes(S.tool) && !g.moved) {
      const w = toWorld(g.start[0], g.start[1]), p = snap(w[0], w[1]);
      if ((S.tool === "dist" && S.pts.length >= 2) || (S.tool === "angle" && S.pts.length >= 3)) S.pts = [];
      S.pts.push(p); S.hover = null; updateReadout();
      document.getElementById("done").classList.toggle("show", S.tool === "area" && S.pts.length >= 3);
      draw(); return;
    }
    settle();
  }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = localXY(e), k = Math.exp(-e.deltaY * 0.0015), v = S.view;
    const wx = (p[0] - v.x) / v.s, wy = (S.h - p[1] - v.y) / v.s, s = v.s * k;
    S.view = { s, x: p[0] - wx * s, y: S.h - p[1] - wy * s }; S.gesturing = true; draw(); settle();
  }, { passive: false });

  /* ---------- tools ---------- */
  function setTool(t) {
    S.tool = t; S.pts = []; S.hover = null; S.snapMark = null; readout("");
    document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
    document.getElementById("done").classList.remove("show");
    const hint = { dist: "m_dist", angle: "m_angle", area: "m_area", zwin: "m_zwin" }[t];
    if (hint) P.toast(P.t(hint), 3500);
    draw();
  }
  document.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  document.getElementById("bFit").onclick = fit;
  document.getElementById("doneBtn").onclick = () => { S.hover = null; updateReadout(); document.getElementById("done").classList.remove("show"); S.pts.length = S.pts.length; draw(); };
  function setUnit(u) { S.unit = u; P.store.set("unit2d", u); document.querySelectorAll("[data-unit]").forEach((b) => b.classList.toggle("on", b.dataset.unit === u)); updateReadout(); }
  document.querySelectorAll("[data-unit]").forEach((b) => (b.onclick = () => setUnit(b.dataset.unit)));
  document.getElementById("bBg").onclick = () => { S.white = !S.white; P.store.set("paper", S.white ? "1" : "0"); S.cache = null; draw(); };

  /* layers */
  const lyPanel = document.getElementById("layers");
  function buildLayers() {
    const list = document.getElementById("lylist"); list.innerHTML = "";
    if (!S.doc) return;
    const names = Object.keys(S.doc.layers).sort((a, b) => a.localeCompare(b, "th"));
    for (const n of names) {
      const L = S.doc.layers[n]; if (L.frozen) continue;
      const row = document.createElement("div"); row.className = "ly";
      row.innerHTML = `<span class="sw"></span><span class="n"></span><span class="tg${L.on ? "" : " off"}"></span>`;
      row.querySelector(".sw").style.background = L.color || ink();
      row.querySelector(".n").textContent = n;
      row.onclick = () => { L.on = !L.on; row.querySelector(".tg").classList.toggle("off", !L.on); S.snapGrid = null; S.cache = null; draw(); };
      list.appendChild(row);
    }
  }
  document.getElementById("bLayers").onclick = () => { lyPanel.classList.toggle("show"); document.getElementById("bLayers").classList.toggle("on", lyPanel.classList.contains("show")); };
  document.getElementById("lyClose").onclick = () => { lyPanel.classList.remove("show"); document.getElementById("bLayers").classList.remove("on"); };
  document.getElementById("lyAll").onclick = () => { if (!S.doc) return; for (const n in S.doc.layers) S.doc.layers[n].on = true; buildLayers(); S.snapGrid = null; S.cache = null; draw(); };

  /* layouts */
  function buildTabs() {
    const el = document.getElementById("tabs"); el.innerHTML = "";
    if (!S.doc || S.doc.spaces.length < 2) return;
    S.doc.spaces.forEach((sp, i) => {
      const b = document.createElement("button"); b.textContent = sp.name; b.classList.toggle("on", i === S.space);
      b.onclick = () => { S.space = i; S.snapGrid = null; S.pts = []; readout(""); buildTabs(); fit(); };
      el.appendChild(b);
    });
  }

  /* find text */
  const fb = document.getElementById("findbar"), fq = document.getElementById("findq");
  document.getElementById("bFind").onclick = () => { fb.classList.toggle("show"); if (fb.classList.contains("show")) fq.focus(); };
  document.getElementById("findX").onclick = () => { fb.classList.remove("show"); S.find = { q: "", hits: [], i: -1 }; draw(); };
  function findNext() {
    const q = fq.value.trim(); const sp = space(); if (!q || !sp) return;
    if (q !== S.find.q) S.find = { q, hits: sp.texts.filter((t) => t.lines.join(" ").toLowerCase().includes(q.toLowerCase())), i: -1 };
    if (!S.find.hits.length) { P.toast(P.t("find_none", { q })); return; }
    S.find.i = (S.find.i + 1) % S.find.hits.length;
    const t = S.find.hits[S.find.i], s = Math.max(S.view.s, (S.h * 0.06) / Math.max(t.h, 1e-6));
    S.view = { s, x: S.w / 2 - t.x * s, y: S.h / 2 - t.y * s };
    P.toast(P.t("find_hit", { i: S.find.i + 1, n: S.find.hits.length }), 1500);
    S.cache = null; draw();
  }
  document.getElementById("findGo").onclick = findNext;
  fq.addEventListener("keydown", (e) => { if (e.key === "Enter") findNext(); });

  /* ---------- opening ---------- */
  async function openFile(file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["dwg", "dxf", "pdf"].includes(ext)) { P.toast(P.t("unsupported", { ext: "." + ext })); return; }
    P.busy(P.t("loading", { name: file.name })); await P.nextFrame();
    try {
      const buf = await file.arrayBuffer();
      S.pdfImg = null; S.pdf = null;
      if (ext === "pdf") await openPdf(buf, 1);
      else {
        let dxf = buf;
        if (ext === "dwg") dxf = await P.dwgToDxf(buf);
        await P.nextFrame();
        S.doc = P.dxf.read(dxf);
        S.space = 0; S.snapGrid = null;
        if (S.doc.truncated) P.toast(P.t("big", { n: S.doc.segments.toLocaleString() }), 5000);
      }
      document.getElementById("fname").textContent = file.name;
      document.getElementById("empty").style.display = "none";
      info(); buildLayers(); buildTabs(); setTool(S.tool === "zwin" ? "pan" : S.tool); fit();
      const v = S.doc && S.doc.savedView;
      if (v && !S.pdfImg) {                         // open where the drawing was last looked at
        const sp = space(), s = (S.h * 0.95) / v.h;
        const inside = sp && !sp.empty && v.cx > sp.minx && v.cx < sp.maxx && v.cy > sp.miny && v.cy < sp.maxy;
        if (inside && isFinite(s) && s > 0) { S.view = { s, x: S.w / 2 - v.cx * s, y: S.h / 2 - v.cy * s }; S.cache = null; draw(); }
      }
      P.toast(P.t("loaded", { name: file.name }));
    } catch (err) {
      console.error(err); P.toast(P.t("failed", { err: err.message || err }), 6000);
    } finally { P.busy(null); }
  }
  function info() {
    const el = document.getElementById("finfo");
    if (S.pdfImg) { el.textContent = " · " + P.t("pdf_note", { p: S.pdfImg.page, n: S.pdfImg.pages }); return; }
    if (!S.doc) { el.textContent = ""; return; }
    const names = { 0.001: "มิลลิเมตร / mm", 0.01: "เซนติเมตร / cm", 1: "เมตร / m", 0.0254: "นิ้ว / in", 0.3048: "ฟุต / ft" };
    el.textContent = " · DXF " + S.doc.ver + " · " + P.t("units_note", { u: S.doc.units ? names[S.doc.units] || S.doc.units + " m" : P.t("units_unknown") });
  }
  let pdfjs = null;
  async function openPdf(buf, pageNo) {
    P.needHttp();
    if (!pdfjs) { pdfjs = await import(P.url("vendor/pdfjs/pdf.min.mjs")); pdfjs.GlobalWorkerOptions.workerSrc = P.url("vendor/pdfjs/pdf.worker.min.mjs"); }
    if (buf) S.pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), cMapUrl: P.url("vendor/pdfjs/cmaps/"), cMapPacked: true, standardFontDataUrl: P.url("vendor/pdfjs/standard_fonts/") }).promise;
    const page = await S.pdf.getPage(pageNo), vp1 = page.getViewport({ scale: 1 });
    const k = Math.min(4096 / Math.max(vp1.width, vp1.height), 4), vp = page.getViewport({ scale: k });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    S.doc = { layers: {}, spaces: [{ name: "PDF", segs: new Map(), fills: new Map(), texts: [], empty: true }], units: 0.001 };
    S.pdfImg = { canvas: c, wmm: (vp1.width * 25.4) / 72, hmm: (vp1.height * 25.4) / 72, page: pageNo, pages: S.pdf.numPages };
    const tabs = document.getElementById("tabs"); tabs.innerHTML = "";
    if (S.pdf.numPages > 1) for (let i = 1; i <= Math.min(S.pdf.numPages, 60); i++) {
      const b = document.createElement("button"); b.textContent = (P.lang === "th" ? "หน้า " : "Page ") + i; b.classList.toggle("on", i === pageNo);
      b.onclick = async () => { P.busy("PDF " + i); try { await openPdf(null, i); info(); fit(); } finally { P.busy(null); } };
      tabs.appendChild(b);
    }
  }
  document.getElementById("bOpen").onclick = async () => openFile(await P.pickFile(".dwg,.dxf,.pdf,application/pdf"));
  // a drawing dropped on the page (iPad drag and drop from Files works too)
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

  P.onTheme.push(() => { S.cache = null; draw(); });
  P.onLang.push(() => { info(); });
  window.addEventListener("resize", resize);
  P.boot();
  setUnit(S.unit);
  resize();
  P.pro2d = { S, openFile, fit, setTool };      // tests
})();
