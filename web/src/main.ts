import { Map, NavigationControl, setWorkerUrl } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { mountApp, type AppHandle } from "./ui/app.ts";
import { loadBasins, loadIndex, loadRoutesGeoJson } from "./platform/catalog.ts";
import { openStore, type KeyValueStore } from "./platform/store.ts";

declare global {
  interface Window {
    hnRetryCatalog?: () => void;
  }
}

const LAND = "basemap/land.geojson";
const GRATICULE = "basemap/graticule.geojson";

export function baseMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      land: { type: "geojson", data: LAND },
      graticule: { type: "geojson", data: GRATICULE },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#0b1626" },
      },
      {
        id: "land-fill",
        type: "fill",
        source: "land",
        paint: { "fill-color": "#1c2733" },
      },
      {
        id: "coast-line",
        type: "line",
        source: "land",
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
    navigator.serviceWorker.register("service-worker.js").catch(() => undefined);
  });
}

