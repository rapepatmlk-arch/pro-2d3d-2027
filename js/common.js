/* Pro2D-2027 / Pro3D-2027 for iPad — what both programs share:
 * themes, Thai/English, the toast and busy panel, opening files, units, the service worker. */
(function () {
  "use strict";
  const P = (window.P23 = window.P23 || {});
  const store = {
    get(k, d) { try { const v = localStorage.getItem("p23." + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("p23." + k, v); } catch (e) {} },
  };
  P.store = store;

  /* ---------- language ---------- */
  P.dict = { th: {}, en: {} };
  P.addText = function (th, en) { Object.assign(P.dict.th, th); Object.assign(P.dict.en, en); };
  P.lang = store.get("lang", "th");
  P.t = function (k, vars) {
    let s = (P.dict[P.lang] && P.dict[P.lang][k]) || P.dict.en[k] || k;
    if (vars) for (const n in vars) s = s.split("{" + n + "}").join(vars[n]);
    return s;
  };
  P.applyText = function (root) {
    (root || document).querySelectorAll("[data-t]").forEach((el) => { el.textContent = P.t(el.dataset.t); });
    (root || document).querySelectorAll("[data-tip]").forEach((el) => { el.title = P.t(el.dataset.tip); });
    document.documentElement.lang = P.lang;
  };
  P.addText({
    open: "เปิดไฟล์", sample: "บ้านตัวอย่าง", th_navy: "กรมท่า-ทอง", th_blue: "บลูพริ้นท์", th_graph: "กราไฟต์",
    loading: "กำลังเปิด {name} …", loaded: "เปิด {name} แล้ว", failed: "เปิดไฟล์ไม่สำเร็จ: {err}", unsupported: "ยังเปิดไฟล์ชนิดนี้ไม่ได้: {ext}",
    offline_ready: "พร้อมใช้งานแบบไม่มีเน็ตแล้ว", need_http: "ต้องเปิดผ่านเว็บ (https) — เปิดจากไฟล์ในเครื่องโดยตรงไม่ได้",
  }, {
    open: "Open file", sample: "Sample house", th_navy: "Navy Gold", th_blue: "Blueprint", th_graph: "Graphite",
    loading: "Opening {name} …", loaded: "{name} opened", failed: "Could not open the file: {err}", unsupported: "This file type cannot be opened yet: {ext}",
    offline_ready: "Ready to work offline", need_http: "Open it from the web (https) — not from a local file",
  });

  /* ---------- theme ---------- */
  P.theme = store.get("theme", "navy");
  P.setTheme = function (name) {
    P.theme = name; store.set("theme", name);
    document.documentElement.dataset.theme = name;
    document.querySelectorAll("[data-theme-btn]").forEach((b) => b.classList.toggle("on", b.dataset.themeBtn === name));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bar").trim() || "#13214a";
    (P.onTheme || []).forEach((f) => f(name));
  };
  P.setLang = function (lang) {
    P.lang = lang; store.set("lang", lang);
    document.querySelectorAll("[data-lang-btn]").forEach((b) => b.classList.toggle("on", b.dataset.langBtn === lang));
    P.applyText();
    (P.onLang || []).forEach((f) => f(lang));
  };
  P.onTheme = []; P.onLang = [];

  /* ---------- toast / busy ---------- */
  let toastTimer = null;
  P.toast = function (msg, ms) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), ms || 2800);
  };
  P.busy = function (msg) {
    const el = document.getElementById("busy");
    if (!el) return;
    if (msg) { el.querySelector("span").textContent = msg; el.classList.add("show"); }
    else el.classList.remove("show");
  };
  P.nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  /* ---------- files ---------- */
  P.pickFile = function (accept) {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      // iPad / iPhone / Android: an accept list with types the system does not know (.skp, .igz, .dwg)
      // greys those files out in the Files picker, so on touch devices every file is offered and the
      // program checks the extension itself
      const touch = /iPad|iPhone|iPod|Android/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
      inp.type = "file"; inp.accept = touch ? "" : accept || "";
      inp.style.display = "none"; document.body.appendChild(inp);
      setTimeout(() => inp.remove(), 60000);
      inp.onchange = () => resolve(inp.files && inp.files[0] ? inp.files[0] : null);
      inp.click();
    });
  };
  P.url = (p) => new URL(p, document.baseURI).href;
  P.needHttp = function () { if (location.protocol === "file:") throw new Error(P.t("need_http")); };

  /* DWG → DXF with GNU LibreDWG compiled to WebAssembly (the engine Pro2D-2027 uses on the PC). */
  let dwgLib = null;
  P.dwgToDxf = async function (buf) {
    P.needHttp();
    if (!dwgLib) {
      const m = await import(P.url("vendor/libredwg/dist/libredwg-web.js"));
      dwgLib = await m.LibreDwg.create(P.url("vendor/libredwg/wasm"));
    }
    const out = dwgLib.dwg_write_dxf(new Uint8Array(buf));
    if (!out || !out.length) throw new Error("LibreDWG could not read this DWG");
    return out;
  };

  /* ---------- units of a length readout (metres in, text out) ---------- */
  P.fmtLen = function (m, unit) {
    if (unit === "in") return (m / 0.0254).toFixed(2) + '"';
    if (unit === "mm") return Math.round(m * 1000).toLocaleString("en-US") + " mm";
    return m.toFixed(3) + " m";
  };
  P.fmtArea = function (m2, unit) {
    if (unit === "in") return (m2 / (0.0254 * 0.0254)).toFixed(1) + (P.lang === "th" ? " ตร.นิ้ว" : " in²");
    if (unit === "mm") return Math.round(m2 * 1e6).toLocaleString("en-US") + (P.lang === "th" ? " ตร.มม." : " mm²");
    return m2.toFixed(3) + (P.lang === "th" ? " ตร.ม." : " m²");
  };

  /* ---------- start ---------- */
  P.VERSION = "2027.0.5";
  P.boot = function () {
    // the version on screen (top bar, right) so it is easy to see which version is running
    const top = document.querySelector(".top");
    if (top) { const v = document.createElement("span"); v.className = "ver"; v.textContent = "v" + P.VERSION; top.appendChild(v); }
    document.querySelectorAll("[data-theme-btn]").forEach((b) => (b.onclick = () => P.setTheme(b.dataset.themeBtn)));
    document.querySelectorAll("[data-lang-btn]").forEach((b) => (b.onclick = () => P.setLang(b.dataset.langBtn)));
    P.setTheme(P.theme); P.setLang(P.lang);
    // iPad Safari: no pinch-zoom of the page itself, no bounce
    document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
    document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    const dev = /^(localhost|127.0.0.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
    if ("serviceWorker" in navigator && location.protocol !== "file:" && !dev) {
      // a new version took over: reload once so the page itself is the new one
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded && navigator.serviceWorker.controller) { reloaded = true; location.reload(); } });
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
        reg.update().catch(() => {});
        if (!navigator.serviceWorker.controller) reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (w) w.addEventListener("statechange", () => { if (w.state === "activated") P.toast(P.t("offline_ready")); });
        });
      }).catch(() => {});
    }
  };
})();
