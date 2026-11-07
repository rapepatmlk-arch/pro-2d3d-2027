/* Pro-2D+3D 2027 — service worker: lets the iPad home-screen app start and work offline.
 * Core files are cached on install; the large engines (DWG/IFC/SKP/PDF) are cached the first time they are used.
 * Bump VERSION on every release so devices pick up the new files. */
const VERSION = "p23-2027.0-1";
const CORE = [
  "./", "./index.html", "./css/app.css", "./logo.jpg", "./manifest.webmanifest",
  "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png",
  "./vendor/three.min.js", "./vendor/OrbitControls.js", "./vendor/OBJLoader.js", "./vendor/GLTFLoader.js",
  "./js/i18n.js", "./js/model.js", "./js/sample.js", "./js/editor2d.js", "./js/view3d.js",
  "./js/io-dxf.js", "./js/io-obj.js", "./js/io-pdf.js", "./js/io-ext.js", "./js/io-ifc.js", "./js/app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;                 // engine calls are never cached
  const sameOrigin = url.origin === self.location.origin, fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  // app shell: network first (fresh when online), cache when offline; everything else: cache first
  const shell = sameOrigin && (req.mode === "navigate" || /\.(html|js|css|webmanifest)$/.test(url.pathname)) && !url.pathname.includes("/vendor/");
  e.respondWith(shell
    ? fetch(req).then((res) => { const copy = res.clone(); if (res.ok) caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
    : caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })));
});
