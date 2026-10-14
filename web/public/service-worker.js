// Service worker (W5.1). Dos cachés:
//  - hn-app-<sha>: código versionado (main.js/css, worker, ícono). cache-first.
//  - hn-data-v<CATALOG_VERSION>: catálogo y basemap. network-first (se actualiza
//    sin cambiar el SHA) con fallback a caché. No se borra al cambiar el SHA.
// Los marcadores __HN_BUILD__, __HN_CATALOG__ y __HN_PRECACHE__ los inyecta
// scripts/build-web.sh (PRECACHE = sw-manifest.json completo).

const HN_VERSION = "__HN_BUILD__";
const HN_CATALOG_VERSION = "__HN_CATALOG__";
const APP_CACHE = "hn-app-" + HN_VERSION;
const DATA_CACHE = "hn-data-v" + HN_CATALOG_VERSION;
const PRECACHE_URLS = __HN_PRECACHE__;

// Código de la app: su nombre no lleva el SHA, pero el caché sí, así que
// servirlos cache-first dentro del caché activo siempre devuelve el build actual.
const SHELL = new Set([
  "./main.js",
  "./main.css",
  "./app.css",
  "./icon.svg",
  "./manifest.webmanifest",
  "./maplibre-gl-worker.mjs",
  "./maplibre-gl-shared.mjs",
]);

function isData(path) {
  return path.includes("/catalog/") || path.includes("/basemap/");
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok && res.type === "basic") await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === "basic") await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (fallbackUrl) {
      const fb = await cache.match(fallbackUrl);
      if (fb) return fb;
    }
    throw err;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const appCache = await caches.open(APP_CACHE);
      const dataCache = await caches.open(DATA_CACHE);
      const failures = [];
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          const target = isData(url) ? dataCache : appCache;
          try {
            const res = await fetch(url, { cache: "reload" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            await target.put(url, res);
          } catch (err) {
            // No tragarse el error: registrar qué URL falló.
            failures.push(url + " → " + (err && err.message ? err.message : String(err)));
          }
        }),
      );
      if (failures.length > 0) {
        console.warn("SW precache: " + failures.length + " URL(s) fallaron:\n" + failures.join("\n"));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => (k.startsWith("hn-app-") && k !== APP_CACHE) || k.startsWith("hn-offline-"))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Teselas PMTiles (E10.1b): se piden con `Range` y el servidor responde 206
  // (contenido parcial). El SW no debe interceptarlas: cachear respuestas 206
  // parciales corrompería la lectura del archivo. Van directo a la red.
  if (url.pathname.includes("/tiles/")) return;

  const base = "./" + url.pathname.split("/").pop();

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, APP_CACHE, "./index.html"));
    return;
  }
  if (isData(url.pathname)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }
  if (SHELL.has(base)) {
    event.respondWith(cacheFirst(req, APP_CACHE));
    return;
  }
  event.respondWith(networkFirst(req, APP_CACHE));
});
