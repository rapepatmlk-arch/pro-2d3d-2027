/* Pro-2D+3D 2027 — application shell: navigation, menus, themes, language, properties, files. */
(function () {
  const P23 = window.P23, M = P23.model, G = P23.geom, t = P23.t;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  let editor, view3d, workMode = "split", curView = "hub";

  /* ---------- helpers ---------- */
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 3800); }
  function modal(html) { $("#modalBody").innerHTML = html; $("#modal").classList.add("on"); }
  async function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "application/octet-stream" });
    const native = window.pywebview && window.pywebview.api && window.pywebview.api.save_file;
    if (native) { // desktop program: native "Save as" dialog
      const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.readAsDataURL(blob); });
      return (await window.pywebview.api.save_file(name, b64)) || { ok: false, cancelled: true };
    }
    // iPad / iPhone home-screen app: blob downloads do not work there → share sheet ("Save to Files")
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
    if (ios && standalone && navigator.canShare) {
      const f = new File([blob], name, { type: blob.type || "application/octet-stream" });
      if (navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: name }); return { ok: true, path: name }; }
        catch (e) { if (e && e.name === "AbortError") return { ok: false, cancelled: true }; }
      }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return { ok: true, path: name };
  }
  /** Save a file, then report it (nothing is reported when the user cancels the Save dialog). */
  async function deliver(name, data, mime, msg) {
    const r = await download(name, data, mime);
    if (!r || !r.ok) return false;
    toast(msg + (r.path && r.path !== name ? " → " + r.path : ""));
    return true;
  }
  const baseName = () => (M.doc.name || "Pro2D3D").replace(/[\\/:*?"<>|]+/g, "_");
  const fmt = (v, d) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
  const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- theme & language ---------- */
  function setTheme(th) {
    document.documentElement.dataset.theme = th;
    $$("[data-theme-btn]").forEach((b) => b.classList.toggle("on", b.dataset.themeBtn === th));
    store.set("p23-theme", th);
    if (editor) editor.refreshColors(); if (view3d) { view3d.refreshColors(); view3d.queue(); }
  }

  /* ---------- views ---------- */
  function showView(v, mode) {
    curView = v;
    $$(".view").forEach((s) => s.classList.remove("on"));
    $("#view-" + v).classList.add("on");
    if (v === "work") {
      workMode = mode || workMode;
      const w = $("#view-work"); w.classList.remove("mode-2d", "mode-3d", "mode-split"); w.classList.add("mode-" + workMode);
      $$(".modes .tbtn").forEach((b) => b.classList.toggle("on", b.dataset.cmd === { "2d": "view2d", "3d": "view3d", split: "viewSplit" }[workMode]));
      if (workMode === "3d" && editor.tool !== "select") setTool("select");
      requestAnimationFrame(() => { editor.resize(); view3d.resize(); });
    }
    if (v === "hub") renderRecent();
    const navKey = v === "work" ? workMode : v;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.nav === navKey));
    updateHint();
  }
  function setTool(tl) {
    editor.setTool(tl);
    $$("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === tl));
    updateHint();
  }
  function updateHint() {
    const h = $("#hint2d"); if (h) h.textContent = t("h_" + editor.tool);
    const p3 = $("#pane3d"); if (p3) p3.title = t("h_3d");
  }

  /* ---------- commands ---------- */
  function confirmDiscard() { return !M.dirty || !M.doc.walls.length || window.confirm(t("t_confirm_new")); }
  const cmds = {
    new() { if (!confirmDiscard()) return; M.newDoc(); view3d.setRefModel(null); toast(t("t_new")); showView("work", workMode); editor.fit(); },
    open() { $("#fileInput").click(); },
    async save() {
      const name = baseName() + ".p23", data = M.snapshot();
      if (await deliver(name, data, "application/json", t("t_saved", { f: name }))) { M.dirty = false; addRecent(name, data); updateStatus(); }
    },
    exportDxf() { if (!M.doc.walls.length && !M.doc.refs.lines.length) return toast(t("t_empty")); deliver(baseName() + ".dxf", P23.dxf.exportDXF(), "application/dxf", t("t_dxf_out")); },
    async exportDwg() {
      if (!M.doc.walls.length && !M.doc.refs.lines.length) return toast(t("t_empty"));
      const eng = P23.ext.engine;
      if (!eng.status) await eng.check();
      if (!eng.status || !eng.status.dwg_write) return toast(t("t_need_engine"));
      try {
        toast(t("t_converting", { f: baseName() + ".dwg" }));
        const r = await eng.saveDwg(P23.dxf.exportDXF(), "r2000");
        await deliver(baseName() + ".dwg", new Blob([r.bytes], { type: "application/acad" }), null,
          r.warnings.length ? t("t_dwg_out_warn", { w: r.warnings.join("; ") }) : t("t_dwg_out"));
      } catch (e) { console.error(e); toast(t("t_err", { e: e.message || e })); }
    },
    exportIfc() {
      if (!M.doc.walls.length) return toast(t("t_empty"));
      deliver(baseName() + ".ifc", P23.ifc.exportIFC(), "application/x-step", t("t_ifc_out"));
    },
    async exportObj() {
      if (!M.doc.walls.length) return toast(t("t_empty"));
      view3d.rebuild(); const r = P23.obj.exportOBJ(view3d, baseName());
      if (!(await deliver(baseName() + ".obj", r.obj, "text/plain", t("t_obj_out")))) return;
      await new Promise((ok) => setTimeout(ok, 400));
      await deliver(baseName() + ".mtl", r.mtl, "text/plain", t("t_obj_out"));
    },
    exportPdf() {
      if (!M.doc.walls.length && !M.doc.refs.lines.length) return toast(t("t_empty"));
      const r = P23.pdf.exportPDF($("#pdfPaper").value); if (!r) return toast(t("t_empty"));
      deliver(baseName() + ".pdf", new Blob([r.bytes], { type: "application/pdf" }), null, t("t_pdf_out", { s: r.scale }));
    },
    sample() { if (!confirmDiscard()) return; P23.sampleHouse(); view3d.setRefModel(null); addRecent("Sample house.p23", M.snapshot()); showView("work", "split"); setTimeout(() => { editor.fit(); view3d.fit(); }, 30); },
    undo() { M.undo(); }, redo() { M.redo(); },
    delete() { const s = M.selection; if (!s) return; M.checkpoint(); M.remove(s.kind, s.id); M.changed("app"); },
    clearRefs() { M.checkpoint(); M.doc.refs = { lines: [], texts: [] }; M.doc.underlay = null; M.refModel = null; view3d.setRefModel(null); M.changed("app"); toast(t("t_refs_cleared")); },
    view2d() { showView("work", "2d"); }, view3d() { showView("work", "3d"); }, viewSplit() { showView("work", "split"); },
    fit() { editor.fit(); view3d.fit(); },
    camIso() { view3d.fit(false); }, camTop() { view3d.fit(true); },
    shortcuts() {
      const rows = [["V", t("tl_select")], ["W", t("tl_wall")], ["D", t("tl_door")], ["N", t("tl_window")], ["M", t("tl_dim")], ["F", t("c_fit")], ["Shift", "Ortho"],
        ["Esc", "Cancel"], ["Del", t("c_delete")], ["Ctrl+Z / Ctrl+Y", t("c_undo") + " / " + t("c_redo")], ["Ctrl+S", t("c_save")], ["Ctrl+O", t("c_open")], ["1 / 2 / 3", "2D / 2D|3D / 3D"]];
      modal(`<h3>${t("sc_title")}</h3><table>${rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${escH(r[1])}</td></tr>`).join("")}</table>`);
    },
    about() { modal(`<h3>${t("about_title")}</h3><p><img src="logo.jpg" style="width:220px;background:#fff;border-radius:8px;padding:6px"></p>${t("about_body").split("\n").map((l) => `<p>${escH(l)}</p>`).join("")}`); },
  };
  function run(name) { if (cmds[name]) cmds[name](); }

  /* ---------- files ---------- */
  async function openFile(file) {
    const name = file.name, ext = (name.split(".").pop() || "").toLowerCase();
    try {
      if (ext === "p23" || ext === "json") {
        const doc = JSON.parse(await file.text()); if (doc.format !== "p23") throw new Error("not a .p23 project");
        M.load(doc); M.refModel = null; view3d.setRefModel(null); addRecent(name, M.snapshot());
        showView("work", "split"); setTimeout(cmds.fit, 30); toast(t("t_opened", { f: name }));
      } else if (ext === "dxf") {
        const r = P23.dxf.importDXF(await file.arrayBuffer(), name); view3d.setRefModel(null);
        addRecent(name.replace(/\.dxf$/i, ".p23"), M.snapshot());
        showView("work", r.walls.length ? "split" : "2d"); setTimeout(cmds.fit, 30);
        toast(t("t_dxf_in", { v: r.ver, w: r.walls.length, l: r.lines.length, t: r.texts.length }));
      } else if (ext === "obj") {
        const r = P23.obj.importOBJ(await file.text()); M.refModel = r.group; showView("work", "3d"); setTimeout(() => view3d.setRefModel(r.group), 30);
        toast(t("t_obj_in", { n: r.meshes }));
      } else if (ext === "dwg") {
        toast(t("t_converting", { f: name }));
        const { dxf } = await P23.ext.dwgToDxfAuto(await file.arrayBuffer());
        const r = P23.dxf.importDXF(dxf.buffer.slice(dxf.byteOffset, dxf.byteOffset + dxf.byteLength), name);
        view3d.setRefModel(null); addRecent(name.replace(/\.dwg$/i, ".p23"), M.snapshot());
        showView("work", r.walls.length ? "split" : "2d"); setTimeout(cmds.fit, 30);
        toast(t("t_dwg_in", { v: r.ver, l: r.lines.length, t: r.texts.length }));
      } else if (ext === "skp") {
        toast(t("t_converting", { f: name }));
        const r = await P23.ext.skpToGroup(await file.arrayBuffer());
        M.refModel = r.group; showView("work", "3d"); setTimeout(() => view3d.setRefModel(r.group), 30);
        toast(t("t_skp_in", { n: r.meshes, v: r.version ? " (" + r.version + ")" : "" }));
      }
      else if (ext === "ifc") {
        const buf = await file.arrayBuffer();
        const own = P23.ifc.embeddedModel(new TextDecoder("latin1").decode(buf));
        if (own) {
          M.load(own, own.name || name.replace(/\.ifc$/i, "")); M.refModel = null; view3d.setRefModel(null); addRecent(name.replace(/\.ifc$/i, ".p23"), M.snapshot());
          showView("work", "split"); setTimeout(cmds.fit, 30); toast(t("t_ifc_own", { w: own.walls.length }));
        } else {
          toast(t("t_converting", { f: name }));
          const r = await P23.ifc.ifcToGroup(buf); M.refModel = r.group; showView("work", "3d"); setTimeout(() => view3d.setRefModel(r.group), 30);
          toast(t("t_ifc_in", { s: r.schema, n: r.meshes }));
        }
      }
      else if (ext === "pdf") {
        toast(t("t_converting", { f: name }));
        const pdf = await P23.ext.pdfOpen(await file.arrayBuffer());
        let pg = 1;
        if (pdf.numPages > 1) { pg = parseInt(window.prompt(t("t_pdf_page", { n: pdf.numPages }), "1"), 10); if (!(pg >= 1 && pg <= pdf.numPages)) pg = 1; }
        const scale = parseFloat($("#pdfInScale").value) || 100;
        const ul = await P23.ext.pdfToUnderlay(pdf, pg, scale);
        M.checkpoint(); M.doc.underlay = ul; if (!M.doc.name) M.doc.name = name.replace(/\.pdf$/i, "");
        M.changed("app"); showView("work", workMode === "3d" ? "split" : workMode); setTimeout(() => editor.fit(), 30);
        toast(t("t_pdf_in", { p: pg, n: pdf.numPages, s: scale, w: ul.w.toFixed(1), h: ul.h.toFixed(1) }));
      }
      else toast(t("t_unknown"));
    } catch (e) { console.error(e); toast(t("t_err", { e: e.message || e })); }
  }

  /* ---------- recent files (stored in this browser) ---------- */
  function getRecent() { try { return JSON.parse(store.get("p23-recent", "[]")); } catch (e) { return []; } }
  function addRecent(name, data) {
    let list = getRecent().filter((r) => r.name !== name);
    list.unshift({ name, time: Date.now(), data: data.length < 400000 ? data : null });
    list = list.slice(0, 8);
    store.set("p23-recent", JSON.stringify(list));
  }
  function thumb(data) {
    try {
      const d = JSON.parse(data); if (!d.walls.length) throw 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      d.walls.forEach((w) => [w.a, w.b].forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }));
      const s = Math.min(64 / (x1 - x0 || 1), 50 / (y1 - y0 || 1));
      const ln = d.walls.map((w) => `M${(3 + (w.a.x - x0) * s).toFixed(1)} ${(53 - (w.a.y - y0) * s).toFixed(1)}L${(3 + (w.b.x - x0) * s).toFixed(1)} ${(53 - (w.b.y - y0) * s).toFixed(1)}`).join("");
      return `<svg width="70" height="56" viewBox="0 0 70 56"><path d="${ln}" stroke-width="2.2" stroke-linecap="square"/></svg>`;
    } catch (e) { return `<svg width="50" height="40" viewBox="0 0 50 40"><rect x="4" y="4" width="42" height="32"/></svg>`; }
  }
  function renderRecent() {
    const list = getRecent(), el = $("#recentList");
    if (!list.length) { el.innerHTML = `<div class="empty">${escH(t("recent_empty"))}</div>`; return; }
    const lc = P23.getLang() === "th" ? "th-TH" : "en-GB";
    el.innerHTML = list.map((r, i) => `<button class="file" data-recent="${i}"><div class="thumb">${r.data ? thumb(r.data) : ""}</div><div class="meta"><b>${escH(r.name)}</b><span>${new Date(r.time).toLocaleString(lc, { dateStyle: "medium", timeStyle: "short" })}</span></div></button>`).join("");
    $$("[data-recent]", el).forEach((b) => b.addEventListener("click", () => {
      const r = list[+b.dataset.recent]; if (!r.data) return run("open");
      if (!confirmDiscard()) return;
      M.load(JSON.parse(r.data)); view3d.setRefModel(null); showView("work", "split"); setTimeout(cmds.fit, 30);
    }));
  }

  /* ---------- properties panel ---------- */
  function num(label, key, val, step, min) { return `<label>${escH(t(label))}<input type="number" data-prop="${key}" value="${fmt(val, 3)}" step="${step || 0.01}" min="${min == null ? 0 : min}"></label>`; }
  function renderProps() {
    const el = $("#props"), s = M.selection, obj = s && M.get(s.kind, s.id);
    if (!obj) {
      const q = M.counts();
      el.innerHTML = `<h5>${escH(t("pr_none"))}</h5><p class="muted">${escH(t("pr_none_s"))}</p><div class="sep"></div>
        <h5>${escH(t("pr_doc"))}</h5><label>${escH(t("pr_name"))}<input type="text" data-prop="docname" value="${escH(M.doc.name || "")}" style="width:130px"></label>
        <p class="muted">${escH(t("pr_stats", { w: q.walls, d: q.doors, n: q.wins }))}</p>
        ${M.doc.refs.lines.length ? `<p class="muted">${escH(t("pr_refs", { l: M.doc.refs.lines.length, t: M.doc.refs.texts.length }))}</p>` : ""}`;
    } else if (s.kind === "wall") {
      el.innerHTML = `<h5><span class="kind">${escH(t("k_wall"))}</span></h5>
        ${num("pr_length", "length", G.len(obj.a, obj.b), 0.05, 0.05)}${num("pr_thick", "t", obj.t, 0.01, 0.02)}${num("pr_height", "h", obj.h, 0.1, 0.1)}
        <button class="btn ghost" data-cmd="delete">${escH(t("c_delete"))}</button>`;
    } else if (s.kind === "opening") {
      el.innerHTML = `<h5><span class="kind">${escH(t(obj.kind === "door" ? "k_door" : "k_window"))}</span></h5>
        <label>${escH(t("pr_kind"))}<select data-prop="kind"><option value="door"${obj.kind === "door" ? " selected" : ""}>${escH(t("k_door"))}</option><option value="window"${obj.kind === "window" ? " selected" : ""}>${escH(t("k_window"))}</option></select></label>
        ${num("pr_width", "w", obj.w, 0.05, 0.2)}${num("pr_oheight", "h", obj.h, 0.05, 0.2)}${num("pr_sill", "sill", obj.sill, 0.05, 0)}${num("pr_pos", "pos", obj.pos - obj.w / 2, 0.05, 0)}
        ${obj.kind === "door" ? `<label>${escH(t("pr_flip"))}<input type="checkbox" data-prop="flip"${obj.flip ? " checked" : ""} style="width:auto"></label>` : ""}
        <button class="btn ghost" data-cmd="delete">${escH(t("c_delete"))}</button>`;
    } else {
      el.innerHTML = `<h5><span class="kind">${escH(t("k_dim"))}</span></h5><p class="muted">${fmt(G.len(obj.a, obj.b), 2)} m</p><button class="btn ghost" data-cmd="delete">${escH(t("c_delete"))}</button>`;
    }
    $$("[data-cmd]", el).forEach((b) => b.addEventListener("click", () => run(b.dataset.cmd)));
    $$("[data-prop]", el).forEach((inp) => inp.addEventListener("change", () => applyProp(inp)));
  }
  function applyProp(inp) {
    const key = inp.dataset.prop;
    if (key === "docname") { M.doc.name = inp.value.trim(); M.changed("props"); return; }
    const s = M.selection, obj = s && M.get(s.kind, s.id); if (!obj) return;
    const v = inp.type === "checkbox" ? inp.checked : inp.tagName === "SELECT" ? inp.value : parseFloat(inp.value);
    if (typeof v === "number" && (isNaN(v) || v < 0)) { renderProps(); return; }
    M.checkpoint();
    if (s.kind === "wall") {
      if (key === "length" && v > 0.01) {
        const L = G.len(obj.a, obj.b) || 1, ux = (obj.b.x - obj.a.x) / L, uy = (obj.b.y - obj.a.y) / L;
        const linked = editor.linkedPoints(obj.b, obj);
        obj.b.x = obj.a.x + ux * v; obj.b.y = obj.a.y + uy * v; linked.forEach((q) => { q.x = obj.b.x; q.y = obj.b.y; });
      } else if (key === "t") obj.t = Math.max(0.02, v); else if (key === "h") obj.h = Math.max(0.1, v);
    } else if (s.kind === "opening") {
      if (key === "kind") { obj.kind = v; if (v === "door") obj.sill = 0; else if (!obj.sill) obj.sill = M.defaults.winSill; }
      else if (key === "pos") obj.pos = v + obj.w / 2; else if (key === "flip") obj.flip = v; else obj[key] = v;
    }
    M.clampOpenings(); M.changed("props"); renderProps();
  }

  /* ---------- formats ---------- */
  function renderFormats() {
    const B = (k) => `<span class="badge ${k === "yes" ? "ok" : k === "part" ? "part" : "no"}">${escH(t(k))}</span>`;
    const th = P23.getLang() === "th";
    const rows = [
      ["DXF", "R12 … 2018–2026 (AC1009–AC1032)", "yes", "yes", th ? "บันทึกเป็น R12 (มม.) เปิดได้ทุก AutoCAD" : "Saved as R12 (mm), opens in every AutoCAD"],
      ["DWG", th ? "เปิด R13 … 2018–2026 (AC1032) · บันทึก 2000" : "Open R13 … 2018–2026 (AC1032) · save 2000", "yes", "part", th ? "GNU LibreDWG (WebAssembly / engine) · บันทึก DWG ต้องเปิดผ่าน engine (Start-Pro2D3D.bat) — เป็นรุ่น 2000 ซึ่ง AutoCAD 2000–2026 เปิดได้" : "GNU LibreDWG (WebAssembly / engine) · DWG save needs the engine (Start-Pro2D3D.bat) — written as 2000, opens in AutoCAD 2000–2026"],
      ["IFC", th ? "เปิด IFC2x3 · IFC4 · IFC4.3 · บันทึก IFC4" : "Open IFC2x3 · IFC4 · IFC4.3 · save IFC4", "yes", "yes", th ? "เปิดด้วย web-ifc (MPL-2.0) เป็นโมเดลอ้างอิง 3D · ไฟล์ IFC ที่บันทึกจาก Pro-2D+3D เปิดกลับมาแก้ไขได้" : "Opened with web-ifc (MPL-2.0) as a 3D reference · IFC saved by Pro-2D+3D re-opens editable"],
      ["SKP", "SketchUp 2013–2026", "yes", "no", th ? "เปิดด้วย OpenSKP (MIT) เป็นโมเดลอ้างอิงใน 3D" : "Opened with OpenSKP (MIT) as a 3D reference model"],
      ["OBJ", "Wavefront OBJ + MTL", "yes", "yes", th ? "เปิดเป็นโมเดลอ้างอิงใน 3D" : "Opened as a 3D reference model"],
      ["PDF", "PDF 1.7 / 2.0", "yes", "yes", th ? "ส่งออกแบบเวกเตอร์ตามมาตราส่วน · เปิดเป็นแบบอ้างอิงใต้แปลน 2D (pdf.js) ตามมาตราส่วนที่ตั้งไว้" : "Vector export to scale · opened as a 2D underlay (pdf.js) at the set scale"],
      ["P23", "Pro-2D+3D project", "yes", "yes", th ? "ไฟล์งานของโปรแกรม (เก็บข้อมูลครบ)" : "Native project file (full data)"],
    ];
    $("#fmtTable").innerHTML = `<tr><th>${t("f_fmt")}</th><th>${t("f_ver")}</th><th>${t("f_open")}</th><th>${t("f_save")}</th><th>${t("f_note")}</th></tr>` +
      rows.map((r) => `<tr><td><b>${r[0]}</b></td><td>${escH(r[1])}</td><td>${B(r[2])}</td><td>${B(r[3])}</td><td class="muted">${escH(r[4])}</td></tr>`).join("");
  }

  /* ---------- status ---------- */
  function updateStatus() {
    $("#docName").textContent = (M.doc.name || "") + (M.dirty ? " •" : "");
    const s = M.selection, obj = s && M.get(s.kind, s.id);
    $("#stSel").textContent = obj ? t(s.kind === "wall" ? "k_wall" : s.kind === "dim" ? "k_dim" : obj.kind === "door" ? "k_door" : "k_window") + (s.kind === "wall" ? " " + fmt(G.len(obj.a, obj.b), 2) + " m" : "") : "";
  }

  /* ---------- init ---------- */
  function init() {
    setTheme(store.get("p23-theme", "navy"));
    P23.setLang(store.get("p23-lang", "th"));
    editor = new P23.Editor2D($("#cv2d"));
    view3d = new P23.View3D($("#pane3d"));
    P23.app = { editor, view3d, run, toast, download };
    editor.onCursor = (p) => ($("#stCursor").textContent = "X " + fmt(p.x, 2) + "  Y " + fmt(p.y, 2));
    editor.snapStep = parseFloat(store.get("p23-snap", "0.1")); $("#snapStep").value = String(editor.snapStep);
    $("#pdfPaper").value = store.get("p23-paper", "A3");

    // theme / lang buttons
    $$("[data-theme-btn]").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.themeBtn)));
    $$("[data-lang-btn]").forEach((b) => b.addEventListener("click", () => P23.setLang(b.dataset.langBtn)));
    M.on("lang", () => { renderProps(); renderFormats(); updateHint(); updateStatus(); if (curView === "hub") renderRecent(); });

    // nav
    $$("[data-nav]").forEach((b) => b.addEventListener("click", () => {
      const n = b.dataset.nav;
      if (n === "hub" || n === "settings") showView(n);
      else if (n === "2d" || n === "3d" || n === "split") showView("work", n);
      else if (n === "open") run("open");
      else if (n === "sample") run("sample");
      else if (n === "3d-new" || n === "2d-new") { if (!confirmDiscard()) return; M.newDoc(); view3d.setRefModel(null); showView("work", n === "3d-new" ? "split" : "2d"); setTool("wall"); setTimeout(() => editor.fit(), 30); }
    }));
    // menus
    $$(".menu").forEach((m) => {
      $(".menu-btn", m).addEventListener("click", (e) => { e.stopPropagation(); const open = m.classList.contains("open"); $$(".menu").forEach((x) => x.classList.remove("open")); if (!open) m.classList.add("open"); });
      $(".menu-btn", m).addEventListener("mouseenter", () => { if ($$(".menu.open").length && !m.classList.contains("open")) { $$(".menu").forEach((x) => x.classList.remove("open")); m.classList.add("open"); } });
    });
    document.addEventListener("click", () => $$(".menu").forEach((x) => x.classList.remove("open")));
    $$("[data-cmd]").forEach((b) => b.addEventListener("click", () => run(b.dataset.cmd)));
    $$("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
    $("#modalClose").addEventListener("click", () => $("#modal").classList.remove("on"));
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("#modal").classList.remove("on"); });

    // defaults & settings
    const defT = $("#defT"), defH = $("#defH");
    defT.addEventListener("change", () => { const v = parseFloat(defT.value); if (v > 0) M.defaults.t = v; });
    defH.addEventListener("change", () => { const v = parseFloat(defH.value); if (v > 0) M.defaults.h = v; });
    $("#snapChk").addEventListener("change", (e) => (editor.snapOn = e.target.checked));
    $("#snapStep").addEventListener("change", (e) => { editor.snapStep = parseFloat(e.target.value); store.set("p23-snap", e.target.value); });
    $("#pdfPaper").addEventListener("change", (e) => store.set("p23-paper", e.target.value));

    // files (iPadOS greys out unknown extensions such as .p23/.dwg/.skp in the picker → no filter there)
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) $("#fileInput").removeAttribute("accept");
    $("#fileInput").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ""; });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

    // keyboard
    window.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase(); if (tag === "input" || tag === "select" || tag === "textarea") return;
      const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); run("undo"); }
      else if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); run("redo"); }
      else if (ctrl && k === "s") { e.preventDefault(); run("save"); }
      else if (ctrl && k === "o") { e.preventDefault(); run("open"); }
      else if (ctrl && k === "n") { e.preventDefault(); run("new"); }
      else if (ctrl) return;
      else if (k === "escape") { editor.cancel(); $("#modal").classList.remove("on"); setTool(editor.tool); }
      else if (k === "delete" || k === "backspace") run("delete");
      else if (curView !== "work") return;
      else if (k === "v") setTool("select");
      else if (workMode !== "3d" && k === "w") setTool("wall");
      else if (workMode !== "3d" && k === "d") setTool("door");
      else if (workMode !== "3d" && k === "n") setTool("window");
      else if (workMode !== "3d" && k === "m") setTool("dim");
      else if (k === "f") run("fit");
      else if (k === "1") showView("work", "2d"); else if (k === "2") showView("work", "split"); else if (k === "3") showView("work", "3d");
    });
    window.addEventListener("beforeunload", (e) => { if (M.dirty && M.doc.walls.length) { e.preventDefault(); e.returnValue = ""; } });

    // live link indicators
    let pulseT;
    M.on("change", (ev) => {
      updateStatus(); if (ev.source !== "props") renderProps();
      const d = $("#liveDot"); d.classList.add("pulse"); clearTimeout(pulseT); pulseT = setTimeout(() => d.classList.remove("pulse"), 180);
    });
    M.on("select", () => { renderProps(); updateStatus(); });

    const showEngine = () => { const s = P23.ext.engine.status; $("#stEngine").textContent = s ? "⚙ " + t("s_engine_on", { v: s.engine }) : ""; };
    M.on("lang", showEngine);
    P23.ext.engine.check().then(showEngine);

    renderFormats(); renderProps(); updateStatus(); setTool("select");
    showView("hub");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  // offline / home-screen app (web & iPad). Skipped inside the Windows program, which serves files itself.
  if ("serviceWorker" in navigator && location.protocol !== "file:" && !window.pywebview && !/^\/api\//.test(location.pathname)) {
    window.addEventListener("load", () => setTimeout(() => {
      if (window.pywebview) return;
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker", e));
    }, 1500));
  }
})();
