const HN_VERSION = "__HN_BUILD__";
const HN_CACHE = "hn-offline-" + HN_VERSION;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./app.css",
  "./main.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./basemap/land.geojson",
  "./basemap/graticule.geojson",
  "./catalog/index.json",
  "./catalog/routes.geojson",
  "./catalog/basins.json"
];


const HN_CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./main.js",
  "./main.css",
  "./basemap/land.geojson",
  "./basemap/graticule.geojson",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(HN_CACHE)
      .then((cache) => cache.addAll(HN_CORE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== HN_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(HN_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"));
    }),
  );
});
