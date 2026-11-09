/* Pro2D-2027 / Pro3D-2027 for iPad — reading a DXF for display.
 * ASCII DXF of every release (R12 … AC1032 = AutoCAD 2018–2026, what LibreDWG writes from a DWG).
 * Everything is flattened at load into what a screen draws: line segments, filled polygons and texts,
 * per layer + colour, per space (Model and each Layout). Blocks (nested, arrays), dimensions (their
 * block), mirrored entities (OCS extrusion −Z), arcs/circles/ellipses/splines/bulges are resolved here.
 * Thai text: codepage ANSI_874 (TIS-620) and UTF-8 (AC1021+) are decoded. */
(function () {
  "use strict";
  const P = (window.P23 = window.P23 || {});
  const UNIT = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 7: 1000, 8: 0.0000254, 9: 0.0000254, 10: 0.9144, 14: 0.1 };
  const VER = { AC1009: "R12", AC1012: "R13", AC1014: "R14", AC1015: "2000", AC1018: "2004", AC1021: "2007", AC1024: "2010", AC1027: "2013", AC1032: "2018–2026" };

  /* ---------- AutoCAD Color Index → #rrggbb (7 = "ink": white on dark, black on light → null) ---------- */
  const BASE = [null, "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", null, "#808080", "#c0c0c0"];
  function hsv(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    const c = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
    return "#" + c(f(5)) + c(f(3)) + c(f(1));
  }
  function aci(i) {
    i = Math.abs(i | 0);
    if (i < 10) return BASE[i] === undefined ? null : BASE[i];
    if (i >= 250) { const g = [0.2, 0.31, 0.43, 0.55, 0.67, 0.8][i - 250]; return hsv(0, 0, g); }
    const h = Math.floor((i - 10) / 10) * 15, k = (i - 10) % 10;
    const v = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][k], s = k % 2 ? 0.5 : 1;
    return hsv(h, s, v);
  }
  const trueColor = (n) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
  P.aci = aci;

  /* ---------- text decoding ---------- */
  function decode(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 22)));
    if (head.startsWith("AutoCAD Binary DXF")) throw new Error("Binary DXF — save it as ASCII DXF");
    const sniff = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 400000)));
    const ver = (/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/.exec(sniff) || [])[1] || "AC1009";
    const cp = ((/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/.exec(sniff) || [])[1] || "").toUpperCase();
    let enc = "windows-1252";
    if (ver >= "AC1021") enc = "utf-8";
    else if (cp === "ANSI_874") enc = "windows-874";
    else if (/^ANSI_(\d+)$/.test(cp)) enc = "windows-" + cp.slice(5);
    let text;
    try { text = new TextDecoder(enc).decode(bytes); } catch (e) { text = new TextDecoder("windows-1252").decode(bytes); }
    return { text, ver };
  }
  const unesc = (s) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%%/g, "%").replace(/%%[uUoO]/g, "");
  function mtextLines(s) {
    s = unesc(s).replace(/\\S([^;]*)[\^#/]([^;]*);/g, "$1/$2").replace(/\\[ACcFfHhQqTtWw][^;\\{}]*;/g, "")
      .replace(/\\[LlOoKk]/g, "").replace(/\\~/g, " ").replace(/[{}]/g, "");
    return s.split(/\\P|\n/).map((x) => x.replace(/\\\\/g, "\\").trim());
  }

  /* ---------- pairs → sections ---------- */
  function* pairIter(text) {
    let i = 0;
    const n = text.length;
    while (i < n) {
      let j = text.indexOf("\n", i); if (j < 0) j = n;
      const code = parseInt(text.slice(i, j), 10);
      i = j + 1; j = text.indexOf("\n", i); if (j < 0) j = n;
      let v = text.slice(i, j); if (v.endsWith("\r")) v = v.slice(0, -1);
      i = j + 1;
      if (!isNaN(code)) yield [code, v];
    }
  }
  function structure(text) {
    const S = { header: {}, layers: {}, records: {}, layouts: [], blocks: {}, entities: [] };
    const it = pairIter(text);
    let cur = it.next();
    const take = () => { const v = cur.value; cur = it.next(); return v; };
    const readEnt = () => {               // at a 0-pair
      const type = take()[1].trim(); const g = [];
      while (!cur.done && cur.value[0] !== 0) g.push(take());
      return { type, g };
    };
    const group = (list) => {             // VERTEX/ATTRIB under POLYLINE/INSERT
      const out = [];
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.type === "POLYLINE") { e.verts = []; while (k + 1 < list.length && list[k + 1].type === "VERTEX") e.verts.push(list[++k]); if (list[k + 1] && list[k + 1].type === "SEQEND") k++; }
        else if (e.type === "INSERT") { e.attribs = []; while (k + 1 < list.length && list[k + 1].type === "ATTRIB") e.attribs.push(list[++k]); if (list[k + 1] && list[k + 1].type === "SEQEND") k++; }
        out.push(e);
      }
      return out;
    };
    while (!cur.done) {
      const [c, v] = cur.value;
      if (!(c === 0 && v.trim() === "SECTION")) { take(); continue; }
      take(); const name = take()[1].trim();
      const until = () => !cur.done && !(cur.value[0] === 0 && cur.value[1].trim() === "ENDSEC");
      if (name === "HEADER") {
        let key = null;
        while (until()) { const p = take(); if (p[0] === 9) key = p[1].trim(); else if (key) (S.header[key] = S.header[key] || []).push(p); }
      } else if (name === "TABLES") {
        while (until()) {
          if (cur.value[0] !== 0) { take(); continue; }
          const e = readEnt();
          if (e.type === "LAYER") {
            const nm = str(e.g, 2); const col = num(e.g, 62, 7); const flags = num(e.g, 70, 0); const tc = e.g.find((p) => p[0] === 420);
            S.layers[nm] = { name: nm, color: tc ? trueColor(+tc[1]) : aci(col), on: col >= 0, frozen: !!(flags & 1) };
          } else if (e.type === "BLOCK_RECORD") S.records[str(e.g, 5)] = str(e.g, 2);
          else if (e.type === "VPORT" && str(e.g, 2).toUpperCase() === "*ACTIVE" && !S.vport)
            S.vport = { cx: num(e.g, 12, NaN), cy: num(e.g, 22, NaN), h: num(e.g, 40, 0) };
        }
      } else if (name === "BLOCKS") {
        while (until()) {
          if (cur.value[0] !== 0) { take(); continue; }
          const e = readEnt();
          if (e.type !== "BLOCK") continue;
          const bname = str(e.g, 2), base = [num(e.g, 10), num(e.g, 20)];
          const list = [];
          while (!cur.done && !(cur.value[0] === 0 && cur.value[1].trim() === "ENDBLK")) { if (cur.value[0] === 0) list.push(readEnt()); else take(); }
          if (!cur.done) readEnt();
          S.blocks[bname.toUpperCase()] = { name: bname, base, ents: group(list), xref: !!(num(e.g, 70, 0) & 4) };
        }
      } else if (name === "ENTITIES") {
        const list = [];
        while (until()) { if (cur.value[0] === 0) list.push(readEnt()); else take(); }
        S.entities = group(list);
      } else if (name === "OBJECTS") {
        while (until()) {
          if (cur.value[0] !== 0) { take(); continue; }
          const e = readEnt();
          if (e.type === "LAYOUT") S.layouts.push({ name: str(e.g, 1), record: str(e.g, 330, true) , rec340: str(e.g, 340), order: num(e.g, 71, 0) });
        }
      } else { while (until()) take(); }
      if (!cur.done) take();          // ENDSEC
    }
    return S;
  }
  function num(g, code, def) { for (const p of g) if (p[0] === code) { const v = parseFloat(p[1]); return isNaN(v) ? (def || 0) : v; } return def === undefined ? 0 : def; }
  function str(g, code, last) {
    if (last) { let r = ""; for (const p of g) if (p[0] === code) r = p[1].trim(); return r; }
    for (const p of g) if (p[0] === code) return p[1].trim(); return "";
  }
  function all(g, code) { const r = []; for (const p of g) if (p[0] === code) r.push(parseFloat(p[1])); return r; }

  /* ---------- 2D affine: x' = a x + c y + e, y' = b x + d y + f ---------- */
  const I = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const mul = (m, n) => ({ a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f });
  const tr = (x, y) => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
  const rot = (r) => ({ a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 });
  const sc = (x, y) => ({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
  const MIRROR = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };        // OCS with extrusion (0,0,-1)
  const ocs = (g) => (num(g, 230, 1) < 0 ? MIRROR : I);

  /* ---------- the reader ---------- */
  function read(buf, opts) {
    opts = opts || {};
    const MAXSEG = opts.maxSegments || 3000000;
    const { text, ver } = decode(buf);
    const S = structure(text);
    const hv = (k, code) => { const a = S.header[k]; if (!a) return NaN; const p = a.find((q) => q[0] === code); return p ? parseFloat(p[1]) : NaN; };
    const units = UNIT[hv("$INSUNITS", 70) | 0] || null;
    // the model view the drawing was saved with (where AutoCAD / Pro2D open it)
    const vc = [hv("$VIEWCTR", 10), hv("$VIEWCTR", 20)], vs = hv("$VIEWSIZE", 40);
    let savedView = isFinite(vc[0]) && isFinite(vc[1]) && vs > 0 ? { cx: vc[0], cy: vc[1], h: vs } : null;
    if (!savedView && S.vport && isFinite(S.vport.cx) && S.vport.h > 0) savedView = S.vport;
    const layers = S.layers;
    if (!layers["0"]) layers["0"] = { name: "0", color: null, on: true, frozen: false };
    const spaces = [];
    let nseg = 0;

    function newSpace(name) { const sp = { name, segs: new Map(), fills: new Map(), texts: [], minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity }; spaces.push(sp); return sp; }
    function emit(space) {
      const bucket = (map, layer, color) => {
        const key = layer + "\u0001" + (color || "");
        let b = map.get(key); if (!b) { b = []; map.set(key, b); } return b;
      };
      const grow = (x, y) => { if (x < space.minx) space.minx = x; if (x > space.maxx) space.maxx = x; if (y < space.miny) space.miny = y; if (y > space.maxy) space.maxy = y; };
      return {
        poly(m, layer, color, pts, closed) {          // pts: [x0,y0,x1,y1,...] local
          if (pts.length < 4 || nseg > MAXSEG) return;
          const b = bucket(space.segs, layer, color);
          const n = pts.length / 2;
          let px = m.a * pts[0] + m.c * pts[1] + m.e, py = m.b * pts[0] + m.d * pts[1] + m.f;
          grow(px, py);
          const x0 = px, y0 = py;
          for (let k = 1; k < n; k++) {
            const x = m.a * pts[2 * k] + m.c * pts[2 * k + 1] + m.e, y = m.b * pts[2 * k] + m.d * pts[2 * k + 1] + m.f;
            b.push(px, py, x, y); px = x; py = y; grow(x, y); nseg++;
          }
          if (closed) { b.push(px, py, x0, y0); nseg++; }
        },
        fill(m, layer, color, pts) {
          if (pts.length < 6) return;
          const out = [];
          for (let k = 0; k < pts.length; k += 2) { const x = m.a * pts[k] + m.c * pts[k + 1] + m.e, y = m.b * pts[k] + m.d * pts[k + 1] + m.f; out.push(x, y); grow(x, y); }
          bucket(space.fills, layer, color).push(out);
        },
        text(m, layer, color, x, y, h, r, lines, ha, va, wf) {
          if (!lines.length || !h) return;
          const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
          const sx = Math.hypot(m.a, m.b), mir = m.a * m.d - m.b * m.c < 0;
          const ang = Math.atan2(m.b, m.a) + (mir ? -r : r);
          grow(X, Y);
          space.texts.push({ x: X, y: Y, h: h * sx, r: ang, lines, layer, color, ha, va, wf: wf || 1 });
        },
      };
    }

    function arcPts(cx, cy, r, a0, a1, full) {      // radians CCW
      if (full) a1 = a0 + Math.PI * 2; else while (a1 <= a0) a1 += Math.PI * 2;
      const n = Math.max(6, Math.min(128, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 72)));
      const pts = [];
      for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
      return pts;
    }
    function bulgePts(x1, y1, x2, y2, b, out) {
      if (Math.abs(b) < 1e-9) { out.push(x2, y2); return; }
      const th = 4 * Math.atan(b), dx = x2 - x1, dy = y2 - y1, c = Math.hypot(dx, dy);
      if (c < 1e-12) return;
      const r = c / (2 * Math.sin(th / 2)), h = r * Math.cos(th / 2);
      const cx = (x1 + x2) / 2 - (dy / c) * h, cy = (y1 + y2) / 2 + (dx / c) * h;
      const n = Math.max(3, Math.min(64, Math.ceil((Math.abs(th) / (Math.PI * 2)) * 72)));
      for (let k = 1; k <= n; k++) {
        const a = (th * k) / n, ca = Math.cos(a), sa = Math.sin(a);
        out.push(cx + (x1 - cx) * ca - (y1 - cy) * sa, cy + (x1 - cx) * sa + (y1 - cy) * ca);
      }
    }
    function bspline(deg, knots, cps, nOut) {
      const n = cps.length / 2; if (n < 2) return cps.slice();
      if (!knots.length || knots.length !== n + deg + 1) { knots = []; for (let i = 0; i < n + deg + 1; i++) knots.push(i < deg + 1 ? 0 : i >= n ? n - deg : i - deg); }
      const t0 = knots[deg], t1 = knots[n], out = [];
      for (let s = 0; s <= nOut; s++) {
        let t = t0 + ((t1 - t0) * s) / nOut; if (s === nOut) t = t1 - 1e-9;
        let k = deg; while (k < n - 1 && t >= knots[k + 1]) k++;
        const dx = [], dy = [];
        for (let j = 0; j <= deg; j++) { dx[j] = cps[2 * (j + k - deg)]; dy[j] = cps[2 * (j + k - deg) + 1]; }
        for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
          const den = knots[j + 1 + k - r] - knots[j + k - deg]; const a = den ? (t - knots[j + k - deg]) / den : 0;
          dx[j] = (1 - a) * dx[j - 1] + a * dx[j]; dy[j] = (1 - a) * dy[j - 1] + a * dy[j];
        }
        out.push(dx[deg], dy[deg]);
      }
      return out;
    }

    function entColor(g, inherit) {
      const tc = g.find((p) => p[0] === 420);
      if (tc) return trueColor(+tc[1]);
      const c = num(g, 62, 256);
      if (c === 256) return undefined;          // ByLayer
      if (c === 0) return inherit;              // ByBlock
      return aci(c) || "ink";
    }

    function draw(ents, m, out, depth, inhLayer, inhColor) {
      if (depth > 12) return;
      for (const e of ents) {
        const g = e.g;
        let layer = str(g, 8) || "0";
        if (layer === "0" && inhLayer) layer = inhLayer;
        const L = layers[layer];
        if (L && L.frozen) continue;
        let color = entColor(g, inhColor);
        if (color === undefined) color = L ? L.color : null;
        if (color === "ink") color = null;
        const em = mul(m, ocs(g));
        switch (e.type) {
          case "LINE": out.poly(m, layer, color, [num(g, 10), num(g, 20), num(g, 11), num(g, 21)]); break;
          case "LWPOLYLINE": {
            const xs = [], ys = [], bs = []; let last = null;
            for (const p of g) {
              if (p[0] === 10) { xs.push(+p[1]); bs.push(0); last = "x"; }
              else if (p[0] === 20) ys.push(+p[1]);
              else if (p[0] === 42 && xs.length) bs[xs.length - 1] = +p[1];
            }
            const closed = !!(num(g, 70, 0) & 1), pts = [xs[0], ys[0]];
            const nv = xs.length;
            for (let k = 0; k < nv - 1 + (closed ? 1 : 0); k++) { const j = (k + 1) % nv; bulgePts(xs[k], ys[k], xs[j], ys[j], bs[k] || 0, pts); }
            out.poly(em, layer, color, pts, false);
            if ((num(g, 43, 0) > 0) && closed) out.fill(em, layer, color, pts);
            break;
          }
          case "POLYLINE": {
            const flags = num(g, 70, 0); if (flags & (16 | 64)) break;     // meshes: not in a plan view
            const v = (e.verts || []).filter((x) => !(num(x.g, 70, 0) & 16));
            if (v.length < 2) break;
            const closed = !!(flags & 1), pts = [num(v[0].g, 10), num(v[0].g, 20)];
            for (let k = 0; k < v.length - 1 + (closed ? 1 : 0); k++) { const j = (k + 1) % v.length; bulgePts(num(v[k].g, 10), num(v[k].g, 20), num(v[j].g, 10), num(v[j].g, 20), num(v[k].g, 42, 0), pts); }
            out.poly(flags & 8 ? m : em, layer, color, pts, false);
            break;
          }
          case "CIRCLE": out.poly(em, layer, color, arcPts(num(g, 10), num(g, 20), num(g, 40), 0, 0, true)); break;
          case "ARC": out.poly(em, layer, color, arcPts(num(g, 10), num(g, 20), num(g, 40), (num(g, 50) * Math.PI) / 180, (num(g, 51) * Math.PI) / 180)); break;
          case "ELLIPSE": {
            const cx = num(g, 10), cy = num(g, 20), mx = num(g, 11), my = num(g, 21), ratio = num(g, 40, 1);
            let t0 = num(g, 41, 0), t1 = num(g, 42, Math.PI * 2); while (t1 <= t0) t1 += Math.PI * 2;
            const a = Math.hypot(mx, my), ang = Math.atan2(my, mx), b = a * ratio, n = Math.max(12, Math.ceil(((t1 - t0) / (Math.PI * 2)) * 72)), pts = [];
            // WCS centre and axis; a −Z extrusion only runs the parameter the other way round
            const sgn = num(g, 230, 1) < 0 ? -1 : 1;
            for (let k = 0; k <= n; k++) { const t = t0 + ((t1 - t0) * k) / n, x = a * Math.cos(t), y = sgn * b * Math.sin(t); pts.push(cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)); }
            out.poly(m, layer, color, pts);
            break;
          }
          case "SPLINE": {
            const deg = num(g, 71, 3), knots = all(g, 40);
            const cx = all(g, 10), cy = all(g, 20), fx = all(g, 11), fy = all(g, 21);
            let pts = [];
            if (cx.length >= 2) { const cps = []; for (let k = 0; k < cx.length; k++) cps.push(cx[k], cy[k]); pts = bspline(Math.min(deg, cx.length - 1), knots, cps, Math.min(200, cx.length * 8)); }
            else for (let k = 0; k < fx.length; k++) pts.push(fx[k], fy[k]);
            out.poly(m, layer, color, pts);
            break;
          }
          case "SOLID": case "TRACE": case "3DFACE": {
            const p = [num(g, 10), num(g, 20), num(g, 11), num(g, 21)];
            const x3 = num(g, 13, NaN), y3 = num(g, 23, NaN), x2 = num(g, 12), y2 = num(g, 22);
            if (e.type === "3DFACE") { p.push(x2, y2); if (!isNaN(x3)) p.push(x3, y3); out.poly(m, layer, color, p, true); }
            else { if (!isNaN(x3)) p.push(x3, y3); p.push(x2, y2); out.fill(e.type === "3DFACE" ? m : em, layer, color, p); }
            break;
          }
          case "TEXT": case "ATTRIB": {
            if (e.type === "ATTRIB" && (num(g, 70, 0) & 1)) break;
            const s = unesc(str(g, 1)); if (!s) break;
            const ha = num(g, 72, 0), va = num(g, e.type === "TEXT" ? 73 : 74, 0);
            const useAlign = ha !== 0 || va !== 0;
            const x = useAlign ? num(g, 11, num(g, 10)) : num(g, 10), y = useAlign ? num(g, 21, num(g, 20)) : num(g, 20);
            const H = [0, 1, 2, 0, 1, 0][ha] || 0, V = ha === 4 ? 2 : Math.max(0, Math.min(3, va));   // V: 0 baseline 1 bottom 2 middle 3 top
            out.text(em, layer, color, x, y, num(g, 40, 1), (num(g, 50, 0) * Math.PI) / 180, [s], H, V, num(g, 41, 1));
            break;
          }
          case "MTEXT": {
            let s = ""; for (const p of g) if (p[0] === 3) s += p[1]; s += str(g, 1) ? (g.filter((p) => p[0] === 1).pop() || [0, ""])[1] : "";
            const lines = mtextLines(s).filter((x, k, a) => x || k < a.length - 1); if (!lines.length) break;
            const att = num(g, 71, 1); let r = (num(g, 50, 0) * Math.PI) / 180;
            const dx = num(g, 11, NaN), dy = num(g, 21, NaN); if (!isNaN(dx) && (dx || dy)) r = Math.atan2(dy, dx);
            out.text(em, layer, color, num(g, 10), num(g, 20), num(g, 40, 1), r, lines, (att - 1) % 3, att <= 3 ? 3 : att <= 6 ? 2 : 1);
            break;
          }
          case "LEADER": {
            const xs = all(g, 10), ys = all(g, 20), pts = []; for (let k = 0; k < xs.length; k++) pts.push(xs[k], ys[k]);
            out.poly(m, layer, color, pts);
            break;
          }
          case "INSERT": case "DIMENSION": {
            const bname = str(g, 2).toUpperCase(), blk = S.blocks[bname];
            if (blk && !blk.xref) {
              if (e.type === "DIMENSION") draw(blk.ents, m, out, depth + 1, layer, color);
              else {
                const sx = num(g, 41, 1), sy = num(g, 42, sx), ang = (num(g, 50, 0) * Math.PI) / 180;
                const cols = Math.max(1, num(g, 70, 1)), rows = Math.max(1, num(g, 71, 1)), cdx = num(g, 44, 0), rdy = num(g, 45, 0);
                for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
                  let bm = mul(em, tr(num(g, 10), num(g, 20)));
                  bm = mul(bm, rot(ang)); bm = mul(bm, tr(cc * cdx, rr * rdy)); bm = mul(bm, sc(sx, sy)); bm = mul(bm, tr(-blk.base[0], -blk.base[1]));
                  draw(blk.ents, bm, out, depth + 1, layer, color);
                }
              }
            }
            if (e.attribs) draw(e.attribs, m, out, depth + 1, layer, color);
            break;
          }
          case "HATCH": {
            if (num(g, 70, 0) !== 1) break;                    // solid fills only (patterns: their boundary lines are drawn already)
            // polyline boundary paths (92 & 2): vertices 10/20 after 93
            let k = 0;
            while (k < g.length) {
              if (g[k][0] === 92 && (+g[k][1] & 2)) {
                const pts = []; k++;
                while (k < g.length && g[k][0] !== 93) k++;
                const nv = k < g.length ? +g[k][1] : 0; k++;
                for (let v = 0; v < nv && k < g.length; ) { if (g[k][0] === 10) { pts.push(+g[k][1]); } else if (g[k][0] === 20) { pts.push(+g[k][1]); v++; } k++; }
                if (pts.length >= 6) out.fill(em, layer, color, pts);
              } else k++;
            }
            break;
          }
          default: break;
        }
      }
    }

    // model space: ENTITIES not in paper space
    const model = newSpace("Model");
    draw(S.entities.filter((e) => num(e.g, 67, 0) !== 1), I, emit(model), 0, null, null);
    // layouts: the active one is in ENTITIES (67=1); the others are *Paper_Space# blocks
    const recName = (h) => S.records[h] || "";
    const lays = S.layouts.filter((l) => l.name && l.name.toUpperCase() !== "MODEL").sort((a, b) => a.order - b.order);
    const paper = S.entities.filter((e) => num(e.g, 67, 0) === 1);
    let usedActive = false;
    for (const l of lays) {
      const rn = (recName(l.rec340) || recName(l.record) || "").toUpperCase();
      let ents = null;
      if (rn === "*PAPER_SPACE") { ents = paper; usedActive = true; }
      else if (rn && S.blocks[rn]) ents = S.blocks[rn].ents;
      if (!ents || !ents.length) continue;
      const sp = newSpace(l.name); draw(ents, I, emit(sp), 0, null, null);
    }
    if (!usedActive && paper.length) { const sp = newSpace("Layout"); draw(paper, I, emit(sp), 0, null, null); }
    // typed arrays for drawing
    for (const sp of spaces) {
      for (const [k, v] of sp.segs) sp.segs.set(k, new Float64Array(v));
      sp.empty = !(sp.minx <= sp.maxx);
      sp.fit = fitBox(sp);
    }
    return { ver: VER[ver] || ver, units, layers, savedView, spaces: spaces.filter((s) => !s.empty || s.name === "Model"), segments: nseg, truncated: nseg > MAXSEG };
  }

  /* What "Extents" frames: the drawing without the odd stray object far away (the 0.3 % farthest
     points on each side are left out, the way the eye ignores a speck at the edge of a sheet). */
  function fitBox(sp) {
    if (sp.empty) return null;
    const xs = [], ys = [];
    let total = 0; for (const a of sp.segs.values()) total += a.length / 2;
    const step = Math.max(1, Math.floor(total / 200000));
    let i = 0;
    for (const a of sp.segs.values()) for (let k = 0; k < a.length; k += 2) { if (i++ % step === 0) { xs.push(a[k]); ys.push(a[k + 1]); } }
    for (const t of sp.texts) { xs.push(t.x); ys.push(t.y); }
    if (xs.length < 50) return { minx: sp.minx, miny: sp.miny, maxx: sp.maxx, maxy: sp.maxy };
    const f64 = (v) => Float64Array.from(v).sort();
    const X = f64(xs), Y = f64(ys), q = (A, p) => A[Math.min(A.length - 1, Math.max(0, Math.round(p * (A.length - 1))))];
    let minx = q(X, 0.003), maxx = q(X, 0.997), miny = q(Y, 0.003), maxy = q(Y, 0.997);
    const w = maxx - minx, h = maxy - miny;
    minx -= w * 0.02; maxx += w * 0.02; miny -= h * 0.02; maxy += h * 0.02;
    return { minx, miny, maxx, maxy };
  }

  P.dxf = { read, aci };
})();
