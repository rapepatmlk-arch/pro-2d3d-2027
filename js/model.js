/* Pro-2D+3D 2027 — shared document model (the "Live Link").
 * Both the 2D editor and the 3D view read from and write to this single model.
 * Every change emits "change", so the other view updates immediately.
 * Units: metres. Plan coordinates: x → right, y → up (north).
 */
(function () {
  const P23 = (window.P23 = window.P23 || {});

  let seq = 1;
  const uid = (p) => p + Date.now().toString(36) + (seq++).toString(36);

  function emptyDoc() {
    return {
      format: "p23", version: 1, name: "", created: new Date().toISOString(),
      walls: [],     // {id, a:{x,y}, b:{x,y}, t, h}
      openings: [],  // {id, wall, pos (centre distance from wall.a), w, h, sill, kind:'door'|'window', flip}
      dims: [],      // {id, a:{x,y}, b:{x,y}, off}
      refs: { lines: [], texts: [] }, // imported reference drawing: lines [x1,y1,x2,y2], texts {x,y,h,s,r}
      underlay: null, // PDF page as image {src (data URL), x, y (bottom-left, m), w, h (m), scale, page}
    };
  }

  const listeners = {};
  const model = {
    doc: emptyDoc(),
    selection: null,          // {kind:'wall'|'opening'|'dim', id}
    refModel: null,           // THREE.Group from an imported OBJ (not saved in .p23)
    dirty: false,
    defaults: { t: 0.2, h: 3.0, doorW: 0.9, doorH: 2.1, winW: 1.2, winH: 1.2, winSill: 0.9 },
    undoStack: [], redoStack: [],

    uid,
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit(ev, data) { (listeners[ev] || []).forEach((fn) => fn(data)); },

    /** Notify both views. source = '2d' | '3d' | 'app' */
    changed(source) { this.dirty = true; this.emit("change", { source: source || "app" }); },

    snapshot() { return JSON.stringify(this.doc); },
    /** Save an undo point before a modification. */
    checkpoint() {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 150) this.undoStack.shift();
      this.redoStack.length = 0;
    },
    undo() {
      if (!this.undoStack.length) return;
      this.redoStack.push(this.snapshot());
      this.doc = JSON.parse(this.undoStack.pop());
      this.validateSelection(); this.changed("app");
    },
    redo() {
      if (!this.redoStack.length) return;
      this.undoStack.push(this.snapshot());
      this.doc = JSON.parse(this.redoStack.pop());
      this.validateSelection(); this.changed("app");
    },

    load(doc, name) {
      const d = Object.assign(emptyDoc(), doc);
      d.refs = Object.assign({ lines: [], texts: [] }, d.refs || {});
      if (name) d.name = name;
      this.doc = d; this.selection = null; this.undoStack = []; this.redoStack = [];
      this.dirty = false;
      this.emit("load", {}); this.emit("change", { source: "app" }); this.emit("select", {});
    },
    newDoc() { this.refModel = null; this.load(emptyDoc()); },

    select(kind, id, source) {
      this.selection = kind ? { kind, id } : null;
      this.emit("select", { source });
    },
    validateSelection() {
      if (this.selection && !this.get(this.selection.kind, this.selection.id)) this.select(null);
      else this.emit("select", {});
    },

    get(kind, id) {
      const list = kind === "wall" ? this.doc.walls : kind === "opening" ? this.doc.openings : kind === "dim" ? this.doc.dims : [];
      return list.find((o) => o.id === id) || null;
    },
    wall(id) { return this.doc.walls.find((w) => w.id === id) || null; },

    addWall(a, b, t, h) {
      const r = (v) => Math.round(v * 1e6) / 1e6; // 0.001 mm — removes floating-point noise
      const w = { id: uid("w"), a: { x: r(a.x), y: r(a.y) }, b: { x: r(b.x), y: r(b.y) }, t: t || this.defaults.t, h: h || this.defaults.h };
      this.doc.walls.push(w); return w;
    },
    addOpening(wallId, kind, pos, opts) {
      const d = this.defaults, isDoor = kind === "door";
      const o = Object.assign({ id: uid("o"), wall: wallId, kind, pos,
        w: isDoor ? d.doorW : d.winW, h: isDoor ? d.doorH : d.winH, sill: isDoor ? 0 : d.winSill, flip: false }, opts || {});
      this.doc.openings.push(o); return o;
    },
    addDim(a, b, off) {
      const m = { id: uid("d"), a: { ...a }, b: { ...b }, off: off == null ? 0.6 : off };
      this.doc.dims.push(m); return m;
    },
    remove(kind, id) {
      if (kind === "wall") {
        this.doc.walls = this.doc.walls.filter((w) => w.id !== id);
        this.doc.openings = this.doc.openings.filter((o) => o.wall !== id);
      } else if (kind === "opening") this.doc.openings = this.doc.openings.filter((o) => o.id !== id);
      else if (kind === "dim") this.doc.dims = this.doc.dims.filter((d) => d.id !== id);
      if (this.selection && this.selection.id === id) this.select(null);
    },

    /** Keep openings inside their wall after the wall changes length. */
    clampOpenings() {
      for (const o of this.doc.openings) {
        const w = this.wall(o.wall); if (!w) continue;
        const L = geom.len(w.a, w.b);
        o.w = Math.min(o.w, Math.max(0.1, L - 0.02));
        o.pos = Math.max(o.w / 2, Math.min(L - o.w / 2, o.pos));
        o.h = Math.min(o.h, w.h - o.sill);
      }
    },

    bounds() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
      for (const w of this.doc.walls) { add(w.a.x, w.a.y); add(w.b.x, w.b.y); }
      for (const d of this.doc.dims) { add(d.a.x, d.a.y); add(d.b.x, d.b.y); }
      for (const l of this.doc.refs.lines) { add(l[0], l[1]); add(l[2], l[3]); }
      for (const t of this.doc.refs.texts) add(t.x, t.y);
      const u = this.doc.underlay; if (u) { add(u.x, u.y); add(u.x + u.w, u.y + u.h); }
      if (x0 === Infinity) return null;
      return { x0, y0, x1, y1 };
    },

    /** Element counts shown in the properties panel. */
    counts() {
      const ops = this.doc.openings;
      return { walls: this.doc.walls.length, doors: ops.filter((o) => o.kind === "door").length, wins: ops.filter((o) => o.kind === "window").length };
    },
  };

  /* ---------- geometry helpers ---------- */
  const geom = {
    len: (a, b) => Math.hypot(b.x - a.x, b.y - a.y),
    eq: (a, b, tol) => Math.abs(a.x - b.x) <= (tol || 1e-3) && Math.abs(a.y - b.y) <= (tol || 1e-3),
    /** Project p on segment ab → {t (0..1), d (distance), x, y, along (metres)} */
    project(p, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const x = a.x + dx * t, y = a.y + dy * t;
      return { t, x, y, d: Math.hypot(p.x - x, p.y - y), along: t * Math.sqrt(L2) };
    },
    /** Is endpoint p of wall w joined to another wall (L, T or X joint)? */
    joined(p, w, walls) {
      for (const o of walls) {
        if (o === w) continue;
        if (geom.eq(p, o.a) || geom.eq(p, o.b)) return true;
        const pr = geom.project(p, o.a, o.b);
        if (pr.d < 1e-3 && pr.t > 0 && pr.t < 1) return true;
      }
      return false;
    },
    /** Solid intervals [s0,s1] along a wall (metres from a) at height band, minus openings. */
    openingsOf(w, openings) {
      return openings.filter((o) => o.wall === w.id).sort((p, q) => p.pos - q.pos);
    },
  };

  P23.model = model;
  P23.geom = geom;
})();
