let selectedVariant = "A";

function updateUrlForSelection(routeCode?: string, variant: string = "A"): void {
  try {
    const sp = new URLSearchParams(location.search);
    if (routeCode) {
      sp.set("route", routeCode);
      sp.set("variant", variant);
      history.replaceState({}, "", location.pathname + "?" + sp.toString());
    }
  } catch {}
}

interface BootParams { route: string | null; variant: string | null; }

function readUrlParams(): BootParams {
  try {
    const sp = new URLSearchParams(location.search);
    return { route: sp.get("route"), variant: sp.get("variant") };
  } catch {
    return { route: null, variant: null };
  }
}

const bootParams = readUrlParams();
if (bootParams.variant) selectedVariant = bootParams.variant;
// W4 — UI equivalente en DOM (ADR-007, sin framework):
// barra de contexto, hoja con tabs, tab Rutas (búsqueda/chips/lista), ficha v3,
// importar GPX/KML/CSV, GPS/manual y bitácora.

import type { Map as MlMap, GeoJSONSource, FilterSpecification } from "maplibre-gl";
import { signal, effect, untracked, type Signal } from "../core/store.ts";
import {
  filterEntries,
  monthVerdict,
  type CatalogIndex,
  type IndexEntry,
  type RouteDetail,
  type MonthVerdict,
} from "../core/catalog.ts";
import {
  resolveContext,
  type Basin,
  type VariantGeometry,
} from "../core/context.ts";
import { formatLat, formatLon, parseCoords } from "../core/coords.ts";
import { parseRouteFile, importedRouteToGeoJson, type ImportedRoute } from "../core/gpx.ts";
import { navigate, haversineNm, type RouteTrack, type NavFix } from "../core/navigation.ts";
import { kinematics, type Fix, type Kinematics } from "../core/kinematics.ts";
import {
  voyageToGpx,
  voyageDistanceNm,
  withPoint,
  type VoyageLog,
} from "../core/voyage.ts";
import { sunTimes } from "../core/sun.ts";
import { loadFact } from "../platform/catalog.ts";
import { KEYS, type KeyValueStore } from "../platform/store.ts";
import { downloadText, pickTextFile } from "../platform/download.ts";
import { watchGps, type Position, type PositionStatus } from "../platform/position.ts";
import {
  MONTH_ABBR,
  MONTH_INITIAL,
  MONTH_NAME,
  currentMonthUtc,
  nm,
  nmDecimal,
  rangeNm,
} from "./format.ts";

type TabName = "aqui" | "rutas" | "travesia";
type SheetState = "peek" | "half" | "full";
// Arranque progresivo (W5.1): el catálogo (índice+cuencas) y la geometría de
// rutas llegan después de montar el mapa; la hoja muestra el estado mientras tanto.
type LoadState = "loading" | "ready" | "failed";

interface Geometry {
  coords: [number, number][];
  names: string[];
}

interface ActiveRoute {
  code: string;
  chapter: string;
  variant: string | null;
}

interface UiState {
  store: KeyValueStore;
  map: MlMap;
  index: CatalogIndex;
  basins: Record<string, Basin>;
  geometry: Map<string, Geometry>;
  variants: VariantGeometry[];
  catalog: Signal<LoadState>;
  routes: Signal<LoadState>;
  position: Signal<Position | null>;
  gpsStatus: Signal<PositionStatus>;
  month: Signal<number>;
  tab: Signal<TabName>;
  sheet: Signal<SheetState>;
  selected: Signal<{ code: string; chapter: string } | null>;
  active: Signal<ActiveRoute | null>;
  query: Signal<string>;
  region: Signal<string>;
  nearMe: Signal<boolean>;
  imported: Signal<ImportedRoute[]>;
  voyage: Signal<VoyageLog | null>;
  recording: Signal<boolean>;
  navFixes: Fix[];
}

export interface AppDeps {
  store: KeyValueStore;
}

// El mapa y la UI se montan apenas carga el mapa base; el catálogo llega después
// y se inyecta por estos métodos (arranque progresivo, W5.1).
export interface AppHandle {
  setCatalog(index: CatalogIndex, basins: Record<string, Basin>): void;
  setRoutes(routesGeoJson: string): void;
  catalogFailed(): void;
  routesFailed(): void;
}

const EMPTY_INDEX: CatalogIndex = { chapters: [], routes: [] };

// --------------------------------------------------------------- montaje

export function mountApp(map: MlMap, deps: AppDeps): AppHandle {
  const ui: UiState = {
    store: deps.store,
    map,
    index: EMPTY_INDEX,
    basins: {},
    geometry: new Map(),
    variants: [],
    catalog: signal<LoadState>("loading"),
    routes: signal<LoadState>("loading"),
    position: signal<Position | null>(null),
    gpsStatus: signal<PositionStatus>("off"),
    month: signal(currentMonthUtc()),
    tab: signal<TabName>("aqui"),
    sheet: signal<SheetState>("peek"),
    selected: signal<{ code: string; chapter: string } | null>(null),
    active: signal<ActiveRoute | null>(null),
    query: signal(""),
    region: signal(""),
    nearMe: signal(false),
    imported: signal<ImportedRoute[]>([]),
    voyage: signal<VoyageLog | null>(null),
    recording: signal(false),
    navFixes: [],
  };

  installBaseLayers(map);
  wireGps(ui);
  let moveTimer: number | undefined;
  map.on("moveend", () => {
    if (moveTimer !== undefined) window.clearTimeout(moveTimer);
    moveTimer = window.setTimeout(() => applyCatalogFilter(ui), 300);
  });
  effect(() => {
    ui.query();
    ui.region();
    ui.nearMe();
    ui.catalog();
    applyCatalogFilter(ui);
  });
  try {
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p: any) => {
      if (p.state === "granted") wireGpsStart();
    }).catch(() => {});
  } catch {}

  const root = el("div", { id: "hn-ui" });
  document.body.appendChild(root);
  const contextBar = el("div", { class: "hn-context" });
  const sheet = el("div", { class: "hn-sheet" });
  root.append(contextBar, sheet);

  const fab = el("button", { class: "hn-fab", "aria-label": "Centrar" }, "◉");
  fab.addEventListener("click", () => {
    const p = ui.position();
    if (!p) {
      wireGpsStart();
      return;
    }
    ui.map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(ui.map.getZoom(), 6) });
  });
  root.append(fab);

  renderContextBar(ui, contextBar);
  renderSheet(ui, sheet);

  effect(() => persist(ui, KEYS.month, String(ui.month())));
  effect(() => {
    const a = ui.active();
    persist(ui, KEYS.active, a ? JSON.stringify(a) : "");
    drawActive(ui);
  });
  effect(() => {
    if (!ui.recording()) return;
    drawVoyage(ui, ui.voyage());
  });

  void restore(ui);

  let bootOpened = false;
  return {
    setCatalog(index, basins) {
      if (ui.catalog() === "ready") return;
      ui.index = index;
      ui.basins = basins;
      addBasinLayers(ui, basins);
      applyCatalogFilter(ui);
      ui.catalog.set("ready");
      if (bootParams.route && !bootOpened && entryOf(ui, bootParams.route)) {
        bootOpened = true;
        openRoute(ui, bootParams.route);
      }
    },
    setRoutes(routesGeoJson) {
      if (ui.routes() === "ready") return;
      const { geometry, variants } = buildGeometry(routesGeoJson);
      ui.geometry = geometry;
      ui.variants = variants;
      addCatalogLayers(ui, routesGeoJson);
      ui.routes.set("ready");
      const sel = ui.selected();
      if (sel) drawSelected(ui, sel.code, selectedVariant);
      drawActive(ui);
      applyCatalogFilter(ui);
    },
    catalogFailed() {
      if (ui.catalog() === "ready") return;
      ui.catalog.set("failed");
    },
    routesFailed() {
      if (ui.routes() === "ready") return;
      ui.routes.set("failed");
    },
  };
}

async function restore(ui: UiState): Promise<void> {
  const [month, active, imported, voyage, position] = await Promise.all([
    ui.store.get(KEYS.month),
    ui.store.get(KEYS.active),
    ui.store.get(KEYS.imported),
    ui.store.get(KEYS.voyageCurrent),
    ui.store.get(KEYS.position),
  ]);
  if (month) ui.month.set(Number(month) || currentMonthUtc());
  ui.active.set(readJson<ActiveRoute | null>(active, null));
  ui.imported.set(readJson<ImportedRoute[]>(imported, []));
  ui.voyage.set(readJson<VoyageLog | null>(voyage, null));
  const pos = readJson<Position | null>(position, null);
  if (pos) {
    ui.position.set(pos);
    setSource(ui.map, "me", featureCollection([pointFeature(pos.lon, pos.lat)]));
  }
  drawImported(ui);
}

function readJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

// --------------------------------------------------------------- helpers

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v ?? "";
    else if (v !== undefined) node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function clear(node: HTMLElement): void {
  node.replaceChildren();
}

function entryOf(ui: UiState, code: string): IndexEntry | null {
  return ui.index.routes.find((r) => r.code === code) ?? null;
}

function buildGeometry(geojson: string): {
  geometry: Map<string, Geometry>;
  variants: VariantGeometry[];
} {
  const geometry = new Map<string, Geometry>();
  const variants: VariantGeometry[] = [];
  try {
    const doc = JSON.parse(geojson) as {
      features: {
        geometry: { type: string; coordinates: unknown };
        properties: { code: string; variant: string; wpNames?: string[] };
      }[];
    };
    for (const f of doc.features) {
      if (f.geometry.type !== "LineString") continue;
      const coords = f.geometry.coordinates as [number, number][];
      const names = f.properties.wpNames ?? [];
      geometry.set(`${f.properties.code}|${f.properties.variant}`, { coords, names });
      variants.push({ code: f.properties.code, variant: f.properties.variant, coords, names });
    }
  } catch {
    /* sin geometría */
  }
  return { geometry, variants };
}

function firstGeometry(ui: UiState, code: string): Geometry | null {
  for (const [key, g] of ui.geometry) if (key.startsWith(`${code}|`)) return g;
  return null;
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function persist(ui: UiState, key: string, value: string): void {
  if (value === "") void ui.store.remove(key);
  else void ui.store.put(key, value);
}

// --------------------------------------------------------------- capas

function installBaseLayers(map: MlMap): void {
  const empty = featureCollection([]);
  for (const id of ["selected", "active", "imported", "voyage", "me", "navline"]) {
    map.addSource(id, { type: "geojson", data: empty });
  }

  map.addLayer({
    id: "imported-lines",
    type: "line",
    source: "imported",
    paint: { "line-color": "#B388FF", "line-width": 2, "line-dasharray": [2, 1.5] },
  });
  map.addLayer({
    id: "voyage-line",
    type: "line",
    source: "voyage",
    paint: { "line-color": "#FFD54F", "line-width": 2.5 },
  });
  map.addLayer({
    id: "route-active",
    type: "line",
    source: "active",
    paint: { "line-color": "#4FC3F7", "line-width": 2.5 },
  });
  map.addLayer({
    id: "nav-to-wp",
    type: "line",
    source: "navline",
    paint: { "line-color": "#00E676", "line-width": 1.5, "line-dasharray": [2, 1.5] },
  });
  map.addLayer({
    id: "route-wps",
    type: "circle",
    source: "active",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 3.2,
      "circle-color": "#FFCC80",
      "circle-stroke-color": "#0b1626",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: "route-lines",
    type: "line",
    source: "selected",
    paint: { "line-color": "#4FC3F7", "line-opacity": 0.6, "line-width": 2.2 },
  });
  map.addLayer({
    id: "my-accuracy",
    type: "circle",
    source: "me",
    paint: { "circle-radius": 12, "circle-color": ["case", ["==", ["get", "source"], "simulated"], "#FF8F00", ["==", ["get", "source"], "manual"], "#B388FF", "#2979FF"], "circle-opacity": 0.12, "circle-stroke-color": "#2979FF", "circle-stroke-opacity": 0.4, "circle-stroke-width": 0.5 },
  });
  map.addLayer({
    id: "my-halo",
    type: "circle",
    source: "me",
    paint: { "circle-radius": 12, "circle-color": ["case", ["==", ["get", "source"], "simulated"], "#FF8F00", ["==", ["get", "source"], "manual"], "#B388FF", "#2979FF"], "circle-opacity": 0.18 },
  });
  map.addLayer({
    id: "my-dot",
    type: "circle",
    source: "me",
    paint: {
      "circle-radius": 5,
      "circle-color": ["case", ["==", ["get", "source"], "simulated"], "#FF8F00", ["==", ["get", "source"], "manual"], "#B388FF", "#2979FF"],
      "circle-stroke-color": "#0b1626",
      "circle-stroke-width": 1.5,
    },
  });
}

// Capas del catálogo: se agregan recién cuando llegan los datos (arranque
// progresivo). Quedan por debajo de las capas base (ancla "imported-lines").
function addBasinLayers(ui: UiState, basins: Record<string, Basin>): void {
  const map = ui.map;
  if (map.getLayer("basin-label")) return;
  map.addSource("basins", { type: "geojson", data: basinsFeatureCollection(basins) });
  map.addLayer(
    {
      id: "basin-label",
      type: "symbol",
      source: "basins",
      maxzoom: 3,
      layout: { "text-field": ["get", "name"], "text-size": 12 },
      paint: { "text-color": "#4FC3F7", "text-halo-color": "#0b1626", "text-halo-width": 1.5 },
    },
    "imported-lines",
  );
  map.on("click", "basin-label", (e) => {
    const name = e.features?.[0]?.properties?.["name"];
    if (typeof name === "string") {
      ui.region.set(name);
      goTo(ui, "rutas");
    }
  });
}

function addCatalogLayers(ui: UiState, routesGeoJson: string): void {
  const map = ui.map;
  if (map.getLayer("catalog-lines")) return;
  map.addSource("catalog", { type: "geojson", data: JSON.parse(routesGeoJson) as object });
  const before = map.getLayer("basin-label") ? "basin-label" : "imported-lines";
  map.addLayer(
    {
      id: "catalog-lines",
      type: "line",
      source: "catalog",
      filter: ["==", ["get", "variant"], ""],
      paint: { "line-color": "#4FC3F7", "line-opacity": 0.25, "line-width": 1 },
    },
    before,
  );
  map.on("click", "catalog-lines", (e) => {
    const code = e.features?.[0]?.properties?.["code"];
    if (typeof code === "string") openRoute(ui, code);
  });
  map.on("mouseenter", "catalog-lines", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "catalog-lines", () => {
    map.getCanvas().style.cursor = "";
  });
}

function setSource(map: MlMap, id: string, data: object): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  src?.setData(data as never);
}

function lineFeature(coords: [number, number][], props: Record<string, unknown> = {}): object {
  return { type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } };
}

function pointFeature(lon: number, lat: number, props: Record<string, unknown> = {}): object {
  return { type: "Feature", properties: props, geometry: { type: "Point", coordinates: [lon, lat] } };
}

function featureCollection(features: object[]): object {
  return { type: "FeatureCollection", features };
}

function basinsFeatureCollection(basins: Record<string, Basin>): object {
  const features: object[] = [];
  for (const [name, b] of Object.entries(basins)) {
    for (const box of b.boxes) {
      if (box.length < 4) continue;
      const lon = (box[0]! + box[2]!) / 2;
      const lat = (box[1]! + box[3]!) / 2;
      features.push(pointFeature(lon, lat, { name }));
    }
  }
  return featureCollection(features);
}

function basinAt(ui: UiState, lon: number, lat: number): string | null {
  for (const [name, b] of Object.entries(ui.basins)) {
    for (const box of b.boxes) {
      if (box.length < 4) continue;
      if (box[0]! <= lon && lon <= box[2]! && box[1]! <= lat && lat <= box[3]!) return name;
    }
  }
  return null;
}

const CATALOG_EMPTY_FILTER: FilterSpecification = ["==", ["get", "variant"], ""];

function applyCatalogFilter(ui: UiState): void {
  if (!ui.map.getLayer("catalog-lines")) return;
  if (ui.map.getZoom() < 3) {
    ui.map.setFilter("catalog-lines", CATALOG_EMPTY_FILTER);
    return;
  }
  const c = ui.map.getCenter();
  let region = basinAt(ui, c.lng, c.lat);
  if (!region && ui.region()) region = ui.region();
  if (!region) {
    ui.map.setFilter("catalog-lines", CATALOG_EMPTY_FILTER);
    return;
  }
  const codes = filterEntries(ui.index, { query: ui.query(), region: ui.region() || region }).map((e) => e.code);
  const firstByCode = new Map<string, string>();
  for (const v of ui.variants) if (!firstByCode.has(v.code)) firstByCode.set(v.code, v.variant);
  const ids: string[] = [];
  for (const code of codes) {
    const id = firstByCode.get(code);
    if (id) ids.push(id);
  }
  ui.map.setFilter("catalog-lines", ["in", ["get", "variant"], ["literal", ids]]);
}

function fitTo(ui: UiState, coords: [number, number][]): void {
  if (coords.length === 0) return;
  let minLon = coords[0]![0];
  let minLat = coords[0]![1];
  let maxLon = minLon;
  let maxLat = minLat;
  for (const [lon, lat] of coords) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  ui.map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding: { top: 90, bottom: getBottomPadding(ui), left: getLeftPadding(ui), right: 40 }, maxZoom: 7, duration: 600 },
  );
}

function drawSelected(ui: UiState, code: string | null, variant: string | null): void {
  if (code === null) {
    setSource(ui.map, "selected", featureCollection([]));
    return;
  }
  const features: object[] = [];
  for (const [key, g] of ui.geometry) {
    if (!key.startsWith(`${code}|`)) continue;
    if (variant !== null && key !== `${code}|${variant}`) continue;
    features.push(lineFeature(g.coords));
    for (let i = 0; i < g.coords.length; i++) {
      features.push(pointFeature(g.coords[i]![0], g.coords[i]![1], { name: g.names[i] ?? "" }));
    }
  }
  setSource(ui.map, "selected", featureCollection(features));
}

function drawActive(ui: UiState): void {
  const a = ui.active();
  const g = a?.variant ? ui.geometry.get(`${a.code}|${a.variant}`) : undefined;
  if (!g) {
    setSource(ui.map, "active", featureCollection([]));
    return;
  }
  const features: object[] = [lineFeature(g.coords)];
  for (let i = 0; i < g.coords.length; i++) {
    features.push(pointFeature(g.coords[i]![0], g.coords[i]![1], { name: g.names[i] ?? "" }));
  }
  setSource(ui.map, "active", featureCollection(features));
}

function drawImported(ui: UiState): void {
  const features = ui.imported().map((r) => JSON.parse(importedRouteToGeoJson(r)) as object);
  setSource(ui.map, "imported", featureCollection(features));
}

function drawVoyage(ui: UiState, log: VoyageLog | null): void {
  if (!log || log.points.length < 2) {
    setSource(ui.map, "voyage", featureCollection([]));
    return;
  }
  setSource(
    ui.map,
    "voyage",
    featureCollection([lineFeature(log.points.map((p) => [p.lon, p.lat] as [number, number]))]),
  );
}

function wireGps(ui: UiState): void {
  let stop: (() => void) | null = null;
  const start = (): void => {
    if (stop) return;
    stop = watchGps((u) => {
      ui.gpsStatus.set(u.status);
      if (u.position) {
        ui.position.set(u.position);
        setSource(ui.map, "me", featureCollection([pointFeature(u.position.lon, u.position.lat)]));
        pushFix(ui, u.position);
      }
    });
  };
  (window as unknown as { hnStartGps: () => void }).hnStartGps = start;
  (window as unknown as { hnStopGps: () => void }).hnStopGps = () => {
    stop?.();
    stop = null;
  };
}

function pushFix(ui: UiState, p: Position): void {
  ui.navFixes.push({ lat: p.lat, lon: p.lon, t: p.t, speedMps: null, headingDeg: null });
  if (ui.navFixes.length > 240) ui.navFixes.splice(0, ui.navFixes.length - 240);
  if (!ui.recording()) return;
  const log = ui.voyage() ?? { name: `Bitácora ${isoDate()}`, points: [] };
  const next = withPoint(log, p.lat, p.lon, p.t);
  if (next !== log) {
    ui.voyage.set(next);
    persist(ui, KEYS.voyageCurrent, JSON.stringify(next));
  }
}

function wireGpsStart(): void {
  (window as unknown as { hnStartGps?: () => void }).hnStartGps?.();
}

// --------------------------------------------------------- barra de contexto

function renderContextBar(ui: UiState, bar: HTMLElement): void {
  effect(() => {
    const month = ui.month();
    const pos = ui.position();
    const status = ui.gpsStatus();
    const ctx = pos ? resolveContext(pos.lat, pos.lon, month, ui.basins, ui.variants) : null;

    clear(bar);
    const where = el("button", { class: "hn-ctx-where" });
    where.append(
      el("span", { class: "hn-ctx-label" }, "Dónde"),
      el("span", { class: "hn-ctx-value" }, ctx?.region ?? (pos ? "alta mar" : "sin posición")),
    );
    where.addEventListener("click", () => goTo(ui, "aqui"));

    const when = el("button", { class: "hn-ctx-when" });
    when.append(el("span", { class: "hn-ctx-label" }, "Cuándo"), el("span", { class: "hn-ctx-value" }, MONTH_ABBR[month - 1] ?? ""));
    when.addEventListener("click", () => goTo(ui, "aqui"));

    const chip = el("button", { class: "hn-ctx-pos" });
    chip.append(el("span", { class: `hn-dot hn-dot-${status}` }), el("span", {}, positionLabel(ui)));
    chip.addEventListener("click", () => {
      const p = ui.position();
      const s = ui.gpsStatus();
      if (!p && s === "off") {
        wireGpsStart();
        return;
      }
      // menú simple
      const m = el("div", { class: "hn-menu" });
      const useGps = el("button", { class: "hn-btn" }, "Usar GPS");
      useGps.addEventListener("click", () => { m.remove(); wireGpsStart(); });
      const write = el("button", { class: "hn-btn" }, "Escribir coordenadas");
      write.addEventListener("click", () => { m.remove(); openManualPosition(ui); });
      const ap = el("button", { class: "hn-btn" }, "Apagar");
      ap.addEventListener("click", () => { m.remove(); ui.position.set(null); ui.gpsStatus.set("off"); (window as unknown as { hnStopGps?: () => void }).hnStopGps?.(); });
      m.append(useGps, write, ap);
      document.body.appendChild(m);
      const rm = (ev: Event) => { if (!m.contains(ev.target as Node)) { m.remove(); document.removeEventListener("click", rm); } };
      setTimeout(() => document.addEventListener("click", rm), 0);
    });

    bar.append(where, when, chip);
  });
}

function goTo(ui: UiState, tab: TabName): void {
  ui.selected.set(null);
  ui.tab.set(tab);
  if (ui.sheet() === "peek") ui.sheet.set("half");
}

function positionLabel(ui: UiState): string {
  const p = ui.position();
  if (p) return p.source === "gps" ? "GPS" : p.source === "manual" ? "manual" : "simulada";
  const s = ui.gpsStatus();
  if (s === "searching") return "ubicando…";
  if (s === "denied") return "GPS denegado";
  if (s === "unavailable") return "sin GPS";
  if (!p && s === "off") return "Usar GPS";
  return "poner posición";
}

// --------------------------------------------------------------- hoja

function renderSheet(ui: UiState, sheet: HTMLElement): void {
  let cleanup: (() => void)[] = [];
  effect(() => {
    const state = ui.sheet();
    const tab = ui.tab();
    const sel = ui.selected();
    const catalog = ui.catalog();
    ui.routes();
    for (const d of cleanup) d();
    cleanup = [];
    sheet.className = `hn-sheet hn-sheet-${state}`;
    clear(sheet);

    const handle = el("div", { class: "hn-handle" });
    let startY = 0;
    let dragging = false;
    handle.addEventListener("pointerdown", (ev) => {
      dragging = true;
      startY = ev.clientY;
      handle.setPointerCapture(ev.pointerId);
    });
    handle.addEventListener("pointerup", (ev) => {
      if (!dragging) return;
      dragging = false;
      const dy = ev.clientY - startY;
      if (dy > -24 && dy < 24) return;
      const order: SheetState[] = ["peek", "half", "full"];
      const i = order.indexOf(state);
      const next = dy < 0 ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
      ui.sheet.set(order[next]!);
    });
    handle.addEventListener("pointercancel", () => {
      dragging = false;
    });
    sheet.append(handle);

    const tabs = el("div", { class: "hn-tabs" });
    const names: { id: TabName; label: string }[] = [
      { id: "aqui", label: "Aquí" },
      { id: "rutas", label: "Rutas" },
      { id: "travesia", label: "Travesía" },
    ];
    for (const t of names) {
      const b = el("button", { class: `hn-tab${tab === t.id && !sel ? " on" : ""}` }, t.label);
      b.addEventListener("click", () => goTo(ui, t.id));
      tabs.append(b);
    }
    sheet.append(tabs);

    const body = el("div", { class: "hn-sheet-body" });
    sheet.append(body);

    // El cuerpo se arma una vez por cambio de pestaña/ficha/estado de hoja.
    // Lo que sí depende de la posición o el mes se actualiza con efectos
    // locales (ver cleanup) que reemplazan solo su nodo, sin tocar el scroll.
    untracked(() => {
      if (sel) renderFicha(ui, body, sel.code, sel.chapter);
      else if (catalog === "loading") renderCatalogLoading(body);
      else if (catalog === "failed") renderCatalogFailed(body);
      else if (tab === "aqui") renderAqui(ui, body, cleanup);
      else if (tab === "rutas") renderRutas(ui, body, cleanup);
      else renderTravesia(ui, body, cleanup);
    });
  });
}

function renderCatalogLoading(body: HTMLElement): void {
  body.append(el("p", { class: "hn-muted" }, "Cargando catálogo…"));
}

function renderCatalogFailed(body: HTMLElement): void {
  body.append(el("p", { class: "hn-muted" }, "Sin catálogo todavía"));
  const retry = el("button", { class: "hn-btn" }, "Reintentar");
  retry.addEventListener("click", () => window.hnRetryCatalog?.());
  body.append(retry);
}

// ----------------------------------------------------------- pestaña Aquí

function renderAqui(ui: UiState, body: HTMLElement, cleanup: (() => void)[]): void {
  body.append(el("h2", { class: "hn-h2" }, "Aquí"));

  const top = el("div", { class: "hn-aqui-top" });
  body.append(top);

  cleanup.push(
    effect(() => {
      const month = ui.month();
      const pos = ui.position();
      const ctx = pos ? resolveContext(pos.lat, pos.lon, month, ui.basins, ui.variants) : null;
      const nodes: Node[] = [];

      const sentence = el("p", { class: "hn-sentence" });
      sentence.textContent = ctx?.region
        ? `Estás en ${ctx.region}, en ${MONTH_NAME[month - 1]}.`
        : pos
          ? `Estás en alta mar, en ${MONTH_NAME[month - 1]}.`
          : "Todavía no hay posición.";
      nodes.push(sentence);

      if (ctx) nodes.push(stormCard(ctx, month));

      if (pos) {
        const st = sunTimes(pos.lat, pos.lon, Date.now());
        if (st) {
          nodes.push(
            el(
              "div",
              { class: "hn-card" },
              el("div", { class: "hn-card-title" }, "Luz del día (UTC)"),
              el("div", { class: "hn-sun-row" }, el("span", {}, `↑ ${clock(st.sunriseMs)}`), el("span", {}, `↓ ${clock(st.sunsetMs)}`)),
            ),
          );
        }
      }

      nodes.push(el("h3", { class: "hn-h3" }, "Rutas que te pasan cerca"));
      if (!ctx || ctx.nearby.length === 0) {
        nodes.push(el("p", { class: "hn-muted" }, "Sin rutas a menos de 600 nm. Activá el GPS o poné tu posición a mano."));
      } else {
        const list = el("div", { class: "hn-list" });
        for (const n of ctx.nearby) {
          const e = entryOf(ui, n.code);
          if (e) list.append(routeRow(ui, e, n.distanceNm, n.nearestWp));
        }
        nodes.push(list);
      }

      top.replaceChildren(...nodes);
    }),
  );

  const activeSlot = el("div", { class: "hn-aqui-active" });
  body.append(activeSlot);
  cleanup.push(
    effect(() => {
      const active = ui.active();
      activeSlot.replaceChildren();
      if (active) renderActive(ui, activeSlot, active);
    }),
  );
}

function renderActive(ui: UiState, body: HTMLElement, active: ActiveRoute): void {
  const e = entryOf(ui, active.code);
  const nav = activeNav(ui);
  body.append(el("h3", { class: "hn-h3" }, "Ruta en curso"));
  const card = el("div", { class: "hn-card" });
  card.append(el("div", { class: "hn-card-title" }, e ? `${e.code} ${e.from} → ${e.to}` : active.code));
  if (nav) {
    const grid = el("div", { class: "hn-nav-grid" });
    grid.append(
      navCell("Próximo", nav.fix.nextName || `${formatLat(nav.fix.nextLat)} ${formatLon(nav.fix.nextLon)}`),
      navCell("Rumbo", `${Math.round(nav.fix.bearingDeg)}°`),
      navCell("Distancia", nmDecimal(nav.fix.distanceNm)),
      navCell("Desvío", xteLabel(nav.fix.xteNm)),
      navCell("Tramo", `${nav.fix.legIndex + 1} de ${maxLeg(nav.track)}`),
      navCell("Velocidad", nav.kin.sogKn === null ? "—" : `${nav.kin.sogKn.toFixed(1)} kn`),
      navCell("VMG", nav.kin.vmgKn === null ? "—" : `${nav.kin.vmgKn.toFixed(1)} kn`),
      navCell("ETA próximo", nav.kin.etaNextMs === null ? "—" : clock(nav.kin.etaNextMs)),
      navCell("ETA destino", nav.kin.etaDestMs === null ? "—" : clock(nav.kin.etaDestMs)),
    );
    card.append(grid);
  } else {
    card.append(el("p", { class: "hn-muted" }, "Poné tu posición para ver rumbo, distancia y ETA."));
  }
  const actions = el("div", { class: "hn-actions" });
  const ver = el("button", { class: "hn-btn" }, "Ver ficha");
  ver.addEventListener("click", () => openRoute(ui, active.code));
  const stop = el("button", { class: "hn-btn" }, "Dejar de seguir");
  stop.addEventListener("click", () => ui.active.set(null));
  actions.append(ver, stop);
  card.append(actions);
  body.append(card);
}

function stormCard(
  ctx: { stormMonths: number[]; inStormSeason: boolean; rsmc: string | null },
  month: number,
): HTMLElement {
  const card = el("div", { class: "hn-card" });
  card.append(el("div", { class: "hn-card-title" }, "Ciclones"));
  if (ctx.stormMonths.length === 0) {
    card.append(el("p", { class: "hn-line" }, "Sin temporada de ciclones en esta cuenca."));
  } else {
    const span = `${MONTH_ABBR[ctx.stormMonths[0]! - 1]}–${MONTH_ABBR[ctx.stormMonths[ctx.stormMonths.length - 1]! - 1]}`;
    card.append(el("p", { class: "hn-line" }, el("span", { class: "hn-k" }, "Temporada: "), span));
    card.append(
      el(
        "p",
        { class: "hn-line" },
        ctx.inStormSeason
          ? `Estás dentro de la temporada (${MONTH_NAME[month - 1]}).`
          : `Estás fuera de la temporada (${MONTH_NAME[month - 1]}).`,
      ),
    );
  }
  if (ctx.rsmc) card.append(el("p", { class: "hn-muted" }, `Avisos: ${ctx.rsmc}.`));
  return card;
}

function navCell(label: string, value: string): HTMLElement {
  const c = el("div", { class: "hn-nav-cell" });
  c.append(el("div", { class: "hn-nav-label" }, label), el("div", { class: "hn-nav-value" }, value));
  return c;
}

function activeNav(ui: UiState): { fix: NavFix; kin: Kinematics; track: RouteTrack } | null {
  const a = ui.active();
  const p = ui.position();
  if (!a || !p) return null;
  const g = a.variant ? ui.geometry.get(`${a.code}|${a.variant}`) : null;
  if (!g) return null;
  const track: RouteTrack = {
    names: g.names,
    dests: g.coords.map(() => false),
    corrected: g.coords.map(() => false),
    coords: g.coords,
  };
  const fix = navigate(track, p.lat, p.lon);
  if (!fix) return null;
  return { fix, kin: kinematics(ui.navFixes, fix, remainingToDest(g.coords, fix), Date.now()), track };
}


function xteLabel(xteNm: number): string {
  const v = Math.abs(xteNm).toFixed(1).replace('.', ',');
  if (xteNm > 0) return `${v} nm a estribor`;
  if (xteNm < 0) return `${v} nm a babor`;
  return '0,0 nm';
}

function maxLeg(track: RouteTrack): number {
  return Math.max(0, track.coords.length - 1);
}

function remainingToDest(coords: [number, number][], fix: NavFix): number {
  let sum = Math.max(0, fix.legNm - fix.alongNm);
  for (let i = fix.legIndex + 1; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    sum += haversineNm(a[1], a[0], b[1], b[0]);
  }
  return sum;
}

function routeRow(ui: UiState, e: IndexEntry, distanceNm?: number, nearestWp?: string): HTMLElement {
  const row = el("button", { class: "hn-row" });
  const sub =
    distanceNm !== undefined
      ? `${nmDecimal(distanceNm)}${nearestWp ? ` · ${nearestWp}` : ""}`
      : `${rangeNm(e.nmMin, e.nmMax)} · ${e.variantCount} variante${e.variantCount === 1 ? "" : "s"}`;
  const main = el("div", { class: "hn-row-main" });
  main.append(el("div", { class: "hn-row-title" }, `${e.code} · ${e.from} → ${e.to}`), el("div", { class: "hn-row-sub" }, sub));
  row.append(main, monthBadge(e, ui.month()));
  row.addEventListener("click", () => openRoute(ui, e.code));
  return row;
}

function monthBadge(e: IndexEntry, month: number): HTMLElement {
  const v: MonthVerdict = monthVerdict(e.bestMonths, e.stormMonths, month);
  const glyph: Record<MonthVerdict, string> = { best: "✔", storm: "⚠", off: "—" };
  const title: Record<MonthVerdict, string> = {
    best: "Buena época",
    storm: "Temporada de ciclones",
    off: "Fuera de temporada",
  };
  return el("span", { class: `hn-badge hn-badge-${v}`, title: title[v] }, glyph[v]);
}

// ---------------------------------------------------------- pestaña Rutas

function renderRutas(ui: UiState, body: HTMLElement, cleanup: (() => void)[]): void {
  body.append(el("h2", { class: "hn-h2" }, "Rutas"));

  const search = el("input", { class: "hn-search", type: "search", placeholder: "Puerto, zona o código…" });
  search.value = ui.query();
  body.append(search);

  const chips = el("div", { class: "hn-chips" });
  body.append(chips);

  const toggle = el("label", { class: "hn-toggle" });
  const cb = el("input", { type: "checkbox" });
  cb.checked = ui.nearMe();
  toggle.append(cb, el("span", {}, "Solo cerca de mí"));
  body.append(toggle);

  const results = el("div", { class: "hn-results" });
  body.append(results);

  const importRow = el("div", { class: "hn-actions hn-actions-sticky" });
  const impBtn = el("button", { class: "hn-btn" }, "Importar GPX/KML/CSV");
  impBtn.addEventListener("click", () => void importFile(ui));
  importRow.append(impBtn);
  body.append(importRow);

  const buildChips = (): void => {
    clear(chips);
    for (const r of ["", ...uniqueRegions(ui)]) {
      const chip = el("button", { class: `hn-chip${ui.region() === r ? " on" : ""}` }, r === "" ? "Todas" : r);
      chip.addEventListener("click", () => {
        ui.region.set(r);
        buildChips();
        refresh();
      });
      chips.append(chip);
    }
  };

  const refresh = (): void => {
    clear(results);
    const pos = ui.position();
    if (ui.nearMe() && pos) {
      const scored = filterEntries(ui.index, { query: ui.query(), region: ui.region() })
        .map((e) => ({ e, d: bboxDistanceNm(e, pos.lat, pos.lon) }))
        .filter((x) => x.d <= 600)
        .sort((a, b) => a.d - b.d);
      results.append(el("p", { class: "hn-muted" }, `${scored.length} rutas cerca`));
      const rows = el("div", { class: "hn-list" });
      for (const { e, d } of scored.slice(0, 80)) rows.append(routeRow(ui, e, d));
      results.append(rows);
    } else {
      const list = filterEntries(ui.index, { query: ui.query(), region: ui.region() });
      if (list.length === 0) {
        results.append(el("p", { class: "hn-muted" }, "Sin resultados."));
      } else {
        results.append(el("p", { class: "hn-muted" }, `${list.length} rutas`));
        const rows = el("div", { class: "hn-list" });
        for (const e of list.slice(0, 120)) rows.append(routeRow(ui, e));
        results.append(rows);
      }
    }
    const imported = ui.imported();
    if (imported.length > 0) {
      results.append(el("h3", { class: "hn-h3" }, "Importadas"));
      const rows = el("div", { class: "hn-list" });
      for (const r of imported) {
        const row = el("button", { class: "hn-row" });
        row.append(el("div", { class: "hn-row-main" }, el("div", { class: "hn-row-title" }, r.name), el("div", { class: "hn-row-sub" }, `${r.points.length} puntos`)));
        row.addEventListener("click", () => showImported(ui, r));
        rows.append(row);
      }
      results.append(rows);
    }
  };

  search.addEventListener("input", () => {
    ui.query.set(search.value);
    refresh();
  });
  cb.addEventListener("change", () => {
    ui.nearMe.set(cb.checked);
    refresh();
  });

  buildChips();

  // La lista se redibuja al cambiar búsqueda, cuenca, importadas o "cerca de mí".
  // Se reemplaza solo el contenedor de resultados y se conserva el scroll.
  cleanup.push(
    effect(() => {
      ui.imported();
      ui.region();
      const near = ui.nearMe();
      if (near) ui.position();
      const top = body.scrollTop;
      untracked(refresh);
      body.scrollTop = top;
    }),
  );
}

function showImported(ui: UiState, r: ImportedRoute): void {
  const coords = r.points.map((p) => [p.lon, p.lat] as [number, number]);
  setSource(ui.map, "selected", featureCollection([lineFeature(coords)]));
  fitTo(ui, coords);
}

function uniqueRegions(ui: UiState): string[] {
  const seen: string[] = [];
  for (const r of ui.index.routes) if (r.region && !seen.includes(r.region)) seen.push(r.region);
  return seen;
}

function bboxDistanceNm(e: IndexEntry, lat: number, lon: number): number {
  const b = e.bbox;
  if (b.length < 4) return Number.MAX_VALUE;
  const lon2 = Math.min(Math.max(lon, b[0]!), b[2]!);
  const lat2 = Math.min(Math.max(lat, b[1]!), b[3]!);
  return haversineNm(lat, lon, lat2, lon2);
}

async function importFile(ui: UiState): Promise<void> {
  const file = await pickTextFile(".gpx,.kml,.csv,.txt,text/plain");
  if (!file) return;
  const route = parseRouteFile(file.name, file.text);
  if (!route) {
    const msg = el("p", { class: "hn-error" }, "No pude leer ese archivo. Probá con GPX, KML o CSV con columnas lat/lon.");
    const actions = el("div", { class: "hn-actions" });
    actions.append(el("button", { class: "hn-btn hn-btn-primary" }, "OK"));
    const box = el("div", { class: "hn-modal-box" });
    box.append(el("h3", { class: "hn-h3" }, "Error de importación"), msg, actions);
    const dialog = el("div", { class: "hn-modal" });
    dialog.append(box);
    dialog.addEventListener("click", (ev) => { if (ev.target === dialog) dialog.remove(); });
    document.body.append(dialog);
    actions.querySelector("button")!.addEventListener("click", () => dialog.remove());
    return;
  }
  const next = [...ui.imported(), route];
  ui.imported.set(next);
  persist(ui, KEYS.imported, JSON.stringify(next));
  drawImported(ui);
  showImported(ui, route);
  ui.tab.set("rutas");
  ui.sheet.set("half");
}

// --------------------------------------------------------------- ficha

function openRoute(ui: UiState, code: string): void {
  const e = entryOf(ui, code);
  if (!e) return;
  ui.selected.set({ code, chapter: e.chapter });
  updateUrlForSelection(code, selectedVariant);
  if (ui.sheet() === "peek") ui.sheet.set("half");
  drawSelected(ui, code, null);
  const g = firstGeometry(ui, code);
  if (g) fitTo(ui, g.coords);
}

function renderFicha(ui: UiState, body: HTMLElement, code: string, chapter: string): void {
  const back = el("button", { class: "hn-back" }, "← Rutas");
  back.addEventListener("click", () => {
    ui.selected.set(null);
    ui.sheet.set("half");
    drawSelected(ui, null, null);
  });
  body.append(back);

  const e = entryOf(ui, code);
  if (!e) {
    body.append(el("p", { class: "hn-muted" }, "Ruta no encontrada."));
    return;
  }

  body.append(el("h2", { class: "hn-h2" }, `${e.code} · ${e.from} → ${e.to}`));
  body.append(el("p", { class: "hn-title-en" }, e.title));
  body.append(el("p", { class: "hn-muted" }, `${rangeNm(e.nmMin, e.nmMax)} · ${e.variantCount} variante${e.variantCount === 1 ? "" : "s"}`));

  const host = el("div", { class: "hn-ficha-host" });
  host.append(el("p", { class: "hn-muted" }, "Cargando ficha…"));
  body.append(host);

  void loadFact(chapter, code).then(
    (detail) => {
      clear(host);
      if (detail) renderFichaDetail(ui, host, detail);
      else host.append(el("p", { class: "hn-muted" }, "Sin ficha para esta ruta."));
    },
    () => {
      clear(host);
      host.append(el("p", { class: "hn-muted" }, "No pude cargar la ficha."));
    },
  );
}

function renderFichaDetail(ui: UiState, host: HTMLElement, d: RouteDetail): void {
  const actions = el("div", { class: "hn-actions" });

  const seguir = el("button", { class: "hn-btn hn-btn-primary" }, "Seguir");
  seguir.addEventListener("click", () => {
    ui.active.set({ code: d.code, chapter: d.chapter, variant: d.variants[0]?.id ?? null });
    wireGpsStart();
    ui.selected.set(null);
    ui.tab.set("aqui");
    ui.sheet.set("half");
  });

  const exportar = el("button", { class: "hn-btn" }, "Exportar GPX");
  exportar.addEventListener("click", () => {
    const g = firstGeometry(ui, d.code);
    if (g) downloadText(`${d.code}.gpx`, "application/gpx+xml", trackToGpx(d.code, g));
  });

  const recorrer = el("button", { class: "hn-btn" }, "Recorrer");
  recorrer.addEventListener("click", () => {
    const g = firstGeometry(ui, d.code);
    if (g) fitTo(ui, g.coords);
  });

  const enlace = el("button", { class: "hn-btn" }, "Enlace");
  enlace.addEventListener("click", () => {
    const url = new URL(document.baseURI);
    url.searchParams.set("ruta", d.code);
    void navigator.clipboard?.writeText(url.toString());
    enlace.textContent = "Copiado";
  });

  actions.append(seguir, exportar, recorrer, enlace);
  host.append(actions);

  host.append(el("h3", { class: "hn-h3" }, "Cuándo"));
  host.append(monthStrip(ui, d));
  const w = d.whenInfo;
  if (w.bestEs) host.append(el("p", { class: "hn-line" }, el("span", { class: "hn-k" }, "Mejor época: "), w.bestEs));
  if (w.stormsEs) host.append(el("p", { class: "hn-line" }, el("span", { class: "hn-k" }, "Ciclones: "), w.stormsEs));

  if (d.variants.length > 0) {
    host.append(el("h3", { class: "hn-h3" }, "Variantes"));
    const list = el("div", { class: "hn-variants" });
    for (const v of d.variants) {
      const item = el("button", { class: "hn-variant" });
      item.append(
        el(
          "div",
          { class: "hn-variant-main" },
          el("div", { class: "hn-row-title" }, `${v.id} · ${v.from} → ${v.to}`),
          el("div", { class: "hn-row-sub" }, `${nm(v.nm)}${v.coastal ? " · costera" : ""}`),
        ),
      );
      if (v.needsReview) item.append(el("span", { class: "hn-info" }, "Trazado orientativo: en tramos costeros faltan waypoints intermedios. Verificá con tu carta."));
      item.addEventListener("click", () => {
        drawSelected(ui, d.code, v.id);
        const g = ui.geometry.get(`${d.code}|${v.id}`);
        if (g) fitTo(ui, g.coords);
      });
      list.append(item);
    }
    host.append(list);
  }

  const wps = d.variants[0]?.waypoints ?? [];
  if (wps.length > 0) {
    host.append(el("h3", { class: "hn-h3" }, "Waypoints"));
    const list = el("div", { class: "hn-list hn-wps" });
    for (const wp of wps) {
      const row = el("div", { class: "hn-wp" });
      const name = wp.name || (wp.corrected ? "(corregido)" : "(sin nombre)");
      row.append(
        el("div", { class: "hn-wp-name" }, wp.dest ? `⚑ ${name}` : name),
        el("div", { class: "hn-wp-coord" }, `${formatLat(wp.lat)}  ${formatLon(wp.lon)}`),
      );
      if (wp.corrected) row.append(el("span", { class: "hn-tag" }, "corregido"));
      list.append(row);
    }
    host.append(list);
  }

  if (d.charts.length > 0) host.append(plainList("Cartas", d.charts));
  if (d.guides.length > 0) host.append(plainList("Guías", d.guides));
  if (d.planner.length > 0) host.append(plainList("Planificador", d.planner));
  if (d.tip) host.append(el("div", { class: "hn-tip" }, d.tip));
  if (d.chapterTip) host.append(el("div", { class: "hn-tip hn-tip-chapter" }, d.chapterTip));

  if (d.quoteEs || d.quoteEn) {
    const q = el("blockquote", { class: "hn-quote" });
    if (d.quoteEs) q.append(el("p", {}, d.quoteEs));
    else if (d.quoteEn) q.append(el("p", { class: "hn-quote-en" }, d.quoteEn));
    if (d.quoteSource) q.append(el("cite", {}, d.quoteSource));
    host.append(q);
  }

  if (d.attribution) host.append(el("p", { class: "hn-attrib" }, d.attribution));
  if (d.needsReview) host.append(el("p", { class: "hn-info" }, "Trazado orientativo: en tramos costeros faltan waypoints intermedios. Verificá con tu carta."));
}

function plainList(title: string, items: string[]): HTMLElement {
  const wrap = el("div", { class: "hn-plain" });
  wrap.append(el("h3", { class: "hn-h3" }, title));
  const ul = el("ul", { class: "hn-plain-list" });
  for (const i of items) ul.append(el("li", {}, i));
  wrap.append(ul);
  return wrap;
}

function monthStrip(ui: UiState, d: RouteDetail): HTMLElement {
  const strip = el("div", { class: "hn-months" });
  for (let m = 1; m <= 12; m++) {
    const v = monthVerdict(d.whenInfo.bestMonths, d.whenInfo.stormMonths, m);
    const b = el(
      "button",
      { class: `hn-month hn-month-${v}${ui.month() === m ? " on" : ""}`, title: MONTH_NAME[m - 1] ?? "" },
      MONTH_INITIAL[m - 1] ?? "",
    );
    b.addEventListener("click", () => ui.month.set(m));
    strip.append(b);
  }
  const legend = el("div", { class: "hn-months-legend" });
  legend.append(
    el("span", { class: "hn-month hn-month-best" }, "buena"),
    el("span", { class: "hn-month hn-month-storm" }, "ciclones"),
    el("span", { class: "hn-month hn-month-off" }, "fuera"),
  );
  return el("div", { class: "hn-months-wrap" }, strip, legend);
}

// ------------------------------------------------------------ pestaña Travesía

function renderTravesia(ui: UiState, body: HTMLElement, cleanup: (() => void)[]): void {
  body.append(el("h2", { class: "hn-h2" }, "Travesía"));

  const card = el("div", { class: "hn-card" });
  card.append(el("div", { class: "hn-card-title" }, "Bitácora"));
  const counters = el("div");
  card.append(counters);
  body.append(card);

  cleanup.push(
    effect(() => {
      const log = ui.voyage();
      if (!log || log.points.length === 0) {
        counters.replaceChildren(el("p", { class: "hn-muted" }, "Sin puntos todavía. Empezá a grabar con el GPS."));
      } else {
        const grid = el("div", { class: "hn-nav-grid" });
        grid.append(navCell("Puntos", String(log.points.length)), navCell("Recorrido", nm(voyageDistanceNm(log))));
        counters.replaceChildren(grid);
      }
    }),
  );

  const actions = el("div", { class: "hn-actions" });
  const rec = el("button", { class: "hn-btn" }, ui.recording() ? "Pausar" : "Grabar");
  cleanup.push(
    effect(() => {
      rec.className = `hn-btn${ui.recording() ? " hn-btn-primary" : ""}`;
      rec.textContent = ui.recording() ? "Pausar" : "Grabar";
    }),
  );
  rec.addEventListener("click", () => {
    if (ui.recording()) {
      ui.recording.set(false);
    } else {
      if (!ui.voyage()) ui.voyage.set({ name: `Bitácora ${isoDate()}`, points: [] });
      ui.recording.set(true);
      wireGpsStart();
    }
  });
  const exportBtn = el("button", { class: "hn-btn" }, "Exportar GPX");
  exportBtn.addEventListener("click", () => {
    const l = ui.voyage();
    if (l && l.points.length >= 2) {
      downloadText(`bitacora-${l.name.replace(/\s+/g, "_")}.gpx`, "application/gpx+xml", voyageToGpx(l));
    }
  });
  const clearBtn = el("button", { class: "hn-btn" }, "Nueva");
  clearBtn.addEventListener("click", () => {
    if (!confirm("¿Empezar una bitácora nueva? La actual se guarda en el archivo.")) return;
    const l = ui.voyage();
    if (l && l.points.length > 1) {
      void ui.store.get(KEYS.voyageArchive).then((prev) => {
        const arr = readJson<VoyageLog[]>(prev, []);
        arr.push(l);
        return ui.store.put(KEYS.voyageArchive, JSON.stringify(arr));
      });
    }
    ui.recording.set(false);
    const next: VoyageLog = { name: `Bitácora ${isoDate()}`, points: [] };
    ui.voyage.set(next);
    persist(ui, KEYS.voyageCurrent, JSON.stringify(next));
  });
  actions.append(rec, exportBtn, clearBtn);
  body.append(actions);
}

// ------------------------------------------------------ posición a mano

function openManualPosition(ui: UiState): void {
  const dialog = el("div", { class: "hn-modal" });
  const box = el("div", { class: "hn-modal-box" });
  box.append(el("h3", { class: "hn-h3" }, "Poner posición a mano"));
  box.append(el("p", { class: "hn-muted" }, "Formato: 15.5 -60.2  ·  15°30'N 60°12'W"));
  const input = el("input", { class: "hn-search", placeholder: "lat lon" });
  const p = ui.position();
  if (p && p.source === "manual") input.value = `${p.lat} ${p.lon}`;
  box.append(input);

  const actions = el("div", { class: "hn-actions" });
  const ok = el("button", { class: "hn-btn hn-btn-primary" }, "Usar");
  ok.addEventListener("click", () => {
    const parsed = parseCoords(input.value);
    if (!parsed) {
      const msg = el("p", { class: "hn-error" }, "No pude leer esas coordenadas.");
      const act = el("div", { class: "hn-actions" });
      act.append(el("button", { class: "hn-btn hn-btn-primary" }, "OK"));
      const box = el("div", { class: "hn-modal-box" });
      box.append(el("h3", { class: "hn-h3" }, "Coordenadas inválidas"), msg, act);
      const dialog = el("div", { class: "hn-modal" });
      dialog.append(box);
      dialog.addEventListener("click", (ev) => { if (ev.target === dialog) dialog.remove(); });
      document.body.append(dialog);
      act.querySelector("button")!.addEventListener("click", () => dialog.remove());
      return;
    }
    const pos: Position = { lat: parsed.lat, lon: parsed.lon, accuracyM: 0, source: "manual", t: Date.now() };
    ui.position.set(pos);
    ui.gpsStatus.set("off");
    persist(ui, KEYS.position, JSON.stringify(pos));
    setSource(ui.map, "me", featureCollection([pointFeature(pos.lon, pos.lat)]));
    pushFix(ui, pos);
    ui.map.flyTo({ center: [pos.lon, pos.lat], zoom: 5 });
    dialog.remove();
  });
  const cancel = el("button", { class: "hn-btn" }, "Cerrar");
  cancel.addEventListener("click", () => dialog.remove());
  actions.append(ok, cancel);
  box.append(actions);
  dialog.append(box);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.remove();
  });
  document.body.append(dialog);
  input.focus();
}

// ---------------------------------------------------------------- varios

function clock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function trackToGpx(name: string, g: Geometry): string {
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Holistic Navigator">'];
  parts.push(`<metadata><copyright author="Jimmy & Doina Cornell"><license>World Cruising Routes, 8.ª ed. — uso personal</license></copyright></metadata>`);
  parts.push(`<rte><name>${escapeXml(name)}</name>`);
  for (let i = 0; i < g.coords.length; i++) {
    const c = g.coords[i]!;
    parts.push(`<rtept lat="${c[1]}" lon="${c[0]}"><name>${escapeXml(g.names[i] ?? "")}</name><desc>${escapeXml(g.names[i] ?? "")}</desc></rtept>`);
  }
  parts.push("</rte></gpx>");
  return parts.join("");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getLeftPadding(_ui: UiState): number {
  if (typeof window === "undefined") return 40;
  return window.innerWidth >= 700 ? 400 : 40;
}

function getBottomPadding(_ui: UiState): number {
  if (typeof window === "undefined") return 260;
  return window.innerWidth >= 700 ? 20 : 260;
}
