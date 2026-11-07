/* Pro-2D+3D 2027 — vector PDF plan export (own minimal PDF 1.7 writer).
 * Geometry is vector at a standard scale (1:20 … 1:2000). Thai text in the title block is embedded as an image
 * (base-14 PDF fonts have no Thai glyphs); Latin text and dimensions are vector.
 */
(function () {
  const P23 = window.P23, M = P23.model, G = P23.geom;
  const PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };
  const SCALES = [20, 50, 75, 100, 150, 200, 250, 300, 500, 750, 1000, 2000, 5000];
  const PT = 72 / 25.4;

  function jpegFromCanvas(cv) {
    const b64 = cv.toDataURL("image/jpeg", 0.92).split(",")[1], bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return { w: cv.width, h: cv.height, bytes: u };
  }
  function textImage(s, px, bold) {
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    const font = (bold ? "700 " : "500 ") + px + 'px "IBM Plex Sans Thai","Inter",sans-serif';
    ctx.font = font; const w = Math.ceil(ctx.measureText(s).width) + 8, h = Math.ceil(px * 1.5);
    cv.width = w; cv.height = h; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.font = font; ctx.fillStyle = "#000"; ctx.textBaseline = "middle"; ctx.fillText(s, 4, h / 2);
    return jpegFromCanvas(cv);
  }
  function logoImage() {
    try {
      const img = document.querySelector(".logo-tile img"); if (!img || !img.naturalWidth) return null;
      const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0);
      return jpegFromCanvas(cv);
    } catch (e) { return null; } // tainted canvas when opened from file://
  }

  function exportPDF(paperName) {
    const [PW, PH] = PAPER[paperName] || PAPER.A3;
    const doc = M.doc, b = M.bounds(); if (!b) return null;
    const margin = 10, tbH = 30, areaW = PW - 2 * margin - 10, areaH = PH - 2 * margin - tbH - 10;
    const pad = 1.5, bw = b.x1 - b.x0 + pad * 2, bh = b.y1 - b.y0 + pad * 2;
    const scale = SCALES.find((s) => (bw * 1000) / s <= areaW && (bh * 1000) / s <= areaH) || SCALES[SCALES.length - 1];
    const k = 1000 / scale; // mm on paper per metre
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, ox = margin + 5 + areaW / 2, oy = margin + tbH + 5 + areaH / 2;
    const X = (x) => ((ox + (x - cx) * k) * PT).toFixed(2), Y = (y) => ((oy + (y - cy) * k) * PT).toFixed(2);
    const mm = (v) => (v * PT).toFixed(2);
    const c = [], images = [];
    const op = (s) => c.push(s);
    const poly = (pts) => { op(pts.map((p, i) => X(p.x) + " " + Y(p.y) + (i ? " l" : " m")).join(" ") + " h"); };
    const seg = (a, bb) => op(X(a.x) + " " + Y(a.y) + " m " + X(bb.x) + " " + Y(bb.y) + " l S");
    const esc = (s) => s.replace(/[\\()]/g, (m) => "\\" + m);
    const ascii = (s) => /^[\x20-\x7e]*$/.test(s);
    const text = (s, xmm, ymm, size, opts) => {
      opts = opts || {};
      if (!ascii(s)) {
        const im = textImage(s, 64, opts.bold); images.push(im);
        const hmm = size / PT * 1.5, wmm = hmm * im.w / im.h;
        const x0 = opts.center ? xmm - wmm / 2 : xmm;
        op(`q ${mm(wmm)} 0 0 ${mm(hmm)} ${mm(x0)} ${mm(ymm - hmm * 0.3)} cm /Im${images.length} Do Q`); return;
      }
      const w = s.length * size * 0.5 / PT; // rough width (mm) for centering
      const r = (opts.rot || 0) * Math.PI / 180, cs = Math.cos(r).toFixed(4), sn = Math.sin(r).toFixed(4);
      let x = xmm, y = ymm; if (opts.center) { x -= Math.cos(r) * w / 2; y -= Math.sin(r) * w / 2; }
      op(`BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${cs} ${sn} ${(-Math.sin(r)).toFixed(4)} ${cs} ${mm(x)} ${mm(y)} Tm (${esc(s)}) Tj ET`);
    };

    op("1 J 1 j");
    // reference drawing
    if (doc.refs.lines.length) { op("0.6 G 0.2 w"); for (const l of doc.refs.lines) op(X(l[0]) + " " + Y(l[1]) + " m " + X(l[2]) + " " + Y(l[3]) + " l"); op("S"); }
    // walls: 2-pass fill (black outline, grey poché) → clean joints
    const ed = window.P23.Editor2D.prototype, walls = doc.walls;
    const info = walls.map((w) => ({ w, ja: G.joined(w.a, w, walls), jb: G.joined(w.b, w, walls) }));
    const e1 = 0.25 / k; // 0.25 mm outline
    op("0 g"); for (const it of info) { poly(ed.wallRect(it.w, it.w.t / 2 + e1, it.ja ? it.w.t / 2 + e1 : e1, it.jb ? it.w.t / 2 + e1 : e1)); op("f"); }
    op("0.78 g"); for (const it of info) { poly(ed.wallRect(it.w, Math.max(it.w.t / 2 - e1, e1 / 4), it.ja ? it.w.t / 2 - e1 : -e1, it.jb ? it.w.t / 2 - e1 : -e1)); op("f"); }
    // openings
    for (const o of doc.openings) {
      const w = M.wall(o.wall); if (!w) continue;
      const L = G.len(w.a, w.b), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }, n = { x: -u.y, y: u.x }, t = w.t;
      const at = (s, q) => ({ x: w.a.x + u.x * s + n.x * q, y: w.a.y + u.y * s + n.y * q });
      const s0 = o.pos - o.w / 2, s1 = o.pos + o.w / 2;
      op("1 g"); poly([at(s0, t / 2 + e1 * 1.5), at(s1, t / 2 + e1 * 1.5), at(s1, -t / 2 - e1 * 1.5), at(s0, -t / 2 - e1 * 1.5)]); op("f");
      op("0 G 0.5 w"); seg(at(s0, t / 2), at(s0, -t / 2)); seg(at(s1, t / 2), at(s1, -t / 2));
      if (o.kind === "window") { op("0.35 w"); for (const q of [-t / 2, 0, t / 2]) seg(at(s0, q), at(s1, q)); }
      else {
        const side = o.flip ? -1 : 1, H = at(o.flip ? s1 : s0, side * t / 2), tip = { x: H.x + n.x * side * o.w, y: H.y + n.y * side * o.w };
        const cl = at(o.flip ? s0 : s1, side * t / 2);
        op("0.45 w"); seg(H, tip);
        const a0 = Math.atan2(tip.y - H.y, tip.x - H.x); let a1 = Math.atan2(cl.y - H.y, cl.x - H.x), d = a1 - a0;
        while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        op("[1.5 1.5] 0 d 0.25 w"); const pts = [];
        for (let i = 0; i <= 18; i++) { const a = a0 + (d * i) / 18; pts.push({ x: H.x + Math.cos(a) * o.w, y: H.y + Math.sin(a) * o.w }); }
        op(pts.map((p, i) => X(p.x) + " " + Y(p.y) + (i ? " l" : " m")).join(" ") + " S [] 0 d");
      }
    }
    // dimensions
    op("0 G 0 g 0.25 w");
    for (const d of doc.dims) {
      const L = G.len(d.a, d.b); if (L < 1e-6) continue;
      const u = { x: (d.b.x - d.a.x) / L, y: (d.b.y - d.a.y) / L }, n = { x: -u.y, y: u.x };
      const A = { x: d.a.x + n.x * d.off, y: d.a.y + n.y * d.off }, B = { x: d.b.x + n.x * d.off, y: d.b.y + n.y * d.off };
      seg(d.a, A); seg(d.b, B); seg(A, B);
      const tk = 1.2 / k; op("0.5 w");
      for (const Q of [A, B]) seg({ x: Q.x - (u.x + n.x) * tk, y: Q.y - (u.y + n.y) * tk }, { x: Q.x + (u.x + n.x) * tk, y: Q.y + (u.y + n.y) * tk });
      op("0.25 w");
      let rot = Math.atan2(u.y, u.x) * 180 / Math.PI, sgn = 1; if (rot > 90 || rot <= -90) { rot += 180; sgn = -1; }
      const mid = { x: (A.x + B.x) / 2 + n.x * sgn * 1.0 / k, y: (A.y + B.y) / 2 + n.y * sgn * 1.0 / k };
      text(L.toFixed(2), ox + (mid.x - cx) * k, oy + (mid.y - cy) * k, 7, { center: true, rot });
    }
    // frame + title block
    op("0 G 0.7 w"); op(`${mm(margin)} ${mm(margin)} ${mm(PW - 2 * margin)} ${mm(PH - 2 * margin)} re S`);
    const tx = margin, ty = margin, tw = PW - 2 * margin;
    op("0.5 w"); op(`${mm(tx)} ${mm(ty + tbH)} m ${mm(tx + tw)} ${mm(ty + tbH)} l S`);
    const cols = [0, 70, tw - 190, tw - 120, tw - 60, tw];
    for (const cxm of cols.slice(1, -1)) op(`${mm(tx + cxm)} ${mm(ty)} m ${mm(tx + cxm)} ${mm(ty + tbH)} l S`);
    const logo = logoImage();
    if (logo) { images.push(logo); const lh = tbH - 6, lw = Math.min(60, lh * logo.w / logo.h); op(`q ${mm(lw)} 0 0 ${mm(lh)} ${mm(tx + 5)} ${mm(ty + 3)} cm /Im${images.length} Do Q`); }
    else text("PRO-CON", tx + 8, ty + 13, 14, { bold: true });
    const L2 = (s, x, y, sz, bold) => text(s, tx + x, ty + y, sz, { bold });
    L2("PROJECT", 75, tbH - 7, 6); L2(doc.name || "Untitled", 75, tbH - 17, 12, true);
    L2("Pro-2D+3D 2027  |  PRO CONSTRUCTION & DESIGN CO.,LTD.", 75, 5, 6.5);
    L2("DRAWING", cols[2] + 5, tbH - 7, 6); L2("FLOOR PLAN", cols[2] + 5, tbH - 17, 11, true);
    L2("SCALE", cols[3] + 5, tbH - 7, 6); L2("1:" + scale, cols[3] + 5, tbH - 17, 11, true); L2(paperName || "A3", cols[3] + 5, 5, 6.5);
    L2("DATE", cols[4] + 5, tbH - 7, 6); L2(new Date().toISOString().slice(0, 10), cols[4] + 5, tbH - 17, 9, true); L2("SHEET A-101", cols[4] + 5, 5, 6.5);
    // north arrow
    const nx = PW - margin - 16, ny = PH - margin - 18;
    op(`0 G 0.4 w ${mm(nx)} ${mm(ny)} m ${mm(nx - 4)} ${mm(ny - 8)} l ${mm(nx)} ${mm(ny - 5)} l ${mm(nx + 4)} ${mm(ny - 8)} l h B`);
    text("N", nx - 1.4, ny + 2, 9, { bold: true });

    return { bytes: buildPDF(PW * PT, PH * PT, c.join("\n"), images), scale };
  }

  function buildPDF(w, h, content, images) {
    const enc = new TextEncoder(), chunks = [], offs = [];
    let len = 0;
    const put = (x) => { const u = typeof x === "string" ? enc.encode(x) : x; chunks.push(u); len += u.length; };
    const obj = (n, body) => { offs[n] = len; put(n + " 0 obj\n"); body(); put("\nendobj\n"); };
    put("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
    const xo = images.map((_, i) => `/Im${i + 1} ${7 + i} 0 R`).join(" ");
    obj(1, () => put("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => put("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
    obj(3, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << ${xo} >> >> >>`));
    const cb = enc.encode(content);
    obj(4, () => { put(`<< /Length ${cb.length} >>\nstream\n`); put(cb); put("\nendstream"); });
    obj(5, () => put("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
    obj(6, () => put("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
    images.forEach((im, i) => obj(7 + i, () => {
      put(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`);
      put(im.bytes); put("\nendstream");
    }));
    const n = 7 + images.length, xref = len;
    put(`xref\n0 ${n}\n0000000000 65535 f \n`);
    for (let i = 1; i < n; i++) put(String(offs[i]).padStart(10, "0") + " 00000 n \n");
    put(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len); let p = 0; for (const u of chunks) { out.set(u, p); p += u.length; }
    return out;
  }

  P23.pdf = { exportPDF };
})();
