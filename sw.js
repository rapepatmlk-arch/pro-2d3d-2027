/* Pro2D-2027 / Pro3D-2027 for iPad — offline cache. Bump VERSION on every release. */
const VERSION = "p23-ipad-2027.0.4";
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
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
