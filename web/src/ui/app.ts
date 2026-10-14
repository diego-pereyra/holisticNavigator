function updateUrlForSelection(routeCode?: string, variant: string = ""): void {
  try {
    const sp = new URLSearchParams(location.search);
    if (routeCode) {
      sp.set("route", routeCode);
      if (variant) sp.set("variant", variant);
      else sp.delete("variant");
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
// W4 — UI equivalente en DOM (ADR-007, sin framework):
// barra de contexto, hoja con tabs, tab Rutas (búsqueda/chips/lista), ficha v3,
// importar GPX/KML/CSV, GPS/manual y bitácora.

import type { Map as MlMap, GeoJSONSource, FilterSpecification, MapMouseEvent } from "maplibre-gl";
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
  evalAlarms,
  DEFAULT_ALARMS,
  anchorAlarm,
  anchorDistanceM,
  mobFix,
  type AlarmSettings,
  type AnchorWatch,
  type Mob,
} from "../core/alarms.ts";
import {
  voyageToGpx,
  voyageDistanceNm,
  withPoint,
  type VoyageLog,
} from "../core/voyage.ts";
import { sunTimes } from "../core/sun.ts";
import { loadFact } from "../platform/catalog.ts";
import { beep } from "../platform/sound.ts";
import { KEYS, type KeyValueStore } from "../platform/store.ts";
import {
  deleteZone,
  downloadZone,
  listZones,
  type ZoneHooks,
  type ZoneState,
} from "../platform/tiles.ts";
import { downloadText, pickTextFile } from "../platform/download.ts";
import { watchGps, type Position, type PositionStatus } from "../platform/position.ts";
import { keepAwake } from "../platform/wakelock.ts";
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

// Estado de los acordeones de la ficha (W4.5 #3), de las alarmas (E9.2) y del
// fondeo/MOB (E9.3), recordado en `hn.settings`.
interface Settings {
  acc: Record<string, boolean>;
  alarms: AlarmSettings;
  anchor: AnchorSettings;
  mob: Mob | null;
}

// Fondeo (E9.3): radio del círculo y punto donde se largó el ancla.
interface AnchorSettings extends AnchorWatch {
  active: boolean;
}

const DEFAULT_ANCHOR: AnchorSettings = { active: false, lat: 0, lon: 0, radiusM: 50 };

// Por defecto en escritorio (dos columnas) se abren Consejo y Waypoints; en
// móvil, donde Diego ya está acostumbrado a todo abierto, se abren todos.
function defaultAcc(): Record<string, boolean> {
  const desktop =
    typeof window !== "undefined" && window.matchMedia("(min-width: 1100px)").matches;
  return desktop
    ? { consejo: true, variantes: false, waypoints: true, referencias: false, libro: false }
    : { consejo: true, variantes: true, waypoints: true, referencias: true, libro: true };
}

// Un clic sobre un waypoint en la carta no debe además abrir la ruta (el mismo
// gesto llega a la capa del catálogo). La bandera se limpia en el mismo tick.
let wpHitHandled = false;

// "Fijar en el mapa" (UX-1): con el modo armado, el próximo clic fija la
// posición y los otros handlers de clic no deben reaccionar.
let fixOnMapArmed = false;

// Fichas ya cargadas: permiten volver a armarlas al cambiar de variante sin
// mostrar "Cargando…" otra vez (W4.5).
const fichaCache = new Map<string, RouteDetail>();

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
  gpsStop: (() => void) | null;
  month: Signal<number>;
  tab: Signal<TabName>;
  sheet: Signal<SheetState>;
  selected: Signal<{ code: string; chapter: string } | null>;
  variant: Signal<string>;
  active: Signal<ActiveRoute | null>;
  query: Signal<string>;
  region: Signal<string>;
  nearMe: Signal<boolean>;
  imported: Signal<ImportedRoute[]>;
  voyage: Signal<VoyageLog | null>;
  recording: Signal<boolean>;
  helpSeen: Signal<boolean | null>;
  anchor: Signal<AnchorSettings>;
  mob: Signal<Mob | null>;
  navFixes: Fix[];
  settings: Settings;
  zones?: ZoneHooks;
}

export interface AppDeps {
  store: KeyValueStore;
  zones?: ZoneHooks;
}

// El mapa y la UI se montan apenas carga el mapa base; el catálogo llega después
// y se inyecta por estos métodos (arranque progresivo, W5.1).
export interface AppHandle {
  setCatalog(index: CatalogIndex, basins: Record<string, Basin>): void;
  setRoutes(routesGeoJson: string): void;
  catalogFailed(): void;
  routesFailed(): void;
  setScaleNote(text: string | null): void;
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
    gpsStop: null,
    month: signal(currentMonthUtc()),
    tab: signal<TabName>("aqui"),
    sheet: signal<SheetState>("half"),
    selected: signal<{ code: string; chapter: string } | null>(null),
    variant: signal(bootParams.variant ?? ""),
    active: signal<ActiveRoute | null>(null),
    query: signal(""),
    region: signal(""),
    nearMe: signal(false),
    imported: signal<ImportedRoute[]>([]),
    voyage: signal<VoyageLog | null>(null),
    recording: signal(false),
    helpSeen: signal<boolean | null>(null),
    anchor: signal<AnchorSettings>({ ...DEFAULT_ANCHOR }),
    mob: signal<Mob | null>(null),
    navFixes: [],
    settings: { acc: defaultAcc(), alarms: { ...DEFAULT_ALARMS }, anchor: { ...DEFAULT_ANCHOR }, mob: null },
    zones: deps.zones,
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

  const root = el("div", { id: "hn-ui" });
  document.body.appendChild(root);
  const contextBar = el("div", { class: "hn-context" });
  const sheet = el("div", { class: "hn-sheet" });
  root.append(contextBar, sheet);

  const fab = el("button", { class: "hn-fab", "aria-label": "Centrar" }, "◉");
  fab.addEventListener("click", () => {
    const p = ui.position();
    if (!p) {
      startGps(ui);
      return;
    }
    ui.map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(ui.map.getZoom(), 6) });
  });
  root.append(fab);

  // UX-3: nota discreta abajo a la izquierda cuando el zoom pasa el detalle
  // disponible en el centro (la carta base llega a zoom 6; una zona descargada,
  // a 10). El texto y su visibilidad los decide main.ts.
  const scaleNote = el("div", { class: "hn-scale-note" });
  scaleNote.hidden = true;
  root.append(scaleNote);

  // E9.3: botón flotante de hombre al agua. Mantener apretado 600 ms marca la
  // caída con la posición actual (un toque suelto no hace nada).
  const mobBtn = el("button", { class: "hn-mob", type: "button", "aria-label": "Hombre al agua: mantener apretado" }, "MOB");
  mobBtn.append(el("span", { class: "hn-mob-ring" }));
  root.append(mobBtn);
  let mobPress: number | undefined;
  const mobCancel = (): void => {
    if (mobPress !== undefined) window.clearTimeout(mobPress);
    mobPress = undefined;
    mobBtn.classList.remove("hn-mob-press");
  };
  mobBtn.addEventListener("pointerdown", (ev) => {
    if (ui.mob() || !ui.position()) return;
    ev.preventDefault();
    mobBtn.classList.add("hn-mob-press");
    mobPress = window.setTimeout(() => {
      mobPress = undefined;
      mobBtn.classList.remove("hn-mob-press");
      const p = ui.position();
      if (!p) return;
      ui.mob.set({ lat: p.lat, lon: p.lon, t: Date.now() });
      try {
        navigator.vibrate?.(150);
      } catch {
        /* sin vibración */
      }
    }, 600);
  });
  mobBtn.addEventListener("pointerup", mobCancel);
  mobBtn.addEventListener("pointercancel", mobCancel);
  mobBtn.addEventListener("pointerleave", mobCancel);
  effect(() => {
    const has = ui.position() !== null;
    const on = ui.mob() !== null;
    mobBtn.hidden = !has;
    mobBtn.classList.toggle("hn-mob-on", on);
  });

  renderContextBar(ui, contextBar);
  renderSheet(ui, sheet);
  renderAlarmBand(ui);
  wireSelectedWp(ui);
  wireKeyboard(ui);

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

  // E9.3: círculo del fondeo y marca de MOB en el mapa.
  effect(() => drawAnchor(ui));
  effect(() => drawMob(ui));

  // E9.3: pantalla encendida mientras haya ruta activa, fondeo o MOB.
  effect(() => {
    const on = ui.active() !== null || ui.anchor().active || ui.mob() !== null;
    void keepAwake(on);
  });

  // Fondeo y MOB sobreviven la recarga: se guardan al cambiar (no en el arranque,
  // para no pisar lo que `restore` todavía no leyó).
  ui.anchor.subscribe((a) => {
    ui.settings.anchor = a;
    saveSettings(ui);
  });
  ui.mob.subscribe((m) => {
    ui.settings.mob = m;
    saveSettings(ui);
  });

  // UX-2: recién después de restaurar se decide arrancar el GPS, para no pisar
  // una posición manual persistida aunque el permiso esté concedido.
  void restore(ui).then(() => autoStartGps(ui));

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
      if (sel) drawSelected(ui, sel.code, ui.variant().startsWith(sel.code) ? ui.variant() : null);
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
    setScaleNote(text) {
      if (text === null) {
        scaleNote.hidden = true;
        return;
      }
      if (scaleNote.textContent !== text) scaleNote.textContent = text;
      scaleNote.hidden = false;
    },
  };
}

async function restore(ui: UiState): Promise<void> {
  const [month, active, imported, voyage, position, settings, seenHelp] = await Promise.all([
    ui.store.get(KEYS.month),
    ui.store.get(KEYS.active),
    ui.store.get(KEYS.imported),
    ui.store.get(KEYS.voyageCurrent),
    ui.store.get(KEYS.position),
    ui.store.get(KEYS.settings),
    ui.store.get(KEYS.seenHelp),
  ]);
  if (month) ui.month.set(Number(month) || currentMonthUtc());
  ui.active.set(readJson<ActiveRoute | null>(active, null));
  ui.imported.set(readJson<ImportedRoute[]>(imported, []));
  ui.voyage.set(readJson<VoyageLog | null>(voyage, null));
  ui.helpSeen.set(seenHelp === "1");
  const s = readJson<Settings | null>(settings, null);
  if (s) {
    if (s.acc) ui.settings.acc = { ...defaultAcc(), ...s.acc };
    if (s.alarms) ui.settings.alarms = { ...DEFAULT_ALARMS, ...s.alarms };
    if (s.anchor) ui.anchor.set({ ...DEFAULT_ANCHOR, ...s.anchor });
    if (s.mob) ui.mob.set(s.mob);
  }
  const pos = readJson<Position | null>(position, null);
  if (pos) {
    ui.position.set(pos);
    setSource(ui.map, "me", featureCollection([pointFeature(pos.lon, pos.lat)]));
  }
  // Excepción a la apertura en Aquí (UX-1): con ruta activa y posición la hoja
  // arranca en peek, para mostrar la tira Navegando (E9.1).
  if (ui.active() && ui.position()) ui.sheet.set("peek");
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

// Geometría de la variante elegida (o la primera si todavía no hay ninguna).
function selectedGeometry(ui: UiState, code: string): Geometry | null {
  const v = ui.variant();
  if (v.startsWith(code)) {
    const g = ui.geometry.get(`${code}|${v}`);
    if (g) return g;
  }
  return firstGeometry(ui, code);
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

  // Balizas OSM en línea (E10.3): raster de OpenSeaMap al pie del mapa. Arranca
  // apagada (el interruptor está en el panel "Sin conexión"), así no pide
  // teselas por red hasta que el usuario la prenda.
  map.addSource("seamarks-online", {
    type: "raster",
    tiles: ["https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"],
    tileSize: 256,
    minzoom: 9,
    maxzoom: 18,
    attribution: "© OpenSeaMap (CC BY-SA)",
  });
  map.addLayer({
    id: "seamarks-online",
    type: "raster",
    source: "seamarks-online",
    minzoom: 9,
    layout: { visibility: "none" },
    paint: { "raster-opacity": 0.9 },
  });

  for (const id of ["selected", "active", "imported", "voyage", "me", "navline", "sel-wp", "anchor", "mob"]) {
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
  // Waypoints de la ruta elegida: puntos tocables para seleccionar la fila (W4.5 #3 bis).
  map.addLayer({
    id: "route-wps-selected",
    type: "circle",
    source: "selected",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#FFCC80",
      "circle-stroke-color": "#0b1626",
      "circle-stroke-width": 1,
    },
  });
  // Waypoint elegido en la tabla: agrandado con halo (patrón savvy navvy, W4.5 #3 bis).
  map.addLayer({
    id: "route-wp-selected-halo",
    type: "circle",
    source: "sel-wp",
    paint: { "circle-radius": 16, "circle-color": "#FFCC80", "circle-opacity": 0.22 },
  });
  map.addLayer({
    id: "route-wp-selected",
    type: "circle",
    source: "sel-wp",
    paint: {
      "circle-radius": 8,
      "circle-color": "#FFCC80",
      "circle-stroke-color": "#0b1626",
      "circle-stroke-width": 2,
    },
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

  // Fondeo (E9.3): círculo del radio y punto del ancla.
  map.addLayer({
    id: "anchor-ring",
    type: "line",
    source: "anchor",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "line-color": "#FFD54F", "line-width": 1.5 },
  });
  map.addLayer({
    id: "anchor-dot",
    type: "circle",
    source: "anchor",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 5,
      "circle-color": "#FFD54F",
      "circle-stroke-color": "#0b1626",
      "circle-stroke-width": 1.5,
    },
  });
  // Hombre al agua (E9.3): marca la caída con el nombre de la hora.
  map.addLayer({
    id: "mob",
    type: "symbol",
    source: "mob",
    layout: {
      "text-field": ["concat", "✖\n", ["get", "name"]],
      "text-size": 16,
      "text-line-height": 1.1,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#FF1744", "text-halo-color": "#0b1626", "text-halo-width": 1.5 },
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
    if (fixOnMapArmed) return;
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
    if (wpHitHandled || fixOnMapArmed) return;
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
  const want = variant !== null && ui.geometry.has(`${code}|${variant}`) ? variant : null;
  const features: object[] = [];
  for (const [key, g] of ui.geometry) {
    if (!key.startsWith(`${code}|`)) continue;
    if (want !== null && key !== `${code}|${want}`) continue;
    features.push(lineFeature(g.coords));
    for (let i = 0; i < g.coords.length; i++) {
      features.push(pointFeature(g.coords[i]![0], g.coords[i]![1], { name: g.names[i] ?? "", wpIndex: i }));
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

// E9.3: círculo del radio de fondeo (avisado en metros) y punto del ancla.
const DEM_CIRCLE_STEPS = 64;

function circleFeature(lon: number, lat: number, radiusM: number): object {
  const earth = 6378137;
  const dLat = (radiusM / earth) * (180 / Math.PI);
  const dLon = dLat / Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= DEM_CIRCLE_STEPS; i++) {
    const a = (i / DEM_CIRCLE_STEPS) * Math.PI * 2;
    ring.push([lon + dLon * Math.sin(a), lat + dLat * Math.cos(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function drawAnchor(ui: UiState): void {
  const a = ui.anchor();
  if (!a.active) {
    setSource(ui.map, "anchor", featureCollection([]));
    return;
  }
  setSource(ui.map, "anchor", featureCollection([circleFeature(a.lon, a.lat, a.radiusM), pointFeature(a.lon, a.lat)]));
}

function drawMob(ui: UiState): void {
  const m = ui.mob();
  setSource(ui.map, "mob", m ? featureCollection([pointFeature(m.lon, m.lat, { name: mobName(m) })]) : featureCollection([]));
}

function mobName(m: Mob): string {
  const d = new Date(m.t);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `MOB ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function wireGps(ui: UiState): void {
  const start = (): void => {
    if (ui.gpsStop) return;
    ui.gpsStop = watchGps((u) => {
      // UX-2: mientras la posición sea manual, ningún fix de GPS se aplica.
      if (ui.position()?.source === "manual") return;
      ui.gpsStatus.set(u.status);
      if (u.position) {
        ui.position.set(u.position);
        setSource(ui.map, "me", featureCollection([pointFeature(u.position.lon, u.position.lat)]));
        pushFix(ui, u.position);
      }
    });
  };
  (window as unknown as { hnStartGps: () => void }).hnStartGps = start;
  (window as unknown as { hnStopGps: () => void }).hnStopGps = () => stopGps(ui);
}

function stopGps(ui: UiState): void {
  ui.gpsStop?.();
  ui.gpsStop = null;
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

// UX-2: "Usar GPS" cambia de manual a GPS. Descartamos la posición manual (y su
// persistencia) para que el primer fix del watch la reemplace.
function startGps(ui: UiState): void {
  if (ui.position()?.source === "manual") {
    ui.position.set(null);
    setSource(ui.map, "me", featureCollection([]));
    persist(ui, KEYS.position, "");
  }
  ui.gpsStatus.set("searching");
  wireGpsStart();
}

// Arranque automático al abrir: no si hay una posición manual persistida (UX-2).
function autoStartGps(ui: UiState): void {
  if (ui.position()?.source === "manual") return;
  try {
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p: any) => {
      if (p.state === "granted") wireGpsStart();
    }).catch(() => {});
  } catch {}
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
        startGps(ui);
        return;
      }
      // menú simple
      const m = el("div", { class: "hn-menu" });
      const useGps = el("button", { class: "hn-btn" }, "Usar GPS");
      useGps.addEventListener("click", () => { m.remove(); startGps(ui); });
      const fix = el("button", { class: "hn-btn" }, "Fijar en el mapa");
      fix.addEventListener("click", () => { m.remove(); armFixOnMap(ui); });
      const write = el("button", { class: "hn-btn" }, "Escribir coordenadas");
      write.addEventListener("click", () => { m.remove(); openManualPosition(ui); });
      const ap = el("button", { class: "hn-btn" }, "Apagar");
      ap.addEventListener("click", () => { m.remove(); stopGps(ui); ui.position.set(null); ui.gpsStatus.set("off"); persist(ui, KEYS.position, ""); });
      m.append(useGps, fix, write, ap);
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
    const i = order.indexOf(ui.sheet());
    const next = dy < 0 ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
    ui.sheet.set(order[next]!);
  });
  handle.addEventListener("pointercancel", () => {
    dragging = false;
  });

  // Dos columnas en escritorio (W4.4): lista a la izquierda (tabs + cuerpo) y
  // ficha a la derecha. En móvil la ficha reemplaza a la lista (ver app.css).
  const cols = el("div", { class: "hn-cols" });
  const listCol = el("div", { class: "hn-col-list" });
  const tabs = el("div", { class: "hn-tabs" });
  const names: { id: TabName; label: string }[] = [
    { id: "aqui", label: "Aquí" },
    { id: "rutas", label: "Rutas" },
    { id: "travesia", label: "Travesía" },
  ];
  const tabButtons = new Map<TabName, HTMLElement>();
  for (const t of names) {
    const b = el("button", { class: "hn-tab" }, t.label);
    b.addEventListener("click", () => goTo(ui, t.id));
    tabs.append(b);
    tabButtons.set(t.id, b);
  }
  const body = el("div", { class: "hn-sheet-body" });
  const navStrip = el("div", { class: "hn-navstrip" });
  listCol.append(tabs, navStrip, body);
  const fichaCol = el("div", { class: "hn-col-ficha hn-ficha-dock" });
  cols.append(listCol, fichaCol);
  sheet.append(handle, cols);
  renderNavStrip(ui, navStrip);

  // La forma de la hoja depende del estado y de si hay ficha abierta. La tira
  // de navegación (E9.1) sube el peek a 160 px: --hn-sheet-h lo lee el botón ◉.
  effect(() => {
    const state = ui.sheet();
    const sel = ui.selected();
    const hasNav = activeNav(ui) !== null;
    sheet.className = `hn-sheet hn-sheet-${state}${sel ? " hn-ficha-open" : ""}${hasNav ? " hn-nav" : ""}`;
    document.body.classList.toggle("hn-has-ficha", !!sel);
    const root = document.documentElement;
    if (window.matchMedia("(min-width: 700px)").matches) {
      root.style.removeProperty("--hn-sheet-h");
    } else {
      const h = state === "peek" ? (hasNav ? "160px" : "96px") : state === "half" ? "50vh" : "92vh";
      root.style.setProperty("--hn-sheet-h", h);
    }
  });

  effect(() => {
    const tab = ui.tab();
    for (const [id, b] of tabButtons) b.className = `hn-tab${tab === id ? " on" : ""}`;
  });

  // La ficha vive en su propia columna: elegir una ruta no rearma la lista.
  // Se rearma al cambiar de variante para que la tabla de waypoints siga a la
  // elegida; si es la misma ruta, se conserva el scroll.
  let lastFichaCode: string | null = null;
  effect(() => {
    const sel = ui.selected();
    ui.variant();
    untracked(() => {
      const sameCode = sel?.code === lastFichaCode;
      const top = fichaCol.scrollTop;
      clear(fichaCol);
      if (sel) renderFicha(ui, fichaCol, sel.code, sel.chapter);
      lastFichaCode = sel?.code ?? null;
      if (sameCode) fichaCol.scrollTop = top;
    });
  });

  // El cuerpo (lista) se arma por cambio de pestaña o llegada del catálogo.
  // Las dependencias que sí importan (posición, mes) se siguen con efectos
  // locales (ver bodyCleanup) que reemplazan solo su nodo, sin tocar el scroll.
  let bodyCleanup: (() => void)[] = [];
  effect(() => {
    const tab = ui.tab();
    const catalog = ui.catalog();
    ui.routes();
    for (const d of bodyCleanup) d();
    bodyCleanup = [];
    clear(body);
    untracked(() => {
      if (catalog === "loading") renderCatalogLoading(body);
      else if (catalog === "failed") renderCatalogFailed(body);
      else if (tab === "aqui") renderAqui(ui, body, bodyCleanup);
      else if (tab === "rutas") renderRutas(ui, body, bodyCleanup);
      else renderTravesia(ui, body, bodyCleanup);
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

  // Ayuda de primer uso (UX-1): tarjeta al tope, no modal, una sola vez.
  const helpSlot = el("div", { class: "hn-aqui-help" });
  body.append(helpSlot);
  cleanup.push(
    effect(() => {
      clear(helpSlot);
      if (ui.helpSeen() !== false) return;
      // Si ya consiguió posición, la ayuda cumplió su función y no vuelve.
      if (ui.position()) {
        ui.helpSeen.set(true);
        persist(ui, KEYS.seenHelp, "1");
        return;
      }
      helpSlot.append(helpCard(ui));
    }),
  );

  const top = el("div", { class: "hn-aqui-top" });
  body.append(top);

  cleanup.push(
    effect(() => {
      const month = ui.month();
      const pos = ui.position();
      const ctx = pos ? resolveContext(pos.lat, pos.lon, month, ui.basins, ui.variants) : null;
      const nodes: Node[] = [];

      // Primera tarjeta cuando todavía no hay posición (UX-1).
      if (!pos) nodes.push(positionCard(ui));

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

  body.append(alarmsCard(ui));
  body.append(anchorCard(ui, cleanup));
  body.append(offlineCard(ui));
}

// Ayuda de primer uso (UX-1): tarjeta, no modal, máx. cuatro renglones.
function helpCard(ui: UiState): HTMLElement {
  const card = el("div", { class: "hn-card hn-help" });
  const lines: [string, string][] = [
    ["📍", "Tu posición manda"],
    ["▸", "Elegí una ruta"],
    ["⚑", "Tocá Seguir"],
    ["🆘", "Mantené apretado MOB si alguien cae al agua"],
  ];
  for (const [icon, text] of lines) {
    card.append(
      el("div", { class: "hn-help-line" }, el("span", { class: "hn-help-ico" }, icon), el("span", {}, text)),
    );
  }
  const ok = el("button", { class: "hn-btn hn-btn-primary hn-help-ok", type: "button" }, "Entendido");
  ok.addEventListener("click", () => {
    ui.helpSeen.set(true);
    persist(ui, KEYS.seenHelp, "1");
  });
  card.append(ok);
  return card;
}

// Tarjeta "Tu posición manda" (UX-1): solo cuando todavía no hay posición.
function positionCard(ui: UiState): HTMLElement {
  const card = el("div", { class: "hn-card hn-card-pos" });
  card.append(el("div", { class: "hn-card-title" }, "Tu posición manda"));
  const actions = el("div", { class: "hn-pos-actions" });
  const gps = el("button", { class: "hn-btn hn-pos-btn", type: "button" }, "Usar GPS");
  gps.addEventListener("click", () => startGps(ui));
  const fix = el("button", { class: "hn-btn hn-pos-btn", type: "button" }, "Fijar en el mapa");
  fix.addEventListener("click", () => armFixOnMap(ui));
  const write = el("button", { class: "hn-btn hn-pos-btn", type: "button" }, "Escribir coordenadas");
  write.addEventListener("click", () => openManualPosition(ui));
  actions.append(gps, fix, write);
  card.append(actions);
  return card;
}

// "Fijar en el mapa" (UX-1): arma el modo de un toque; el próximo clic sobre la
// carta fija la posición. La banda avisa y permite cancelar.
function armFixOnMap(ui: UiState): void {
  if (fixOnMapArmed) return;
  fixOnMapArmed = true;
  const band = el("div", { class: "hn-fixband" });
  band.append(el("span", { class: "hn-fixband-text" }, "Tocá el mapa para fijar tu posición"));
  const cancel = el("button", { class: "hn-alarm-btn", type: "button" }, "Cancelar");
  band.append(cancel);
  document.body.append(band);

  const done = (): void => {
    band.remove();
    ui.map.off("click", onMap);
    ui.map.getCanvas().style.cursor = "";
    // Se limpia recién en el próximo tick: los handlers de capa del mismo clic
    // (basin-label, catalog-lines, route-wps-selected) todavía deben verlo armado.
    window.setTimeout(() => {
      fixOnMapArmed = false;
    }, 0);
  };
  const onMap = (e: MapMouseEvent): void => {
    const pos: Position = { lat: e.lngLat.lat, lon: e.lngLat.lng, accuracyM: 0, source: "manual", t: Date.now() };
    // UX-2: la posición manual manda; no dejar el watch del GPS pisándola.
    stopGps(ui);
    ui.position.set(pos);
    ui.gpsStatus.set("off");
    persist(ui, KEYS.position, JSON.stringify(pos));
    setSource(ui.map, "me", featureCollection([pointFeature(pos.lon, pos.lat)]));
    pushFix(ui, pos);
    done();
  };
  cancel.addEventListener("click", done);
  ui.map.getCanvas().style.cursor = "crosshair";
  ui.map.on("click", onMap);
}

// Ajustes de alarmas (E9.2): dos umbrales numéricos, persistidos en hn.settings.
function alarmsCard(ui: UiState): HTMLElement {
  const card = el("div", { class: "hn-card" });
  card.append(el("div", { class: "hn-card-title" }, "Alarmas"));
  const row = el("div", { class: "hn-alarm-fields" });
  const xte = el("input", {
    class: "hn-search",
    type: "number",
    min: "0",
    step: "0.1",
    inputmode: "decimal",
  });
  xte.value = String(ui.settings.alarms.xteMaxNm);
  const arrival = el("input", {
    class: "hn-search",
    type: "number",
    min: "0",
    step: "0.1",
    inputmode: "decimal",
  });
  arrival.value = String(ui.settings.alarms.arrivalNm);
  const save = (): void => {
    const x = Number(xte.value);
    const a = Number(arrival.value);
    if (Number.isFinite(x) && x >= 0) ui.settings.alarms.xteMaxNm = x;
    if (Number.isFinite(a) && a >= 0) ui.settings.alarms.arrivalNm = a;
    saveSettings(ui);
  };
  xte.addEventListener("change", save);
  arrival.addEventListener("change", save);
  row.append(
    el("label", { class: "hn-field" }, el("span", { class: "hn-field-label" }, "Desvío máximo (nm)"), xte),
    el("label", { class: "hn-field" }, el("span", { class: "hn-field-label" }, "Radio de llegada (nm)"), arrival),
  );
  card.append(row);
  return card;
}

// Vigilancia de fondeo (E9.3): marca el punto donde se largó el ancla y avisa si
// el barco se aleja más que el radio. El estado se recuerda entre recargas.
function anchorCard(ui: UiState, cleanup: (() => void)[]): HTMLElement {
  const card = el("div", { class: "hn-card" });
  card.append(el("div", { class: "hn-card-title" }, "Fondeo"));

  const radius = el("input", { class: "hn-search", type: "number", min: "5", step: "5", inputmode: "numeric" });
  radius.value = String(Math.round(ui.anchor().radiusM));
  radius.addEventListener("change", () => {
    const r = Number(radius.value);
    if (Number.isFinite(r) && r > 0) ui.anchor.update((a) => ({ ...a, radiusM: r }));
  });
  const field = el(
    "label",
    { class: "hn-field" },
    el("span", { class: "hn-field-label" }, "Radio (m)"),
    radius,
  );

  const info = el("div", { class: "hn-anchor-info hn-muted" });
  const actions = el("div", { class: "hn-actions" });
  card.append(field, info, actions);

  cleanup.push(
    effect(() => {
      const a = ui.anchor();
      const pos = ui.position();
      clear(info);
      clear(actions);
      radius.disabled = a.active;
      if (!a.active) {
        info.textContent = pos
          ? "Vigilá que el barco no garree. Al activar se toma la posición actual."
          : "Poné tu posición para activar la vigilancia.";
        const on = el("button", { class: "hn-btn hn-btn-primary", type: "button" }, "Activar vigilancia");
        on.disabled = !pos;
        on.addEventListener("click", () => {
          const p = ui.position();
          if (!p) return;
          ui.anchor.update((cur) => ({ ...cur, active: true, lat: p.lat, lon: p.lon }));
        });
        actions.append(on);
        return;
      }
      info.textContent = pos
        ? `Fondeado a ${Math.round(anchorDistanceM(pos, a))} m del punto · radio ${Math.round(a.radiusM)} m`
        : "Fondeado · esperando posición";
      const off = el("button", { class: "hn-btn", type: "button" }, "Desactivar");
      off.addEventListener("click", () => ui.anchor.set({ ...DEFAULT_ANCHOR }));
      actions.append(off);
    }),
  );
  return card;
}

// --------------------------------------------------------- Sin conexión (E10.2)

// Panel "Sin conexión" en Aquí: qué se ve sin red y qué zonas de la carta
// detallada están descargadas. Cada zona se baja a IndexedDB y queda disponible
// en modo avión.
function offlineCard(ui: UiState): HTMLElement {
  const card = el("div", { class: "hn-card" });
  card.append(el("div", { class: "hn-card-title" }, "Sin conexión"));
  card.append(offlineRow("Carta base", "siempre"));
  card.append(offlineRow("Carta mundial (zoom ≤ 6)", "45 MB · con red"));
  card.append(onlineSeamarkRow(ui));

  const zonesBox = el("div", { class: "hn-offline-zones" });
  card.append(zonesBox);

  void (async () => {
    const states = await listZones(ui.store).catch(() => [] as ZoneState[]);
    const nodes: HTMLElement[] =
      states.length === 0
        ? [el("p", { class: "hn-muted" }, "Sin zonas disponibles por ahora.")]
        : states.map((st) => zoneRow(ui, st));
    zonesBox.replaceChildren(...nodes);
  })();
  return card;
}

function offlineRow(name: string, info: string): HTMLElement {
  const row = el("div", { class: "hn-offline-row" });
  row.append(el("span", { class: "hn-offline-name" }, name), el("span", { class: "hn-offline-info" }, info));
  return row;
}

// Balizas OSM en línea (E10.3): capa raster de OpenSeaMap, apagada por defecto.
// Sirve donde hay red; sin conexión quedan las balizas bajadas con la zona.
function onlineSeamarkRow(ui: UiState): HTMLElement {
  const row = el("div", { class: "hn-offline-row" });
  const action = el("span", { class: "hn-offline-action" });
  const btn = el("button", { class: "hn-btn", type: "button" }, "Mostrar");
  let on = false;
  btn.addEventListener("click", () => {
    if (!ui.map.getLayer("seamarks-online")) return;
    on = !on;
    ui.map.setLayoutProperty("seamarks-online", "visibility", on ? "visible" : "none");
    btn.textContent = on ? "Ocultar" : "Mostrar";
  });
  action.append(btn);
  row.append(
    el("span", { class: "hn-offline-name" }, "Balizas OSM online"),
    el("span", { class: "hn-offline-info" }, "con red"),
    action,
  );
  return row;
}

function fmtMb(bytes: number): string {
  return `${Math.round(bytes / 1048576)} MB`;
}

function fmtDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getUTCDate()} ${(MONTH_NAME[d.getUTCMonth()] ?? "").slice(0, 3)}`;
}

function zoneRow(ui: UiState, state: ZoneState): HTMLElement {
  const { id, meta } = state;
  const row = el("div", { class: "hn-offline-row" });
  const info = el("span", { class: "hn-offline-info" });
  const action = el("span", { class: "hn-offline-action" });
  row.append(el("span", { class: "hn-offline-name" }, meta.nombre), info, action);

  const showAbsent = (): void => {
    info.textContent = fmtMb(meta.bytes);
    clear(action);
    action.append(downloadButton());
  };

  const showReady = (bytes: number, date?: string): void => {
    info.textContent = date ? `✓ ${fmtDay(date)} · ${fmtMb(bytes)}` : `✓ ${fmtMb(bytes)}`;
    clear(action);
    const del = el("button", { class: "hn-btn", type: "button" }, "Borrar");
    del.addEventListener("click", () => {
      void deleteZone(ui.store, id).then(() => {
        ui.zones?.remove(id);
        showAbsent();
      });
    });
    action.append(del);
  };

  const downloadButton = (): HTMLElement => {
    const btn = el("button", { class: "hn-btn", type: "button" }, "Descargar");
    btn.addEventListener("click", () => {
      const conn = (navigator as unknown as { connection?: { type?: string } }).connection;
      const warning = `Vas a usar datos móviles para bajar ${meta.nombre} (${fmtMb(meta.bytes)}). ¿Seguir?`;
      if (conn?.type === "cellular" && !window.confirm(warning)) return;
      clear(action);
      info.textContent = "0 %";
      void downloadZone(ui.store, id, (ratio) => {
        info.textContent = `${Math.round(ratio * 100)} %`;
      })
        .then((res) => {
          ui.zones?.add(id, res.blob, meta, res.seamarks);
          showReady(res.bytes, res.date);
        })
        .catch((err) => {
          console.error("No pude descargar la zona:", err);
          info.textContent = "no se pudo";
          clear(action);
          action.append(downloadButton());
        });
    });
    return btn;
  };

  if (state.saved) showReady(state.bytes ?? meta.bytes, state.date);
  else showAbsent();
  return row;
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

// Tira de navegación (E9.1): con ruta activa y posición, el peek de la hoja
// (y el tope del panel en escritorio) muestran los datos grandes de navegación.
function renderNavStrip(ui: UiState, host: HTMLElement): void {
  host.hidden = true;
  host.addEventListener("click", () => goTo(ui, "aqui"));
  let autoPeekDone = false;
  let lastActiveKey: string | null = null;
  let mobTimer: number | undefined;
  void lastActiveKey;
  effect(() => {
    const mob = ui.mob();
    if (mob) {
      const at = (): { lat: number; lon: number } => ui.position() ?? { lat: mob.lat, lon: mob.lon };
      const line = (): string => {
        const f = mobFix(at(), mob);
        return `${nmDecimal(f.distanceNm)} · ${mmss(f.elapsedS)} desde la caída`;
      };
      const bearing = Math.round(mobFix(at(), mob).bearingDeg);
      const row1 = el("div", { class: "hn-navstrip-row1" });
      row1.append(
        el("span", { class: "hn-navstrip-next hn-navstrip-mob" }, "MOB"),
        el("span", { class: "hn-navstrip-bearing" }, `${bearing}°`),
      );
      const row2 = el("div", { class: "hn-navstrip-row2" }, line());
      const end = el("button", { class: "hn-btn hn-navstrip-end", type: "button" }, "Terminar MOB");
      end.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ui.mob.set(null);
      });
      const row3 = el("div", { class: "hn-navstrip-row3" }, end);
      host.hidden = false;
      host.replaceChildren(row1, row2, row3);
      if (mobTimer === undefined) {
        mobTimer = window.setInterval(() => {
          if (ui.mob()) row2.textContent = line();
        }, 1000);
      }
      return;
    }
    if (mobTimer !== undefined) {
      window.clearInterval(mobTimer);
      mobTimer = undefined;
    }

    const active = ui.active();
    const key = active ? `${active.code}|${active.variant ?? ""}` : null;
    if (key !== lastActiveKey) {
      autoPeekDone = false;
      lastActiveKey = key;
    }
    const nav = activeNav(ui);
    if (!nav) {
      host.hidden = true;
      clear(host);
      return;
    }
    const state = ui.sheet();
    if (!autoPeekDone && (state === "half" || state === "full") && sustainedSog(ui.navFixes, Date.now())) {
      autoPeekDone = true;
      ui.sheet.set("peek");
    }
    host.hidden = false;
    const { fix, kin, track } = nav;
    const next = fix.nextName || `${formatLat(fix.nextLat)} ${formatLon(fix.nextLon)}`;
    const dest = track.names[track.names.length - 1] || "destino";
    const eta = kin.etaNextMs === null ? "—" : clock(kin.etaNextMs);
    const sog = kin.sogKn === null ? "—" : `${kin.sogKn.toFixed(1)} kn`;
    const dev = fix.xteNm === 0 ? "en rumbo" : xteLabel(fix.xteNm);
    const row1 = el("div", { class: "hn-navstrip-row1" });
    row1.append(
      el("span", { class: "hn-navstrip-next" }, next),
      el("span", { class: "hn-navstrip-bearing" }, `${Math.round(fix.bearingDeg)}°`),
    );
    const row2 = el(
      "div",
      { class: "hn-navstrip-row2" },
      `${nm(fix.distanceNm)} · ETA ${eta} · SOG ${sog} · desvío ${dev}`,
    );
    const row3 = el(
      "div",
      { class: "hn-navstrip-row3" },
      `tramo ${fix.legIndex + 1} de ${maxLeg(track)} · ${dest} a ${nm(remainingToDest(track.coords, fix))}`,
    );
    host.replaceChildren(row1, row2, row3);
  });
}

// SOG ≥ 0,5 kn sostenida por 2 minutos seguidos sobre la ventana de fijas.
function sustainedSog(fixes: Fix[], nowMs: number): boolean {
  const win = fixes.filter((f) => nowMs - f.t <= 120_000);
  if (win.length < 2) return false;
  const first = win[0]!;
  const last = win[win.length - 1]!;
  const span = last.t - first.t;
  if (span < 120_000) return false;
  return haversineNm(first.lat, first.lon, last.lat, last.lon) / (span / 3_600_000) >= 0.5;
}

// Banda de alarma (E9.2/E9.3): fija arriba de la hoja. Cubre MOB (prioridad),
// fondeo garreado y las alarmas de ruta (llegada/desvío). Al aparecer una alarma
// nueva (no silenciada) suena y repite mientras siga activa; Silenciar la deja en
// gris, sin sonido, hasta que cambie de tipo.
type AlarmKind = "mob" | "anchor" | "arrival" | "xte";

function renderAlarmBand(ui: UiState): void {
  const band = el("div", { class: "hn-alarm" });
  const text = el("span", { class: "hn-alarm-text" }, "");
  const silence = el("button", { class: "hn-alarm-btn", type: "button" }, "Silenciar");
  band.append(text, silence);
  band.hidden = true;
  document.body.append(band);

  let shown: AlarmKind | null = null;
  let silenced: AlarmKind | null = null;
  let beepTimer: number | undefined;
  const stopBeeps = (): void => {
    if (beepTimer !== undefined) {
      window.clearInterval(beepTimer);
      beepTimer = undefined;
    }
  };

  silence.addEventListener("click", () => {
    if (!shown) return;
    silenced = shown;
    stopBeeps();
    band.className = "hn-alarm hn-alarm-silenced";
  });

  effect(() => {
    const mob = ui.mob();
    const anchor = ui.anchor();
    const pos = ui.position();
    const active = ui.active();
    const nav = active ? activeNav(ui) : null;

    let kind: AlarmKind | null = null;
    let message = "";
    let beeps = 3;
    let intervalMs = 10_000;

    if (mob) {
      kind = "mob";
      const f = mobFix(pos ?? { lat: mob.lat, lon: mob.lon }, mob);
      message = `✖ Hombre al agua · ${nmDecimal(f.distanceNm)} · ${mmss(f.elapsedS)} desde la caída`;
      beeps = 2;
      intervalMs = 5_000;
    } else if (anchor.active && pos && anchorAlarm(pos, anchor)) {
      kind = "anchor";
      message = `⚓ Garreando: ${Math.round(anchorDistanceM(pos, anchor))} m del fondeo`;
    } else if (nav) {
      const next = evalAlarms(nav.fix, ui.settings.alarms, { active: null, silencedFor: null });
      if (next.active === "arrival") {
        kind = "arrival";
        message = `⚑ Llegando a ${nav.fix.nextName || "el waypoint"}`;
      } else if (next.active === "xte") {
        kind = "xte";
        message = `⚠ Desvío de ${Math.abs(nav.fix.xteNm).toFixed(1).replace(".", ",")} nm`;
      }
    }

    if (kind === null) {
      shown = null;
      silenced = null;
      stopBeeps();
      band.hidden = true;
      return;
    }

    const fresh = kind !== shown;
    if (fresh) silenced = null;
    shown = kind;
    const isSilenced = silenced === kind;
    band.hidden = false;
    band.className = `hn-alarm${isSilenced ? " hn-alarm-silenced" : ""}`;
    text.textContent = message;
    if (fresh && !isSilenced) {
      beep(beeps);
      stopBeeps();
      beepTimer = window.setInterval(() => {
        if (shown === kind && silenced !== kind) beep(beeps);
        else stopBeeps();
      }, intervalMs);
    }
  });
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
  const main = el("div", { class: "hn-row-main" });
  main.append(el("div", { class: "hn-row-title" }, `${e.code} · ${e.title}`));
  const sub =
    distanceNm !== undefined
      ? `${nmDecimal(distanceNm)}${nearestWp ? ` · ${nearestWp}` : ""}`
      : `${e.from} → ${e.to} · ${rangeNm(e.nmMin, e.nmMax)} · ${e.variantCount} variante${e.variantCount === 1 ? "" : "s"}`;
  main.append(el("div", { class: "hn-row-sub" }, sub));
  if (ui.region() === "" && e.region) main.append(el("div", { class: "hn-row-region" }, e.region));
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
  const wrap = el("div", { class: "hn-rutas" });
  const head = el("div", { class: "hn-rutas-head" });

  const searchRow = el("div", { class: "hn-search-row" });
  const search = el("input", { class: "hn-search", type: "search", placeholder: "" });
  search.value = ui.query();
  searchRow.append(search);

  const chips = el("div", { class: "hn-chips" });

  // Contador: va en el placeholder si la búsqueda está vacía; si se escribe,
  // baja a una línea de 16 px debajo de los chips (W4.8 #2).
  const count = el("p", { class: "hn-count hn-muted" });
  count.hidden = true;
  const variantChips = el("div", { class: "hn-variant-chips" });

  head.append(searchRow, chips, count, variantChips);
  const list = el("div", { class: "hn-list" });
  wrap.append(head, list);
  body.append(wrap);

  const total = ui.index.routes.length;

  const setCount = (shown: number): void => {
    if (ui.query().trim() === "") {
      search.placeholder = `Buscar · ${shown} de ${total}`;
      count.hidden = true;
    } else {
      count.textContent = `${shown} de ${total} rutas${ui.region() ? ` · ${ui.region()}` : ""}`;
      count.hidden = false;
    }
  };

  // Chips en una sola fila: "Todas · Cerca de mí · cuencas". "Cerca de mí" es
  // un chip más, no un toggle (W4.8 #3).
  const buildChips = (): void => {
    clear(chips);
    const add = (label: string, on: boolean, onClick: () => void): void => {
      const chip = el("button", { class: `hn-chip${on ? " on" : ""}`, type: "button" }, label);
      chip.addEventListener("click", onClick);
      chips.append(chip);
    };
    add("Todas", ui.region() === "" && !ui.nearMe(), () => {
      ui.region.set("");
      ui.nearMe.set(false);
      list.scrollTop = 0;
    });
    add("Cerca de mí", ui.nearMe(), () => {
      ui.nearMe.set(!ui.nearMe());
      list.scrollTop = 0;
    });
    for (const r of uniqueRegions(ui)) {
      add(r, ui.region() === r, () => {
        ui.region.set(ui.region() === r ? "" : r);
        list.scrollTop = 0;
      });
    }
  };

  const refresh = (): void => {
    clear(list);
    const pos = ui.position();
    if (ui.nearMe() && pos) {
      const scored = filterEntries(ui.index, { query: ui.query(), region: ui.region() })
        .map((e) => ({ e, d: bboxDistanceNm(e, pos.lat, pos.lon) }))
        .filter((x) => x.d <= 600)
        .sort((a, b) => a.d - b.d);
      setCount(scored.length);
      if (scored.length === 0) list.append(el("p", { class: "hn-muted" }, "Sin rutas a menos de 600 nm."));
      for (const { e, d } of scored.slice(0, 80)) list.append(routeRow(ui, e, d));
    } else {
      const items = filterEntries(ui.index, { query: ui.query(), region: ui.region() });
      setCount(items.length);
      if (items.length === 0) {
        list.append(el("p", { class: "hn-muted" }, "Sin resultados."));
      } else {
        for (const e of items.slice(0, 120)) list.append(routeRow(ui, e));
      }
    }
    const imported = ui.imported();
    if (imported.length > 0) {
      list.append(el("h3", { class: "hn-h3" }, "Importadas"));
      for (const r of imported) {
        const row = el("button", { class: "hn-row", type: "button" });
        row.append(el("div", { class: "hn-row-main" }, el("div", { class: "hn-row-title" }, r.name), el("div", { class: "hn-row-sub" }, `${r.points.length} puntos`)));
        row.addEventListener("click", () => showImported(ui, r));
        list.append(row);
      }
    }
    // Importar deja de estar arriba: es la última fila de la lista (W4.8 #4).
    const importRow = el("button", { class: "hn-row hn-row-import", type: "button" });
    importRow.append(el("span", { class: "hn-row-import-plus" }, "+"), el("span", {}, "Importar GPX / KML / CSV"));
    importRow.addEventListener("click", () => void importFile(ui));
    list.append(importRow);
  };

  search.addEventListener("input", () => {
    ui.query.set(search.value);
    refresh();
    list.scrollTop = 0;
  });

  // Chips y lista se redibujan al cambiar cuenca, "cerca de mí" o importadas.
  // La búsqueda se refresca en el handler de input; se conserva el scroll.
  cleanup.push(
    effect(() => {
      ui.imported();
      ui.region();
      const near = ui.nearMe();
      if (near) ui.position();
      const top = list.scrollTop;
      untracked(() => {
        buildChips();
        refresh();
      });
      list.scrollTop = top;
    }),
  );

  // Chips de variantes: aparecen cuando hay ruta seleccionada y mueven
  // `selectedVariant` (W4.4 #4). Solo el sufijo (A, B, C) como etiqueta.
  cleanup.push(
    effect(() => {
      const sel = ui.selected();
      const cur = ui.variant();
      ui.routes();
      clear(variantChips);
      if (!sel) return;
      const ids: string[] = [];
      for (const v of ui.variants) {
        if (v.code === sel.code && v.variant && !ids.includes(v.variant)) ids.push(v.variant);
      }
      if (ids.length === 0) return;
      const makeChip = (id: string, label: string): HTMLElement => {
        const chip = el("button", { class: `hn-chip${cur === id ? " on" : ""}` }, label);
        chip.addEventListener("click", () => {
          ui.variant.set(id);
          updateUrlForSelection(sel.code, id);
          drawSelected(ui, sel.code, id || null);
          const g = (id && ui.geometry.get(`${sel.code}|${id}`)) || firstGeometry(ui, sel.code);
          if (g) fitTo(ui, g.coords);
        });
        return chip;
      };
      variantChips.append(makeChip("", "Todas"));
      for (const id of ids) variantChips.append(makeChip(id, variantLabel(id, sel.code)));
    }),
  );
}

function variantLabel(id: string, code: string): string {
  return id.startsWith(code) ? id.slice(code.length) || id : id;
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
  const keep = ui.variant().startsWith(code) ? ui.variant() : "";
  if (keep !== ui.variant()) ui.variant.set(keep);
  ui.selected.set({ code, chapter: e.chapter });
  updateUrlForSelection(code, keep);
  if (ui.sheet() === "peek") ui.sheet.set("half");
  clearWpMarker(ui);
  drawSelected(ui, code, keep || null);
  const g = (keep && ui.geometry.get(`${code}|${keep}`)) || firstGeometry(ui, code);
  if (g) fitTo(ui, g.coords);
}

// Cierra la ficha y limpia la selección (botón ‹ Rutas y tecla Esc).
function closeFicha(ui: UiState): void {
  ui.selected.set(null);
  ui.sheet.set("half");
  clearWpMarker(ui);
  drawSelected(ui, null, null);
}

function clearWpMarker(ui: UiState): void {
  setSource(ui.map, "sel-wp", featureCollection([]));
}

// Tocar un waypoint en la carta selecciona su fila y la trae a la vista (W4.5 #3 bis).
function selectWpByIndex(index: number): void {
  const row = document.querySelector<HTMLElement>(
    `.hn-wps .hn-wp-item[data-wp="${index}"] .hn-wp`,
  );
  if (!row) return;
  row.click();
  row.scrollIntoView({ block: "nearest" });
}

function wireSelectedWp(ui: UiState): void {
  ui.map.on("click", "route-wps-selected", (e) => {
    if (fixOnMapArmed) return;
    wpHitHandled = true;
    window.setTimeout(() => {
      wpHitHandled = false;
    }, 0);
    const i = e.features?.[0]?.properties?.["wpIndex"];
    if (typeof i === "number") selectWpByIndex(i);
  });
}

function saveSettings(ui: UiState): void {
  void ui.store.put(KEYS.settings, JSON.stringify(ui.settings));
}

// Teclado de escritorio (regla 12 de §6 ter, W4.5 #4).
function wireKeyboard(ui: UiState): void {
  document.addEventListener("keydown", (ev) => {
    const target = ev.target as HTMLElement | null;
    const typing =
      !!target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

    if (ev.key === "Escape") {
      if (ui.selected()) {
        closeFicha(ui);
        ev.preventDefault();
      }
      return;
    }
    if (typing) return;

    if (ev.key === "/") {
      if (ui.tab() !== "rutas") goTo(ui, "rutas");
      const search = document.querySelector<HTMLInputElement>(".hn-search");
      if (search) {
        search.focus();
        ev.preventDefault();
      }
      return;
    }

    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".hn-rutas .hn-list .hn-row:not(.hn-row-import)"));
      if (rows.length === 0) return;
      const current = rows.indexOf(document.activeElement as HTMLElement);
      const next =
        current === -1
          ? ev.key === "ArrowDown"
            ? 0
            : rows.length - 1
          : ev.key === "ArrowDown"
            ? Math.min(rows.length - 1, current + 1)
            : Math.max(0, current - 1);
      rows[next]?.focus();
      ev.preventDefault();
    }
  });
}

function monthVerdictText(d: RouteDetail, month: number): string {
  const v = monthVerdict(d.whenInfo.bestMonths, d.whenInfo.stormMonths, month);
  const name = MONTH_NAME[month - 1] ?? "";
  if (v === "best") return `✔ ${name} está en la mejor época`;
  if (v === "storm") return `⚠ ${name}: temporada de ciclones`;
  return `— ${name}: fuera de la mejor época`;
}

// Acordeón de la ficha (W4.5 #3): cabecera de 44 px con título y cuenta,
// estado recordado en hn.settings.
function accordion(
  ui: UiState,
  host: HTMLElement,
  id: string,
  title: string,
  count: number | undefined,
  buildBody: (body: HTMLElement) => void,
): void {
  const open = ui.settings.acc[id] ?? false;
  const acc = el("div", { class: `hn-acc${open ? " open" : ""}` });
  const head = el("button", { class: "hn-acc-head", type: "button", "aria-expanded": open ? "true" : "false" });
  head.append(el("span", { class: "hn-acc-title" }, title));
  if (count !== undefined) head.append(el("span", { class: "hn-acc-count" }, String(count)));
  head.append(el("span", { class: "hn-acc-chev" }, "▾"));
  const body = el("div", { class: "hn-acc-body" });
  buildBody(body);
  head.addEventListener("click", () => {
    const isOpen = acc.classList.toggle("open");
    head.setAttribute("aria-expanded", isOpen ? "true" : "false");
    ui.settings.acc[id] = isOpen;
    saveSettings(ui);
  });
  acc.append(head, body);
  host.append(acc);
}

function renderFicha(ui: UiState, body: HTMLElement, code: string, chapter: string): void {
  // Cabecera y acciones fijas (W4.5 #1): quedan pegadas arriba de la columna.
  const head = el("div", { class: "hn-ficha-head" });
  const back = el("button", { class: "hn-back" }, "‹ Rutas");
  back.addEventListener("click", () => closeFicha(ui));
  head.append(back);

  const e = entryOf(ui, code);
  if (!e) {
    body.append(head, el("p", { class: "hn-muted" }, "Ruta no encontrada."));
    return;
  }

  head.append(el("h2", { class: "hn-h2" }, `${e.code} · ${e.from} → ${e.to}`));
  head.append(el("p", { class: "hn-title-en" }, e.title));
  body.append(head);

  const host = el("div", { class: "hn-ficha-host" });
  body.append(host);

  const cached = fichaCache.get(code);
  if (cached) {
    renderFichaDetail(ui, head, host, cached);
    return;
  }

  host.append(el("p", { class: "hn-muted" }, "Cargando ficha…"));
  void loadFact(chapter, code).then(
    (detail) => {
      clear(host);
      if (detail) {
        fichaCache.set(code, detail);
        renderFichaDetail(ui, head, host, detail);
      } else {
        host.append(el("p", { class: "hn-muted" }, "Sin ficha para esta ruta."));
      }
    },
    () => {
      clear(host);
      host.append(el("p", { class: "hn-muted" }, "No pude cargar la ficha."));
    },
  );
}

function renderFichaDetail(ui: UiState, head: HTMLElement, host: HTMLElement, d: RouteDetail): void {
  const e = entryOf(ui, d.code);
  const actions = el("div", { class: "hn-actions" });

  const seguir = el("button", { class: "hn-btn hn-btn-primary" }, "Seguir");
  seguir.addEventListener("click", () => {
    const variant = ui.variant().startsWith(d.code) ? ui.variant() : (d.variants[0]?.id ?? null);
    ui.active.set({ code: d.code, chapter: d.chapter, variant });
    wireGpsStart();
    ui.selected.set(null);
    ui.tab.set("aqui");
    ui.sheet.set("half");
  });

  const exportar = el("button", { class: "hn-btn" }, "Exportar GPX");
  exportar.addEventListener("click", () => {
    const g = selectedGeometry(ui, d.code);
    if (g) downloadText(`${d.code}.gpx`, "application/gpx+xml", trackToGpx(d.code, g));
  });

  const recorrer = el("button", { class: "hn-btn" }, "Recorrer");
  recorrer.addEventListener("click", () => {
    const g = selectedGeometry(ui, d.code);
    if (g) fitTo(ui, g.coords);
  });

  const enlace = el("button", { class: "hn-btn" }, "Enlace");
  enlace.addEventListener("click", () => {
    const url = new URL(document.baseURI);
    url.searchParams.set("route", d.code);
    void navigator.clipboard?.writeText(url.toString());
    enlace.textContent = "Copiado";
  });

  actions.append(seguir, exportar, recorrer, enlace);
  head.append(actions);

  // Datos en rejilla (W4.5 #2): la tira de meses va encima.
  const w = d.whenInfo;
  const verdict = el("div", { class: "hn-fact-v hn-verdict" }, monthVerdictText(d, ui.month()));
  const facts = el("div", { class: "hn-facts" });
  const fact = (k: string, v: string): HTMLElement =>
    el("div", { class: "hn-fact" }, el("div", { class: "hn-fact-k" }, k), el("div", { class: "hn-fact-v" }, v));
  facts.append(
    fact("Cuenca", e?.region || d.region || "—"),
    fact("Millas", e ? rangeNm(e.nmMin, e.nmMax) : "—"),
    fact("Variantes", String(e?.variantCount ?? d.variants.length)),
    fact("Mejor época", w.bestEs || "—"),
    fact("Ciclones", w.stormsEs || "—"),
    el("div", { class: "hn-fact hn-fact-wide" }, el("div", { class: "hn-fact-k" }, "Veredicto del mes"), verdict),
  );
  host.append(monthStrip(ui, d, () => (verdict.textContent = monthVerdictText(d, ui.month()))));
  host.append(facts);
  if (d.needsReview) {
    host.append(el("p", { class: "hn-info" }, "Trazado orientativo: en tramos costeros faltan waypoints intermedios. Verificá con tu carta."));
  }

  // Acordeones (W4.5 #3).
  const hasConsejo = !!d.tip || !!d.chapterTip;
  if (hasConsejo) {
    accordion(ui, host, "consejo", "Consejo", undefined, (b) => {
      if (d.tip) b.append(el("div", { class: "hn-tip" }, d.tip));
      if (d.chapterTip) {
        b.append(
          el(
            "div",
            { class: "hn-tip hn-tip-chapter" },
            el("div", { class: "hn-tip-label" }, `Cómo encarar · ${e?.region || d.region || "la cuenca"}`),
            d.chapterTip,
          ),
        );
      }
    });
  }

  if (d.variants.length > 0) {
    accordion(ui, host, "variantes", "Variantes", d.variants.length, (b) => {
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
          ui.variant.set(v.id);
          updateUrlForSelection(d.code, v.id);
          clearWpMarker(ui);
          drawSelected(ui, d.code, v.id);
          const g = ui.geometry.get(`${d.code}|${v.id}`);
          if (g) fitTo(ui, g.coords);
        });
        list.append(item);
      }
      b.append(list);
    });
  }

  const selVariant = ui.variant().startsWith(d.code) ? ui.variant() : "";
  const wps = (d.variants.find((v) => v.id === selVariant) ?? d.variants[0])?.waypoints ?? [];
  if (wps.length > 0) {
    accordion(ui, host, "waypoints", "Waypoints", wps.length, (b) => {
      const list = el("div", { class: "hn-list hn-wps" });
      wps.forEach((wp, i) => {
        const item = el("div", { class: "hn-wp-item", "data-wp": String(i) });
        const row = el("button", { class: "hn-wp", type: "button" });
        const name = wp.name || (wp.corrected ? "(corregido)" : "(sin nombre)");
        row.append(
          el("div", { class: "hn-wp-name" }, wp.dest ? `⚑ ${name}` : name),
          el("div", { class: "hn-wp-coord" }, `${formatLat(wp.lat)}  ${formatLon(wp.lon)}`),
        );
        if (wp.corrected) row.append(el("span", { class: "hn-tag" }, "corregido"));
        const detail = el("div", { class: "hn-wp-detail" });
        const next = wps[i + 1];
        const pos = `${formatLat(wp.lat)}  ${formatLon(wp.lon)}`;
        detail.textContent = next
          ? `${pos} · al siguiente (${next.name || "sin nombre"}): ${nmDecimal(haversineNm(wp.lat, wp.lon, next.lat, next.lon))}`
          : `${pos} · último waypoint`;
        row.addEventListener("click", () => {
          const wasOn = item.classList.contains("on");
          for (const it of list.querySelectorAll(".hn-wp-item.on")) it.classList.remove("on");
          if (wasOn) {
            clearWpMarker(ui);
            return;
          }
          item.classList.add("on");
          setSource(ui.map, "sel-wp", featureCollection([pointFeature(wp.lon, wp.lat, { name })]));
          ui.map.flyTo({ center: [wp.lon, wp.lat], zoom: Math.max(ui.map.getZoom(), 7), duration: 600 });
        });
        item.append(row, detail);
        list.append(item);
      });
      b.append(list);
    });
  }

  const refLines: [string, string[]][] = [
    ["Cartas", d.charts],
    ["Guías", d.guides],
    ["Planificador", d.planner],
  ].filter(([, items]) => (items as string[]).length > 0) as [string, string[]][];
  if (refLines.length > 0) {
    accordion(ui, host, "referencias", "Referencias", undefined, (b) => {
      for (const [label, items] of refLines) {
        b.append(el("p", { class: "hn-ref" }, el("span", { class: "hn-k" }, `${label}: `), items.join(", ")));
      }
    });
  }

  if (d.quoteEs || d.quoteEn || d.attribution) {
    accordion(ui, host, "libro", "Del libro", undefined, (b) => {
      if (d.quoteEs || d.quoteEn) {
        const q = el("blockquote", { class: "hn-quote" });
        if (d.quoteEs) q.append(el("p", {}, d.quoteEs));
        else if (d.quoteEn) q.append(el("p", { class: "hn-quote-en" }, d.quoteEn));
        if (d.quoteSource) q.append(el("cite", {}, d.quoteSource));
        b.append(q);
      }
      if (d.attribution) b.append(el("p", { class: "hn-attrib" }, d.attribution));
    });
  }
}

function monthStrip(ui: UiState, d: RouteDetail, onChange?: () => void): HTMLElement {
  const strip = el("div", { class: "hn-months" });
  const buttons: HTMLElement[] = [];
  const apply = (): void => {
    for (let m = 1; m <= 12; m++) {
      const v = monthVerdict(d.whenInfo.bestMonths, d.whenInfo.stormMonths, m);
      const b = buttons[m - 1]!;
      b.className = `hn-month hn-month-${v}${ui.month() === m ? " on" : ""}`;
    }
  };
  for (let m = 1; m <= 12; m++) {
    const v = monthVerdict(d.whenInfo.bestMonths, d.whenInfo.stormMonths, m);
    const b = el(
      "button",
      { class: `hn-month hn-month-${v}${ui.month() === m ? " on" : ""}`, title: MONTH_NAME[m - 1] ?? "" },
      MONTH_INITIAL[m - 1] ?? "",
    );
    b.addEventListener("click", () => {
      ui.month.set(m);
      apply();
      onChange?.();
    });
    buttons.push(b);
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
    // UX-2: la posición manual manda; no dejar el watch del GPS pisándola.
    stopGps(ui);
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

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 60))}:${p(s % 60)}`;
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

function getLeftPadding(ui: UiState): number {
  if (typeof window === "undefined") return 40;
  if (window.innerWidth >= 1100) return ui.selected() ? 780 : 340;
  if (window.innerWidth >= 700) return 420;
  return 40;
}

function getBottomPadding(_ui: UiState): number {
  if (typeof window === "undefined") return 260;
  return window.innerWidth >= 700 ? 20 : 260;
}
