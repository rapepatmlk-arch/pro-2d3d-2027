/* Pro-2D+3D 2027 — 2D plan editor (canvas).
 * Draws and edits the shared model; every edit calls model.changed('2d') so the 3D view follows live.
 */
(function () {
  const P23 = window.P23, M = P23.model, G = P23.geom;
  const SNAP_PX = 10;

  class Editor2D {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext("2d");
      this.view = { cx: 5, cy: 4, s: 50 };     // world centre & pixels per metre
      this.tool = "select"; this.snapOn = true; this.snapStep = 0.1;
      this.mouse = null; this.snapInfo = null; this.shift = false;
      this.draft = null;   // wall/dim drafting {start, chainStart}
      this.drag = null; this.pan = null; this.hoverWall = null;
      this.onCursor = null; this.onHint = null;
      this.colors = {}; this.refreshColors();
      this._bind();
      new ResizeObserver(() => this.resize()).observe(canvas);
      M.on("change", () => this.redraw());
      M.on("select", () => this.redraw());
    }

    /* ---------- coordinates ---------- */
    get W() { return this.cv.clientWidth; } get H() { return this.cv.clientHeight; }
    toS(p) { return { x: this.W / 2 + (p.x - this.view.cx) * this.view.s, y: this.H / 2 - (p.y - this.view.cy) * this.view.s }; }
    toW(sx, sy) { return { x: this.view.cx + (sx - this.W / 2) / this.view.s, y: this.view.cy - (sy - this.H / 2) / this.view.s }; }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      this.cv.width = Math.max(1, Math.round(this.W * dpr)); this.cv.height = Math.max(1, Math.round(this.H * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.redraw();
    }
    refreshColors() {
      const cs = getComputedStyle(document.documentElement), c = {};
      ["bg", "grid", "grid-major", "axis", "wall", "wall-line", "sel", "ref", "dim", "open", "text"].forEach((k) => (c[k] = cs.getPropertyValue("--cv-" + k).trim()));
      this.colors = c; this.redraw();
    }
    setTool(t) { this.tool = t; this.draft = null; this.hoverWall = null; this.cv.style.cursor = t === "select" ? "default" : "crosshair"; this.redraw(); this.onHint && this.onHint(); }
    cancel() { if (this.draft) { this.draft = null; this.redraw(); } else if (this.tool !== "select") this.setTool("select"); else M.select(null, null, "2d"); }

    fit() {
      const b = M.bounds();
      if (!b) { this.view = { cx: 5, cy: 4, s: Math.min(this.W / 14, this.H / 11) || 50 }; this.redraw(); return; }
      const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
      this.view.cx = (b.x0 + b.x1) / 2; this.view.cy = (b.y0 + b.y1) / 2;
      this.view.s = Math.max(0.0005, Math.min((this.W - 60) / bw, (this.H - 60) / bh));
      this.redraw();
    }

    /* ---------- snapping ---------- */
    snap(raw, opts) {
      opts = opts || {};
      const tolW = SNAP_PX / this.view.s;
      let best = null, bd = tolW;
      const tryPt = (x, y, kind) => { const d = Math.hypot(raw.x - x, raw.y - y); if (d < bd) { bd = d; best = { x, y, kind }; } };
      for (const w of M.doc.walls) {
        if (opts.exclude && opts.exclude.includes(w)) continue;
        tryPt(w.a.x, w.a.y, "end"); tryPt(w.b.x, w.b.y, "end");
        tryPt((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2, "mid");
      }
      const refs = M.doc.refs.lines, n = Math.min(refs.length, 40000);
      for (let i = 0; i < n; i++) { const l = refs[i]; tryPt(l[0], l[1], "end"); tryPt(l[2], l[3], "end"); }
      if (best) return best;

      let p = { x: raw.x, y: raw.y };
      const st = this.draft && this.draft.start;
      if (st && opts.ortho !== false) {
        const dx = p.x - st.x, dy = p.y - st.y, L = Math.hypot(dx, dy);
        if (this.shift) { if (Math.abs(dx) > Math.abs(dy)) p.y = st.y; else p.x = st.x; }
        else if (L > 0) {                                   // gentle 45° angle snap
          const ang = Math.atan2(dy, dx), k = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
          if (Math.abs(ang - k) < 0.05) { p = { x: st.x + Math.cos(k) * L, y: st.y + Math.sin(k) * L }; }
        }
      }
      // on a wall axis (T-joint)
      for (const w of M.doc.walls) {
        if (opts.exclude && opts.exclude.includes(w)) continue;
        const pr = G.project(p, w.a, w.b);
        if (pr.d < tolW * 0.8 && pr.t > 0 && pr.t < 1) {
          let along = pr.along; if (this.snapOn) along = Math.round(along / this.snapStep) * this.snapStep;
          const L = G.len(w.a, w.b), t = Math.max(0, Math.min(1, along / L));
          return { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t, kind: "on" };
        }
      }
      if (this.snapOn) {
        const s = this.snapStep, horiz = st && Math.abs(p.y - st.y) < 1e-9, vert = st && Math.abs(p.x - st.x) < 1e-9;
        if (!vert) p.x = Math.round(p.x / s) * s;
        if (!horiz) p.y = Math.round(p.y / s) * s;
        return { x: p.x, y: p.y, kind: "grid" };
      }
      return { x: p.x, y: p.y, kind: "free" };
    }

    /* ---------- hit testing ---------- */
    openingGeom(o) {
      const w = M.wall(o.wall); if (!w) return null;
      const L = G.len(w.a, w.b) || 1, ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
      const c = { x: w.a.x + ux * o.pos, y: w.a.y + uy * o.pos };
      return { w, ux, uy, nx: -uy, ny: ux, c, p0: { x: c.x - ux * o.w / 2, y: c.y - uy * o.w / 2 }, p1: { x: c.x + ux * o.w / 2, y: c.y + uy * o.w / 2 } };
    }
    dimGeom(d) {
      const L = G.len(d.a, d.b) || 1, nx = -(d.b.y - d.a.y) / L, ny = (d.b.x - d.a.x) / L;
      return { L, nx, ny, a: { x: d.a.x + nx * d.off, y: d.a.y + ny * d.off }, b: { x: d.b.x + nx * d.off, y: d.b.y + ny * d.off } };
    }
    hit(p) {
      const px = 1 / this.view.s;
      for (const o of M.doc.openings) {
        const g = this.openingGeom(o); if (!g) continue;
        const pr = G.project(p, g.p0, g.p1); if (pr.d <= g.w.t / 2 + 4 * px) return { kind: "opening", id: o.id };
      }
      for (const d of M.doc.dims) { const g = this.dimGeom(d); if (G.project(p, g.a, g.b).d <= 6 * px) return { kind: "dim", id: d.id }; }
      let best = null, bd = Infinity;
      for (const w of M.doc.walls) {
        const pr = G.project(p, w.a, w.b);
        if (pr.d <= w.t / 2 + 3 * px && pr.d < bd) { bd = pr.d; best = { kind: "wall", id: w.id }; }
      }
      return best;
    }
    wallNear(p, extraPx) {
      let best = null, bd = Infinity;
      for (const w of M.doc.walls) {
        const pr = G.project(p, w.a, w.b);
        if (pr.d <= w.t / 2 + (extraPx || 10) / this.view.s && pr.d < bd) { bd = pr.d; best = { w, pr }; }
      }
      return best;
    }
    /** Points of other walls that coincide with point pt (so joints follow when dragging). */
    linkedPoints(pt, exceptWall) {
      const out = [];
      for (const w of M.doc.walls) {
        if (w === exceptWall) continue;
        if (G.eq(w.a, pt)) out.push(w.a); if (G.eq(w.b, pt)) out.push(w.b);
      }
      return out;
    }

    /* ---------- events ---------- */
    _bind() {
      const cv = this.cv;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
      cv.addEventListener("contextmenu", (e) => e.preventDefault());
      this._pos = pos;
      cv.addEventListener("pointerdown", (e) => {
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / already-released pointer */ }
        this.shift = e.shiftKey;
        const { sx, sy } = pos(e), p = this.toW(sx, sy);
        if (e.pointerType === "touch") return this.touchDown(e, sx, sy, p);
        if (e.button === 1 || e.button === 2) {
          if (e.button === 2 && this.draft) { this.draft = null; this.redraw(); return; }
          this.pan = { sx, sy, cx: this.view.cx, cy: this.view.cy, moved: false }; cv.style.cursor = "grabbing"; return;
        }
        if (e.button !== 0) return;
        this.down(p, sx, sy);
      });
      cv.addEventListener("pointermove", (e) => {
        this.shift = e.shiftKey;
        const { sx, sy } = pos(e), p = this.toW(sx, sy);
        if (e.pointerType === "touch") return this.touchMove(e, sx, sy, p);
        if (this.pan) {
          this.view.cx = this.pan.cx - (sx - this.pan.sx) / this.view.s; this.view.cy = this.pan.cy + (sy - this.pan.sy) / this.view.s;
          this.redraw(); return;
        }
        this.move(p);
      });
      const up = (e) => {
        if (e.pointerType === "touch") return this.touchUp(e, e.type === "pointercancel");
        if (this.pan) { this.pan = null; this.cv.style.cursor = this.tool === "select" ? "default" : "crosshair"; return; }
        if (this.drag) { this.drag = null; this.redraw(); }
      };
      cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
      cv.addEventListener("pointerleave", () => { this.mouse = null; this.redraw(); });
      cv.addEventListener("dblclick", () => { if (this.tool === "wall") { this.draft = null; this.redraw(); } });
      cv.addEventListener("wheel", (e) => {
        e.preventDefault();
        const { sx, sy } = pos(e), before = this.toW(sx, sy);
        const f = Math.pow(1.0015, -e.deltaY);
        this.view.s = Math.max(0.0005, Math.min(5000, this.view.s * f));
        const after = this.toW(sx, sy);
        this.view.cx += before.x - after.x; this.view.cy += before.y - after.y;
        this.redraw();
      }, { passive: false });
    }

    /* ---------- touch (iPad / tablets) ----------
     * 1 finger, select tool: tap = select, drag an element = move it, drag empty space = pan.
     * 1 finger, drawing tools: the snapped preview follows the finger; lifting the finger places the point.
     *   Tapping the last point again finishes a wall chain.
     * 2 fingers: pinch = zoom, move = pan (cancels whatever the first finger was doing). */
    touchDown(e, sx, sy, p) {
      const T = (this.touches = this.touches || new Map());
      T.set(e.pointerId, { sx, sy });
      if (T.size === 2) {
        if (this.drag && this.drag.started) { M.undo(); } // a pinch must not leave a half-done move behind
        this.drag = null; this.pan = null; this.touchAim = null;
        const [a, b] = [...T.values()];
        this.pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2, s: this.view.s, cx: this.view.cx, cy: this.view.cy };
        return;
      }
      if (T.size > 2) return;
      this.mouse = p;
      if (this.tool === "select") {
        this.down(p);
        if (!this.drag) this.pan = { sx, sy, cx: this.view.cx, cy: this.view.cy };
      } else {
        this.touchAim = true; this.move(p); // show the snapped preview under the finger
      }
    }
    touchMove(e, sx, sy, p) {
      const T = this.touches; if (!T || !T.has(e.pointerId)) return;
      T.set(e.pointerId, { sx, sy });
      if (this.pinch && T.size >= 2) {
        const [a, b] = [...T.values()], pc = this.pinch;
        const d = Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
        const s = Math.max(0.0005, Math.min(5000, pc.s * d / pc.d));
        const wx = pc.cx + (pc.mx - this.W / 2) / pc.s, wy = pc.cy - (pc.my - this.H / 2) / pc.s; // world point under the start midpoint
        this.view.s = s; this.view.cx = wx - (mx - this.W / 2) / s; this.view.cy = wy + (my - this.H / 2) / s;
        this.redraw(); return;
      }
      if (this.pan) {
        this.view.cx = this.pan.cx - (sx - this.pan.sx) / this.view.s; this.view.cy = this.pan.cy + (sy - this.pan.sy) / this.view.s;
        this.redraw(); return;
      }
      this.move(p);
    }
    touchUp(e, cancelled) {
      const T = this.touches; if (!T) return;
      const last = T.get(e.pointerId); T.delete(e.pointerId);
      if (this.pinch) { if (T.size < 2) { this.pinch = null; this.touchAim = null; } return; }
      this.pan = null;
      if (this.drag) { this.drag = null; this.redraw(); }
      if (this.touchAim && !cancelled && last) { this.touchAim = null; this.down(this.toW(last.sx, last.sy)); }
      this.touchAim = null;
    }

    down(p) {
      const t = this.tool;
      if (t === "select") {
        // endpoint handles of the selected wall first
        const sel = M.selection, px = 1 / this.view.s;
        if (sel && sel.kind === "wall") {
          const w = M.wall(sel.id);
          if (w) for (const end of ["a", "b"]) {
            if (Math.hypot(p.x - w[end].x, p.y - w[end].y) <= 8 * px) {
              this.drag = { type: "end", w, end, linked: this.linkedPoints(w[end], w), started: false }; return;
            }
          }
        }
        const h = this.hit(p);
        M.select(h ? h.kind : null, h ? h.id : null, "2d");
        if (!h) return;
        const obj = M.get(h.kind, h.id);
        if (h.kind === "wall") this.drag = { type: "wall", w: obj, start: p, a0: { ...obj.a }, b0: { ...obj.b },
          la: this.linkedPoints(obj.a, obj).map((q) => ({ q, o: { ...q } })), lb: this.linkedPoints(obj.b, obj).map((q) => ({ q, o: { ...q } })), started: false };
        else if (h.kind === "opening") this.drag = { type: "opening", o: obj, started: false };
        else if (h.kind === "dim") this.drag = { type: "dim", d: obj, started: false };
        return;
      }
      const s = this.snap(p);
      if (t === "wall") {
        if (!this.draft) { this.draft = { start: { x: s.x, y: s.y }, chainStart: { x: s.x, y: s.y } }; this.redraw(); return; }
        const st = this.draft.start;
        if (G.len(st, s) < 0.02) { this.draft = null; this.redraw(); return; } // tap the last point again = finish
        M.checkpoint();
        const w = M.addWall(st, s, this.defT(), this.defH());
        M.select("wall", w.id, "2d");
        if (G.eq(s, this.draft.chainStart)) this.draft = null; else this.draft.start = { x: s.x, y: s.y };
        M.changed("2d");
      } else if (t === "door" || t === "window") {
        const near = this.wallNear(p); if (!near) return;
        const L = G.len(near.w.a, near.w.b);
        const d = M.defaults; let wdt = t === "door" ? d.doorW : d.winW; wdt = Math.min(wdt, L - 0.1); if (wdt < 0.2) return;
        let pos = near.pr.along; if (this.snapOn) pos = Math.round(pos / 0.05) * 0.05;
        pos = Math.max(wdt / 2, Math.min(L - wdt / 2, pos));
        M.checkpoint();
        const o = M.addOpening(near.w.id, t, pos, { w: wdt });
        o.h = Math.min(o.h, near.w.h - o.sill);
        M.select("opening", o.id, "2d"); M.changed("2d");
      } else if (t === "dim") {
        if (!this.draft) { this.draft = { start: { x: s.x, y: s.y } }; this.redraw(); return; }
        if (G.len(this.draft.start, s) < 0.02) return;
        M.checkpoint();
        const dm = M.addDim(this.draft.start, s, 0.6);
        this.draft = null; M.select("dim", dm.id, "2d"); M.changed("2d");
      }
    }

    move(p) {
      this.mouse = p;
      const dr = this.drag;
      if (dr) {
        if (!dr.started) { M.checkpoint(); dr.started = true; }
        if (dr.type === "end") {
          const s = this.snap(p, { exclude: [dr.w] });
          dr.w[dr.end].x = s.x; dr.w[dr.end].y = s.y;
          for (const q of dr.linked) { q.x = s.x; q.y = s.y; }
          this.snapInfo = s;
        } else if (dr.type === "wall") {
          let dx = p.x - dr.start.x, dy = p.y - dr.start.y;
          if (this.snapOn) { dx = Math.round(dx / this.snapStep) * this.snapStep; dy = Math.round(dy / this.snapStep) * this.snapStep; }
          if (this.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
          dr.w.a.x = dr.a0.x + dx; dr.w.a.y = dr.a0.y + dy; dr.w.b.x = dr.b0.x + dx; dr.w.b.y = dr.b0.y + dy;
          for (const l of dr.la) { l.q.x = l.o.x + dx; l.q.y = l.o.y + dy; }
          for (const l of dr.lb) { l.q.x = l.o.x + dx; l.q.y = l.o.y + dy; }
        } else if (dr.type === "opening") {
          const w = M.wall(dr.o.wall); if (w) {
            const L = G.len(w.a, w.b); let pos = G.project(p, w.a, w.b).along;
            if (this.snapOn) pos = Math.round(pos / 0.05) * 0.05;
            dr.o.pos = Math.max(dr.o.w / 2, Math.min(L - dr.o.w / 2, pos));
          }
        } else if (dr.type === "dim") {
          const d = dr.d, L = G.len(d.a, d.b) || 1;
          let off = ((p.x - d.a.x) * -(d.b.y - d.a.y) + (p.y - d.a.y) * (d.b.x - d.a.x)) / L;
          if (this.snapOn) off = Math.round(off / 0.05) * 0.05; d.off = off;
        }
        M.clampOpenings(); M.changed("2d");
      } else {
        if (this.tool === "wall" || this.tool === "dim") this.snapInfo = this.snap(p);
        else this.snapInfo = null;
        if (this.tool === "door" || this.tool === "window") this.hoverWall = this.wallNear(p);
        if (this.tool === "select") {
          const sel = M.selection; let cur = "default";
          if (sel && sel.kind === "wall") { const w = M.wall(sel.id); if (w && ["a", "b"].some((e) => Math.hypot(p.x - w[e].x, p.y - w[e].y) <= 8 / this.view.s)) cur = "move"; }
          if (cur === "default" && this.hit(p)) cur = "pointer";
          this.cv.style.cursor = cur;
        }
        this.redraw();
      }
      this.onCursor && this.onCursor(this.snapInfo || p);
    }
    defT() { return M.defaults.t; } defH() { return M.defaults.h; }

    /* ---------- drawing ---------- */
    redraw() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
    }
    draw() {
      const ctx = this.ctx, W = this.W, H = this.H, c = this.colors;
      if (!W || !H) return;
      ctx.fillStyle = c.bg || "#0e1838"; ctx.fillRect(0, 0, W, H);
      this.drawGrid();
      this.drawRefs();
      this.drawWalls();
      this.drawOpenings();
      this.drawDims();
      this.drawOverlay();
    }
    drawGrid() {
      const ctx = this.ctx, s = this.view.s, c = this.colors;
      const steps = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500, 1000, 5000];
      let minor = steps.find((v) => v * s >= 10) || 5000; const major = steps[steps.indexOf(minor) + 1] || minor * 10;
      const tl = this.toW(0, 0), br = this.toW(this.W, this.H);
      const line = (step, col) => {
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = Math.ceil(tl.x / step) * step; x <= br.x; x += step) { const sx = Math.round(this.toS({ x, y: 0 }).x) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, this.H); }
        for (let y = Math.ceil(br.y / step) * step; y <= tl.y; y += step) { const sy = Math.round(this.toS({ x: 0, y }).y) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(this.W, sy); }
        ctx.stroke();
      };
      line(minor, c.grid); line(major, c["grid-major"]);
      const o = this.toS({ x: 0, y: 0 });
      ctx.strokeStyle = c.axis; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(o.x, 0); ctx.lineTo(o.x, this.H); ctx.moveTo(0, o.y); ctx.lineTo(this.W, o.y); ctx.stroke();
    }
    drawUnderlay() {
      const u = M.doc.underlay; if (!u) return;
      if (!this._ulImg || this._ulSrc !== u.src) { this._ulSrc = u.src; this._ulImg = new Image(); this._ulImg.onload = () => this.redraw(); this._ulImg.src = u.src; }
      if (!this._ulImg.complete) return;
      const ctx = this.ctx, tl = this.toS({ x: u.x, y: u.y + u.h }), s = this.view.s;
      ctx.save();
      const dark = document.documentElement.dataset.theme !== "blueprint";
      ctx.globalAlpha = 0.55; if (dark) ctx.filter = "invert(1) hue-rotate(180deg)";
      ctx.drawImage(this._ulImg, tl.x, tl.y, u.w * s, u.h * s);
      ctx.restore();
    }
    drawRefs() {
      this.drawUnderlay();
      const r = M.doc.refs; if (!r.lines.length && !r.texts.length) return;
      const ctx = this.ctx, c = this.colors, s = this.view.s, v = this.view, W2 = this.W / 2, H2 = this.H / 2;
      ctx.strokeStyle = c.ref; ctx.lineWidth = 1; ctx.beginPath();
      for (const l of r.lines) {
        ctx.moveTo(W2 + (l[0] - v.cx) * s, H2 - (l[1] - v.cy) * s); ctx.lineTo(W2 + (l[2] - v.cx) * s, H2 - (l[3] - v.cy) * s);
      }
      ctx.stroke();
      ctx.fillStyle = c.ref;
      for (const t of r.texts) {
        const px = t.h * s; if (px < 5) continue;
        const p = this.toS(t); ctx.save(); ctx.translate(p.x, p.y); if (t.r) ctx.rotate(-t.r * Math.PI / 180);
        ctx.font = px.toFixed(1) + "px sans-serif"; ctx.textBaseline = "alphabetic"; ctx.fillText(t.s, 0, 0); ctx.restore();
      }
    }
    wallRect(w, half, extA, extB) {
      const L = G.len(w.a, w.b) || 1e-9, ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, nx = -uy * half, ny = ux * half;
      const a = { x: w.a.x - ux * extA, y: w.a.y - uy * extA }, b = { x: w.b.x + ux * extB, y: w.b.y + uy * extB };
      return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
    }
    poly(pts) { const ctx = this.ctx; ctx.beginPath(); pts.forEach((q, i) => { const p = this.toS(q); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); }
    drawWalls() {
      const ctx = this.ctx, c = this.colors, px = 1 / this.view.s, walls = M.doc.walls;
      const sel = M.selection && M.selection.kind === "wall" ? M.selection.id : null;
      const info = walls.map((w) => ({ w, ja: G.joined(w.a, w, walls), jb: G.joined(w.b, w, walls) }));
      // pass 1: outline colour, slightly larger
      for (const it of info) {
        ctx.fillStyle = it.w.id === sel ? c.sel : c["wall-line"];
        const e = 1.2 * px;
        this.poly(this.wallRect(it.w, it.w.t / 2 + e, it.ja ? it.w.t / 2 + e : e, it.jb ? it.w.t / 2 + e : e)); ctx.fill();
      }
      // pass 2: fill, slightly smaller → clean merged joints
      for (const it of info) {
        ctx.fillStyle = c.wall; ctx.globalAlpha = 1;
        const e = 0.6 * px;
        this.poly(this.wallRect(it.w, Math.max(it.w.t / 2 - e, 0.2 * px), it.ja ? it.w.t / 2 - e : -e, it.jb ? it.w.t / 2 - e : -e)); ctx.fill();
      }
      // hatch selected
      if (sel) { const w = M.wall(sel); if (w) { ctx.fillStyle = c.sel; ctx.globalAlpha = 0.28; this.poly(this.wallRect(w, w.t / 2, 0, 0)); ctx.fill(); ctx.globalAlpha = 1; } }
    }
    drawOpenings(preview) {
      const ctx = this.ctx, c = this.colors, px = 1 / this.view.s;
      const list = preview ? [preview] : M.doc.openings;
      const selId = M.selection && M.selection.kind === "opening" ? M.selection.id : null;
      for (const o of list) {
        const g = this.openingGeom(o); if (!g) continue;
        const t = g.w.t, col = o.id === selId ? c.sel : (preview ? c.sel : c.open);
        // gap
        ctx.fillStyle = c.bg;
        const gapW = { a: g.p0, b: g.p1, t: t + 3 * px };
        this.poly(this.wallRect(gapW, gapW.t / 2, 0, 0)); ctx.fill();
        // jambs
        ctx.strokeStyle = c["wall-line"]; ctx.lineWidth = 1.4; ctx.beginPath();
        for (const q of [g.p0, g.p1]) {
          const s1 = this.toS({ x: q.x + g.nx * t / 2, y: q.y + g.ny * t / 2 }), s2 = this.toS({ x: q.x - g.nx * t / 2, y: q.y - g.ny * t / 2 });
          ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
        }
        ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = o.id === selId ? 2.2 : 1.5;
        if (o.kind === "window") {
          ctx.beginPath();
          for (const k of [-t / 2, 0, t / 2]) {
            const s1 = this.toS({ x: g.p0.x + g.nx * k, y: g.p0.y + g.ny * k }), s2 = this.toS({ x: g.p1.x + g.nx * k, y: g.p1.y + g.ny * k });
            ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
          }
          ctx.stroke();
        } else {
          // hinge at p0 (or p1 when flipped); leaf swings to +n side
          const hinge = o.flip ? g.p1 : g.p0, dirU = o.flip ? -1 : 1;
          const side = o.flip ? -1 : 1;
          const hx = hinge.x + g.nx * side * t / 2, hy = hinge.y + g.ny * side * t / 2;
          const tip = { x: hx + g.nx * side * o.w, y: hy + g.ny * side * o.w };
          const H0 = this.toS({ x: hx, y: hy }), T = this.toS(tip);
          ctx.beginPath(); ctx.moveTo(H0.x, H0.y); ctx.lineTo(T.x, T.y); ctx.stroke();
          const closed = { x: hx + g.ux * dirU * o.w, y: hy + g.uy * dirU * o.w }, C = this.toS(closed);
          const r = o.w * this.view.s, a1 = Math.atan2(T.y - H0.y, T.x - H0.x), a2 = Math.atan2(C.y - H0.y, C.x - H0.x);
          let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          ctx.save(); ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(H0.x, H0.y, r, a1, a2, d < 0); ctx.stroke(); ctx.restore();
        }
      }
    }
    drawDims() {
      const ctx = this.ctx, c = this.colors, selId = M.selection && M.selection.kind === "dim" ? M.selection.id : null;
      for (const d of M.doc.dims) this.drawDim(d.a, d.b, d.off, d.id === selId ? c.sel : c.dim);
    }
    drawDim(a, b, off, col) {
      const ctx = this.ctx, L = G.len(a, b); if (L < 1e-6) return;
      const d = this.dimGeom({ a, b, off }), A = this.toS(d.a), B = this.toS(d.b), a0 = this.toS(a), b0 = this.toS(b);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(A.x, A.y); ctx.moveTo(b0.x, b0.y); ctx.lineTo(B.x, B.y); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      const ang = Math.atan2(B.y - A.y, B.x - A.x);
      ctx.lineWidth = 1.6; ctx.beginPath();
      for (const P of [A, B]) { ctx.moveTo(P.x - Math.cos(ang + Math.PI / 4) * 5, P.y - Math.sin(ang + Math.PI / 4) * 5); ctx.lineTo(P.x + Math.cos(ang + Math.PI / 4) * 5, P.y + Math.sin(ang + Math.PI / 4) * 5); }
      ctx.stroke();
      let ta = ang; if (ta > Math.PI / 2 || ta < -Math.PI / 2) ta += Math.PI;
      ctx.save(); ctx.translate((A.x + B.x) / 2, (A.y + B.y) / 2); ctx.rotate(ta);
      ctx.font = "600 12px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(L.toFixed(2), 0, -3); ctx.restore();
    }
    label(text, p, col) {
      const ctx = this.ctx, s = this.toS(p);
      ctx.font = "600 12px Inter, sans-serif"; const w = ctx.measureText(text).width + 10;
      ctx.fillStyle = col; ctx.globalAlpha = 0.92; ctx.fillRect(s.x + 12, s.y - 26, w, 18); ctx.globalAlpha = 1;
      ctx.fillStyle = this.colors.bg; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, s.x + 17, s.y - 17);
    }
    drawOverlay() {
      const ctx = this.ctx, c = this.colors;
      // selected wall: length + handles
      const sel = M.selection;
      if (sel && sel.kind === "wall") {
        const w = M.wall(sel.id);
        if (w) {
          for (const q of [w.a, w.b]) { const s = this.toS(q); ctx.fillStyle = c.bg; ctx.strokeStyle = c.sel; ctx.lineWidth = 2; ctx.fillRect(s.x - 5, s.y - 5, 10, 10); ctx.strokeRect(s.x - 5, s.y - 5, 10, 10); }
          this.drawDim(w.a, w.b, w.t / 2 + 0.45, c.sel);
        }
      }
      // wall / dim drafting preview
      if (this.draft && this.snapInfo) {
        const a = this.draft.start, b = this.snapInfo;
        if (this.tool === "wall") {
          ctx.globalAlpha = 0.45; ctx.fillStyle = c.sel; this.poly(this.wallRect({ a, b }, this.defT() / 2, 0, 0)); ctx.fill(); ctx.globalAlpha = 1;
          ctx.strokeStyle = c.sel; ctx.setLineDash([6, 4]); ctx.lineWidth = 1; const A = this.toS(a), B = this.toS(b);
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.setLineDash([]);
          const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
          this.label(G.len(a, b).toFixed(2) + " m  ∠" + ((ang + 360) % 360).toFixed(0) + "°", b, c.sel);
        } else if (this.tool === "dim") this.drawDim(a, b, 0.6, c.sel);
      }
      // opening preview
      if ((this.tool === "door" || this.tool === "window") && this.hoverWall && this.mouse) {
        const w = this.hoverWall.w, L = G.len(w.a, w.b), d = M.defaults;
        const wd = Math.min(this.tool === "door" ? d.doorW : d.winW, L - 0.1);
        if (wd >= 0.2) {
          const pos = Math.max(wd / 2, Math.min(L - wd / 2, this.hoverWall.pr.along));
          ctx.globalAlpha = 0.85; this.drawOpenings({ id: "_pv", wall: w.id, kind: this.tool, pos, w: wd }); ctx.globalAlpha = 1;
        }
      }
      // snap marker
      if (this.snapInfo && this.tool !== "select" && this.mouse) {
        const s = this.toS(this.snapInfo); ctx.strokeStyle = c.sel; ctx.lineWidth = 1.5;
        if (this.snapInfo.kind === "end") ctx.strokeRect(s.x - 6, s.y - 6, 12, 12);
        else if (this.snapInfo.kind === "mid") { ctx.beginPath(); ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x + 7, s.y + 5); ctx.lineTo(s.x - 7, s.y + 5); ctx.closePath(); ctx.stroke(); }
        else if (this.snapInfo.kind === "on") { ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(s.x - 6, s.y); ctx.lineTo(s.x + 6, s.y); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x, s.y + 6); ctx.stroke(); }
      }
    }
  }

  P23.Editor2D = Editor2D;
})();
