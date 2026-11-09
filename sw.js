/* Pro2D-2027 / Pro3D-2027 for iPad — offline cache. Bump VERSION on every release. */
const VERSION = "p23-ipad-2027.0.6";
const CORE = [
  "./", "pro2d.html", "pro3d.html", "css/p23.css", "js/common.js", "js/dxfview.js", "js/pro2d.js", "js/pro3d.js", "js/igz.js",
  "logo.jpg", "sample.igz", "manifest-2d.webmanifest", "manifest-3d.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "vendor/three.min.js", "vendor/OrbitControls.js", "vendor/GLTFLoader.js", "vendor/OBJLoader.js",
  "vendor/earcut/earcut.js", "vendor/fflate/browser.js", "vendor/flatbuffers/flatbuffers.js", "vendor/openskp/openskp.mjs",
  "vendor/flatbuffers/builder.js", "vendor/flatbuffers/byte-buffer.js", "vendor/flatbuffers/constants.js", "vendor/flatbuffers/encoding.js", "vendor/flatbuffers/flexbuffers.js", "vendor/flatbuffers/flexbuffers/bit-width-util.js", "vendor/flatbuffers/flexbuffers/bit-width.js", "vendor/flatbuffers/flexbuffers/builder.js", "vendor/flatbuffers/flexbuffers/flexbuffers-util.js", "vendor/flatbuffers/flexbuffers/reference-util.js", "vendor/flatbuffers/flexbuffers/reference.js", "vendor/flatbuffers/flexbuffers/stack-value.js", "vendor/flatbuffers/flexbuffers/value-type-util.js", "vendor/flatbuffers/flexbuffers/value-type.js", "vendor/flatbuffers/types.js", "vendor/flatbuffers/utils.js",
  "vendor/libredwg/dist/libredwg-web.js", "vendor/libredwg/wasm/libredwg-web.js", "vendor/libredwg/wasm/libredwg-web.wasm",
  "vendor/web-ifc/web-ifc-api-iife.js", "vendor/web-ifc/web-ifc.wasm",
  "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs",
];
/* install: fetch every file fresh from the server (cache: "reload"), never from the browser's HTTP
   cache — otherwise an update could store the previous version's files again */
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(CORE.map((u) =>
    fetch(new Request(u, { cache: "reload" })).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* the program's own pages and code: network first (always the newest when online), the saved copy
   when offline. The big engines in vendor/ and the sample: saved copy first (they never change). */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const save = (res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; };
  const fixed = /\/vendor\/|\.(wasm|igz)$/.test(url.pathname);
  if (fixed) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then(save)));
  } else {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(save).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./", { ignoreSearch: true }))));
  }
});
