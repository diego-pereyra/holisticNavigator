import { Map as MlMap, NavigationControl, addProtocol, setWorkerUrl } from "maplibre-gl";
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { Protocol, PMTiles, FileSource } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

import { mountApp, type AppHandle } from "./ui/app.ts";
import { loadBasins, loadIndex, loadRoutesGeoJson } from "./platform/catalog.ts";
import { openStore, type KeyValueStore } from "./platform/store.ts";
import {
  bboxTouches,
  getZone,
  loadTilesIndex,
  zoneLayerIds,
  zoneLayers,
  zoneProtocolName,
  zoneSourceId,
  type ZoneHooks,
  type ZoneMeta,
} from "./platform/tiles.ts";

declare global {
  interface Window {
    hnRetryCatalog?: () => void;
  }
}

const BATHY = "basemap/bathy.geojson";
const COUNTRIES = "basemap/countries.geojson";
const CITIES = "basemap/cities.geojson";
const GRATICULE = "basemap/graticule.geojson";

// Carta de detalle mundial (PMTiles de OSM, E10.1b). El workflow `tiles.yml`
// publica `world-z6.pmtiles` como asset de la release `tiles-latest`; el deploy
// lo copia a `tiles/` del propio sitio de Pages (mismo origen, con CORS y
// soporte de rangos). Leerlo del propio origen evita el bloqueo CORS de los
// assets de Releases.
const TILES_WORLD_URL = new URL("tiles/world-z6.pmtiles", document.baseURI).toString();

const ATTRIBUTION = "© OpenStreetMap contributors · Protomaps · Natural Earth";

// Fuente con los cuatro layers de la carta de detalle, apagados con minzoom para
// que salgan recién a zoom ≥ 4 (donde se apagan las capas de Natural Earth).
const DETAIL_LAYERS: LayerSpecification[] = [
  {
    id: "detail-water",
    type: "fill",
    source: "detail",
    "source-layer": "water",
    minzoom: 4,
    paint: { "fill-color": "#0b1626" },
  },
  {
    id: "detail-earth",
    type: "fill",
    source: "detail",
    "source-layer": "earth",
    minzoom: 4,
    paint: { "fill-color": "#1c2733" },
  },
  {
    id: "detail-boundary",
    type: "line",
    source: "detail",
    "source-layer": "boundaries",
    minzoom: 4,
    filter: ["==", ["get", "kind"], "country"],
    paint: { "line-color": "#3a4a5a", "line-width": 0.6 },
  },
  {
    id: "detail-place",
    type: "symbol",
    source: "detail",
    "source-layer": "places",
    minzoom: 3,
    layout: {
      "text-field": ["get", "name"],
      "text-size": ["match", ["get", "kind"], "country", 12, "region", 11, "locality", 10, 10],
    },
    paint: { "text-color": "#9FB0C0", "text-halo-color": "#0b1626", "text-halo-width": 1 },
  },
];

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
      detail: { type: "vector", url: "pmtiles://" + TILES_WORLD_URL, maxzoom: 6 },
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
        maxzoom: 4,
        paint: { "fill-color": fillColor },
      },
      {
        id: "country-line",
        type: "line",
        source: "countries",
        maxzoom: 4,
        paint: { "line-color": "#3a4a5a", "line-width": 0.6 },
      },
      {
        id: "coast-line",
        type: "line",
        source: "countries",
        maxzoom: 4,
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
      ...DETAIL_LAYERS,
      {
        id: "country-label",
        type: "symbol",
        source: "countries",
        minzoom: 2,
        maxzoom: 4,
        layout: { "text-field": ["get", "name"], "text-size": 11 },
        paint: { "text-color": "#6b7f96", "text-halo-color": "#0b1626", "text-halo-width": 1 },
      },
      {
        id: "city-dot",
        type: "circle",
        source: "cities",
        minzoom: 3,
        maxzoom: 4,
        filter: [">=", ["get", "pop_max"], CITY_MIN_POP],
        paint: { "circle-radius": 2, "circle-color": "#9FB0C0" },
      },
      {
        id: "city-label",
        type: "symbol",
        source: "cities",
        minzoom: 3,
        maxzoom: 4,
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

// Protocolo pmtiles (E10.1): se registra una sola vez, antes de crear el mapa,
// para que la fuente `detail` resuelva las URLs `pmtiles://…`.
const pmtilesProtocol = new Protocol();
addProtocol("pmtiles", pmtilesProtocol.tile);

const map = new MlMap({
  container: "map",
  style: baseMapStyle(),
  center: [0, 20],
  zoom: 1.2,
  minZoom: 0,
  maxZoom: 18,
  attributionControl: { compact: true, customAttribution: ATTRIBUTION },
});

map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");

// La carta de detalle puede faltar (sin red, o si la release todavía no se
// publicó): el mapa sigue con el piso y no se le muestra nada al usuario.
map.on("error", (e) => {
  const msg = e.error instanceof Error ? e.error.message : String(e.error);
  if (/pmtiles|world-z6/i.test(msg)) return;
  console.warn("mapa:", e.error);
});

// Zonas descargables (E10.2). Cada zona bajada se registra en el protocolo
// pmtiles como `zone-<id>` y se agrega al mapa como fuente vectorial
// `detail-<id>` con las capas de detalle; solo se dibuja si el viewport toca su
// bbox (así una zona del Caribe no hace trabajo estando en el Río de la Plata).
const zoneBounds = new Map<string, [number, number, number, number]>();
const registeredZones = new Set<string>();

function addZoneToMap(id: string, blob: Blob, meta: ZoneMeta): void {
  const name = zoneProtocolName(id);
  if (!registeredZones.has(name)) {
    pmtilesProtocol.add(new PMTiles(new FileSource(new File([blob], name))));
    registeredZones.add(name);
  }
  const srcId = zoneSourceId(id);
  if (!map.getSource(srcId)) {
    map.addSource(srcId, { type: "vector", url: `pmtiles://${name}`, minzoom: 7, maxzoom: 10 });
    const before = map.getLayer("country-label") ? "country-label" : undefined;
    for (const layer of zoneLayers(id)) map.addLayer(layer, before);
  }
  zoneBounds.set(id, meta.bbox);
  updateZoneVisibility();
  updateScaleNote();
}

function removeZoneFromMap(id: string): void {
  for (const lid of zoneLayerIds(id)) if (map.getLayer(lid)) map.removeLayer(lid);
  const srcId = zoneSourceId(id);
  if (map.getSource(srcId)) map.removeSource(srcId);
  pmtilesProtocol.tiles.delete(zoneProtocolName(id));
  zoneBounds.delete(id);
  updateScaleNote();
}

function updateZoneVisibility(): void {
  if (zoneBounds.size === 0) return;
  const b = map.getBounds();
  const viewport: [number, number, number, number] = [
    b.getWest(), b.getSouth(), b.getEast(), b.getNorth(),
  ];
  const farEnough = map.getZoom() >= 6.9;
  for (const [id, box] of zoneBounds) {
    const visible = farEnough && bboxTouches(viewport, box);
    for (const lid of zoneLayerIds(id)) {
      if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", visible ? "visible" : "none");
    }
  }
}

const zoneHooks: ZoneHooks = { add: addZoneToMap, remove: removeZoneFromMap };
map.on("moveend", updateZoneVisibility);

// UX-3: el zoom no se corta (hasta 18). La carta mundial llega a zoom 6 y una
// zona descargada a zoom 10; más allá MapLibre sobreamplía las teselas, así que
// cuando el centro queda por encima de ese detalle se avisa con una nota
// discreta (abajo a la izquierda). El texto lo pinta la UI (app.ts).
let setScaleNote: ((text: string | null) => void) | null = null;

function centerCovered(): boolean {
  const c = map.getCenter();
  for (const b of zoneBounds.values()) {
    if (c.lng >= b[0] && c.lng <= b[2] && c.lat >= b[1] && c.lat <= b[3]) return true;
  }
  return false;
}

function updateScaleNote(): void {
  if (!setScaleNote) return;
  const covered = centerCovered();
  if (map.getZoom() > (covered ? 10 : 6)) {
    setScaleNote(
      covered
        ? "Detalle hasta zoom 10 · usá tu carta para el puerto"
        : "Sin detalle a esta escala · descargá la zona",
    );
  } else {
    setScaleNote(null);
  }
}

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
    putBlob: (k, b) => ready.then((s) => s.putBlob(k, b)),
    getBlob: (k) => ready.then((s) => s.getBlob(k)),
    removeBlob: (k) => ready.then((s) => s.removeBlob(k)),
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

// Al arrancar, registra en el mapa las zonas ya descargadas (E10.2). El índice
// de zonas queda guardado, así que sin red igual sabemos nombre y bbox.
async function restoreZones(store: KeyValueStore): Promise<void> {
  const idx = await loadTilesIndex(store).catch(() => null);
  const zones = idx?.zones ?? {};
  for (const [id, meta] of Object.entries(zones)) {
    const blob = await getZone(store, id);
    if (blob) addZoneToMap(id, blob, meta);
  }
}

function start(): void {
  // El mapa base ya está en pantalla: se monta la UI y se oculta la carga.
  boot.step("base", true);
  boot.hide();
  const store = lazyStore();
  const app = mountApp(map, { store, zones: zoneHooks });
  setScaleNote = (text) => app.setScaleNote(text);
  map.on("move", updateScaleNote);
  map.on("zoom", updateScaleNote);
  updateScaleNote();
  window.hnRetryCatalog = () => void loadCatalog(app);
  void loadCatalog(app);
  void loadRoutes(app);
  void restoreZones(store);
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

