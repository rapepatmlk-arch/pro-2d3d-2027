/* Pro-2D+3D 2027 — external format engines (loaded on demand as ES modules).
 *  DWG → DXF : GNU LibreDWG compiled to WebAssembly (@mlightcad/libredwg-web, GPL-3.0) — the same engine IngeCAD uses.
 *  SKP → 3D  : OpenSKP (MIT) — the same parser IngeTrazo uses; SketchUp 2013–2026.
 * Requires the app to be served over http (Start-Pro2D3D.bat); browsers block ES modules / WASM on file://.
 */
(function () {
  const P23 = window.P23;
  const url = (p) => new URL(p, document.baseURI).href;
  let dwgLib = null, skpMod = null;

  function needHttp() {
    if (location.protocol === "file:") throw new Error(P23.t("t_need_http"));
  }

  async function dwgToDxf(buf) {
    needHttp();
    if (!dwgLib) {
      const m = await import(url("vendor/libredwg/dist/libredwg-web.js"));
      dwgLib = await m.LibreDwg.create(url("vendor/libredwg/wasm"));
    }
    const out = dwgLib.dwg_write_dxf(buf);
    if (!out || !out.length) throw new Error("LibreDWG could not convert this DWG");
    return out; // Uint8Array (ASCII DXF)
  }

  async function skpToGroup(buf) {
    needHttp();
    if (!skpMod) skpMod = await import(url("vendor/openskp/openskp.mjs"));
    const scene = skpMod.buildScene(buf);
    const glb = skpMod.toGLB(scene);
    const group = await new Promise((res, rej) =>
      new THREE.GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "", (g) => res(g.scene), rej));
    let n = 0;
    group.traverse((o) => { if (o.isMesh) { n++; o.castShadow = o.receiveShadow = true; } });
    let version = "";
    try { const md = skpMod.parseSkp(buf); version = md.version || ""; } catch (e) {}
    return { group, meshes: n, version: String(version).replace(/[{}]/g, "") };
  }

  /* ---------- local Python engine (engine/p23engine.py — IngeCAD's dwg_bridge + LibreDWG) ---------- */
  const engine = { status: null };
  engine.check = async function () {
    if (location.protocol === "file:") return (engine.status = null);
    try {
      const r = await fetch(url("api/status"), { cache: "no-store" });
      engine.status = r.ok ? await r.json() : null;
    } catch (e) { engine.status = null; }
    return engine.status;
  };
  engine.saveDwg = async function (dxfText, version) {
    const r = await fetch(url("api/dwg/save?version=" + (version || "r2000")), { method: "POST", body: new TextEncoder().encode(dxfText) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "HTTP " + r.status);
    let warnings = [];
    try { warnings = JSON.parse(r.headers.get("X-P23-Warnings") || "[]"); } catch (e) {}
    return { bytes: new Uint8Array(await r.arrayBuffer()), warnings };
  };
  engine.openDwg = async function (buf) {
    const r = await fetch(url("api/dwg/open"), { method: "POST", body: buf });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "HTTP " + r.status);
    return new Uint8Array(await r.arrayBuffer());
  };

  /** DWG → DXF: native LibreDWG in the engine when it is running, else the WebAssembly build. */
  async function dwgToDxfAuto(buf) {
    if (engine.status && engine.status.dwg_read) {
      try { return { dxf: await engine.openDwg(buf), via: "engine" }; } catch (e) { console.warn("engine DWG open failed, using WASM", e); }
    }
    return { dxf: await dwgToDxf(buf), via: "wasm" };
  }

  /* ---------- PDF page → 2D underlay (pdf.js, Apache-2.0) ---------- */
  let pdfjs = null;
  async function pdfOpen(buf) {
    needHttp();
    if (!pdfjs) {
      pdfjs = await import(url("vendor/pdfjs/pdf.min.mjs"));
      pdfjs.GlobalWorkerOptions.workerSrc = url("vendor/pdfjs/pdf.worker.min.mjs");
    }
    return pdfjs.getDocument({ data: new Uint8Array(buf), cMapUrl: url("vendor/pdfjs/cmaps/"), cMapPacked: true, standardFontDataUrl: url("vendor/pdfjs/standard_fonts/") }).promise;
  }
  /** Render one page as a JPEG underlay sized in metres for drawing scale 1:scale. */
  async function pdfToUnderlay(pdf, pageNo, scale) {
    const page = await pdf.getPage(pageNo);
    const vp1 = page.getViewport({ scale: 1 });                     // PDF points (1/72 in)
    const px = Math.min(4096 / Math.max(vp1.width, vp1.height), 4); // render resolution
    const vp = page.getViewport({ scale: px });
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const mmW = vp1.width * 25.4 / 72, mmH = vp1.height * 25.4 / 72;
    return { src: cv.toDataURL("image/jpeg", 0.82), x: 0, y: 0, w: mmW * scale / 1000, h: mmH * scale / 1000, scale, page: pageNo, pages: pdf.numPages };
  }

  P23.ext = { dwgToDxf, dwgToDxfAuto, skpToGroup, engine, pdfOpen, pdfToUnderlay };
})();
