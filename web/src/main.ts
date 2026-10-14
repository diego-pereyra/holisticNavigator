import { Map, NavigationControl, setWorkerUrl } from "maplibre-gl";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { mountApp, type AppHandle } from "./ui/app.ts";
import { loadBasins, loadIndex, loadRoutesGeoJson } from "./platform/catalog.ts";
import { openStore, type KeyValueStore } from "./platform/store.ts";

declare global {
  interface Window {
    hnRetryCatalog?: () => void;
  }
}

const BATHY = "basemap/bathy.geojson";
const COUNTRIES = "basemap/countries.geojson";
const CITIES = "basemap/cities.geojson";
const GRATICULE = "basemap/graticule.geojson";

// Siete tonos apagados (índices 1..7 de `mapcolor7`) para que los países se
// distingan sobre el fondo oscuro sin gritar.
const COUNTRY_SHADES = [
  "#1c2733", "#202c3a", "#1a2a31", "#22293a", "#1e2f3a", "#242a33", "#1b2d38",
] as const;

// Población mínima para mostrar una ciudad, según el zoom: en la vista de mundo
// solo las enormes; desde el zoom 5, todas.
const CITY_MIN_POP: ExpressionSpecification = [
  "step", ["zoom"], 2000000, 4, 500000, 5, 0,
];

export function baseMapStyle(): StyleSpecification {
  const fillColor: ExpressionSpecification = [
    "match",
    ["get", "mapcolor7"],
    1, COUNTRY_SHADES[0],
    2, COUNTRY_SHADES[1],
    3, COUNTRY_SHADES[2],
    4, COUNTRY_SHADES[3],
    5, COUNTRY_SHADES[4],
    6, COUNTRY_SHADES[5],
    7, COUNTRY_SHADES[6],
    COUNTRY_SHADES[0],
  ];
  return {
    version: 8,
    sources: {
      bathy: { type: "geojson", data: BATHY },
      countries: { type: "geojson", data: COUNTRIES },
      cities: { type: "geojson", data: CITIES },
      graticule: { type: "geojson", data: GRATICULE },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#15263f" },
      },
      {
        id: "bathy-fill",
        type: "fill",
        source: "bathy",
        paint: {
          "fill-color": [
            "match",
            ["get", "depth"],
            200, "#13223a",
            1000, "#0f1d33",
            2000, "#0c182b",
            3000, "#0a1425",
            4000, "#081120",
            5000, "#060d1a",
            "#060d1a",
          ],
        },
      },
      {
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: { "fill-color": fillColor },
      },
      {
        id: "country-line",
        type: "line",
        source: "countries",
        paint: { "line-color": "#3a4a5a", "line-width": 0.6 },
      },
      {
        id: "coast-line",
        type: "line",
        source: "countries",
        paint: { "line-color": "#3a4a5a", "line-width": 0.8 },
      },
      {
        id: "graticule-line",
        type: "line",
        source: "graticule",
        paint: { "line-color": "#17202b", "line-width": 0.6 },
      },
      {
        id: "graticule-label",
        type: "symbol",
        source: "graticule",
        minzoom: 2,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 10,
          "symbol-placement": "line",
        },
        paint: { "text-color": "#44546a" },
      },
      {
        id: "country-label",
        type: "symbol",
        source: "countries",
        minzoom: 2,
        layout: { "text-field": ["get", "name"], "text-size": 11 },
        paint: { "text-color": "#6b7f96", "text-halo-color": "#0b1626", "text-halo-width": 1 },
      },
      {
        id: "city-dot",
        type: "circle",
        source: "cities",
        minzoom: 3,
        filter: [">=", ["get", "pop_max"], CITY_MIN_POP],
        paint: { "circle-radius": 2, "circle-color": "#9FB0C0" },
      },
      {
        id: "city-label",
        type: "symbol",
        source: "cities",
        minzoom: 3,
        filter: [">=", ["get", "pop_max"], CITY_MIN_POP],
        layout: { "text-field": ["get", "name"], "text-size": 10 },
        paint: { "text-color": "#9FB0C0", "text-halo-color": "#0b1626", "text-halo-width": 1 },
      },
    ],
  };
}

// MapLibre 6 corre en un Web Worker servido como archivo aparte (esbuild no lo
// incluye en el bundle). build-web.sh lo copia a dist/; acá se fija su URL
// relativa a la base de la app (funciona en Pages bajo /holisticNavigator/).
setWorkerUrl(new URL("maplibre-gl-worker.mjs", document.baseURI).toString());

const map = new Map({
  container: "map",
  style: baseMapStyle(),
  center: [0, 20],
  zoom: 1.2,
  minZoom: 0,
  maxZoom: 12,
  attributionControl: false,
});

map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");

// ------------------------------------------------------------------- arranque

// Pantalla de carga (definida en index.html). Si no está, no hay nada que
// actualizar: degradar a no-ops. El tope de 8 s y los errores globales viven ahí.
interface BootScreen {
  step(key: "base" | "catalog" | "routes", ok: boolean): void;
  hide(): void;
  fail(msg: string): void;
  notice(msg: string): void;
}
const boot: BootScreen =
  (window as unknown as { hnBoot?: BootScreen }).hnBoot ??
  { step() {}, hide() {}, fail() {}, notice() {} };

function firstLine(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split("\n")[0] ?? msg;
}

// Store perezoso: la app arranca sin esperar a IndexedDB. Cada operación aguarda
// la apertura (openStore ya tiene tope de 3 s y cae a localStorage).
function lazyStore(): KeyValueStore {
  const ready = openStore();
  return {
    get: (k) => ready.then((s) => s.get(k)),
    put: (k, v) => ready.then((s) => s.put(k, v)),
    remove: (k) => ready.then((s) => s.remove(k)),
  };
}

async function loadCatalog(app: AppHandle): Promise<void> {
  try {
    const [index, basins] = await Promise.all([loadIndex(), loadBasins()]);
    app.setCatalog(index, basins);
    boot.step("catalog", true);
  } catch (err) {
    console.error("No pude cargar el catálogo:", err);
    app.catalogFailed();
    boot.fail(firstLine(err));
  }
}

async function loadRoutes(app: AppHandle): Promise<void> {
  try {
    app.setRoutes(await loadRoutesGeoJson());
    boot.step("routes", true);
  } catch (err) {
    console.error("No pude cargar las rutas:", err);
    app.routesFailed();
    boot.fail(firstLine(err));
  }
}

function start(): void {
  // El mapa base ya está en pantalla: se monta la UI y se oculta la carga.
  boot.step("base", true);
  boot.hide();
  const app = mountApp(map, { store: lazyStore() });
  window.hnRetryCatalog = () => void loadCatalog(app);
  void loadCatalog(app);
  void loadRoutes(app);
}

if (map.loaded()) start();
else map.on("load", start);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void registerServiceWorker();
  });
}

// Registro del service worker y aviso de versión nueva (W4.9). El shell queda
// cacheado, así que una pestaña abierta no se entera del deploy hasta que el
// usuario recarga: mostramos una banda cuando hay un worker nuevo instalado.
async function registerServiceWorker(): Promise<void> {
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register("service-worker.js");
  } catch {
    return;
  }

  reg.addEventListener("updatefound", () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener("statechange", () => {
      // Solo es una actualización si ya había un worker controlando la página;
      // en la primera instalación no hay nada que avisar.
      if (sw.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(reg);
    });
  });

  // Al volver a primer plano, busquemos deploys sin esperar una navegación.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void reg.update().catch(() => undefined);
  });
}

function showUpdateBanner(reg: ServiceWorkerRegistration): void {
  const band = document.createElement("div");
  band.className = "hn-update";
  const text = document.createElement("span");
  text.textContent = "Hay una versión nueva";
  const btn = document.createElement("button");
  btn.className = "hn-update-btn";
  btn.type = "button";
  btn.textContent = "Actualizar";
  band.append(text, btn);
  document.body.append(band);

  let reloading = false;
  const reload = (): void => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };
  btn.addEventListener("click", () => {
    band.remove();
    navigator.serviceWorker.addEventListener("controllerchange", reload);
    // El worker ya hace skipWaiting al instalar; si todavía está en espera,
    // lo apuramos. Si ya tomó el control, recargamos nosotros.
    if (reg.waiting) reg.waiting.postMessage("skip");
    else reload();
  });
}

