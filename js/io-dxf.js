/* Pro-2D+3D 2027 — DXF reader / writer (own implementation, no third-party code).
 * Reader: ASCII DXF of any release (R12 … AC1032 = AutoCAD 2018–2026). Handles LINE, LWPOLYLINE, POLYLINE,
 *         CIRCLE, ARC, ELLIPSE, SPLINE (approx.), TEXT, MTEXT, INSERT (blocks, nested, arrays), DIMENSION (via its block).
 *         Files written by Pro-2D+3D come back as editable walls/doors/windows/dimensions (P23 XDATA).
 * Writer: AutoCAD R12 DXF (AC1009) in millimetres — opens in every AutoCAD release incl. 2026.
 */
(function () {
  const P23 = window.P23, M = P23.model, G = P23.geom;
  const ACADVER_NAMES = { AC1009: "R12", AC1012: "R13", AC1014: "R14", AC1015: "2000", AC1018: "2004", AC1021: "2007", AC1024: "2010", AC1027: "2013", AC1032: "2018–2026" };
  const UNIT = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };

  /* ================= READ ================= */
  function decode(buf) {
    const bytes = new Uint8Array(buf);
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 22)));
    if (head.startsWith("AutoCAD Binary DXF")) throw new Error("Binary DXF — please save as ASCII DXF");
    const sniff = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 300000)));
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
  function pairs(text) {
    const L = text.split(/\r\n|\r|\n/), out = [];
    for (let i = 0; i + 1 < L.length; i += 2) {
      const code = parseInt(L[i], 10); if (isNaN(code)) { i--; continue; }
      out.push([code, L[i + 1]]);
    }
    return out;
  }
  const unesc = (s) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  function cleanMText(s) {
    return unesc(s).replace(/\\P/g, " ").replace(/\\[ACcFfHhLlOoQqTtWw][^;\\{}]*;?/g, "").replace(/\\S([^;]*)[\^#/]([^;]*);/g, "$1/$2")
      .replace(/\\~/g, " ").replace(/[{}]/g, "").replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").trim();
  }

  /** Group the pair stream into sections → entities {type, g:[[code,val]...]} */
  function structure(ps) {
    const res = { header: {}, blocks: {}, entities: [] };
    let i = 0;
    const readEntities = (stopAt) => {
      const list = [];
      while (i < ps.length) {
        const [c, v] = ps[i];
        if (c === 0 && stopAt.includes(v.trim())) break;
        if (c === 0) {
          const ent = { type: v.trim(), g: [] }; i++;
          while (i < ps.length && ps[i][0] !== 0) { ent.g.push(ps[i]); i++; }
          list.push(ent);
        } else i++;
      }
      // attach VERTEX to POLYLINE
      const out = [];
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.type === "POLYLINE") {
          e.verts = [];
          while (k + 1 < list.length && list[k + 1].type === "VERTEX") e.verts.push(list[++k]);
          if (k + 1 < list.length && list[k + 1].type === "SEQEND") k++;
        }
        if (e.type === "INSERT") { while (k + 1 < list.length && (list[k + 1].type === "ATTRIB")) out.push(list[++k]); if (k + 1 < list.length && list[k + 1].type === "SEQEND") k++; }
        out.push(e);
      }
      return out;
    };
    while (i < ps.length) {
      const [c, v] = ps[i];
      if (c === 0 && v.trim() === "SECTION") {
        const name = (ps[i + 1] || [])[1].trim(); i += 2;
        if (name === "HEADER") {
          let cur = null;
          while (i < ps.length && !(ps[i][0] === 0 && ps[i][1].trim() === "ENDSEC")) {
            if (ps[i][0] === 9) cur = ps[i][1].trim(); else if (cur) (res.header[cur] = res.header[cur] || []).push(ps[i]);
            i++;
          }
        } else if (name === "BLOCKS") {
          while (i < ps.length && !(ps[i][0] === 0 && ps[i][1].trim() === "ENDSEC")) {
            if (ps[i][0] === 0 && ps[i][1].trim() === "BLOCK") {
              i++; const g = [];
              while (i < ps.length && ps[i][0] !== 0) { g.push(ps[i]); i++; }
              const name2 = (g.find((p) => p[0] === 2) || [, ""])[1].trim();
              const bx = num(g, 10), by = num(g, 20);
              const ents = readEntities(["ENDBLK"]);
              res.blocks[name2.toUpperCase()] = { base: { x: bx, y: by }, ents };
            } else i++;
          }
        } else if (name === "ENTITIES") {
          res.entities = readEntities(["ENDSEC"]);
        } else {
          while (i < ps.length && !(ps[i][0] === 0 && ps[i][1].trim() === "ENDSEC")) i++;
        }
      }
      i++;
    }
    return res;
  }
  function num(g, code, def) { const p = g.find((q) => q[0] === code); const v = p ? parseFloat(p[1]) : NaN; return isNaN(v) ? (def || 0) : v; }
  function str(g, code) { const p = g.find((q) => q[0] === code); return p ? p[1].trim() : ""; }
  function xdata(g) {
    const k = g.findIndex((p) => p[0] === 1001 && p[1].trim().toUpperCase() === "P23");
    if (k < 0) return null;
    const vals = [];
    for (let j = k + 1; j < g.length && g[j][0] !== 1001; j++) vals.push(g[j][0] === 1000 ? g[j][1].trim() : parseFloat(g[j][1]));
    return vals;
  }

  /* affine transforms {a,b,c,d,e,f}: x' = a x + c y + e, y' = b x + d y + f */
  const I = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const mul = (m, n) => ({ a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f });
  const ap = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

  function readDXF(buf) {
    const { text, ver } = decode(buf);
    const S = structure(pairs(text));
    const insu = S.header.$INSUNITS ? parseInt(S.header.$INSUNITS[0][1], 10) : 0;
    // written by Pro-2D+3D (directly, or round-tripped through DWG where the header comment is lost)
    const p23file = /Pro-2D\+3D 2027/.test(text.slice(0, 400)) || /\r?\n\s*1001\r?\nP23\r?\n\s*1000\r?\nWALL/.test(text);
    const out = { lines: [], texts: [], walls: [], openings: [], dims: [], ver: ACADVER_NAMES[ver] || ver, p23: false };
    const MAXL = 400000;
    const seg = (m, x1, y1, x2, y2) => { if (out.lines.length >= MAXL) return; const p = ap(m, x1, y1), q = ap(m, x2, y2); out.lines.push([p[0], p[1], q[0], q[1]]); };
    const polyArc = (m, cx, cy, r, a0, a1) => { // radians, CCW a0→a1
      while (a1 < a0) a1 += Math.PI * 2;
      const n = Math.max(4, Math.min(96, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 64)));
      let px = cx + r * Math.cos(a0), py = cy + r * Math.sin(a0);
      for (let k = 1; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); seg(m, px, py, x, y); px = x; py = y; }
    };
    const bulgeSeg = (m, x1, y1, x2, y2, b) => {
      if (!b) return seg(m, x1, y1, x2, y2);
      const th = 4 * Math.atan(b), dx = x2 - x1, dy = y2 - y1, c = Math.hypot(dx, dy); if (c < 1e-12) return;
      const r = c / (2 * Math.sin(th / 2)), h = r * Math.cos(th / 2);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, nx = -dy / c, ny = dx / c;
      const cx = mx + nx * h, cy = my + ny * h;
      let a0 = Math.atan2(y1 - cy, x1 - cx), a1 = Math.atan2(y2 - cy, x2 - cx);
      if (b > 0) polyArc(m, cx, cy, Math.abs(r), a0, a1); else polyArc(m, cx, cy, Math.abs(r), a1, a0);
    };
    const ocs = (g, m) => (num(g, 230, 1) < 0 ? mul(m, { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }) : m);
    const scaleOf = (m) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    const rotOf = (m) => Math.atan2(m.b, m.a) * 180 / Math.PI;
    const addText = (m, x, y, h, s, r) => { if (!s) return; const p = ap(m, x, y); out.texts.push({ x: p[0], y: p[1], h: h * scaleOf(m), s, r: (r || 0) + rotOf(m) }); };

    function emit(e, m, depth) {
      const g = e.g, layer = str(g, 8).toUpperCase();
      if (layer.startsWith("P23-") && e.type === "LINE") {
        const xd = xdata(g);
        if (xd) {
          const a = { x: num(g, 10), y: num(g, 20) }, b = { x: num(g, 11), y: num(g, 21) };
          if (xd[0] === "WALL") out.walls.push({ a, b, t: xd[1], h: xd[2] });
          else if (xd[0] === "DOOR" || xd[0] === "WINDOW") out.openings.push({ a, b, kind: xd[0].toLowerCase(), h: xd[1], sill: xd[2], flip: !!xd[3] });
          else if (xd[0] === "DIM") out.dims.push({ a, b, off: xd[1] });
          out.p23 = true; return;
        }
      }
      if (p23file && layer.startsWith("P23-")) return; // hidden data layers never become reference lines
      if (p23file && /^A-(WALL|DOOR|GLAZ|DIMS)$/.test(layer)) return; // visual copies of P23 objects
      switch (e.type) {
        case "LINE": seg(m, num(g, 10), num(g, 20), num(g, 11), num(g, 21)); break;
        case "LWPOLYLINE": {
          const mm = ocs(g, m), pts = []; let cur = null;
          for (const [c, v] of g) {
            if (c === 10) { cur = { x: parseFloat(v), y: 0, b: 0 }; pts.push(cur); }
            else if (c === 20 && cur) cur.y = parseFloat(v); else if (c === 42 && cur) cur.b = parseFloat(v);
          }
          const closed = (num(g, 70) & 1) === 1;
          for (let k = 0; k < pts.length - 1; k++) bulgeSeg(mm, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, pts[k].b);
          if (closed && pts.length > 2) { const l = pts[pts.length - 1]; bulgeSeg(mm, l.x, l.y, pts[0].x, pts[0].y, l.b); }
          break;
        }
        case "POLYLINE": {
          const pts = (e.verts || []).map((v) => ({ x: num(v.g, 10), y: num(v.g, 20), b: num(v.g, 42) }));
          const closed = (num(g, 70) & 1) === 1, mm = ocs(g, m);
          for (let k = 0; k < pts.length - 1; k++) bulgeSeg(mm, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, pts[k].b);
          if (closed && pts.length > 2) { const l = pts[pts.length - 1]; bulgeSeg(mm, l.x, l.y, pts[0].x, pts[0].y, l.b); }
          break;
        }
        case "CIRCLE": polyArc(ocs(g, m), num(g, 10), num(g, 20), num(g, 40), 0, Math.PI * 2); break;
        case "ARC": polyArc(ocs(g, m), num(g, 10), num(g, 20), num(g, 40), num(g, 50) * Math.PI / 180, num(g, 51) * Math.PI / 180); break;
        case "ELLIPSE": {
          const cx = num(g, 10), cy = num(g, 20), mx = num(g, 11), my = num(g, 21), ratio = num(g, 40, 1);
          let t0 = num(g, 41, 0), t1 = num(g, 42, Math.PI * 2); while (t1 <= t0) t1 += Math.PI * 2;
          const n = 64, ex = -my * ratio, ey = mx * ratio; let px, py;
          for (let k = 0; k <= n; k++) {
            const t = t0 + ((t1 - t0) * k) / n, x = cx + mx * Math.cos(t) + ex * Math.sin(t), y = cy + my * Math.cos(t) + ey * Math.sin(t);
            if (k) seg(m, px, py, x, y); px = x; py = y;
          }
          break;
        }
        case "SPLINE": {
          let xs = g.filter((p) => p[0] === 11).map((p) => parseFloat(p[1])), ys = g.filter((p) => p[0] === 21).map((p) => parseFloat(p[1]));
          if (xs.length < 2) { xs = g.filter((p) => p[0] === 10).map((p) => parseFloat(p[1])); ys = g.filter((p) => p[0] === 20).map((p) => parseFloat(p[1])); }
          for (let k = 0; k < xs.length - 1; k++) seg(m, xs[k], ys[k], xs[k + 1], ys[k + 1]);
          break;
        }
        case "TEXT": case "ATTRIB": {
          if (e.type === "ATTRIB" && (num(g, 70) & 1)) break; // invisible
          const al = num(g, 72) || num(g, 73);
          const x = al ? num(g, 11, num(g, 10)) : num(g, 10), y = al ? num(g, 21, num(g, 20)) : num(g, 20);
          addText(ocs(g, m), x, y, num(g, 40, 1), cleanMText(str(g, 1)), num(g, 50)); break;
        }
        case "MTEXT": {
          const s = g.filter((p) => p[0] === 3).map((p) => p[1]).join("") + str(g, 1);
          let r = num(g, 50); if (!r && g.some((p) => p[0] === 11)) r = Math.atan2(num(g, 21), num(g, 11)) * 180 / Math.PI;
          addText(m, num(g, 10), num(g, 20), num(g, 40, 1), cleanMText(s), r); break;
        }
        case "INSERT": case "DIMENSION": {
          if (depth > 10) break;
          const blk = S.blocks[str(g, 2).toUpperCase()]; if (!blk) break;
          if (e.type === "DIMENSION") { for (const be of blk.ents) emit(be, m, depth + 1); break; }
          const sx = num(g, 41, 1), sy = num(g, 42, 1), rot = num(g, 50) * Math.PI / 180;
          const cols = Math.max(1, Math.min(100, num(g, 70, 1))), rows = Math.max(1, Math.min(100, num(g, 71, 1)));
          const dc = num(g, 44), dr = num(g, 45);
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const ox = c * dc, oy = r * dr;
            const cs = Math.cos(rot), sn = Math.sin(rot);
            let t = { a: cs * sx, b: sn * sx, c: -sn * sy, d: cs * sy, e: num(g, 10) + cs * ox - sn * oy, f: num(g, 20) + sn * ox + cs * oy };
            t = mul(t, { a: 1, b: 0, c: 0, d: 1, e: -blk.base.x, f: -blk.base.y });
            const mm = mul(ocs(g, m), t);
            for (const be of blk.ents) emit(be, mm, depth + 1);
          }
          break;
        }
        default: break;
      }
    }
    for (const e of S.entities) emit(e, I, 0);

    // units → metres
    let k = UNIT[insu];
    if (!k) {
      if (p23file) k = 0.001;
      else {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const l of out.lines) { x0 = Math.min(x0, l[0], l[2]); x1 = Math.max(x1, l[0], l[2]); y0 = Math.min(y0, l[1], l[3]); y1 = Math.max(y1, l[1], l[3]); }
        k = Math.max(x1 - x0, y1 - y0) > 1000 ? 0.001 : 1;
      }
    }
    out.unit = k;
    if (k !== 1) {
      for (const l of out.lines) { l[0] *= k; l[1] *= k; l[2] *= k; l[3] *= k; }
      for (const t of out.texts) { t.x *= k; t.y *= k; t.h *= k; }
      for (const w of out.walls) { w.a.x *= k; w.a.y *= k; w.b.x *= k; w.b.y *= k; w.t *= k; w.h *= k; }
      for (const o of out.openings) { o.a.x *= k; o.a.y *= k; o.b.x *= k; o.b.y *= k; o.h *= k; o.sill *= k; }
      for (const d of out.dims) { d.a.x *= k; d.a.y *= k; d.b.x *= k; d.b.y *= k; d.off *= k; }
    }
    return out;
  }

  /** Load a parsed DXF into the model (replaces the current document). */
  function importDXF(buf, fileName) {
    const r = readDXF(buf);
    const doc = { name: fileName.replace(/\.[^.]+$/, ""), walls: [], openings: [], dims: [], refs: { lines: r.lines, texts: r.texts } };
    for (const w of r.walls) doc.walls.push({ id: M.uid("w"), a: w.a, b: w.b, t: w.t || 0.2, h: w.h || 3 });
    for (const o of r.openings) {
      const mid = { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 };
      let best = null, bd = 0.01;
      for (const w of doc.walls) { const pr = G.project(mid, w.a, w.b); if (pr.d < bd) { bd = pr.d; best = { w, pr }; } }
      if (best) doc.openings.push({ id: M.uid("o"), wall: best.w.id, kind: o.kind, pos: best.pr.along, w: G.len(o.a, o.b), h: o.h, sill: o.sill, flip: o.flip });
    }
    for (const d of r.dims) doc.dims.push({ id: M.uid("d"), a: d.a, b: d.b, off: d.off });
    M.refModel = null;
    M.load(doc);
    return r;
  }

  /* ================= WRITE (R12, millimetres) ================= */
  function faceSegments(w, walls, openings) {
    // returns line segments (metres) for both faces, end caps and jambs, trimmed at joints
    const L = G.len(w.a, w.b); if (L < 1e-6) return [];
    const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }, n = { x: -u.y, y: u.x }, h = w.t / 2;
    const segs = [];
    const endInfo = (P, outward) => {
      // walls sharing endpoint P
      const others = walls.filter((o) => o !== w && (G.eq(o.a, P) || G.eq(o.b, P)));
      const tees = walls.filter((o) => o !== w && !G.eq(o.a, P) && !G.eq(o.b, P) && (() => { const pr = G.project(P, o.a, o.b); return pr.d < 1e-3 && pr.t > 0 && pr.t < 1; })());
      return { others, tees };
    };
    const lineInt = (p, d, q, e) => { const den = d.x * e.y - d.y * e.x; if (Math.abs(den) < 1e-9) return null; return ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den; };
    const extFor = (side, atB) => {
      const P = atB ? w.b : w.a, out = atB ? u : { x: -u.x, y: -u.y }, info = endInfo(P);
      const faceP = { x: P.x + n.x * h * side, y: P.y + n.y * h * side };
      if (info.tees.length) { const o = info.tees[0]; return -o.t / 2 / Math.max(0.2, Math.abs(crossDir(u, o))); }
      if (info.others.length === 1) {
        const o = info.others[0], oL = G.len(o.a, o.b), oP = G.eq(o.a, P) ? o.a : o.b, oQ = oP === o.a ? o.b : o.a;
        const od = { x: (oQ.x - oP.x) / oL, y: (oQ.y - oP.y) / oL }, on = { x: -od.y, y: od.x };
        const cands = [1, -1].map((s2) => lineInt(faceP, out, { x: oP.x + on.x * o.t / 2 * s2, y: oP.y + on.y * o.t / 2 * s2 }, od)).filter((v) => v != null);
        if (cands.length === 2) { const outer = (n.x * side * od.x + n.y * side * od.y) < 0; return outer ? Math.max(...cands) : Math.min(...cands); }
      }
      return info.others.length > 1 ? h : 0; // collinear continuation → 0; 3+ walls → overlap
    };
    const crossDir = (a, o) => { const oL = G.len(o.a, o.b) || 1; return (a.x * (o.b.y - o.a.y) - a.y * (o.b.x - o.a.x)) / oL; };
    const ops = G.openingsOf(w, openings);
    for (const side of [1, -1]) {
      const eA = extFor(side, false), eB = extFor(side, true);
      // excluded intervals on this face: openings + T-stems arriving on this side
      const ex = ops.map((o) => [o.pos - o.w / 2, o.pos + o.w / 2]);
      for (const o of walls) {
        if (o === w) continue;
        for (const P of [o.a, o.b]) {
          const pr = G.project(P, w.a, w.b);
          if (pr.d < 1e-3 && pr.t > 0 && pr.t < 1) {
            const Q = P === o.a ? o.b : o.a, s = (Q.x - P.x) * n.x + (Q.y - P.y) * n.y;
            if (Math.sign(s) === side) { const half = o.t / 2 / Math.max(0.2, Math.abs(crossDir(u, o))); ex.push([pr.along - half, pr.along + half]); }
          }
        }
      }
      ex.sort((p, q) => p[0] - q[0]);
      let cur = -eA; const end = L + eB;
      const off = (s) => ({ x: w.a.x + u.x * s + n.x * h * side, y: w.a.y + u.y * s + n.y * h * side });
      for (const [s0, s1] of ex) { if (s0 > cur + 1e-6) segs.push([off(cur), off(Math.min(s0, end))]); cur = Math.max(cur, s1); }
      if (end > cur + 1e-6) segs.push([off(cur), off(end)]);
    }
    const cap = (s) => [{ x: w.a.x + u.x * s + n.x * h, y: w.a.y + u.y * s + n.y * h }, { x: w.a.x + u.x * s - n.x * h, y: w.a.y + u.y * s - n.y * h }];
    if (!G.joined(w.a, w, walls)) segs.push(cap(0));
    if (!G.joined(w.b, w, walls)) segs.push(cap(L));
    for (const o of ops) { segs.push(cap(o.pos - o.w / 2)); segs.push(cap(o.pos + o.w / 2)); }
    return segs;
  }

  function exportDXF() {
    const doc = M.doc, K = 1000; // metres → mm
    const f = (v) => { const s = (v * K).toFixed(3); return s.replace(/\.?0+$/, "") || "0"; };
    const out = [];
    const P = (c, v) => out.push(String(c), String(v));
    const enc = (s) => String(s).replace(/[^\x20-\x7e]/g, (ch) => "\\U+" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
    const line = (layer, a, b) => {
      P(0, "LINE"); P(8, layer); P(10, f(a.x)); P(20, f(a.y)); P(30, 0); P(11, f(b.x)); P(21, f(b.y)); P(31, 0);
    };
    const text = (layer, p, h, s, rotDeg, center) => {
      P(0, "TEXT"); P(8, layer); P(10, f(p.x)); P(20, f(p.y)); P(30, 0); P(40, f(h)); P(1, enc(s)); if (rotDeg) P(50, rotDeg.toFixed(4));
      if (center) { P(72, 1); P(11, f(p.x)); P(21, f(p.y)); P(31, 0); }
    };
    const arc = (layer, c, r, a0, a1) => { P(0, "ARC"); P(8, layer); P(10, f(c.x)); P(20, f(c.y)); P(30, 0); P(40, f(r)); P(50, a0.toFixed(4)); P(51, a1.toFixed(4)); };

    const b = M.bounds() || { x0: 0, y0: 0, x1: 10, y1: 10 };
    P(999, "Pro-2D+3D 2027 DXF export, units=mm");
    P(0, "SECTION"); P(2, "HEADER");
    P(9, "$ACADVER"); P(1, "AC1009");
    P(9, "$INSBASE"); P(10, 0); P(20, 0); P(30, 0);
    P(9, "$EXTMIN"); P(10, f(b.x0 - 1)); P(20, f(b.y0 - 1)); P(30, 0);
    P(9, "$EXTMAX"); P(10, f(b.x1 + 1)); P(20, f(b.y1 + 1)); P(30, 0);
    P(9, "$LUNITS"); P(70, 2); P(9, "$LUPREC"); P(70, 0);
    P(0, "ENDSEC");
    const layers = [["0", 7, 0], ["A-WALL", 7, 0], ["A-DOOR", 3, 0], ["A-GLAZ", 4, 0], ["A-DIMS", 2, 0], ["REF", 8, 0], ["P23-WALL", 8, 1], ["P23-OPEN", 8, 1], ["P23-DIM", 8, 1]];
    P(0, "SECTION"); P(2, "TABLES");
    P(0, "TABLE"); P(2, "LTYPE"); P(70, 1);
    P(0, "LTYPE"); P(2, "CONTINUOUS"); P(70, 0); P(3, "Solid line"); P(72, 65); P(73, 0); P(40, "0.0");
    P(0, "ENDTAB");
    P(0, "TABLE"); P(2, "LAYER"); P(70, layers.length);
    for (const [n, col, fl] of layers) { P(0, "LAYER"); P(2, n); P(70, fl); P(62, col); P(6, "CONTINUOUS"); }
    P(0, "ENDTAB");
    P(0, "TABLE"); P(2, "STYLE"); P(70, 1);
    P(0, "STYLE"); P(2, "STANDARD"); P(70, 0); P(40, "0.0"); P(41, "1.0"); P(50, "0.0"); P(71, 0); P(42, "2.5"); P(3, "txt"); P(4, "");
    P(0, "ENDTAB");
    P(0, "TABLE"); P(2, "APPID"); P(70, 2);
    P(0, "APPID"); P(2, "ACAD"); P(70, 0); P(0, "APPID"); P(2, "P23"); P(70, 0);
    P(0, "ENDTAB");
    P(0, "ENDSEC");

    P(0, "SECTION"); P(2, "ENTITIES");
    const xline = (layer, a, b, tag, reals, ints) => {
      P(0, "LINE"); P(8, layer); P(10, f(a.x)); P(20, f(a.y)); P(30, 0); P(11, f(b.x)); P(21, f(b.y)); P(31, 0);
      P(1001, "P23"); P(1000, tag); for (const v of reals) P(1040, f(v)); for (const v of ints || []) P(1070, v);
    };
    for (const w of doc.walls) {
      for (const [a, c] of faceSegments(w, doc.walls, doc.openings)) line("A-WALL", a, c);
      xline("P23-WALL", w.a, w.b, "WALL", [w.t, w.h]);
    }
    for (const o of doc.openings) {
      const w = M.wall(o.wall); if (!w) continue;
      const L = G.len(w.a, w.b), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }, n = { x: -u.y, y: u.x };
      const at = (s, k) => ({ x: w.a.x + u.x * s + n.x * k, y: w.a.y + u.y * s + n.y * k });
      const s0 = o.pos - o.w / 2, s1 = o.pos + o.w / 2;
      if (o.kind === "window") { for (const k of [-w.t / 2, 0, w.t / 2]) line("A-GLAZ", at(s0, k), at(s1, k)); }
      else {
        const side = o.flip ? -1 : 1, hs = o.flip ? s1 : s0, H = at(hs, side * w.t / 2);
        const tip = { x: H.x + n.x * side * o.w, y: H.y + n.y * side * o.w };
        line("A-DOOR", H, tip);
        const angTip = Math.atan2(tip.y - H.y, tip.x - H.x) * 180 / Math.PI;
        const closed = at(o.flip ? s0 : s1, side * w.t / 2), angC = Math.atan2(closed.y - H.y, closed.x - H.x) * 180 / Math.PI;
        // ARC is CCW from start to end; pick the 90° sweep
        let a0 = angTip, a1 = angC; let d = ((a1 - a0) % 360 + 360) % 360; if (d > 180) { a0 = angC; a1 = angTip; }
        arc("A-DOOR", H, o.w, (a0 + 360) % 360, (a1 + 360) % 360);
      }
      xline("P23-OPEN", at(s0, 0), at(s1, 0), o.kind.toUpperCase(), [o.h, o.sill], [o.flip ? 1 : 0]);
    }
    for (const d of doc.dims) {
      const L = G.len(d.a, d.b); if (L < 1e-6) continue;
      const n = { x: -(d.b.y - d.a.y) / L, y: (d.b.x - d.a.x) / L };
      const A = { x: d.a.x + n.x * d.off, y: d.a.y + n.y * d.off }, B = { x: d.b.x + n.x * d.off, y: d.b.y + n.y * d.off };
      line("A-DIMS", d.a, A); line("A-DIMS", d.b, B); line("A-DIMS", A, B);
      const tk = 0.08, ux = (d.b.x - d.a.x) / L, uy = (d.b.y - d.a.y) / L, dx = (ux + n.x) * tk / 1.4142, dy = (uy + n.y) * tk / 1.4142;
      for (const Q of [A, B]) line("A-DIMS", { x: Q.x - dx, y: Q.y - dy }, { x: Q.x + dx, y: Q.y + dy });
      let rot = Math.atan2(uy, ux) * 180 / Math.PI; if (rot > 90 || rot < -90) rot += 180;
      const mid = { x: (A.x + B.x) / 2 + n.x * 0.12 * Math.sign(d.off || 1), y: (A.y + B.y) / 2 + n.y * 0.12 * Math.sign(d.off || 1) };
      text("A-DIMS", mid, 0.15, (L * 1000).toFixed(0), rot, true);
      xline("P23-DIM", d.a, d.b, "DIM", [d.off]);
    }
    for (const l of doc.refs.lines) line("REF", { x: l[0], y: l[1] }, { x: l[2], y: l[3] });
    for (const t of doc.refs.texts) text("REF", t, t.h, t.s, t.r || 0, false);
    P(0, "ENDSEC"); P(0, "EOF");
    return out.join("\r\n") + "\r\n";
  }

  P23.dxf = { readDXF, importDXF, exportDXF, faceSegments };
})();
