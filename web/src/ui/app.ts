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

import { Marker, type Map as MlMap, type GeoJSONSource, type FilterSpecification, type MapMouseEvent } from "maplibre-gl";
import {
  effect,
  navAlarmGate,
  normalizeUiMode,
  signal,
  computed,
  sustainedSog,
  uiModeAuto,
  untracked,
  type Signal,
  type UiMode,
} from "../core/store.ts";
import {
  filterEntries,
  monthScore,
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
import { getCell, loadMonth, type ClimLineString, type ClimMonth } from "../core/clim.ts";
import {
  ageText,
  bboxCenter,
  bboxCovers,
  bboxOfBounds,
  bboxOfTrack,
  empalmeConClimatología,
  forecastBytes,
  forecastIdPoint,
  forecastIdView,
  forecastOwnerName,
  getForecastAge,
  type BBox,
  type ForecastPackage,
} from "../core/forecast.ts";
import { formatLat, formatLon, parseCoords } from "../core/coords.ts";
import { parseRouteFile, importedRouteToGeoJson, type ImportedRoute } from "../core/gpx.ts";
import {
  applyOptimizationToOwn,
  copyToOwn,
  endOwn,
  endOwnEdit,
  loadOwnRoutes,
  ownArmActive,
  ownEdit,
  ownRouteById,
  ownRoutes,
  renderMisRutas,
  renderOwnFicha,
  replaceOwnRoute,
  type OwnCtx,
} from "./routes-own.ts";
import { navigate, haversineNm, trackLengthNm, pointAlongTrack, type RouteTrack, type NavFix, type LonLat } from "../core/navigation.ts";
import type { OwnRoute } from "../core/routes-own.ts";
import { addWaypoint } from "../core/routes-own.ts";
import { genericPolar } from "../core/routing/polar.ts";
import { forecastHorizon, forecastWindField, horizonNotice } from "../core/routing/windfield.ts";
import {
  DEFAULT_ROUTING_MODE,
  ROUTING_MODES,
  estimateRouteDuration,
  multiRouteCoords,
  multiRouteSplit,
  routingModeConfig,
  type IsoBaseline,
  type IsoMultiResult,
  type IsoWorkerResponse,
  type RouteEstimate,
  type RoutingMode,
} from "../core/routing/isochrones.ts";
import { kinematics, type Fix, type Kinematics } from "../core/kinematics.ts";
import {
  DEFAULT_ALARMS,
  anchorAlarm,
  anchorDistanceM,
  mobFix,
  type AlarmSettings,
  type AnchorWatch,
  type Mob,
} from "../core/alarms.ts";
import {
  voyageDistanceNm,
  dailyReport,
  withPoint,
  type DailyReport,
  type Note,
  type VoyageLog,
} from "../core/voyage.ts";
import { voyageToGpx } from "../core/gpx.ts";
import { sunTimes } from "../core/sun.ts";
import { loadFact } from "../platform/catalog.ts";
import { beep } from "../platform/sound.ts";
import { KEYS, type KeyValueStore } from "../platform/store.ts";
import {
  downloadForecast,
  listForecasts,
  loadForecast,
  removeForecast,
  type ForecastEntry,
} from "../platform/forecast.ts";
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
} from "./format.ts";
import {
  formatSpeed,
  formatDistance,
  formatDepth,
  formatDuration,
  breakdownDuration,
  applyUnits,
  applyVisibility,
  measureLegs,
  mobButtonVisible,
  navToWpLine,
  FT_PER_M,
  DEFAULT_UNITS,
  DEFAULT_VISIBILITY,
  type Units,
  type DistanceUnit,
  type DepthUnit,
  type Visibility,
} from "../core/format.ts";
import { resolveTheme, THEME_LABEL, THEME_ORDER, themeIcon, type ThemeChoice, type ThemeName } from "./theme.ts";
import { POINT_ACTIONS, forecastCoversPoint, type PointActionId } from "./point-actions.ts";
import {
  clearWeather,
  hourLabel,
  initWeatherLayers,
  nearestSlot,
  SLIDER_SLOTS,
  slotTime,
  summarizeRoute,
  updateForecastWeather,
  updateWeather,
  WEATHER_LABEL,
  WEATHER_ORDER,
  WX_ISOBAR_INTERVAL,
  WX_WAVE_COLORS,
  WX_WAVE_STOPS,
  WX_WIND_COLORS,
  WX_WIND_STOPS,
  applyWxLayers,
  defaultWxLayers,
  WX_LAYERS,
  type RouteWindSummary,
  type WeatherMode,
  type WxLayerKey,
  type WxLayers,
} from "./weather.ts";

type TabName = "aqui" | "rutas" | "travesia" | "ajustes" | "datos";
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
  theme?: ThemeChoice;
  redAtNight?: boolean;
  wxLayers?: WxLayers;
  // E12.6: modo de ponderación del optimizador (Confort / Crucero / Regata).
  routingMode?: RoutingMode;
  // UX-N.3: Planificar y Navegar (D3). Las alarmas de navegación solo suenan
  // en Navegar.
  uiMode?: UiMode;
  visibilidad?: Visibility;
  unidades?: Units;
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

// UX-N.1 — hoja de acciones sobre un punto del mapa (mantener pulsado o click
// derecho). El pin vive hasta que la hoja se cierra; "Optimizar desde acá"
// deja el pin como origen y arma el próximo toque como destino.
let pointSheetEl: HTMLElement | null = null;
let pointPin: Marker | null = null;
let pointLat = 0;
let pointLon = 0;
let pointDestArmed = false;
let pointOptCancel: (() => void) | null = null;
let pointOptCode: string | null = null;
let pointOptOnUpdate: (() => void) | null = null;
let pointOutsideRemove: (() => void) | null = null;

// UX-N.5 T11.3: herramienta Medir. Arranca desde la hoja del pin; cada toque
// agrega un punto. La banda lleva "Limpiar" y "✕"; ESC termina.
interface MeasureState {
  ui: UiState;
  points: { lat: number; lon: number }[];
  band: HTMLElement;
  onMap: (e: MapMouseEvent) => void;
}
let measure: MeasureState | null = null;

// Fichas ya cargadas: permiten volver a armarlas al cambiar de variante sin
// mostrar "Cargando…" otra vez (W4.5).
const fichaCache = new Map<string, RouteDetail>();

// E12.13 — duración estimada por (código, variante, mes) mientras la ficha esté
// abierta. `traverseRoute` ya corre en cada optimización, así que no hace falta
// repetirlo en cada repintado: solo se invalida cuando cambia el paquete
// propio de la ruta (su `fetchedAt`). Se vacía al cerrar la ficha.
const durCache = new Map<string, { stamp: number; startMs: number; est: RouteEstimate }>();

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
  // PS-1 #3: "Salgo en {mes}" activo → la lista de Rutas se ordena por score del
  // mes de planificación y muestra la etiqueta en vez de la insignia simple.
  departSort: Signal<boolean>;
  imported: Signal<ImportedRoute[]>;
  voyage: Signal<VoyageLog | null>;
  recording: Signal<boolean>;
  helpSeen: Signal<boolean | null>;
  anchor: Signal<AnchorSettings>;
  mob: Signal<Mob | null>;
  theme: Signal<ThemeChoice>;
  redAtNight: Signal<boolean>;
  now: Signal<number>;
  // E8.3: modo del interruptor "Tiempo", caché de meses de climatología ya
  // cargados y cargas en curso (para no pedir el mismo mes dos veces).
  weather: Signal<WeatherMode>;
  // E13.3: interruptores de capas del "Tiempo" (hn.settings.wxLayers).
  wxLayers: Signal<WxLayers>;
  clim: Map<number, ClimMonth>;
  climInFlight: Map<number, Promise<ClimMonth | null>>;
  // E13.2: paquete de pronóstico cargado y paso del deslizador de hora.
  forecast: Signal<ForecastPackage | null>;
  forecastHour: Signal<number>;
  navFixes: Fix[];
  // UX-N.3: modo de la tira (Planificar / Navegar) y cuándo entró, para no
  // desenganchar un Navegar forzado a mano antes de los 2 minutos.
  mode: Signal<UiMode>;
  modeEnteredAt: number;
  unidades: Signal<Units>;
  visibilidad: Signal<Visibility>;
  settings: Settings;
  zones?: ZoneHooks;
}

export interface AppDeps {
  store: KeyValueStore;
  zones?: ZoneHooks;
  onTheme?: (theme: ThemeName) => void;
}

// El mapa y la UI se montan apenas carga el mapa base; el catálogo llega después
// y se inyecta por estos métodos (arranque progresivo, W5.1).
export interface AppHandle {
  setCatalog(index: CatalogIndex, basins: Record<string, Basin>): void;
  setRoutes(routesGeoJson: string): void;
  catalogFailed(): void;
  routesFailed(): void;
  setScaleNote(text: string | null): void;
  // UX-N.1: mantener pulsado el mapa (o click derecho) abre la hoja de
  // acciones sobre ese punto.
  openPointActions(lat: number, lon: number): void;
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
    departSort: signal(false),
    imported: signal<ImportedRoute[]>([]),
    voyage: signal<VoyageLog | null>(null),
    recording: signal(false),
    helpSeen: signal<boolean | null>(null),
    anchor: signal<AnchorSettings>({ ...DEFAULT_ANCHOR }),
    mob: signal<Mob | null>(null),
    theme: signal<ThemeChoice>("auto"),
    redAtNight: signal<boolean>(false),
    now: signal(Date.now()),
    weather: signal<WeatherMode>("off"),
    wxLayers: signal<WxLayers>(defaultWxLayers()),
    clim: new Map(),
    climInFlight: new Map(),
    forecast: signal<ForecastPackage | null>(null),
    forecastHour: signal<number>(0),
    navFixes: [],
    mode: signal<UiMode>("planificar"),
    modeEnteredAt: Date.now(),
    unidades: signal<Units>({ ...DEFAULT_UNITS }),
    visibilidad: signal<Visibility>({ ...DEFAULT_VISIBILITY }),
    settings: { acc: defaultAcc(), alarms: { ...DEFAULT_ALARMS }, anchor: { ...DEFAULT_ANCHOR }, mob: null, theme: "auto", redAtNight: false, wxLayers: defaultWxLayers(), routingMode: DEFAULT_ROUTING_MODE, uiMode: "planificar", visibilidad: { ...DEFAULT_VISIBILITY }, unidades: { ...DEFAULT_UNITS } },
    zones: deps.zones,
  };

  installBaseLayers(map);
  // E13.4: las capas wx-* ya existen; aplicar ya el estado de los interruptores
  // (el effect de arranque puede correr antes de que las capas estén creadas).
  applyWxLayers(map, ui.wxLayers());

  // UX-N.4b: retícula y balizas OSM online siguen el interruptor de visibilidad.
  effect(() => {
    const on = ui.visibilidad().graticule ? "visible" : "none";
    for (const id of ["graticule-line", "graticule-label"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on);
    }
  });
  effect(() => {
    if (map.getLayer("seamarks-online")) {
      map.setLayoutProperty("seamarks-online", "visibility", ui.visibilidad().seamarksOnline ? "visible" : "none");
    }
  });
  wireGps(ui);

  // Tema Día / Noche / Rojo (T11.5): `theme` resuelve Auto con la posición y la
  // hora; cada 5 minutos se reevalúa para cruzar el amanecer o el atardecer.
  const theme = computed<ThemeName>(() => {
    const pos = ui.position();
    return resolveTheme(ui.theme(), ui.redAtNight(), pos?.lat ?? 40, pos?.lon ?? 0, ui.now());
  });
  effect(() => deps.onTheme?.(theme()));
  const themeTimer = window.setInterval(() => ui.now.set(Date.now()), 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ui.now.set(Date.now());
    simVisibility();
  });
  window.addEventListener("pagehide", () => window.clearInterval(themeTimer), { once: true });

  let moveTimer: number | undefined;
  map.on("moveend", () => {
    if (moveTimer !== undefined) window.clearTimeout(moveTimer);
    moveTimer = window.setTimeout(() => {
      applyCatalogFilter(ui);
      // E8.3/E13.2: las capas wx se dibujan solo en la vista actual; al mover
      // el mapa hay que repintar.
      if (ui.weather() === "pilot") {
        const clim = ui.clim.get(ui.month());
        if (clim) updateWeather(ui.map, clim, ui.month());
      } else if (ui.weather() === "forecast") {
        paintForecast(ui);
      }
    }, 300);
  });
  effect(() => {
    ui.query();
    ui.region();
    ui.nearMe();
    ui.catalog();
    applyCatalogFilter(ui);
  });

  // E8.3/E13.2: al cambiar de modo o de mes, encender Pilot chart carga (y
  // cachea) el mes de planificación y repinta; Pronóstico limpia y pinta el
  // paquete; Apagado limpia todo.
  effect(() => {
    const mode = ui.weather();
    const month = ui.month();
    if (mode === "off") {
      clearWeather(ui.map);
      return;
    }
    if (mode === "pilot") {
      const cached = ui.clim.get(month);
      if (cached) updateWeather(ui.map, cached, month);
      else void ensureClim(ui, month);
      return;
    }
    clearWeather(ui.map);
    paintForecast(ui);
  });

  // E13.2: al elegir Pronóstico, carga el paquete de la travesía (o de la vista)
  // y coloca el deslizador en "ahora".
  effect(() => {
    const mode = ui.weather();
    const id = ui.active()?.code ?? ui.selected()?.code ?? "vista";
    if (mode !== "forecast") return;
    void loadForecast(ui.store, id).then((pkg) => {
      ui.forecast.set(pkg);
      ui.forecastHour.set(pkg ? nearestSlot(pkg, Date.now()) : 0);
    });
  });

  // E13.2: repinta cuando cambia la hora del deslizador.
  effect(() => {
    ui.weather();
    ui.forecast();
    ui.forecastHour();
    ui.month();
    paintForecast(ui);
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
  effect(() => {
    fab.hidden = !ui.visibilidad().fab;
  });

  // UX-3: nota discreta abajo a la izquierda cuando el zoom pasa el detalle
  // disponible en el centro (la carta base llega a zoom 6; una zona descargada,
  // a 10). El texto y su visibilidad los decide main.ts.
  const scaleNote = el("div", { class: "hn-scale-note" });
  scaleNote.hidden = true;
  root.append(scaleNote);
  // UX-N.4b: la nota de escala respeta el interruptor de visibilidad.
  let scaleNoteText: string | null = null;
  effect(() => {
    scaleNote.hidden = scaleNoteText === null || !ui.visibilidad().scaleNote;
  });

  // E8.3/E13.3: leyenda compacta y selector de capas abajo a la izquierda,
  // cuando el interruptor "Tiempo" no está apagado.
  const wxStack = el("div", { class: "hn-wx-stack" });
  const wxPanel = el("div", { class: "hn-wx-panel" });
  const wxLegend = el("div", { class: "hn-wx-legend" });
  wxLegend.hidden = true;
  wxStack.append(wxPanel, wxLegend);
  root.append(wxStack);
  effect(() => renderWxLayers(wxPanel, ui, ui.weather(), ui.wxLayers()));
  effect(() =>
    renderWeatherLegend(wxLegend, ui, ui.weather(), ui.month(), ui.forecast(), ui.forecastHour(), ui.wxLayers()),
  );

  // E13.3: encender/apagar cada capa wx-* según los interruptores.
  effect(() => applyWxLayers(ui.map, ui.wxLayers()));

  // E13.2: deslizador de hora bajo la barra de contexto, solo en Pronóstico.
  // El alto real de la barra se mide y se expone como --hn-ctx-h.
  const wxBar = el("div", { class: "hn-wx-bar" });
  const wxLabel = el("div", { class: "hn-wx-hora" });
  const wxRange = el("input", { class: "hn-wx-range", type: "range", min: "0" });
  wxRange.max = String(SLIDER_SLOTS - 1);
  wxRange.step = "1";
  wxRange.value = "0";
  wxRange.setAttribute("aria-label", "Hora del pronóstico");
  const wxNow = el("button", { class: "hn-btn hn-wx-now", type: "button" }, "ahora");
  wxBar.append(wxLabel, wxRange, wxNow);
  wxBar.hidden = true;
  root.append(wxBar);
  wxRange.addEventListener("input", () => ui.forecastHour.set(Number(wxRange.value)));
  wxNow.addEventListener("click", () => {
    const pkg = ui.forecast();
    if (pkg) ui.forecastHour.set(nearestSlot(pkg, Date.now()));
  });
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      const h = contextBar.getBoundingClientRect().height;
      if (h > 0) document.documentElement.style.setProperty("--hn-ctx-h", `${h}px`);
    });
    ro.observe(contextBar);
    window.addEventListener("pagehide", () => ro.disconnect(), { once: true });
  }
  effect(() => {
    const mode = ui.weather();
    const pkg = ui.forecast();
    const hour = ui.forecastHour();
    if (mode !== "forecast" || !pkg) {
      wxBar.hidden = true;
      return;
    }
    wxBar.hidden = false;
    if (Number(wxRange.value) !== hour) wxRange.value = String(hour);
    const time = slotTime(pkg, hour);
    clear(wxLabel);
    wxLabel.append(document.createTextNode(hourLabel(time)));
    if (empalmeConClimatología(pkg, time)) wxLabel.append(el("span", { class: "hn-wx-medio" }, "clima medio"));
  });

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
    if (!ui.visibilidad().mob || ui.mob() || !ui.position()) return;
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
    // Un MOB activo siempre se ve, aunque el botón esté oculto.
    mobBtn.hidden = !mobButtonVisible(ui.visibilidad(), has, on);
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

  // UX-N.5 T9.1: nav-to-wp = posición → próximo waypoint, punteada verde.
  // Solo con ruta activa y posición (la capa ya existe; acá se llena la fuente).
  effect(() => {
    const navigating = ui.mode() === "navegar" && ui.active() !== null;
    const nav = activeNav(ui);
    const p = ui.position();
    const coords = navToWpLine(navigating, p, nav ? { lat: nav.fix.nextLat, lon: nav.fix.nextLon } : null);
    setSource(
      ui.map,
      "navline",
      coords ? featureCollection([lineFeature(coords)]) : featureCollection([]),
    );
  });

  // E9.3: pantalla encendida mientras haya ruta activa, fondeo o MOB.
  effect(() => {
    const on = ui.active() !== null || ui.anchor().active || ui.mob() !== null;
    void keepAwake(on);
  });

  // UX-N.3: Planificar y Navegar (D3). Engancha solo con SOG sostenido y ruta
  // activa; se desengancha a los 2 minutos de parar. El chip de la tira fuerza
  // cualquiera de los dos a mano.
  effect(() => {
    const current = ui.mode();
    void ui.position();
    const next = uiModeAuto(ui.navFixes, Date.now(), ui.active() !== null, current, ui.modeEnteredAt);
    if (next !== current) {
      ui.modeEnteredAt = Date.now();
      ui.mode.set(next);
    }
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
  ui.theme.subscribe((t) => {
    ui.settings.theme = t;
    saveSettings(ui);
  });
  ui.redAtNight.subscribe((v) => {
    ui.settings.redAtNight = v;
    saveSettings(ui);
  });
  // UX-N.3: el modo de la tira también se recuerda.
  ui.mode.subscribe((m) => {
    ui.settings.uiMode = m;
    saveSettings(ui);
  });
  ui.visibilidad.subscribe((v) => {
    ui.settings.visibilidad = v;
    saveSettings(ui);
  });
  ui.unidades.subscribe((v) => {
    ui.settings.unidades = v;
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
      syncOwnGeometry(ui);
      addCatalogLayers(ui, routesGeoJson);
      ui.routes.set("ready");
      const sel = ui.selected();
      if (sel && !ownRouteById(sel.code)) {
        drawSelected(ui, sel.code, ui.variant().startsWith(sel.code) ? ui.variant() : null);
      }
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
      scaleNoteText = text;
      if (text !== null && scaleNote.textContent !== text) scaleNote.textContent = text;
      // El effect de visibilidad arma `hidden`; acá solo se refleja el texto.
      scaleNote.hidden = text === null || !ui.visibilidad().scaleNote;
    },
    openPointActions(lat, lon) {
      openPointActions(ui, lat, lon);
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
    if (s.theme) ui.theme.set(s.theme);
    if (typeof s.redAtNight === "boolean") ui.redAtNight.set(s.redAtNight);
    if (s.wxLayers) {
      const layers = { ...defaultWxLayers(), ...s.wxLayers };
      ui.wxLayers.set(layers);
      ui.settings.wxLayers = layers;
    }
    if (s.routingMode && ROUTING_MODES.some((m) => m.id === s.routingMode)) {
      ui.settings.routingMode = s.routingMode;
    }
    if (s.visibilidad) {
      const v = applyVisibility(s.visibilidad);
      ui.visibilidad.set(v);
      ui.settings.visibilidad = v;
    }
    if (s.unidades) {
      const u = applyUnits(s.unidades);
      ui.unidades.set(u);
      ui.settings.unidades = u;
    }
    const mode = normalizeUiMode(s.uiMode);
    if (mode) {
      ui.mode.set(mode);
      ui.modeEnteredAt = Date.now();
    }
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
  await loadOwnRoutes(ui.store);
  syncOwnGeometry(ui);
  if (ui.active() && ownRouteById(ui.active()!.code)) drawActive(ui);
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

  // Balizas OSM en línea (E10.3): raster de OpenSeaMap. UX-N.4b: el interruptor
  // vive en Ajustes › Visibilidad y arranca encendido (efecto en mountApp).
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

  // Pilot charts (E8.3, ADR-009): las capas wx-* van por encima de las balizas
  // y por debajo de catálogo, rutas y posición (nada tapa rutas ni avisos).
  initWeatherLayers(map);

  // Isócronas del enrutado con el viento (E12.5): capa wx- en el tramo fijo,
  // justo por encima de las flechas de viento y por debajo de rutas.
  map.addSource("wx-isochrones", { type: "geojson", data: empty });
  map.addLayer({
    id: "wx-isochrones",
    type: "line",
    source: "wx-isochrones",
    paint: { "line-color": "#80CBC4", "line-opacity": 0.45, "line-width": 1 },
  });

  for (const id of ["selected", "active", "imported", "voyage", "measure-line", "me", "navline", "sel-wp", "anchor", "mob", "optroute"]) {
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
  // T11.3: la línea de Medir, punteada y por encima de la bitácora (id fijo).
  map.addLayer({
    id: "measure-line",
    type: "line",
    source: "measure-line",
    paint: { "line-color": "#FF8A65", "line-width": 2, "line-dasharray": [2, 1.5] },
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
  // Trazado óptimo propuesto (E12.5): mismo color que la ruta activa pero
  // punteado, para distinguirlo de la ruta real sin inventar un color nuevo.
  // E12.12: azul donde rige el pronóstico real, rojo punteado donde empieza la
  // pilot chart (clima medio); mismo dash en ambos, el color distingue el dato.
  map.addLayer({
    id: "route-opt",
    type: "line",
    source: "optroute",
    paint: {
      "line-color": ["case", ["get", "clima"], "#FF1744", "#4FC3F7"],
      "line-width": 2.5,
      "line-dasharray": [3, 2],
    },
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
    if (fixOnMapArmed || ownArmActive() || pointDestArmed || measure) return;
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
    if (wpHitHandled || fixOnMapArmed || ownArmActive() || pointDestArmed || measure) return;
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

// E11.4: las rutas propias se inyectan en `ui.geometry` con código y variante
// propios, así `drawActive` y `activeNav` las navegan como una ruta del libro.
function syncOwnGeometry(ui: UiState): void {
  const ids = new Set<string>();
  for (const r of ownRoutes()) {
    const coords = r.waypoints.map((w) => [w.lon, w.lat] as [number, number]);
    const names = r.waypoints.map((w) => w.name);
    ui.geometry.set(`${r.id}|${r.id}`, { coords, names });
    ids.add(r.id);
  }
  for (const key of [...ui.geometry.keys()]) {
    const code = key.slice(0, key.indexOf("|"));
    if (code.startsWith("MIA-") && !ids.has(code)) ui.geometry.delete(key);
  }
}

function drawOwnSelected(ui: UiState, route: OwnRoute): void {
  const coords = route.waypoints.map((w) => [w.lon, w.lat] as [number, number]);
  const features: object[] = [];
  if (coords.length >= 2) features.push(lineFeature(coords));
  route.waypoints.forEach((w, i) => features.push(pointFeature(w.lon, w.lat, { name: w.name, wpIndex: i })));
  setSource(ui.map, "selected", featureCollection(features));
}

function openOwn(ui: UiState, route: OwnRoute): void {
  ui.selected.set({ code: route.id, chapter: "own" });
  drawOwnSelected(ui, route);
  const coords = route.waypoints.map((w) => [w.lon, w.lat] as [number, number]);
  if (coords.length >= 2) fitTo(ui, coords);
  if (ui.sheet() === "peek") ui.sheet.set("half");
}

function followOwn(ui: UiState, route: OwnRoute): void {
  syncOwnGeometry(ui);
  ui.active.set({ code: route.id, chapter: "own", variant: route.id });
  drawActive(ui);
  wireGpsStart();
  ui.selected.set(null);
  ui.tab.set("aqui");
  ui.sheet.set("half");
}

function ownCtx(ui: UiState): OwnCtx {
  return {
    store: ui.store,
    map: ui.map,
    open: (route) => openOwn(ui, route),
    follow: (route) => followOwn(ui, route),
    redraw: () => {
      syncOwnGeometry(ui);
      const e = ownEdit();
      if (e) drawOwnSelected(ui, e);
      drawActive(ui);
    },
    close: () => closeFicha(ui),
  };
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

function pushFix(ui: UiState, p: Position, speedMps: number | null = null): void {
  ui.navFixes.push({ lat: p.lat, lon: p.lon, t: p.t, speedMps, headingDeg: null });
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
  // Si el GPS vuelve a arrancar (p. ej. "Seguir"), el simulador deja de mandar.
  if (sim.ui) simStop();
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

// ------------------------------------------------- simulador "Recorrer" (SIM)

const SIM_SPEEDS = [4, 16, 64] as const;
type SimSpeed = (typeof SIM_SPEEDS)[number];

// Estado del simulador de "Recorrer la ruta". Es único en la app: nace al tocar
// "Recorrer" en la ficha y muere con "✕ Terminar". La fila `hn-sim` se reutiliza
// y se vuelve a enganchar si la ficha se rearma por un cambio de variante.
const sim = {
  ui: null as UiState | null,
  code: null as string | null,
  track: null as RouteTrack | null,
  totalNm: 0,
  doneNm: 0,
  speed: 4 as SimSpeed,
  running: false,
  finished: false,
  pausedByVisibility: false,
  prevPosition: null as Position | null,
  prevGps: false,
  prevStatus: "off" as PositionStatus,
  raf: null as number | null,
  lastTs: 0,
  lastApply: 0,
  // Reloj simulado (PS-1 #0): t = t0 + horas recorridas a 6 kn. La posición
  // simulada usa ese reloj, no el de la máquina.
  t0: 0,
  row: null as HTMLElement | null,
  playBtn: null as HTMLButtonElement | null,
  speedBtn: null as HTMLButtonElement | null,
  progress: null as HTMLElement | null,
};

function simTrackFrom(g: Geometry): RouteTrack {
  return {
    names: g.coords.map((_, i) => `WP ${i}`),
    dests: g.coords.map(() => false),
    corrected: g.coords.map(() => false),
    coords: g.coords,
  };
}

function simRowEnsure(): HTMLElement {
  if (sim.row) return sim.row;
  const row = el("div", { class: "hn-sim" });
  const play = el("button", { class: "hn-sim-btn", type: "button" }, "▶");
  play.title = "Empezar o pausar el recorrido";
  play.setAttribute("aria-label", "Empezar");
  const speed = el("button", { class: "hn-sim-btn hn-sim-speed", type: "button" }, "x4");
  speed.title = "Velocidad del recorrido";
  speed.setAttribute("aria-label", "Velocidad del recorrido");
  const reset = el("button", { class: "hn-sim-btn", type: "button" }, "↺ Reiniciar");
  const progress = el("div", { class: "hn-sim-progress" });
  const stop = el("button", { class: "hn-sim-btn hn-sim-stop", type: "button" }, "✕ Terminar");
  play.addEventListener("click", () => simToggle());
  speed.addEventListener("click", () => simCycleSpeed());
  reset.addEventListener("click", () => simReset());
  stop.addEventListener("click", () => simStop());
  row.append(play, speed, reset, progress, stop);
  sim.row = row;
  sim.playBtn = play;
  sim.speedBtn = speed;
  sim.progress = progress;
  return row;
}

function simUpdateRow(): void {
  if (sim.playBtn) {
    sim.playBtn.textContent = sim.running ? "⏸" : "▶";
    sim.playBtn.setAttribute("aria-label", sim.running ? "Pausar" : "Empezar");
    sim.playBtn.className = `hn-sim-btn${sim.running ? " hn-sim-on" : ""}`;
  }
  if (sim.speedBtn) sim.speedBtn.textContent = `x${sim.speed}`;
  if (sim.progress) {
    const done = sim.ui ? dst(sim.ui, sim.doneNm, false) : `${Math.round(sim.doneNm)} nm`;
    const total = sim.ui ? dst(sim.ui, sim.totalNm, false) : `${Math.round(sim.totalNm)} nm`;
    sim.progress.textContent = `${done} / ${total}`;
  }
}

function simCancelRaf(): void {
  if (sim.raf !== null) {
    cancelAnimationFrame(sim.raf);
    sim.raf = null;
  }
}

// Un paso de simulación entra por la misma puerta que un fix de GPS: posición +
// pushFix (que además alimenta la bitácora si se está grabando).
function simApply(): void {
  const ui = sim.ui;
  const track = sim.track;
  if (!ui || !track) return;
  const at = pointAlongTrack(track, sim.doneNm);
  if (!at) return;
  const [lon, lat] = at;
  // PS-1 #0: velocidad fija 6 kn (3,086666… m/s) para que SOG muestre 6 kn.
  const speedMps = 6 * 1852 / 3600;
  // Reloj simulado: t = t0 + (nm recorridas / 6 kn) en ms. Así la ETA es realista
  // aunque el recorrido vaya a x64.
  const tSim = sim.t0 + (sim.doneNm / 6) * 3_600_000;
  const pos: Position = { lat, lon, accuracyM: 0, source: "simulated", t: tSim };
  ui.position.set(pos);
  setSource(ui.map, "me", featureCollection([pointFeature(lon, lat)]));
  pushFix(ui, pos, speedMps);
}

function simTick(ts: number): void {
  sim.raf = null;
  if (!sim.ui || !sim.running) return;
  if (sim.lastTs === 0) sim.lastTs = ts;
  const dt = Math.min(0.5, Math.max(0, (ts - sim.lastTs) / 1000));
  sim.lastTs = ts;
  // A velocidad x4 una ruta entera dura 90/4 ≈ 22 s.
  sim.doneNm = Math.min(sim.totalNm, sim.doneNm + (sim.totalNm / 90) * sim.speed * dt);
  if (ts - sim.lastApply >= 200 || sim.doneNm >= sim.totalNm) {
    sim.lastApply = ts;
    simApply();
    simUpdateRow();
  }
  if (sim.doneNm >= sim.totalNm) {
    sim.running = false;
    sim.finished = true;
    simUpdateRow();
    return;
  }
  sim.raf = requestAnimationFrame(simTick);
}

function simOpen(ui: UiState, d: RouteDetail, head: HTMLElement): void {
  const g = selectedGeometry(ui, d.code);
  if (!g || g.coords.length < 2) return;
  if (sim.ui) simStop();
  fitTo(ui, g.coords);
  const track = simTrackFrom(g);
  const totalNm = trackLengthNm(track);
  if (!(totalNm > 0)) return;

  sim.ui = ui;
  sim.code = d.code;
  sim.track = track;
  sim.totalNm = totalNm;
  sim.doneNm = 0;
  sim.speed = 4;
  sim.finished = false;
  sim.pausedByVisibility = false;
  sim.lastTs = 0;
  sim.lastApply = 0;
  // El reloj simulado arranca acá: t = t0 + (nm recorridas / 6 kn) en ms.
  sim.t0 = Date.now();
  sim.prevPosition = ui.position();
  sim.prevGps = ui.gpsStop !== null;
  sim.prevStatus = ui.gpsStatus();
  stopGps(ui);

  // La variante elegida pasa a ser la ruta activa (como Seguir): así la tira
  // Navegando, las alarmas y la bitácora andan igual que con GPS real.
  const variant = ui.variant().startsWith(d.code) ? ui.variant() : (d.variants[0]?.id ?? null);
  ui.active.set({ code: d.code, chapter: d.chapter, variant });

  head.append(simRowEnsure());
  simApply();
  sim.running = true;
  simUpdateRow();
  simCancelRaf();
  sim.raf = requestAnimationFrame(simTick);
}

function simToggle(): void {
  if (!sim.ui) return;
  if (sim.finished) {
    sim.finished = false;
    sim.doneNm = 0;
    sim.lastApply = 0;
    sim.t0 = Date.now();
    simApply();
  }
  sim.pausedByVisibility = false;
  sim.running = !sim.running;
  simCancelRaf();
  if (sim.running) {
    sim.lastTs = 0;
    sim.raf = requestAnimationFrame(simTick);
  }
  simUpdateRow();
}

function simCycleSpeed(): void {
  if (!sim.ui) return;
  const i = SIM_SPEEDS.indexOf(sim.speed);
  sim.speed = SIM_SPEEDS[(i + 1) % SIM_SPEEDS.length] ?? 4;
  simUpdateRow();
}

function simReset(): void {
  if (!sim.ui) return;
  sim.doneNm = 0;
  sim.finished = false;
  sim.lastTs = 0;
  sim.lastApply = 0;
  sim.t0 = Date.now();
  simApply();
  simUpdateRow();
}

// ✕ Terminar: detiene, limpia la posición simulada, restaura la fuente anterior
// (si era GPS, reanuda el watch) y deja de seguir la ruta.
function simStop(): void {
  simCancelRaf();
  sim.running = false;
  sim.finished = false;
  sim.pausedByVisibility = false;
  const ui = sim.ui;
  const prev = sim.prevPosition;
  const wasGps = sim.prevGps;
  const prevStatus = sim.prevStatus;
  sim.ui = null;
  sim.track = null;
  sim.code = null;
  sim.doneNm = 0;
  sim.totalNm = 0;
  sim.row?.remove();
  if (!ui) return;
  ui.active.set(null);
  ui.position.set(null);
  setSource(ui.map, "me", featureCollection([]));
  if (wasGps) {
    ui.gpsStatus.set("searching");
    wireGpsStart();
    return;
  }
  ui.gpsStatus.set(prevStatus);
  if (prev) {
    ui.position.set(prev);
    setSource(ui.map, "me", featureCollection([pointFeature(prev.lon, prev.lat)]));
  }
}

// Pausa automática con la pestaña oculta; reanuda al volver.
function simVisibility(): void {
  if (!sim.ui) return;
  if (document.hidden && sim.running) {
    sim.running = false;
    sim.pausedByVisibility = true;
    simCancelRaf();
    simUpdateRow();
    return;
  }
  if (!document.hidden && sim.pausedByVisibility && !sim.finished) {
    sim.pausedByVisibility = false;
    sim.running = true;
    sim.lastTs = 0;
    simUpdateRow();
    simCancelRaf();
    sim.raf = requestAnimationFrame(simTick);
  }
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
    when.addEventListener("click", () => openMonthPicker(ui));

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

    const themeBtn = el("button", { class: "hn-ctx-theme", type: "button" });
    const choice = ui.theme();
    const shown = choice === "auto" ? resolveTheme(choice, ui.redAtNight(), pos?.lat ?? 40, pos?.lon ?? 0, ui.now()) : choice;
    themeBtn.textContent = themeIcon(shown);
    themeBtn.title = `Tema ${THEME_LABEL[choice]}`;
    themeBtn.setAttribute("aria-label", `Tema ${THEME_LABEL[choice]}. Tocar para cambiar.`);
    themeBtn.addEventListener("click", () => cycleTheme(ui));

    // E8.3: interruptor "Tiempo" (icono viento): apagado · Pilot chart · Pronóstico.
    const wxMode = ui.weather();
    const wxBtn = el("button", { class: "hn-ctx-wx", type: "button" });
    wxBtn.textContent = "≈";
    if (wxMode !== "off") wxBtn.classList.add("on");
    wxBtn.title = `Tiempo: ${WEATHER_LABEL[wxMode]}. Tocar para cambiar.`;
    wxBtn.setAttribute("aria-label", `Tiempo: ${WEATHER_LABEL[wxMode]}. Tocar para cambiar.`);
    wxBtn.addEventListener("click", () => cycleWeather(ui));

    // UX-N.3: chip Planificar / Navegar (D3). Tocar fuerza el otro modo.
    const mode = ui.mode();
    const modeBtn = el("button", { class: `hn-ctx-mode${mode === "navegar" ? " on" : ""}`, type: "button" }, mode === "navegar" ? "Navegar" : "Planificar");
    modeBtn.title = `Modo ${mode === "navegar" ? "Navegar" : "Planificar"}. Tocar para cambiar.`;
    modeBtn.setAttribute("aria-label", `Modo ${mode === "navegar" ? "Navegar" : "Planificar"}. Tocar para cambiar.`);
    modeBtn.addEventListener("click", () => {
      ui.modeEnteredAt = Date.now();
      ui.mode.set(ui.mode() === "navegar" ? "planificar" : "navegar");
    });

    const ajustesBtn = el("button", { class: "hn-ctx-ajustes", type: "button" }, "⚙");
    ajustesBtn.title = "Ajustes";
    ajustesBtn.setAttribute("aria-label", "Ajustes");
    if (ui.tab() === "ajustes") ajustesBtn.classList.add("on");
    ajustesBtn.addEventListener("click", () => openAjustes(ui));

    bar.append(where, when, wxBtn, themeBtn, modeBtn, ajustesBtn, chip);
  });
}

function cycleTheme(ui: UiState): void {
  const i = THEME_ORDER.indexOf(ui.theme());
  ui.theme.set(THEME_ORDER[(i + 1) % THEME_ORDER.length] ?? "auto");
}

// E8.3: ciclo del interruptor "Tiempo" (Apagado → Pilot chart → Pronóstico).
function cycleWeather(ui: UiState): void {
  const i = WEATHER_ORDER.indexOf(ui.weather());
  ui.weather.set(WEATHER_ORDER[(i + 1) % WEATHER_ORDER.length] ?? "off");
}

// Carga y cachea el mes de climatología. Si ya está pedido, reusa la promesa en
// curso; si falla (sin red y sin caché del SW), devuelve null sin romper la UI.
function ensureClim(ui: UiState, month: number): Promise<ClimMonth | null> {
  const cached = ui.clim.get(month);
  if (cached) return Promise.resolve(cached);
  const inFlight = ui.climInFlight.get(month);
  if (inFlight) return inFlight;
  const p = loadMonth(month)
    .then((clim) => {
      ui.clim.set(month, clim);
      ui.climInFlight.delete(month);
      if (ui.weather() === "pilot" && ui.month() === month) updateWeather(ui.map, clim, month);
      else if (ui.weather() === "forecast" && ui.month() === month) paintForecast(ui);
      return clim;
    })
    .catch(() => {
      ui.climInFlight.delete(month);
      return null;
    });
  ui.climInFlight.set(month, p);
  return p;
}

// E13.2: pinta el pronóstico para la hora actual del deslizador. Si la hora
// cae más allá del horizonte del paquete, `updateForecastWeather` usa la
// climatología del mes; si todavía no está cargada, la pide y repinta.
function paintForecast(ui: UiState): void {
  const pkg = ui.forecast();
  if (ui.weather() !== "forecast" || !pkg) return;
  const time = slotTime(pkg, ui.forecastHour());
  const month = ui.month();
  const clim = ui.clim.get(month) ?? null;
  const beyond = updateForecastWeather(ui.map, clim, pkg, time);
  if (beyond && !clim) {
    void ensureClim(ui, month).then(() => {
      const c = ui.clim.get(month) ?? null;
      if (c) updateForecastWeather(ui.map, c, pkg, time);
    });
  }
}

// E13.3: mini-panel de capas del "Tiempo" (un interruptor por capa). Se
// persiste en `hn.settings.wxLayers`.
function renderWxLayers(host: HTMLElement, ui: UiState, mode: WeatherMode, layers: WxLayers): void {
  clear(host);
  if (mode === "off") {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const grid = el("div", { class: "hn-wx-layers" });
  for (const { key, label } of WX_LAYERS) {
    const id = `hn-wxlay-${key}`;
    const input = el("input", { id, type: "checkbox" }) as HTMLInputElement;
    input.checked = layers[key];
    input.addEventListener("change", () => setWxLayer(ui, key, input.checked));
    grid.append(el("label", { class: "hn-wx-layer", for: id }, input, el("span", {}, label)));
  }
  host.append(el("div", { class: "hn-wx-title" }, "Capas"), grid);
}

function setWxLayer(ui: UiState, key: WxLayerKey, on: boolean): void {
  const next: WxLayers = { ...ui.wxLayers(), [key]: on };
  ui.wxLayers.set(next);
  ui.settings.wxLayers = next;
  saveSettings(ui);
}

// Rampa de colores con sus marcas (nudos o metros) para la leyenda.
function wxRamp(stops: number[], colors: string[], label?: (v: number) => string): HTMLElement {
  const ramp = el("div", { class: "hn-wx-ramp" });
  for (let i = 0; i < stops.length; i++) {
    const cell = el("div", { class: "hn-wx-cell" });
    const sw = el("div", { class: "hn-wx-sw" });
    sw.style.background = colors[i] ?? "#888";
    cell.append(sw, el("div", { class: "hn-wx-kn" }, label ? label(stops[i]!) : String(stops[i])));
    ramp.append(cell);
  }
  return ramp;
}

// Leyenda (ADR-009 §6, E13.3): solo las capas encendidas; el pronóstico suma la
// escala de hPa y el pilot chart la rampa de nudos con "flechas tenues".
function renderWeatherLegend(
  host: HTMLElement,
  ui: UiState,
  mode: WeatherMode,
  month: number,
  pkg: ForecastPackage | null,
  hour: number,
  layers: WxLayers,
): void {
  clear(host);
  if (mode === "off") {
    host.hidden = true;
    return;
  }
  host.hidden = false;

  if (mode === "forecast") {
    // UX-N.2 (D2): la vista es una caja de primera clase. Cuando ningún paquete
    // cubre el centro del mapa, se ofrece bajar la caja de la vista acá mismo.
    const center = ui.map.getCenter();
    if (!pkg || !bboxCovers(pkg.bbox, center.lat, center.lng)) {
      host.append(el("div", { class: "hn-wx-title" }, "Pronóstico"));
      const note = el("div", { class: "hn-wx-note" }, "La vista no está cubierta por ningún paquete.");
      const status = el("div", { class: "hn-wx-note" });
      const btn = el("button", { class: "hn-btn hn-wx-dl", type: "button" }, "Descargar pronóstico de la vista");
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = "Bajando…";
        status.textContent = "0 %";
        const box = bboxOfBounds(ui.map.getBounds());
        void downloadForecast(ui.store, forecastIdView(), box, (r) => {
          status.textContent = `${Math.round(r * 100)} %`;
        })
          .then((p) => {
            ui.forecast.set(p);
            ui.forecastHour.set(nearestSlot(p, Date.now()));
          })
          .catch(() => {
            btn.disabled = false;
            btn.textContent = "Reintentar";
            status.textContent = "error · sin conexión";
          });
      });
      host.append(note, btn, status);
      return;
    }
    const time = slotTime(pkg, hour);
    const beyond = empalmeConClimatología(pkg, time);
    const owner = forecastOwnerName(pkg.id, bboxCenter(pkg.bbox));
    host.append(el("div", { class: "hn-wx-title" }, `Pronóstico de ${owner} · ${ageText(pkg.fetchedAt)}`));
    host.append(el("div", { class: "hn-wx-note" }, hourLabel(time)));
    if (layers.isobars) {
      host.append(el("div", { class: "hn-wx-note" }, `isobaras cada ${WX_ISOBAR_INTERVAL} hPa · etiqueta en hPa`));
    }
    if (layers.waves) {
      host.append(el("div", { class: "hn-wx-note" }, "altura de ola (m)"), wxRamp(WX_WAVE_STOPS, WX_WAVE_COLORS));
    }
    if (!layers.isobars && !layers.waves) host.append(el("div", { class: "hn-wx-note" }, "Sin capas encendidas."));
    host.append(
      el(
        "div",
        { class: "hn-wx-note" },
        beyond ? "clima medio · más allá del horizonte de 7 días" : "flechas = dirección de la ola",
      ),
      el("div", { class: "hn-wx-src" }, "Open-Meteo · CC BY 4.0"),
    );
    return;
  }

  host.append(el("div", { class: "hn-wx-title" }, `Pilot chart · ${MONTH_NAME[month - 1] ?? ""}`));
  if (layers.wind) {
    const windU = ui.unidades().speed;
    host.append(
      wxRamp(WX_WIND_STOPS, WX_WIND_COLORS, (v) => (windU === "kmh" ? String(Math.round(v * 1.852)) : String(v))),
      el("div", { class: "hn-wx-note" }, `${windU === "kmh" ? "km/h" : "nudos"} · flechas tenues = viento variable`),
    );
  }
  if (layers.current) host.append(el("div", { class: "hn-wx-note" }, "corrientes: líneas azules finas y discontinuas"));
  if (layers.cyclone) host.append(el("div", { class: "hn-wx-note" }, "rayado = ciclones"));
  if (layers.ice) host.append(el("div", { class: "hn-wx-note" }, "hielo"));
  if (!layers.wind && !layers.current && !layers.cyclone && !layers.ice) {
    host.append(el("div", { class: "hn-wx-note" }, "Sin capas encendidas."));
  }
  host.append(el("div", { class: "hn-wx-src" }, "ERA5 · OSCAR · IBTrACS (1991–2020)"));
}

function goTo(ui: UiState, tab: TabName): void {
  endOwn();
  endOwnEdit();
  ui.selected.set(null);
  ui.tab.set(tab);
  if (ui.sheet() === "peek") ui.sheet.set("half");
}

// UX-N.4b: la entrada fija ⚙ abre Ajustes en toda su altura en móvil.
function openAjustes(ui: UiState): void {
  goTo(ui, "ajustes");
  ui.sheet.set("full");
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
    ui.unidades();
    ownRoutes();
    ownEdit();
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
      // Ajustes y Datos no dependen del catálogo: siempre disponibles.
      if (tab === "ajustes") renderAjustes(ui, body, bodyCleanup);
      else if (tab === "datos") renderDatos(ui, body, bodyCleanup);
      else if (catalog === "loading") renderCatalogLoading(body);
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
          if (e) list.append(routeRow(ui, e, n.distanceNm, n.nearestWp, true));
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
      // Las métricas de la ruta en curso leen unidades: repintar al cambiarlas.
      ui.unidades();
      activeSlot.replaceChildren();
      if (active) renderActive(ui, activeSlot, active);
    }),
  );

  body.append(anchorCard(ui, cleanup));
}

// Ajustes de tema (T11.5): los mismos tres temas que el botón de la barra, más
// Auto, y el interruptor para usar Rojo cuando ya es de noche.
function themeCard(ui: UiState, cleanup: (() => void)[]): HTMLElement {
  const card = el("div", { class: "hn-card" });
  card.append(el("div", { class: "hn-card-title" }, "Tema"));

  const chips = el("div", { class: "hn-chips" });
  card.append(chips, el("p", { class: "hn-muted" }, "Auto sigue el día y la noche según tu posición."));

  const row = el("div", { class: "hn-toggle-row" });
  const label = el("span", {}, "De noche usar Rojo");
  const toggle = el("button", { class: "hn-toggle", type: "button", role: "switch" });
  toggle.addEventListener("click", () => ui.redAtNight.set(!ui.redAtNight()));
  row.append(label, toggle);
  card.append(row);

  cleanup.push(
    effect(() => {
      const cur = ui.theme();
      const red = ui.redAtNight();
      clear(chips);
      for (const choice of THEME_ORDER) {
        const on = choice === cur;
        const icon = choice === "auto" ? "◐" : themeIcon(choice);
        const chip = el("button", { class: `hn-chip${on ? " on" : ""}`, type: "button" }, `${icon} ${THEME_LABEL[choice]}`);
        chip.setAttribute("aria-pressed", on ? "true" : "false");
        chip.addEventListener("click", () => ui.theme.set(choice));
        chips.append(chip);
      }
      toggle.setAttribute("aria-checked", red ? "true" : "false");
      toggle.setAttribute("aria-label", "De noche usar Rojo");
      toggle.disabled = cur !== "auto";
    }),
  );
  return card;
}

// Ayuda de primer uso (UX-1): tarjeta, no modal, máx. cuatro renglones.
function helpCard(ui: UiState): HTMLElement {
  const card = el("div", { class: "hn-card hn-help" });
  const lines: [string, string][] = [
    ["📍", "Tu posición: usá GPS o fijala tocando el mapa."],
    ["🗓", "El mes de planificación se elige en Cuándo, arriba."],
    ["🌦", "Tocá el mar para ver el clima y pedir acciones sobre ese punto."],
    ["👆", "Mantené pulsado el mar para abrir esas acciones."],
    ["⚙", "Unidades, visibilidad y alarmas en Ajustes."],
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

// UX-N.5 T11.3 — Medir: cada toque agrega un punto; muestra el tramo y el total
// (formateados con las unidades del usuario) y se dibuja en `measure-line`.
function drawMeasure(ui: UiState): void {
  const m = measure;
  if (!m || m.points.length === 0) {
    setSource(ui.map, "measure-line", featureCollection([]));
    return;
  }
  const features: object[] = m.points.map((p) => pointFeature(p.lon, p.lat));
  if (m.points.length >= 2) {
    features.push(lineFeature(m.points.map((p) => [p.lon, p.lat] as [number, number])));
  }
  setSource(ui.map, "measure-line", featureCollection(features));
}

function updateMeasure(): void {
  const m = measure;
  if (!m) return;
  const text = m.band.querySelector(".hn-measure-text");
  const sum = m.band.querySelector(".hn-measure-sum");
  const r = measureLegs(m.points);
  if (r.legs.length === 0) {
    if (text) text.textContent = "Tocá el mapa para agregar puntos.";
    if (sum) sum.textContent = "";
  } else {
    const last = r.legs[r.legs.length - 1]!;
    if (text) text.textContent = `Tramo ${dst(m.ui, last.distanceNm)} · rumbo ${Math.round(last.bearingDeg)}°`;
    if (sum) sum.textContent = `Total ${dst(m.ui, r.totalNm)}`;
  }
  drawMeasure(m.ui);
}

function startMeasure(ui: UiState, lat: number, lon: number): void {
  endMeasure();
  closePointSheet(ui);
  const band = el("div", { class: "hn-measure" });
  const text = el("div", { class: "hn-measure-text" }, "");
  const sum = el("div", { class: "hn-measure-sum" }, "");
  const limpiar = el("button", { class: "hn-btn hn-measure-clear", type: "button" }, "Limpiar");
  const terminar = el("button", {
    class: "hn-alarm-btn hn-measure-end",
    type: "button",
    "aria-label": "Terminar medición",
  }, "✕");
  const actions = el("div", { class: "hn-measure-actions" }, limpiar, terminar);
  band.append(text, sum, actions);
  band.addEventListener("click", (ev) => ev.stopPropagation());
  document.body.append(band);

  const onMap = (e: MapMouseEvent): void => {
    if (!measure) return;
    measure.points.push({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    updateMeasure();
  };
  measure = { ui, points: [{ lat, lon }], band, onMap };
  ui.map.on("click", onMap);
  ui.map.getCanvas().style.cursor = "crosshair";
  limpiar.addEventListener("click", () => {
    if (!measure) return;
    measure.points = [];
    updateMeasure();
  });
  terminar.addEventListener("click", () => endMeasure());
  updateMeasure();
}

function endMeasure(): void {
  const m = measure;
  if (!m) return;
  m.ui.map.off("click", m.onMap);
  m.ui.map.getCanvas().style.cursor = "";
  m.band.remove();
  measure = null;
  drawMeasure(m.ui);
}

// Ajustes de alarmas (E9.2): dos umbrales numéricos, persistidos en hn.settings.
function alarmsCard(ui: UiState, cleanup: (() => void)[]): HTMLElement {
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
  // UX-N.3: en Planificar las alarmas de navegación no suenan; se avisa acá
  // (no en el mapa) para no llenar la vista de bandas pasivas.
  const pause = el("p", { class: "hn-muted" }, "Alarmas en pausa — modo Planificar");
  cleanup.push(
    effect(() => {
      pause.hidden = ui.mode() !== "planificar";
    }),
  );
  card.append(pause);
  return card;
}

// Vigilancia de fondeo (E9.3): marca el punto donde se largó el ancla y avisa si
// el barco se aleja más que el radio. El estado se recuerda entre recargas.
function anchorCard(ui: UiState, cleanup: (() => void)[]): HTMLElement {
  const card = el("div", { class: "hn-card" });
  card.append(el("div", { class: "hn-card-title" }, "Fondeo"));

  const radius = el("input", { class: "hn-search", type: "number", min: "5", step: "5", inputmode: "numeric" });
  const radiusLabel = el("span", { class: "hn-field-label" }, "Radio (m)");
  radius.addEventListener("change", () => {
    const r = Number(radius.value);
    if (!Number.isFinite(r) || r <= 0) return;
    // El valor interno siempre es metros; en ft se convierte al guardar.
    const meters = ui.unidades().depth === "ft" ? r / FT_PER_M : r;
    ui.anchor.update((a) => ({ ...a, radiusM: meters }));
  });
  const field = el("label", { class: "hn-field" }, radiusLabel, radius);

  const info = el("div", { class: "hn-anchor-info hn-muted" });
  const actions = el("div", { class: "hn-actions" });
  card.append(field, info, actions);

  cleanup.push(
    effect(() => {
      const a = ui.anchor();
      const pos = ui.position();
      const ft = ui.unidades().depth === "ft";
      radiusLabel.textContent = ft ? "Radio (ft)" : "Radio (m)";
      radius.step = ft ? "10" : "5";
      if (document.activeElement !== radius) {
        radius.value = String(Math.round(ft ? a.radiusM * FT_PER_M : a.radiusM));
      }
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
        ? `Fondeado a ${dep(ui, anchorDistanceM(pos, a))} del punto · radio ${dep(ui, a.radiusM)}`
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
// UX-N.5b — "Datos sin conexión" es sección propia (no Ajustes): cada paquete va
// con su dueño (ruta, punto o vista). Filas de datos, no interruptores.
function renderDatos(ui: UiState, body: HTMLElement, cleanup: (() => void)[]): void {
  const head = el("div", { class: "hn-datos-head" });
  const back = el("button", { class: "hn-back", type: "button" }, "‹ Ajustes");
  back.addEventListener("click", () => goTo(ui, "ajustes"));
  head.append(el("h2", { class: "hn-h2" }, "Datos sin conexión"), back);
  body.append(head);
  body.append(el("p", { class: "hn-muted" }, "Lo que viaja atado a cada ruta, punto o vista."));

  const card = el("div", { class: "hn-card hn-datos-card" });
  card.append(offlineRow("Carta base · 0,2 MB", "siempre"));
  // Pilot charts (12 meses) · 1,8 MB · [Guardar]
  card.append(pilotChartsRow(ui));
  // UX-N.2 (D2): cada caja es de primera clase. Lista de TODAS las guardadas
  // (punto, vista, ruta) con su dueño, edad, [Actualizar] y [Borrar].
  card.append(forecastListHost(ui, cleanup).host);
  card.append(offlineRow("Carta mundial (zoom ≤ 6)", "45 MB · con red"));

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
  body.append(card);
}

function offlineRow(name: string, info: string): HTMLElement {
  const row = el("div", { class: "hn-offline-row" });
  row.append(el("span", { class: "hn-offline-name" }, name), el("span", { class: "hn-offline-info" }, info));
  return row;
}

// UX-N.2 (D2): lista de TODAS las cajas guardadas —punto, vista o ruta— con
// edad visible y borrar por fila. El índice vive en `platform/forecast.ts`.
function forecastListHost(
  ui: UiState,
  cleanup: (() => void)[],
): { host: HTMLElement; reload: () => void } {
  const host = el("div", { class: "hn-forecast-list" });
  const reload = (): void => {
    void listForecasts(ui.store)
      .catch(() => [] as ForecastEntry[])
      .then((entries) => {
        clear(host);
        host.append(el("div", { class: "hn-forecast-title" }, "Pronósticos guardados"));
        if (entries.length === 0) {
          host.append(el("p", { class: "hn-muted" }, "Todavía no hay paquetes de pronóstico."));
          return;
        }
        for (const entry of entries) host.append(forecastEntryRow(ui, entry, reload));
      });
  };
  reload();
  // La edad se refresca sola mientras el panel está abierto.
  const timer = setInterval(reload, 60_000);
  cleanup.push(() => clearInterval(timer));
  return { host, reload };
}

function forecastEntryRow(ui: UiState, entry: ForecastEntry, reload: () => void): HTMLElement {
  const row = el("div", { class: "hn-offline-row hn-forecast-entry" });
  const center = bboxCenter(entry.bbox);
  const owner = forecastOwnerName(entry.id, center);
  const kindLabel = entry.kind === "ruta" ? "ruta" : entry.kind === "punto" ? "punto" : "vista";
  const info = `${kindLabel} · ${fmtMb1(entry.bytes)} · ${ageText(entry.savedAt)}`;
  const action = el("span", { class: "hn-offline-action" });
  const upd = el("button", { class: "hn-btn hn-btn-mini", type: "button", "aria-label": `Actualizar ${owner}` }, "Actualizar");
  upd.addEventListener("click", () => {
    if (upd.disabled) return;
    upd.disabled = true;
    upd.textContent = "Bajando…";
    void downloadForecast(ui.store, entry.id, entry.bbox, (r) => {
      upd.textContent = `${Math.round(r * 100)} %`;
    })
      .then((pkg) => {
        // Si es la caja cargada en el mapa, se refresca con la nueva versión.
        if (ui.forecast()?.id === entry.id) ui.forecast.set(pkg);
        reload();
      })
      .catch(() => {
        upd.disabled = false;
        upd.textContent = "Reintentar";
      });
  });
  const del = el("button", { class: "hn-btn", type: "button", "aria-label": `Borrar ${owner}` }, "Borrar");
  del.addEventListener("click", () => {
    if (del.disabled) return;
    del.disabled = true;
    // Si era el paquete cargado en el mapa, se suelta: no quedan datos viejos.
    if (ui.forecast()?.id === entry.id) ui.forecast.set(null);
    void removeForecast(ui.store, entry.id).then(reload);
  });
  action.append(upd, del);
  row.append(el("span", { class: "hn-offline-name" }, `Pronóstico · ${owner}`), el("span", { class: "hn-offline-info" }, info), action);
  return row;
}

// Pilot charts (E8.4): guardar los 12 meses en Cache Storage vía SW.
function pilotChartsRow(_ui: UiState): HTMLElement {
  const row = el("div", { class: "hn-offline-row" });
  const info = el("span", { class: "hn-offline-info" }, "1,8 MB");
  const action = el("span", { class: "hn-offline-action" });
  const btn = el("button", { class: "hn-btn", type: "button" }, "Guardar");
  let saving = false;

  function setState(s: "idle" | "saving" | "done" | "error"): void {
    saving = s === "saving";
    if (s === "saving") {
      btn.disabled = true;
      btn.textContent = "Guardando…";
      info.textContent = "0 / 12";
    } else if (s === "done") {
      btn.disabled = true;
      btn.textContent = "Guardado";
      info.textContent = "✓ 1,8 MB";
    } else if (s === "error") {
      btn.disabled = false;
      btn.textContent = "Reintentar";
      info.textContent = "error";
    } else {
      btn.disabled = false;
      btn.textContent = "Guardar";
      info.textContent = "1,8 MB";
    }
  }

  const handleMsg = (ev: MessageEvent): void => {
    const m = ev.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "clim-start") {
      info.textContent = `0 / ${m.total}`;
    } else if (m.type === "clim-progress") {
      info.textContent = `${m.done} / ${m.total}`;
    } else if (m.type === "clim-done") {
      if (m.ok) setState("done");
      else setState("error");
      navigator.serviceWorker.removeEventListener("message", handleMsg);
      navigator.serviceWorker.controller?.postMessage("skip"); // no-op
    }
  };

  btn.addEventListener("click", () => {
    if (saving) return;
    if (!("serviceWorker" in navigator)) {
      setState("error");
      return;
    }
    setState("saving");
    navigator.serviceWorker.addEventListener("message", handleMsg);
    navigator.serviceWorker.controller?.postMessage({ type: "clim-save" });
  });

  action.append(btn);
  row.append(el("span", { class: "hn-offline-name" }, "Pilot charts (12 meses)"), info, action);
  return row;
}

// UX-N.5b — bloque de pronóstico de la ficha de una ruta. Regla de Diego: el
// pronóstico vive EN la ficha de su ruta. Muestra el estado de SU paquete
// ("hace 4 h") o "Sin pronóstico · [Descargar]", y lo baja/actualiza desde acá.
// E12.13: `onPkg` se avisa cada vez que el paquete de esta ruta cambia (al
// cargarlo de la caché o al terminar la descarga), porque la duración estimada
// de la ficha depende de él.
function routeForecastBlock(
  ui: UiState,
  code: string,
  host: HTMLElement,
  onPkg?: (pkg: ForecastPackage | null) => void,
): void {
  const row = el("div", { class: "hn-offline-row hn-fc-route-row" });
  const info = el("span", { class: "hn-offline-info" }, "…");
  const action = el("span", { class: "hn-offline-action" });
  const btn = el("button", { class: "hn-btn hn-btn-mini", type: "button" }, "Descargar");
  action.append(btn);
  row.append(el("span", { class: "hn-offline-name" }, "Pronóstico de esta ruta"), info, action);
  host.append(row);

  let busy = false;
  let pkg: ForecastPackage | null = null;
  const bboxOf = (): BBox | null => {
    const g = selectedGeometry(ui, code);
    if (g) return bboxOfTrack(g.coords);
    const own = ownRouteById(code);
    if (own && own.waypoints.length >= 2) {
      return bboxOfTrack(own.waypoints.map((w) => [w.lon, w.lat] as [number, number]));
    }
    return null;
  };
  const showIdle = (): void => {
    btn.disabled = false;
    btn.textContent = pkg ? "Actualizar" : "Descargar";
    info.textContent = pkg ? `${fmtMb1(forecastBytes(pkg))} · ${getForecastAge(pkg)}` : "sin pronóstico";
  };
  void loadForecast(ui.store, code).then((p) => {
    pkg = p;
    showIdle();
    onPkg?.(pkg);
  });

  btn.addEventListener("click", () => {
    if (busy) return;
    const box = bboxOf();
    if (!box) {
      info.textContent = "sin caja de ruta";
      return;
    }
    busy = true;
    btn.disabled = true;
    btn.textContent = "Bajando…";
    info.textContent = "0 %";
    void downloadForecast(ui.store, code, box, (r) => {
      info.textContent = `${Math.round(r * 100)} %`;
    })
      .then((p) => {
        busy = false;
        pkg = p;
        // Si esta ruta es la que está cargada en el mapa, se refresca con la nueva.
        if (ui.forecast()?.id === code) ui.forecast.set(p);
        showIdle();
        onPkg?.(pkg);
      })
      .catch(() => {
        busy = false;
        btn.disabled = false;
        btn.textContent = "Reintentar";
        info.textContent = "error · sin conexión";
      });
  });
}

function fmtMb1(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB`;
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
  const own = ownRouteById(active.code);
  const nav = activeNav(ui);
  body.append(el("h3", { class: "hn-h3" }, "Ruta en curso"));
  const card = el("div", { class: "hn-card" });
  const title = own ? own.name : e ? `${e.code} ${e.from} → ${e.to}` : active.code;
  card.append(el("div", { class: "hn-card-title" }, title));
  if (nav) {
    const grid = el("div", { class: "hn-nav-grid" });
    grid.append(
      navCell("Próximo", nav.fix.nextName || `${formatLat(nav.fix.nextLat)} ${formatLon(nav.fix.nextLon)}`),
      navCell("Rumbo", `${Math.round(nav.fix.bearingDeg)}°`),
      navCell("Distancia", dst(ui, nav.fix.distanceNm)),
      navCell("Desvío", xteLabel(ui, nav.fix.xteNm)),
      navCell("Tramo", `${nav.fix.legIndex + 1} de ${maxLeg(nav.track)}`),
      navCell("Velocidad", nav.kin.sogKn === null ? "—" : spd(ui, nav.kin.sogKn)),
      navCell("VMG", nav.kin.vmgKn === null ? "—" : spd(ui, nav.kin.vmgKn)),
      navCell("ETA próximo", nav.kin.etaNextMs === null ? "—" : clock(nav.kin.etaNextMs)),
      navCell("ETA destino", nav.kin.etaDestMs === null ? "—" : clock(nav.kin.etaDestMs)),
    );
    card.append(grid);
  } else {
    card.append(el("p", { class: "hn-muted" }, "Poné tu posición para ver rumbo, distancia y ETA."));
  }
  const actions = el("div", { class: "hn-actions" });
  const ver = el("button", { class: "hn-btn" }, "Ver ficha");
  ver.addEventListener("click", () => (own ? openOwn(ui, own) : openRoute(ui, active.code)));
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
        return `${dst(ui, f.distanceNm)} · ${mmss(f.elapsedS)} desde la caída`;
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
    // PS-1 #0: con el reloj simulado las fijas van "en el futuro" y sustainedSog
    // daría verdadero al toque, colapsando la hoja y tapando los controles del
    // simulador. Mientras el simulador corre, no hay auto-peek.
    if (!autoPeekDone && !sim.ui && (state === "half" || state === "full") && sustainedSog(ui.navFixes, Date.now())) {
      autoPeekDone = true;
      ui.sheet.set("peek");
    }
    host.hidden = false;
    const { fix, kin, track } = nav;
    const next = fix.nextName || `${formatLat(fix.nextLat)} ${formatLon(fix.nextLon)}`;
    const dest = track.names[track.names.length - 1] || "destino";
    const eta = kin.etaNextMs === null ? "—" : clock(kin.etaNextMs);
    const sog = kin.sogKn === null ? "—" : spd(ui, kin.sogKn);
    const dev = fix.xteNm === 0 ? "en rumbo" : xteLabel(ui, fix.xteNm);
    const row1 = el("div", { class: "hn-navstrip-row1" });
    row1.append(
      el("span", { class: "hn-navstrip-next" }, next),
      el("span", { class: "hn-navstrip-bearing" }, `${Math.round(fix.bearingDeg)}°`),
    );
    const row2 = el(
      "div",
      { class: "hn-navstrip-row2" },
      `${dst(ui, fix.distanceNm, false)} · ETA ${eta} · SOG ${sog} · desvío ${dev}`,
    );
    const row3 = el(
      "div",
      { class: "hn-navstrip-row3" },
      `tramo ${fix.legIndex + 1} de ${maxLeg(track)} · ${dest} a ${dst(ui, remainingToDest(track.coords, fix), false)}`,
    );
    host.replaceChildren(row1, row2, row3);
  });
}

// Banda de alarma (E9.2/E9.3): fija arriba de la hoja. Cubre MOB (prioridad),
// fondeo garreado y las alarmas de ruta (llegada/desvío). Al aparecer una alarma
// nueva (no silenciada) suena y repite mientras siga activa; Silenciar la deja en
// gris, sin sonido, hasta que cambie de tipo. UX-N.3 (D3): fondeo, llegada y
// desvío solo evalúan en modo Navegar; MOB siempre.
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
    const mode = ui.mode();
    const nav = active ? activeNav(ui) : null;

    let kind: AlarmKind | null = null;
    let message = "";
    let beeps = 3;
    let intervalMs = 10_000;

    if (mob) {
      kind = "mob";
      const f = mobFix(pos ?? { lat: mob.lat, lon: mob.lon }, mob);
      message = `✖ Hombre al agua · ${dst(ui, f.distanceNm)} · ${mmss(f.elapsedS)} desde la caída`;
      beeps = 2;
      intervalMs = 5_000;
    } else if (mode === "navegar" && anchor.active && pos && anchorAlarm(pos, anchor)) {
      kind = "anchor";
      message = `⚓ Garreando: ${dep(ui, anchorDistanceM(pos, anchor))} del fondeo`;
    } else if (nav) {
      const next = navAlarmGate(mode, nav.fix, ui.settings.alarms, { active: null, silencedFor: null });
      if (next.active === "arrival") {
        kind = "arrival";
        message = `⚑ Llegando a ${nav.fix.nextName || "el waypoint"}`;
      } else if (next.active === "xte") {
        kind = "xte";
        message = `⚠ Desvío de ${dst(ui, Math.abs(nav.fix.xteNm))}`;
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

function activeNav(
  ui: UiState,
): { fix: NavFix; kin: Kinematics; track: RouteTrack; remainingNm: number } | null {
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
  const remainingNm = remainingToDest(g.coords, fix);
  return { fix, kin: kinematics(ui.navFixes, fix, remainingNm, Date.now()), track, remainingNm };
}


// UX-N.4b: formato con unidades elegidas (Ajustes › Unidades). Los valores
// internos siempre son kn / nm / m; estas envolturas leen el signal `unidades`.
function spd(ui: UiState, kn: number, decimal = true): string {
  return formatSpeed(kn, ui.unidades(), decimal);
}

function dst(ui: UiState, nm: number, decimal = true): string {
  return formatDistance(nm, ui.unidades(), decimal);
}

function dep(ui: UiState, m: number): string {
  return formatDepth(m, ui.unidades());
}

function rangeDist(ui: UiState, min: number, max: number): string {
  const u = ui.unidades();
  if (min === max || max === 0) return formatDistance(min, u, false);
  const a = formatDistance(min, u, false).replace(` ${u.distance}`, "");
  return `${a}–${formatDistance(max, u, false)}`;
}

function xteLabel(ui: UiState, xteNm: number): string {
  const d = dst(ui, Math.abs(xteNm));
  if (xteNm > 0) return `${d} a estribor`;
  if (xteNm < 0) return `${d} a babor`;
  return `${dst(ui, 0)}`;
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

function routeRow(
  ui: UiState,
  e: IndexEntry,
  distanceNm?: number,
  nearestWp?: string,
  showScoreLabel = false,
): HTMLElement {
  const row = el("button", { class: "hn-row" });
  const main = el("div", { class: "hn-row-main" });
  main.append(el("div", { class: "hn-row-title" }, `${e.code} · ${e.title}`));
  const sub =
    distanceNm !== undefined
      ? `${dst(ui, distanceNm)}${nearestWp ? ` · ${nearestWp}` : ""}`
      : `${e.from} → ${e.to} · ${rangeDist(ui, e.nmMin, e.nmMax)} · ${e.variantCount} variante${e.variantCount === 1 ? "" : "s"}`;
  main.append(el("div", { class: "hn-row-sub" }, sub));
  if (ui.region() === "" && e.region) main.append(el("div", { class: "hn-row-region" }, e.region));
  // PS-1: con el orden por mes de salida (o en "Rutas que te pasan cerca") la
  // insignia simple se reemplaza por la etiqueta del score del mes.
  row.append(main, showScoreLabel ? scoreTag(e, ui.month()) : monthBadge(e, ui.month()));
  row.addEventListener("click", () => openRoute(ui, e.code));
  return row;
}

// PS-1 #4: etiqueta del score del mes de planificación, al lado de la ruta.
function scoreTag(e: IndexEntry, month: number): HTMLElement {
  const s = monthScore(e, month);
  return el(
    "span",
    { class: `hn-score-tag hn-score-tag-${s.score}`, title: `${MONTH_NAME[month - 1] ?? ""}: ${s.label}` },
    s.label,
  );
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
    // PS-1 #3: "Salgo en {mes}": ordena por el score del mes de planificación y
    // abre el selector de mes al activarse.
    add(`Salgo en ${MONTH_NAME[ui.month() - 1] ?? ""}`, ui.departSort(), () => {
      if (ui.departSort()) {
        ui.departSort.set(false);
        return;
      }
      ui.departSort.set(true);
      list.scrollTop = 0;
      openMonthPicker(ui);
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
    const month = ui.month();
    const byScore = ui.departSort();
    if (ui.nearMe() && pos) {
      const scored = filterEntries(ui.index, { query: ui.query(), region: ui.region() })
        .map((e) => ({ e, d: bboxDistanceNm(e, pos.lat, pos.lon) }))
        .filter((x) => x.d <= 600)
        .sort((a, b) => a.d - b.d);
      setCount(scored.length);
      if (scored.length === 0) list.append(el("p", { class: "hn-muted" }, "Sin rutas a menos de 600 nm."));
      for (const { e, d } of scored.slice(0, 80)) list.append(routeRow(ui, e, d, undefined, byScore));
    } else {
      const items = filterEntries(ui.index, { query: ui.query(), region: ui.region() });
      // PS-1 #3: el orden por score combina con búsqueda y cuenca (y con "cerca
      // de mí", donde manda la distancia). El sort es estable: empate = orden del índice.
      const ordered = byScore
        ? items.slice().sort((a, b) => monthScore(b, month).score - monthScore(a, month).score)
        : items;
      setCount(ordered.length);
      if (ordered.length === 0) {
        list.append(el("p", { class: "hn-muted" }, "Sin resultados."));
      } else {
        for (const e of ordered.slice(0, 120)) list.append(routeRow(ui, e, undefined, undefined, byScore));
      }
    }
    const imported = ui.imported();
    renderMisRutas(list, ownCtx(ui));
    if (imported.length > 0) {
      list.append(el("h3", { class: "hn-h3" }, "Importadas"));
      for (const r of imported) {
        const wrap = el("div", { class: "hn-own-row" });
        const row = el("button", { class: "hn-row", type: "button" });
        row.append(el("div", { class: "hn-row-main" }, el("div", { class: "hn-row-title" }, r.name), el("div", { class: "hn-row-sub" }, `${r.points.length} puntos`)));
        row.addEventListener("click", () => showImported(ui, r));
        // E11.5: copiar una importada a "Mis rutas" para poder editarla.
        const copiar = el("button", { class: "hn-row-act", type: "button", title: `Copiar ${r.name}` }, "Copiar");
        copiar.addEventListener("click", (ev) => {
          ev.stopPropagation();
          copyToOwn(
            ownCtx(ui),
            r.name,
            r.points.map((p) => [p.lon, p.lat] as [number, number]),
            r.points.map((_p, i) => `WP${i + 1}`),
          );
        });
        wrap.append(row, copiar);
        list.append(wrap);
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

  // Chips y lista se redibujan al cambiar cuenca, "cerca de mí", el mes de
  // planificación, el orden por mes o las importadas.
  // La búsqueda se refresca en el handler de input; se conserva el scroll.
  cleanup.push(
    effect(() => {
      ui.imported();
      ownRoutes();
      ui.region();
      ui.month();
      ui.departSort();
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

// PS-1 #3: selector del mes de planificación (12 chips + "Hoy"). Mismo patrón de
// menú flotante y cierre por clic afuera que el chip de posición.
function openMonthPicker(ui: UiState, onChange?: () => void): void {
  const menu = el("div", { class: "hn-menu hn-month-menu" });
  const pick = (month: number): void => {
    ui.month.set(month);
    menu.remove();
    onChange?.();
  };
  for (let m = 1; m <= 12; m++) {
    const chip = el(
      "button",
      { class: `hn-chip${ui.month() === m ? " on" : ""}`, type: "button", title: MONTH_NAME[m - 1] ?? "" },
      MONTH_ABBR[m - 1] ?? "",
    );
    chip.addEventListener("click", () => pick(m));
    menu.append(chip);
  }
  const hoy = el("button", { class: "hn-btn hn-month-hoy", type: "button" }, "Hoy");
  hoy.addEventListener("click", () => pick(currentMonthUtc()));
  menu.append(hoy);
  document.body.appendChild(menu);
  const rm = (ev: Event): void => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove();
      document.removeEventListener("click", rm);
    }
  };
  setTimeout(() => document.addEventListener("click", rm), 0);
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
  endOwn();
  endOwnEdit();
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
  endOwn();
  endOwnEdit();
  ui.selected.set(null);
  ui.sheet.set("half");
  clearWpMarker(ui);
  drawSelected(ui, null, null);
  // E12.13: la caché de duración vive mientras la ficha esté abierta.
  durCache.clear();
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
    if (fixOnMapArmed || ownArmActive() || pointDestArmed) return;
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
      if (measure) {
        endMeasure();
        ev.preventDefault();
        return;
      }
      if (pointSheetEl) {
        closePointSheet(ui);
        ev.preventDefault();
        return;
      }
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

// ----------------------------------------- optimización con el viento (E12.5)

interface OptJob {
  code: string;
  kind: "book" | "own";
  coords: LonLat[];
  names: string[];
  status: "running" | "done" | "cancelled" | "error";
  ratio: number;
  workerId: number;
  result: IsoMultiResult | null;
  baseline: IsoBaseline | null;
  // E12.13b: la hora de salida del cálculo. `result.etaMs` es una FECHA de
  // llegada; la duración es `etaMs - startMs`.
  startMs: number;
  climateOnly: boolean;
  // E12.6: opcionales que el trazado optimizado ya no toca (solo rutas propias).
  dropped: number;
  error?: string;
}

const optJobs = new Map<string, OptJob>();
const optJobCode = new Map<number, string>();
let optWorker: Worker | null = null;
let optJobSeq = 0;
let optLandBytes: Uint8Array | null = null;
let optPanelEl: HTMLElement | null = null;
let optPanelMeta: { code: string; kind: "book" | "own"; coords: LonLat[]; names: string[] } | null = null;

async function optLandBytesLoad(): Promise<Uint8Array> {
  if (optLandBytes) return optLandBytes;
  const res = await fetch(new URL("basemap/land.bits", document.baseURI));
  if (!res.ok) throw new Error(`land.bits: ${res.status}`);
  optLandBytes = new Uint8Array(await res.arrayBuffer());
  return optLandBytes;
}

function optWorkerGet(ui: UiState): Worker {
  if (!optWorker) {
    optWorker = new Worker(new URL("isochrones.worker.js", document.baseURI), { type: "module" });
    optWorker.onmessage = (ev: MessageEvent) => optHandle(ui, ev.data as IsoWorkerResponse);
  }
  return optWorker;
}

function optHandle(ui: UiState, msg: IsoWorkerResponse): void {
  const code = optJobCode.get(msg.id);
  if (!code) return;
  const job = optJobs.get(code);
  if (!job) return;
  if (msg.type === "progress") {
    job.status = "running";
    job.ratio = msg.progress.ratio;
  } else if (msg.type === "done") {
    job.status = "done";
    job.ratio = 1;
    job.result = msg.result;
    job.baseline = msg.baseline;
    optJobCode.delete(msg.id);
  } else if (msg.type === "cancelled") {
    job.status = "cancelled";
    optJobCode.delete(msg.id);
  } else {
    job.status = "error";
    job.error = msg.message;
    optJobCode.delete(msg.id);
  }
  optRefreshPanel(ui);
  optDraw(ui, code);
  // UX-N.1: la hoja de "Optimizar desde acá" se repinta con el mismo job.
  pointOptOnUpdate?.();
}

// E12.6 — extremos de los tramos a optimizar: en una ruta propia son sus
// waypoints obligatorios; en una del libro, el primer y el último punto.
function bookAnchors(coords: LonLat[]): LonLat[] {
  return coords.length >= 2 ? [coords[0]!, coords[coords.length - 1]!] : coords;
}

// Waypoints obligatorios de una ruta propia (en orden), en [lon, lat].
function optOwnAnchors(code: string): LonLat[] {
  const route = ownRouteById(code);
  if (!route) return [];
  return route.waypoints.filter((w) => w.mandatory).map((w) => [w.lon, w.lat] as LonLat);
}

async function optStart(
  ui: UiState,
  code: string,
  kind: "book" | "own",
  coords: LonLat[],
  names: string[],
): Promise<void> {
  const anchors = kind === "own" ? optOwnAnchors(code) : bookAnchors(coords);
  if (anchors.length < 2) return;
  const dropped = kind === "own" ? Math.max(0, coords.length - anchors.length) : 0;
  const pkg = ui.forecast();
  const month = ui.month();
  let clim = ui.clim.get(month) ?? null;
  if (!clim) clim = await ensureClim(ui, month);
  if (!clim && !pkg) {
    optJobs.set(code, {
      code, kind, coords, names, status: "error", ratio: 0, workerId: 0, result: null, baseline: null,
      startMs: Date.now(), climateOnly: true, dropped, error: "no hay datos de viento",
    });
    optRefreshPanel(ui);
    return;
  }
  let bytes: Uint8Array;
  try {
    bytes = await optLandBytesLoad();
  } catch (err) {
    optJobs.set(code, {
      code, kind, coords, names, status: "error", ratio: 0, workerId: 0, result: null, baseline: null,
      startMs: Date.now(), climateOnly: !pkg, dropped, error: err instanceof Error ? err.message : String(err),
    });
    optRefreshPanel(ui);
    return;
  }
  const id = ++optJobSeq;
  const job: OptJob = {
    code, kind, coords, names, status: "running", ratio: 0, workerId: 0, result: null, baseline: null,
    startMs: Date.now(), climateOnly: !pkg, dropped,
  };
  optJobs.set(code, job);
  optJobCode.set(id, code);
  job.workerId = id;
  const mode = ui.settings.routingMode ?? DEFAULT_ROUTING_MODE;
  optWorkerGet(ui).postMessage({
    type: "run",
    id,
    startMs: Date.now(),
    anchors,
    original: coords,
    pkg,
    clim,
    polar: genericPolar(),
    landBytes: bytes,
    climateOnly: !pkg,
    config: routingModeConfig(mode),
  });
  optRefreshPanel(ui);
}

function optDraw(ui: UiState, code: string): void {
  if (!optPanelMeta || optPanelMeta.code !== code) return;
  const job = optJobs.get(code);
  if (!job?.result) {
    setSource(ui.map, "wx-isochrones", featureCollection([]));
    setSource(ui.map, "optroute", featureCollection([]));
    return;
  }
  const isos = job.result.isochrones.map((l) => lineFeature(l.coords as [number, number][]));
  setSource(ui.map, "wx-isochrones", featureCollection(isos));
  // E12.12: azul hasta donde llega el pronóstico, rojo punteado desde ahí.
  const pkg = job.climateOnly ? null : ui.forecast();
  const parts = multiRouteSplit(job.result, pkg ? forecastHorizon(pkg) : null).map((part) =>
    lineFeature(part.coords as [number, number][], { clima: part.clima }),
  );
  setSource(ui.map, "optroute", featureCollection(parts));
}

function optClearLayers(ui: UiState): void {
  setSource(ui.map, "wx-isochrones", featureCollection([]));
  setSource(ui.map, "optroute", featureCollection([]));
}

function optApply(ui: UiState, code: string): void {
  const job = optJobs.get(code);
  const route = ownRouteById(code);
  if (!job?.result || !job.result.reached || !route) return;
  // E12.6/E12.11: conserva los obligatorios y agrega los puntos optimizados de
  // cada tramo; los opcionales que el trazado ya no toca se descartan. Las
  // maniobras se bautizan "Virada n" (ceñida) o "Trasluchada n" (empopada).
  const segments = job.result.segments.map((s) =>
    s.points.map((p) => ({ lat: p.lat, lon: p.lon, tack: p.tack, maneuver: p.maneuver })),
  );
  const before = route.waypoints.map((w) => ({ ...w }));
  applyOptimizationToOwn(ownCtx(ui), route, segments);
  const dropped = job.dropped;
  const msg =
    dropped > 0
      ? `Optimización aplicada · se descartan ${dropped} waypoint${dropped === 1 ? "" : "s"} opcional${dropped === 1 ? "" : "es"}`
      : "Optimización aplicada";
  showUndoBand(msg, () => {
    const cur = ownRouteById(code);
    if (cur) replaceOwnRoute(ownCtx(ui), cur, before);
  });
  optDiscard(ui, code);
}

function optDiscard(ui: UiState, code: string): void {
  optJobs.delete(code);
  optClearLayers(ui);
  optRefreshPanel(ui);
}

function optCompareText(ui: UiState, job: OptJob): string {
  const r = job.result!;
  const base = job.baseline!;
  const dEta = (job.baseline!.etaMs - r.etaMs) / 3600_000;
  const dNm = r.nm - base.nm;
  const parts = [
    `${dEta >= 0 ? "−" : "+"}${Math.abs(dEta).toFixed(1).replace(".", ",")} h`,
    `${dNm >= 0 ? "+" : "−"}${dst(ui, Math.abs(dNm))}`,
  ];
  if (job.baseline!.windMax > 0 || r.windMax !== null) {
    parts.push(`viento máx ${job.baseline!.windMax > 0 ? spd(ui, job.baseline!.windMax, false) : "—"} → ${r.windMax !== null ? spd(ui, r.windMax, false) : "—"}`);
  }
  return parts.join(" · ");
}

function optRender(
  ui: UiState,
  panel: HTMLElement,
  code: string,
  kind: "book" | "own",
  coords: LonLat[],
  names: string[],
): void {
  clear(panel);
  panel.dataset.code = code;
  const job = optJobs.get(code);
  const hasPkg = !!ui.forecast();
  const anchors = kind === "own" ? optOwnAnchors(code) : bookAnchors(coords);
  const canRun = anchors.length >= 2;
  const mode = ui.settings.routingMode ?? DEFAULT_ROUTING_MODE;

  // E12.6 — chips de modo (Confort / Crucero / Regata), persistidos.
  const modes = el("div", { class: "hn-chips hn-opt-modes" });
  for (const m of ROUTING_MODES) {
    const chip = el(
      "button",
      { class: `hn-chip${m.id === mode ? " on" : ""}`, type: "button", title: m.hint },
      m.label,
    );
    chip.addEventListener("click", () => {
      ui.settings.routingMode = m.id;
      saveSettings(ui);
      optRefreshPanel(ui);
    });
    modes.append(chip);
  }
  panel.append(modes);

  // UX-N.5b: con qué viento se calcula — el mismo paquete que se ve en la ficha.
  const pkg = ui.forecast();
  panel.append(
    el(
      "p",
      { class: "hn-muted hn-opt-src" },
      pkg ? `Pronóstico de ${forecastOwnerName(pkg.id, bboxCenter(pkg.bbox))} · ${getForecastAge(pkg)}` : "Ruta del mes (sin pronóstico)",
    ),
  );

  const head = el("div", { class: "hn-opt-head" });
  if (job?.status === "running") {
    head.append(
      el("span", { class: "hn-opt-status" }, `Calculando… ${Math.round(job.ratio * 100)}%`),
      (() => {
        const cancel = el("button", { class: "hn-btn hn-btn-mini", type: "button" }, "Cancelar");
        cancel.addEventListener("click", () => optWorker?.postMessage({ type: "cancel", id: job.workerId }));
        return cancel;
      })(),
    );
  } else {
    const run = el("button", { class: "hn-btn hn-btn-mini", type: "button" }, hasPkg ? "Optimizar con el viento" : "Ruta del mes");
    run.disabled = !canRun;
    run.addEventListener("click", () => void optStart(ui, code, kind, coords, names));
    head.append(el("span", { class: "hn-opt-status" }, "Optimización"), run);
  }
  panel.append(head);

  if (!canRun) {
    panel.append(
      el(
        "p",
        { class: "hn-muted" },
        kind === "own"
          ? "Marcá al menos dos waypoints obligatorios para optimizar."
          : "La ruta necesita al menos dos waypoints.",
      ),
    );
    return;
  }

  if (job?.status === "done" && job.result && job.baseline) {
    // E12.7 — contrato de falla: si algún tramo no llegó, no se aplica; se avisa
    // por qué y solo se puede descartar.
    const r = job.result;
    if (!r.reached) {
      panel.append(
        el("p", { class: "hn-err" }, `No se pudo trazar la ruta: ${r.reason ?? "tramo sin paso"}.`),
      );
    } else {
      panel.append(el("p", { class: "hn-opt-compare" }, optCompareText(ui, job)));
      const stats = el("div", { class: "hn-opt-stats" });
      stats.append(
        el("span", {}, `Optimizada: ${duracionTexto((r.etaMs - job.startMs) / 3600_000)} · ${dst(ui, r.nm, false)}`),
        el("span", {}, `Ceñida: ${r.tacks} viradas`),
        el("span", {}, `Original: ${duracionTexto((job.baseline.etaMs - job.startMs) / 3600_000)} · ${dst(ui, job.baseline.nm, false)}`),
      );
      if (r.gybes > 0) stats.append(el("span", {}, `Empopada: ${r.gybes} trasluchadas`));
      panel.append(stats);
      const notice = horizonNotice(job.climateOnly ? null : ui.forecast(), r.etaMs);
      if (notice) panel.append(el("p", { class: "hn-muted hn-opt-notice" }, notice));
      // E12.12 — leyenda del trazado: el color distingue el dato, no el dash.
      panel.append(
        el(
          "p",
          { class: "hn-opt-legend" },
          el("span", { class: "hn-leg-azul" }, "—"),
          " azul = pronóstico real · ",
          el("span", { class: "hn-leg-rojo" }, "- -"),
          " rojo = pilot charts (clima medio)",
        ),
      );
    }
    const acts = el("div", { class: "hn-opt-acts" });
    if (kind === "own" && r.reached) {
      const dropped = job.dropped;
      const label =
        dropped > 0
          ? `Aplicar optimización · se descartan ${dropped} opcional${dropped === 1 ? "" : "es"}`
          : "Aplicar optimización";
      const apply = el("button", { class: "hn-btn hn-btn-mini", type: "button" }, label);
      apply.addEventListener("click", () => optApply(ui, code));
      acts.append(apply);
    }
    const close = el("button", { class: "hn-btn hn-btn-mini hn-btn-ghost", type: "button" }, "Descartar");
    close.addEventListener("click", () => {
      optJobs.delete(code);
      optDraw(ui, code);
      optRefreshPanel(ui);
    });
    acts.append(close);
    panel.append(acts);
  } else if (job?.status === "cancelled") {
    panel.append(el("p", { class: "hn-muted" }, "Optimización cancelada."));
  } else if (job?.status === "error") {
    panel.append(el("p", { class: "hn-err" }, `No se pudo optimizar: ${job.error ?? "error"}.`));
  } else if (job?.status === "running") {
    panel.append(el("p", { class: "hn-muted" }, "Trazando isócronas…"));
  } else {
    panel.append(
      el(
        "p",
        { class: "hn-muted" },
        hasPkg
          ? "Calcula el trazado con el viento según el modo. No cambia la ruta hasta que apliques."
          : "Usa la climatología del mes (promedio histórico). Descargá el pronóstico para más precisión.",
      ),
    );
  }
  if (job?.result) optDraw(ui, code);
}

function optMount(
  ui: UiState,
  host: HTMLElement,
  code: string,
  kind: "book" | "own",
  coords: LonLat[],
  names: string[],
): void {
  const panel = el("div", { class: "hn-optimize" });
  host.append(panel);
  optPanelEl = panel;
  optPanelMeta = { code, kind, coords, names };
  optRender(ui, panel, code, kind, coords, names);
}

function optRefreshPanel(ui: UiState): void {
  const meta = optPanelMeta;
  const panel = optPanelEl;
  if (!meta || !panel || !panel.isConnected) return;
  optRender(ui, panel, meta.code, meta.kind, meta.coords, meta.names);
}

function renderFicha(ui: UiState, body: HTMLElement, code: string, chapter: string): void {
  optPanelEl = null;
  optPanelMeta = null;
  optClearLayers(ui);
  // Cabecera y acciones fijas (W4.5 #1): quedan pegadas arriba de la columna.
  const head = el("div", { class: "hn-ficha-head" });
  const back = el("button", { class: "hn-back" }, "‹ Rutas");
  back.addEventListener("click", () => closeFicha(ui));
  head.append(back);

  // E11.4: las rutas propias tienen su propio editor en lugar de la ficha del libro.
  const own = ownRouteById(code);
  if (own) {
    head.append(el("h2", { class: "hn-h2" }, own.name));
    head.append(el("p", { class: "hn-title-en" }, "Ruta propia"));
    body.append(head);
    const host = el("div", { class: "hn-ficha-host" });
    body.append(host);
    renderOwnFicha(host, ownCtx(ui), own);
    // UX-N.5b: el pronóstico de esta ruta vive en su ficha (también en las propias).
    routeForecastBlock(ui, own.id, host);
    const coords = own.waypoints.map((w) => [w.lon, w.lat] as LonLat);
    const names = own.waypoints.map((w) => w.name);
    optMount(ui, host, own.id, "own", coords, names);
    return;
  }

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
  recorrer.addEventListener("click", () => simOpen(ui, d, head));

  // E11.5 — la ruta del libro es de solo lectura: se copia a "Mis rutas" para
  // editarla. El botón va junto a la nota de solo lectura (abajo del título).
  const copiar = el("button", { class: "hn-btn hn-btn-mini" }, "Copiar ruta");
  copiar.addEventListener("click", () => {
    const g = selectedGeometry(ui, d.code);
    if (g) copyToOwn(ownCtx(ui), d.code, g.coords, g.names);
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

  const readonly = el("div", { class: "hn-readonly" });
  const readonlyBtns = el("span", { class: "hn-readonly-acts" });
  readonlyBtns.append(copiar);
  // E12.5: si ya hay optimización, se puede copiar también el trazado óptimo.
  const optJob = optJobs.get(d.code);
  if (optJob?.status === "done" && optJob.result) {
    const copiarOpt = el("button", { class: "hn-btn hn-btn-mini", type: "button" }, "Copiar optimizada");
    copiarOpt.addEventListener("click", () => {
      const r = optJob.result!;
      const coords = multiRouteCoords(r).map((c) => [c[0], c[1]] as [number, number]);
      const names = coords.map((_, i) => (i === 0 ? (optJob.names[0] ?? "Inicio") : i === coords.length - 1 ? (optJob.names[optJob.names.length - 1] ?? "Fin") : `WP${i + 1}`));
      copyToOwn(ownCtx(ui), `${d.code} optimizada`, coords, names);
    });
    readonlyBtns.append(copiarOpt);
  }
  readonly.append(
    el("span", { class: "hn-readonly-text" }, "Ruta del libro · solo lectura — Copiala para editarla"),
    readonlyBtns,
  );
  head.append(readonly);

  // SIM: si el simulador sigue en camino de esta misma ruta, la fila de control
  // vuelve a la ficha (que se rearma al cambiar de variante).
  if (sim.ui === ui && sim.code === d.code && sim.row) head.append(sim.row);

  // Datos en rejilla (W4.5 #2): la tira de meses va encima.
  const w = d.whenInfo;
  const verdict = el("div", { class: "hn-fact-v hn-verdict" }, monthVerdictText(d, ui.month()));
  const facts = el("div", { class: "hn-facts" });
  const fact = (k: string, v: string): HTMLElement =>
    el("div", { class: "hn-fact" }, el("div", { class: "hn-fact-k" }, k), el("div", { class: "hn-fact-v" }, v));
  facts.append(
    fact("Cuenca", e?.region || d.region || "—"),
    fact("Millas", e ? rangeDist(ui, e.nmMin, e.nmMax) : "—"),
    fact("Variantes", String(e?.variantCount ?? d.variants.length)),
    fact("Mejor época", w.bestEs || "—"),
    fact("Ciclones", w.stormsEs || "—"),
    el("div", { class: "hn-fact hn-fact-wide" }, el("div", { class: "hn-fact-k" }, "Veredicto del mes"), verdict),
  );
  // E8.3: bajo "Cuándo", el dato de pilot chart que el libro no puede dar.
  const wxLine = el("div", { class: "hn-wx-line hn-muted" });
  const refreshWx = (): void => updateRouteWind(ui, wxLine, d);
  // E12.13: la antesala de "Optimizar" — cuánto demora este trazado con este
  // viento y esta polar.
  const durLine = el("div", { class: "hn-wx-line hn-muted" });
  const refreshDur = (): void => updateRouteDuration(ui, durLine, d);
  host.append(
    monthStrip(ui, d, () => {
      verdict.textContent = monthVerdictText(d, ui.month());
      refreshWx();
      refreshDur();
    }),
  );
  host.append(facts);
  host.append(wxLine);
  host.append(durLine);
  refreshWx();
  refreshDur();
  // UX-N.5b: el pronóstico de esta ruta vive acá, junto al viento, sin scrollear.
  // E12.13: cuando el paquete llega (o se recarga) cambia la edad del rótulo de
  // duración, así que se rearma con el nuevo.
  routeForecastBlock(ui, d.code, host, refreshDur);

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
            el("div", { class: "hn-row-sub" }, `${dst(ui, v.nm, false)}${v.coastal ? " · costera" : ""}`),
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
          ? `${pos} · al siguiente (${next.name || "sin nombre"}): ${dst(ui, haversineNm(wp.lat, wp.lon, next.lat, next.lon))}`
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

  // E12.5: optimización con el viento sobre la ruta del libro (solo lectura).
  const g = selectedGeometry(ui, d.code);
  if (g) optMount(ui, host, d.code, "book", g.coords, g.names);
}

// E8.3: "Viento medio en ruta". Muestrea la climatología del mes a lo largo del
// trazado elegido (60 nm) y arma la línea de la ficha. Si el mes no está en
// caché, lo carga y vuelve a intentar.
function updateRouteWind(ui: UiState, host: HTMLElement, d: RouteDetail): void {
  const month = ui.month();
  const g = selectedGeometry(ui, d.code);
  if (!g || g.coords.length < 2) {
    host.textContent = "";
    return;
  }
  const route: ClimLineString = { type: "LineString", coordinates: g.coords };
  const cached = ui.clim.get(month);
  if (cached) {
    host.textContent = routeWindText(ui, summarizeRoute(cached, route), month);
    return;
  }
  host.textContent = "Cargando viento medio en ruta…";
  void ensureClim(ui, month).then((clim) => {
    host.textContent = clim ? routeWindText(ui, summarizeRoute(clim, route), month) : "";
  });
}

function routeWindText(ui: UiState, s: RouteWindSummary | null, month: number): string {
  if (!s) return "";
  const cur = spd(ui, s.currentKn);
  const dir = s.currentFwd ? "a favor" : "en contra";
  return (
    `Viento medio en ruta (${MONTH_NAME[month - 1] ?? ""}): ${spd(ui, s.ws, false)} del ${s.dirLabel}, ` +
    `constancia ${Math.round(s.st)} % · corriente ${dir} ${cur} · riesgo ciclónico: ${s.risk}`
  );
}

// E12.13 — "Duración estimada": cuánto demora el trazado elegido con el clima
// del mes o el pronóstico propio de la ruta, y con la polar genérica. Es un
// estimado de planificación (la antesala de "Optimizar"), y lo dice: siempre
// aparece con qué viento se calculó y con qué polar.
function updateRouteDuration(ui: UiState, host: HTMLElement, d: RouteDetail): void {
  const month = ui.month();
  const variant = ui.variant();
  const g = selectedGeometry(ui, d.code);
  if (!g || g.coords.length < 2) {
    host.textContent = "";
    return;
  }
  const key = `${d.code}|${variant}|${month}`;
  const ageOf = (pkg: ForecastPackage | null): string => (pkg ? getForecastAge(pkg) : "");
  const show = (pkg: ForecastPackage | null): void => {
    const stamp = pkg?.fetchedAt ?? 0;
    const hit = durCache.get(key);
    if (hit && hit.stamp === stamp) {
      host.textContent = durationLineText(ui, hit.est, month, ageOf(pkg));
      return;
    }
    const startMs = Date.now();
    const est = estimateRouteDuration({ coords: g.coords, clim: ui.clim.get(month) ?? null, pkg, polar: genericPolar(), startMs });
    durCache.set(key, { stamp, startMs, est });
    host.textContent = durationLineText(ui, est, month, ageOf(pkg));
  };
  const cached = durCache.get(key);
  if (cached) host.textContent = durationLineText(ui, cached.est, month, "…");
  else host.textContent = "Estimando duración…";
  void Promise.all([ensureClim(ui, month), loadForecast(ui.store, d.code)]).then(([, pkg]) => {
    // La ficha pudo cerrarse o cambiar de mes/variante mientras cargaba.
    if (!host.isConnected || ui.month() !== month || ui.variant() !== variant) return;
    show(pkg);
  });
}

function durationLineText(ui: UiState, est: RouteEstimate, month: number, pkgAge: string): string {
  const etaMs = est.etaMs - est.startMs;
  if (!(est.nm > 0) || !(etaMs > 0)) return "";
  const avgKn = est.nm / (etaMs / 3_600_000);
  const source =
    est.windSource === "pronostico"
      ? `con el pronóstico descargado (${pkgAge})`
      : `clima de ${MONTH_NAME[month - 1] ?? ""}`;
  return (
    `Duración estimada: ${formatDuration(etaMs)} · ${spd(ui, avgKn)} medios · ` +
    `viento máx ${spd(ui, est.windMaxKn, false)} — ${source} (polar 40 pies)`
  );
}

// PS-1 #2: tira de meses + fila de tarjetas chicas con el score del mes. Tocar
// cualquiera de las dos cambia el mes de planificación.
function monthStrip(ui: UiState, d: RouteDetail, onChange?: () => void): HTMLElement {
  const w = d.whenInfo;
  const strip = el("div", { class: "hn-months" });
  const scores = el("div", { class: "hn-scores" });
  const monthBtns: HTMLElement[] = [];
  const scoreBtns: HTMLElement[] = [];

  const apply = (): void => {
    const cur = ui.month();
    for (let m = 1; m <= 12; m++) {
      const on = cur === m ? " on" : "";
      monthBtns[m - 1]!.className = `hn-month hn-month-${monthVerdict(w.bestMonths, w.stormMonths, m)}${on}`;
      const s = monthScore(w, m);
      const card = scoreBtns[m - 1]!;
      card.className = `hn-score hn-score-${s.score}${on}`;
      card.setAttribute("aria-pressed", cur === m ? "true" : "false");
    }
  };
  const pick = (m: number): void => {
    ui.month.set(m);
    apply();
    onChange?.();
  };

  for (let m = 1; m <= 12; m++) {
    const on = ui.month() === m ? " on" : "";
    const b = el(
      "button",
      { class: `hn-month hn-month-${monthVerdict(w.bestMonths, w.stormMonths, m)}${on}`, title: MONTH_NAME[m - 1] ?? "", type: "button" },
      MONTH_INITIAL[m - 1] ?? "",
    );
    b.addEventListener("click", () => pick(m));
    monthBtns.push(b);
    strip.append(b);

    const s = monthScore(w, m);
    const card = el("button", {
      class: `hn-score hn-score-${s.score}${on}`,
      title: `${MONTH_NAME[m - 1] ?? ""}: ${s.label}`,
      type: "button",
    });
    card.append(
      el("span", { class: "hn-score-m" }, MONTH_INITIAL[m - 1] ?? ""),
      el("span", { class: "hn-score-l" }, s.label),
    );
    card.addEventListener("click", () => pick(m));
    scoreBtns.push(card);
    scores.append(card);
  }

  const legend = el("div", { class: "hn-months-legend" });
  legend.append(
    el("span", { class: "hn-month hn-month-best" }, "buena"),
    el("span", { class: "hn-month hn-month-storm" }, "ciclones"),
    el("span", { class: "hn-month hn-month-off" }, "fuera"),
  );
  return el("div", { class: "hn-months-wrap" }, strip, legend, scores);
}

// ------------------------------------------------------------ pestaña Travesía

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fechaCorta(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function fechaHora(t: number): string {
  const d = new Date(t);
  return `${fechaCorta(t)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function duracionTexto(hours: number): string {
  return breakdownDuration(hours);
}

function diasTexto(d: number): string {
  if (d >= 10) return `${Math.round(d).toLocaleString("es-AR")} días`;
  return `${d.toFixed(1).replace(".", ",")} ${Math.round(d) === 1 ? "día" : "días"}`;
}

function rumboTexto(deg: number): string {
  return String(Math.round(deg) % 360).padStart(3, "0");
}

function parte24(ui: UiState, r: DailyReport): string {
  if (r.nm24h <= 0) return "Últimas 24 h: sin movimiento";
  return `Últimas 24 h: ${dst(ui, r.nm24h, false)} · ${spd(ui, r.avgKn24h)} · rumbo medio ${rumboTexto(r.avgCogDeg24h)}°`;
}

// Texto del parte diario (E9.4): fecha, posición, las tres líneas y la última
// nota. Se usa tanto en pantalla como en el portapapeles.
function parteDiarioTexto(ui: UiState, nowMs: number): string[] {
  const log = ui.voyage();
  const out: string[] = [`Parte diario — ${fechaHora(nowMs)}`];
  const p = ui.position();
  const last = log && log.points.length ? log.points[log.points.length - 1] : undefined;
  const lat = p?.lat ?? last?.lat;
  const lon = p?.lon ?? last?.lon;
  if (lat !== undefined && lon !== undefined) out.push(`Posición: ${formatLat(lat)} ${formatLon(lon)}`);
  if (!log || log.points.length === 0) {
    out.push("Sin puntos todavía. Empezá a grabar con el GPS.");
    return out;
  }
  const r = dailyReport(log, nowMs);
  out.push(parte24(ui, r));
  out.push(`Total: ${dst(ui, r.totalNm, false)} en ${duracionTexto(r.hours)}`);
  const nav = activeNav(ui);
  if (nav && nav.remainingNm > 0 && r.daysToGo !== undefined) {
    out.push(`Faltan ${dst(ui, nav.remainingNm, false)} · ~${diasTexto(r.daysToGo)} a este ritmo`);
  }
  const notes = log.notes ?? [];
  const lastNote = notes[notes.length - 1];
  if (lastNote) out.push(`Última nota (${fechaHora(lastNote.t)}): ${lastNote.text}`);
  return out;
}

// Banda de deshacer (E9.4): genérica, caduca sola a los 8 s.
let undoTimer: number | null = null;

function showUndoBand(text: string, onUndo: () => void): void {
  document.querySelector(".hn-undo")?.remove();
  if (undoTimer !== null) window.clearTimeout(undoTimer);
  const band = el("div", { class: "hn-undo" });
  band.append(el("span", { class: "hn-undo-text" }, `${text} ·`));
  const undo = el("button", { class: "hn-undo-btn", type: "button" }, "Deshacer");
  band.append(undo);
  document.body.append(band);
  const done = (): void => {
    band.remove();
    if (undoTimer !== null) window.clearTimeout(undoTimer);
    undoTimer = null;
  };
  undo.addEventListener("click", () => {
    onUndo();
    done();
  });
  undoTimer = window.setTimeout(done, 8000);
}

function persistVoyage(ui: UiState, log: VoyageLog): void {
  ui.voyage.set(log);
  persist(ui, KEYS.voyageCurrent, JSON.stringify(log));
}

function addNote(ui: UiState, text: string): boolean {
  const log = ui.voyage() ?? { name: `Bitácora ${isoDate()}`, points: [], notes: [] };
  const p = ui.position();
  const last = log.points[log.points.length - 1];
  const lat = p?.lat ?? last?.lat;
  const lon = p?.lon ?? last?.lon;
  if (lat === undefined || lon === undefined) return false;
  const notes: Note[] = [...(log.notes ?? []), { t: Date.now(), lat, lon, text }];
  persistVoyage(ui, { ...log, notes });
  return true;
}

function deleteNote(ui: UiState, n: Note): void {
  const log = ui.voyage();
  if (!log) return;
  persistVoyage(ui, { ...log, notes: (log.notes ?? []).filter((x) => x !== n) });
  showUndoBand("Nota borrada", () => persistVoyage(ui, log));
}

function noteRow(ui: UiState, n: Note): HTMLElement {
  const row = el("div", { class: "hn-note-row" });
  const meta = `${fechaHora(n.t)} · ${formatLat(n.lat)} ${formatLon(n.lon)} ·`;
  const text = el("div", { class: "hn-note-text" });
  text.append(el("span", { class: "hn-note-meta" }, meta), ` ${n.text}`);
  const del = el("button", { class: "hn-note-del", type: "button" }, "×");
  del.title = "Borrar nota";
  del.addEventListener("click", () => deleteNote(ui, n));
  row.append(text, del);
  return row;
}

function archiveRow(ui: UiState, log: VoyageLog): HTMLElement {
  const row = el("div", { class: "hn-note-row" });
  const first = log.points[0];
  const last = log.points[log.points.length - 1];
  const fechas = first && last ? `${fechaCorta(first.t)} – ${fechaCorta(last.t)}` : "sin puntos";
  const main = el("div", { class: "hn-note-main" });
  main.append(
    el("div", { class: "hn-note-text" }, log.name),
    el("div", { class: "hn-note-meta" }, `${fechas} · ${dst(ui, voyageDistanceNm(log), false)}`),
  );
  const exp = el("button", { class: "hn-btn", type: "button" }, "Exportar GPX");
  exp.addEventListener("click", () => {
    downloadText(`bitacora-${log.name.replace(/\s+/g, "_")}.gpx`, "application/gpx+xml", voyageToGpx(log));
  });
  row.append(main, exp);
  return row;
}

function renderTravesia(ui: UiState, body: HTMLElement, cleanup: (() => void)[]): void {
  body.append(el("h2", { class: "hn-h2" }, "Travesía"));

  // Parte diario (E9.4): medición de las últimas 24 h, total y días restantes.
  const parteCard = el("div", { class: "hn-card" });
  parteCard.append(el("div", { class: "hn-card-title" }, "Parte diario"));
  const parteLines = el("div", { class: "hn-parte" });
  const copyBtn = el("button", { class: "hn-btn" }, "Copiar parte");
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard?.writeText(parteDiarioTexto(ui, Date.now()).join("\n"));
    copyBtn.textContent = "Copiado";
    window.setTimeout(() => {
      copyBtn.textContent = "Copiar parte";
    }, 2500);
  });
  parteCard.append(parteLines, el("div", { class: "hn-actions" }, copyBtn));
  body.append(parteCard);

  cleanup.push(
    effect(() => {
      const log = ui.voyage();
      const now = ui.now();
      ui.position();
      ui.active();
      ui.variant();
      ui.routes();
      if (!log || log.points.length === 0) {
        parteLines.replaceChildren(
          el("p", { class: "hn-muted" }, "Sin puntos todavía. Empezá a grabar con el GPS."),
        );
        return;
      }
      const r = dailyReport(log, now);
      const nav = activeNav(ui);
      const nodes: HTMLElement[] = [
        el("div", { class: "hn-parte-line" }, parte24(ui, r)),
        el("div", { class: "hn-parte-line" }, `Total: ${dst(ui, r.totalNm, false)} en ${duracionTexto(r.hours)}`),
      ];
      if (nav && nav.remainingNm > 0 && r.daysToGo !== undefined) {
        nodes.push(
          el(
            "div",
            { class: "hn-parte-line" },
            `Faltan ${dst(ui, nav.remainingNm, false)} · ~${diasTexto(r.daysToGo)} a este ritmo`,
          ),
        );
      }
      parteLines.replaceChildren(...nodes);
    }),
  );

  // Bitácora: contadores y grabación.
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
        grid.append(navCell("Puntos", String(log.points.length)), navCell("Recorrido", dst(ui, voyageDistanceNm(log), false)));
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
      if (!ui.voyage()) ui.voyage.set({ name: `Bitácora ${isoDate()}`, points: [], notes: [] });
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
  const clearBtn = el("button", { class: "hn-btn" }, "Nueva travesía");
  const notesCard = el("div", { class: "hn-card" });
  clearBtn.addEventListener("click", () => {
    if (!confirm("¿Empezar una travesía nueva? La actual se guarda en el archivo.")) return;
    const l = ui.voyage();
    if (l && (l.points.length > 1 || (l.notes?.length ?? 0) > 0)) {
      void ui.store
        .get(KEYS.voyageArchive)
        .then((prev) => {
          const arr = readJson<VoyageLog[]>(prev, []);
          arr.push(l);
          return ui.store.put(KEYS.voyageArchive, JSON.stringify(arr));
        })
        .then(() => renderArchive(ui, archiveList));
    }
    ui.recording.set(false);
    const next: VoyageLog = { name: `Bitácora ${isoDate()}`, points: [], notes: [] };
    ui.voyage.set(next);
    persist(ui, KEYS.voyageCurrent, JSON.stringify(next));
  });
  actions.append(rec, exportBtn, clearBtn);
  body.append(actions);

  // Notas de a bordo (E9.4): una línea por nota, con deshacer de 8 s.
  notesCard.append(el("div", { class: "hn-card-title" }, "Notas"));
  const noteForm = el("div", { class: "hn-note-form" });
  noteForm.hidden = true;
  const noteInput = el("input", {
    class: "hn-note-input",
    type: "text",
    placeholder: "Una línea con la nota de a bordo",
    maxlength: "140",
  });
  const noteSave = el("button", { class: "hn-btn hn-btn-primary" }, "Guardar");
  const noteHint = el("p", { class: "hn-muted" }, "Sin posición: fijá una posición o empezá a grabar.");
  noteHint.hidden = true;
  noteForm.append(noteInput, noteSave);
  const noteAdd = el("button", { class: "hn-btn" }, "+ Nota");
  noteAdd.addEventListener("click", () => {
    noteForm.hidden = !noteForm.hidden;
    if (!noteForm.hidden) {
      noteInput.focus();
      return;
    }
    noteHint.hidden = true;
  });
  const saveNote = (): void => {
    const text = noteInput.value.trim();
    if (text === "") return;
    if (!addNote(ui, text)) {
      noteHint.hidden = false;
      return;
    }
    noteHint.hidden = true;
    noteInput.value = "";
    noteForm.hidden = true;
  };
  noteSave.addEventListener("click", saveNote);
  noteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveNote();
    if (e.key === "Escape") {
      noteForm.hidden = true;
      noteHint.hidden = true;
    }
  });
  const noteList = el("div", { class: "hn-note-list" });
  notesCard.append(el("div", { class: "hn-actions" }, noteAdd), noteForm, noteHint, noteList);
  body.append(notesCard);

  cleanup.push(
    effect(() => {
      const log = ui.voyage();
      const notes = [...(log?.notes ?? [])].sort((a, b) => b.t - a.t);
      if (notes.length === 0) {
        noteList.replaceChildren(el("p", { class: "hn-muted" }, "Sin notas todavía."));
        return;
      }
      noteList.replaceChildren(...notes.map((n) => noteRow(ui, n)));
    }),
  );

  // Travesías archivadas (E9.4): nombre, fechas, millas y export GPX.
  const archCard = el("div", { class: "hn-card" });
  archCard.append(el("div", { class: "hn-card-title" }, "Travesías archivadas"));
  const archiveList = el("div", { class: "hn-note-list" });
  archCard.append(archiveList);
  body.append(archCard);
  renderArchive(ui, archiveList);
}

function renderArchive(ui: UiState, host: HTMLElement): void {
  void ui.store
    .get(KEYS.voyageArchive)
    .then((raw) => {
      const arr = readJson<VoyageLog[]>(raw, []);
      if (arr.length === 0) {
        host.replaceChildren(el("p", { class: "hn-muted" }, "Sin travesías archivadas todavía."));
        return;
      }
      host.replaceChildren(...arr.map((l) => archiveRow(ui, l)));
    })
    .catch(() => {
      host.replaceChildren(el("p", { class: "hn-muted" }, "Sin travesías archivadas todavía."));
    });
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

// ------------------------------------------- UX-N.1 · acciones sobre un punto
// Mantener pulsado el mapa (o click derecho en escritorio) deja un pin 📍 y
// abre la hoja de acciones sobre ese punto (patrón Google Maps, D1). El toque
// corto no toca nada de lo que ya existía.

const POINT_CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];

// Dirección "de la que viene" el viento, en rumbos de 16, a partir de u/v
// (hacia dónde sopla).
function rumboDe(u: number, v: number): string {
  const deg = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return POINT_CARDINALS[Math.round(deg / 22.5) % 16] ?? "—";
}

function closePointSheet(ui: UiState): void {
  pointOutsideRemove?.();
  pointOutsideRemove = null;
  pointSheetEl?.remove();
  pointSheetEl = null;
  pointPin?.remove();
  pointPin = null;
  if (pointOptCode) {
    pointOptOnUpdate = null;
    pointOptCode = null;
    optClearLayers(ui);
  }
  if (pointOptCancel) {
    pointOptCancel();
    pointOptCancel = null;
  }
}

// Chrome común de la hoja: coords del punto + ✕ + pin. Devuelve el cuerpo
// donde la acción concreta monta su contenido.
function buildPointSheet(ui: UiState, bodyBuilder: (host: HTMLElement) => void): HTMLElement {
  pointSheetEl?.remove();
  pointSheetEl = null;
  pointPin?.remove();
  pointPin = new Marker({ element: el("span", { class: "hn-pin" }, "📍"), anchor: "bottom" })
    .setLngLat([pointLon, pointLat])
    .addTo(ui.map);
  const sheet = el("div", { class: "hn-point-actions" });
  const head = el("div", { class: "hn-point-head" });
  head.append(el("span", { class: "hn-point-coords" }, `${formatLat(pointLat)} · ${formatLon(pointLon)}`));
  const close = el("button", { class: "hn-alarm-btn hn-point-close", type: "button", "aria-label": "Cerrar" }, "✕");
  head.append(close);
  sheet.append(head);
  const body = el("div", { class: "hn-point-body" });
  bodyBuilder(body);
  sheet.append(body);
  document.body.append(sheet);
  pointSheetEl = sheet;
  close.addEventListener("click", () => closePointSheet(ui));
  const outside = (ev: Event): void => {
    if (!sheet.contains(ev.target as Node)) closePointSheet(ui);
  };
  setTimeout(() => document.addEventListener("click", outside), 0);
  pointOutsideRemove = () => document.removeEventListener("click", outside);
  return body;
}

function openPointActions(ui: UiState, lat: number, lon: number): void {
  // Los modos de un toque (fijar posición, editar ruta, destino de
  // optimización) tienen prioridad sobre la hoja.
  if (fixOnMapArmed || ownArmActive() || pointDestArmed || measure) return;
  pointLat = lat;
  pointLon = lon;
  if (pointOptCode) {
    // Una optimización quedó huérfana: sus capas se limpiaron al cerrar.
    pointOptOnUpdate = null;
    pointOptCode = null;
    optClearLayers(ui);
  }
  buildPointSheet(ui, (body) => {
    for (const a of POINT_ACTIONS) {
      const btn = el("button", { class: "hn-point-act", type: "button" }, a.label);
      btn.addEventListener("click", () => runPointAction(ui, a.id, body));
      body.append(btn);
    }
  });
}

function runPointAction(ui: UiState, id: PointActionId, body: HTMLElement): void {
  if (id === "clima") togglePointWx(ui, body);
  else if (id === "medir") startMeasure(ui, pointLat, pointLon);
  else if (id === "optimizar") armPointOpt(ui);
  else if (id === "posicion") fixPointPosition(ui);
  else if (id === "waypoint") waypointPoint(ui);
}

// ---- Clima acá: pilot chart del mes de planificación + pronóstico si cubre.

function togglePointWx(ui: UiState, body: HTMLElement): void {
  const host = body.querySelector(".hn-point-wx") as HTMLElement | null;
  if (host) {
    host.remove();
    return;
  }
  const wx = el("div", { class: "hn-point-wx" });
  wx.append(el("p", { class: "hn-muted" }, "Cargando clima del mes…"));
  body.append(wx);
  const month = ui.month();
  const cached = ui.clim.get(month);
  const p: Promise<ClimMonth | null> = cached ? Promise.resolve(cached) : ensureClim(ui, month);
  void p.then((clim) => {
    if (!wx.isConnected) return; // la hoja se cerró mientras cargaba
    clear(wx);
    if (!clim) {
      wx.append(el("p", { class: "hn-err" }, "No hay datos de clima para este mes."));
      return;
    }
    appendPointWx(ui, wx, clim, pointLat, pointLon);
  });
}

function appendPointWx(ui: UiState, wx: HTMLElement, clim: ClimMonth, lat: number, lon: number): void {
  const cell = getCell(clim, lat, lon);
  if (!cell) {
    wx.append(el("p", { class: "hn-err" }, "Ese punto está en tierra."));
  } else {
    wx.append(el("p", {}, `Viento medio ${spd(ui, cell.ws, false)} del ${rumboDe(cell.wu, cell.wv)}`));
    wx.append(el("p", {}, `Constancia ${cell.cu.toFixed(0)} % · Ola ${cell.hs.toFixed(1)} m`));
    const curKn = Math.hypot(cell.cu, cell.cv);
    if (curKn > 0.05) wx.append(el("p", {}, `Corriente ${spd(ui, curKn)} hacia ${rumboDe(-cell.cu, -cell.cv)}`));
    if (cell.tc > 0) wx.append(el("p", {}, `Ciclones: ${cell.tc.toFixed(0)} por década`));
    if (cell.ice > 0) wx.append(el("p", {}, `Hielo: riesgo ${cell.ice.toFixed(0)}`));
  }
  wx.append(el("p", { class: "hn-muted" }, `Pilot chart · ${MONTH_NAME[ui.month()] ?? ""}`));
  appendPointForecast(ui, wx, lat, lon);
}

// UX-N.2 (D2): la caja del punto (pin + 300 nm) se baja desde acá, sin exigir
// ninguna ruta seleccionada. Con el paquete se muestran los datos de la hora
// del deslizador (o de "ahora" si el pronóstico no está abierto).
function appendPointForecast(ui: UiState, wx: HTMLElement, lat: number, lon: number): void {
  const host = el("div", { class: "hn-point-fc" });
  wx.append(host);
  const id = forecastIdPoint(lat, lon);

  const render = (): void => {
    void loadForecast(ui.store, id).then((own) => {
      if (!host.isConnected) return;
      clear(host);
      const ctx = ui.forecast();
      const useCtx = ctx !== null && (ctx.id === id || bboxCovers(ctx.bbox, lat, lon));
      const used = own ?? (useCtx ? ctx : null);
      if (!used) {
        const btn = el("button", { class: "hn-point-act", type: "button" }, "Descargar pronóstico acá");
        const status = el("p", { class: "hn-muted" }, "Caja del punto + 300 nm.");
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          btn.disabled = true;
          btn.textContent = "Bajando…";
          status.textContent = "0 %";
          void downloadForecast(ui.store, id, [lon, lat, lon, lat], (r) => {
            status.textContent = `${Math.round(r * 100)} %`;
          })
            .then((pkg) => {
              ui.forecast.set(pkg);
              ui.forecastHour.set(nearestSlot(pkg, Date.now()));
              render();
            })
            .catch(() => {
              btn.disabled = false;
              btn.textContent = "Reintentar";
              status.textContent = "error · sin conexión";
            });
        });
        host.append(btn, status);
        return;
      }

      host.append(el("p", { class: "hn-muted" }, `Pronóstico de ${forecastOwnerName(used.id, bboxCenter(used.bbox))} · ${getForecastAge(used)}`));
      const isCtx = ctx !== null && ctx.id === used.id;
      const t = isCtx ? slotTime(used, ui.forecastHour()) : slotTime(used, nearestSlot(used, Date.now()));
      if (forecastCoversPoint(used, lat, lon, t)) {
        const w = forecastWindField(used, null)(lat, lon, t);
        if (w) {
          const dir = POINT_CARDINALS[Math.round(w.dir / 22.5) % 16] ?? "—";
          host.append(el("p", {}, `Pronóstico ${hourLabel(t)}: viento ${spd(ui, w.speed, false)} del ${dir}`));
        }
      } else if (empalmeConClimatología(used, t)) {
        host.append(el("p", { class: "hn-muted" }, "Más allá del horizonte del paquete: clima medio."));
      }
    });
  };
  render();
}

// ---- Optimizar desde acá: el pin es el origen, el próximo toque el destino.

function armPointOpt(ui: UiState): void {
  if (pointDestArmed) return;
  pointDestArmed = true;
  const fromLat = pointLat;
  const fromLon = pointLon;
  // La hoja se cierra; el pin se queda como origen de la ruta.
  pointOutsideRemove?.();
  pointOutsideRemove = null;
  pointSheetEl?.remove();
  pointSheetEl = null;
  const band = el("div", { class: "hn-fixband" });
  band.append(el("span", {}, "Tocá el mapa para elegir el destino"));
  const cancel = el("button", { class: "hn-alarm-btn", type: "button" }, "Cancelar");
  band.append(cancel);
  document.body.append(band);
  const done = (): void => {
    band.remove();
    ui.map.off("click", onDest);
    ui.map.getCanvas().style.cursor = "";
    pointOptCancel = null;
    // Se limpia recién en el próximo tick: los handlers de capa del mismo
    // clic todavía deben verlo armado.
    window.setTimeout(() => {
      pointDestArmed = false;
    }, 0);
  };
  const onDest = (e: MapMouseEvent): void => {
    done();
    void runPointOpt(ui, [fromLon, fromLat], [e.lngLat.lng, e.lngLat.lat]);
  };
  cancel.addEventListener("click", () => {
    done();
    pointPin?.remove();
    pointPin = null;
  });
  ui.map.getCanvas().style.cursor = "crosshair";
  ui.map.on("click", onDest);
  pointOptCancel = () => {
    done();
    pointPin?.remove();
    pointPin = null;
  };
}

async function runPointOpt(ui: UiState, from: LonLat, to: LonLat): Promise<void> {
  // UX-N.2 (D2): usa la caja del punto si cubre el destino (o el paquete que ya
  // está cargado); si ninguna cubre pin→destino, ofrece bajar la combinada.
  const pointPkg = await loadForecast(ui.store, forecastIdPoint(from[1], from[0])).catch(() => null);
  const covers = (p: ForecastPackage | null): p is ForecastPackage =>
    p !== null && bboxCovers(p.bbox, from[1], from[0]) && bboxCovers(p.bbox, to[1], to[0]);
  const local = ui.forecast();
  const covering = covers(local) ? local : covers(pointPkg) ? pointPkg : null;
  if (!covering) {
    promptCombinedForecast(ui, from, to);
    return;
  }
  if (covering !== local) {
    ui.forecast.set(covering);
    ui.forecastHour.set(nearestSlot(covering, Date.now()));
  }
  await runPointOptNow(ui, from, to);
}

// Ítem 4: ofrece la caja combinada pin→destino antes de correr el motor; quien
// no tiene red puede seguir con la climatología del mes.
function promptCombinedForecast(ui: UiState, from: LonLat, to: LonLat): void {
  buildPointSheet(ui, (host) => {
    host.append(el("p", {}, "El pronóstico descargado no cubre el tramo pin → destino."));
    host.append(
      el("p", { class: "hn-muted" }, "¿Bajamos la caja combinada (300 nm de margen) antes de correr el motor?"),
    );
    const status = el("p", { class: "hn-muted" });
    const dl = el("button", { class: "hn-point-act", type: "button" }, "Descargar y optimizar");
    const clim = el("button", { class: "hn-point-act", type: "button" }, "Seguir con clima medio");
    dl.addEventListener("click", () => {
      if (dl.disabled) return;
      const box = bboxOfTrack([from, to]);
      if (!box) return;
      const id = ++optJobSeq;
      const code = `PT${id}`;
      dl.disabled = true;
      clim.disabled = true;
      dl.textContent = "Bajando…";
      status.textContent = "0 %";
      void downloadForecast(ui.store, code, box, (r) => {
        status.textContent = `${Math.round(r * 100)} %`;
      })
        .then((pkg) => {
          ui.forecast.set(pkg);
          ui.forecastHour.set(nearestSlot(pkg, Date.now()));
          closePointSheet(ui);
          void runPointOptNow(ui, from, to, id);
        })
        .catch(() => {
          dl.disabled = false;
          clim.disabled = false;
          dl.textContent = "Reintentar";
          status.textContent = "error · sin conexión";
        });
    });
    clim.addEventListener("click", () => {
      closePointSheet(ui);
      void runPointOptNow(ui, from, to, undefined, true);
    });
    host.append(dl, clim, status);
  });
}

async function runPointOptNow(
  ui: UiState,
  from: LonLat,
  to: LonLat,
  id = ++optJobSeq,
  climateOnly = false,
): Promise<void> {
  const code = `PT${id}`;
  const coords: LonLat[] = [from, to];
  const names = ["Origen", "Destino"];
  // "Seguir con clima medio" del prompt corre sin paquete a propósito.
  const pkg = climateOnly ? null : ui.forecast();
  const month = ui.month();
  let clim = ui.clim.get(month) ?? null;
  if (!clim) clim = await ensureClim(ui, month);
  if (!clim && !pkg) {
    openPointOptSheet(ui, code, "no hay datos de viento");
    optJobs.set(code, {
      code, kind: "own", coords, names, status: "error", ratio: 0, workerId: 0, result: null, baseline: null,
      startMs: Date.now(), climateOnly: true, dropped: 0, error: "no hay datos de viento",
    });
    return;
  }
  let bytes: Uint8Array;
  try {
    bytes = await optLandBytesLoad();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    openPointOptSheet(ui, code, msg);
    optJobs.set(code, {
      code, kind: "own", coords, names, status: "error", ratio: 0, workerId: 0, result: null, baseline: null,
      startMs: Date.now(), climateOnly: !pkg, dropped: 0, error: msg,
    });
    return;
  }
  const job: OptJob = {
    code, kind: "own", coords, names, status: "running", ratio: 0, workerId: 0, result: null, baseline: null,
    startMs: Date.now(), climateOnly: !pkg, dropped: 0,
  };
  optJobs.set(code, job);
  optJobCode.set(id, code);
  job.workerId = id;
  const mode = ui.settings.routingMode ?? DEFAULT_ROUTING_MODE;
  optWorkerGet(ui).postMessage({
    type: "run",
    id,
    startMs: Date.now(),
    anchors: coords,
    original: coords,
    pkg,
    clim,
    polar: genericPolar(),
    landBytes: bytes,
    climateOnly: !pkg,
    config: routingModeConfig(mode),
  });
  openPointOptSheet(ui, code, null);
}

// Hoja de resultado (mismo chrome que la de acciones): comparación de E12.5,
// isócronas y línea punteada en el mapa, y "Aplicar" que crea la ruta propia.
function openPointOptSheet(ui: UiState, code: string, bootError: string | null): void {
  pointOptCode = code;
  const body = buildPointSheet(ui, (host) => renderPointOptBody(ui, host, code, bootError));
  pointOptOnUpdate = () => {
    if (!pointSheetEl) return;
    renderPointOptBody(ui, body, code, null);
  };
}

function renderPointOptBody(ui: UiState, host: HTMLElement, code: string, bootError: string | null): void {
  clear(host);
  const job = optJobs.get(code);
  if (bootError || !job) {
    host.append(el("p", { class: "hn-err" }, `No se pudo trazar la ruta: ${bootError ?? "error desconocido"}`));
    host.append(pointOptBtn("Descartar", () => pointOptDiscard(ui, code)));
    return;
  }
  if (job.status === "running") {
    host.append(el("p", {}, job.ratio > 0 ? `Calculando… ${(job.ratio * 100).toFixed(0)} %` : "Calculando la ruta optimizada…"));
    return;
  }
  if (job.status === "error" || !job.result) {
    host.append(el("p", { class: "hn-err" }, `No se pudo trazar la ruta: ${job.error ?? "error"}`));
    host.append(pointOptBtn("Descartar", () => pointOptDiscard(ui, code)));
    return;
  }
  const r = job.result;
  if (!r.reached) {
    host.append(el("p", { class: "hn-err" }, `No se pudo trazar la ruta: ${r.reason ?? "sin motivo"}`));
    host.append(pointOptBtn("Descartar", () => pointOptDiscard(ui, code)));
    return;
  }
  // Mismas capas de E12.5: isócronas + trazado punteado de comparación.
  const isos = r.isochrones.map((l) => lineFeature(l.coords as [number, number][]));
  setSource(ui.map, "wx-isochrones", featureCollection(isos));
  // E12.12: azul hasta donde llega el pronóstico, rojo punteado desde ahí.
  const pkg = job.climateOnly ? null : ui.forecast();
  const parts = multiRouteSplit(r, pkg ? forecastHorizon(pkg) : null).map((part) =>
    lineFeature(part.coords as [number, number][], { clima: part.clima }),
  );
  setSource(ui.map, "optroute", featureCollection(parts));
  if (job.baseline) host.append(el("p", { class: "hn-opt-compare" }, optCompareText(ui, job)));
  const stats = el("div", { class: "hn-opt-stats" });
  stats.append(
    el("span", {}, `Optimizada: ${duracionTexto((r.etaMs - job.startMs) / 3600_000)} · ${dst(ui, r.nm, false)}`),
    el("span", {}, `Ceñida: ${r.tacks} viradas`),
  );
  if (r.gybes > 0) stats.append(el("span", {}, `Empopada: ${r.gybes} trasluchadas`));
  if (job.baseline) stats.append(el("span", {}, `Original: ${duracionTexto((job.baseline.etaMs - job.startMs) / 3600_000)} · ${dst(ui, job.baseline.nm, false)}`));
  host.append(stats);
  const notice = horizonNotice(job.climateOnly ? null : ui.forecast(), r.etaMs);
  if (notice) host.append(el("p", { class: "hn-muted hn-opt-notice" }, notice));
  host.append(pointOptBtn("Aplicar", () => pointOptApply(ui, code)));
  host.append(pointOptBtn("Descartar", () => pointOptDiscard(ui, code)));
}

function pointOptBtn(label: string, onClick: () => void): HTMLElement {
  const b = el("button", { class: "hn-point-act", type: "button" }, label);
  b.addEventListener("click", onClick);
  return b;
}

function pointOptDiscard(ui: UiState, code: string): void {
  optJobs.delete(code);
  optClearLayers(ui);
  closePointSheet(ui);
}

// "Aplicar": crea una ruta propia nueva en Mis rutas (el catálogo jamás se
// toca) con el trazado optimizado; nada se guarda solo.
function pointOptApply(ui: UiState, code: string): void {
  const job = optJobs.get(code);
  if (!job?.result?.reached) return;
  const ctx = ownCtx(ui);
  goTo(ui, "rutas");
  const route = copyToOwn(ctx, "Optimizada desde el punto", job.coords, job.names);
  const before = route.waypoints.map((w) => ({ name: w.name, lat: w.lat, lon: w.lon }));
  const segments = job.result.segments.map((s) =>
    s.points.map((p) => ({ lat: p.lat, lon: p.lon, tack: p.tack, maneuver: p.maneuver })),
  );
  applyOptimizationToOwn(ctx, route, segments);
  showUndoBand("Ruta optimizada creada en Mis rutas", () => {
    const cur = ownRouteById(route.id);
    if (cur) replaceOwnRoute(ctx, cur, before);
  });
  pointOptDiscard(ui, code);
}

// ---- Fijar posición acá: la posición manual en el pin (UX-2, no pisa el GPS).

function fixPointPosition(ui: UiState): void {
  const pos: Position = { lat: pointLat, lon: pointLon, accuracyM: 0, source: "manual", t: Date.now() };
  stopGps(ui);
  ui.position.set(pos);
  ui.gpsStatus.set("off");
  persist(ui, KEYS.position, JSON.stringify(pos));
  setSource(ui.map, "me", featureCollection([pointFeature(pos.lon, pos.lat)]));
  pushFix(ui, pos);
  closePointSheet(ui);
}

// ---- Waypoint acá: a la ruta en edición, o el primer punto de una nueva.

function waypointPoint(ui: UiState): void {
  const ctx = ownCtx(ui);
  const editing = ownEdit();
  if (editing) {
    const next = addWaypoint(editing, pointLat, pointLon);
    replaceOwnRoute(ctx, next, next.waypoints.map((w) => ({ name: w.name, lat: w.lat, lon: w.lon })));
    closePointSheet(ui);
    return;
  }
  goTo(ui, "rutas");
  copyToOwn(ctx, `Ruta ${ownRoutes().length + 1}`, [[pointLon, pointLat]], ["WP1"]);
  closePointSheet(ui);
}

// ------------------------------------------------------------- Ajustes (UX-N.4b)

function renderAjustes(ui: UiState, body: HTMLElement, cleanup: (() => void)[]): void {
  body.append(el("h2", { class: "hn-h2" }, "Ajustes"));

  // Visibilidad: qué elementos de la carta se ven. Todo arranca visible.
  const visCard = el("div", { class: "hn-card" });
  visCard.append(el("div", { class: "hn-card-title" }, "Visibilidad"));
  const visBox = el("div");
  visCard.append(visBox);
  body.append(visCard);
  cleanup.push(
    effect(() => {
      clear(visBox);
      const v = ui.visibilidad();
      const toggle = (label: string, key: keyof Visibility): HTMLElement => {
        const row = el("div", { class: "hn-toggle-row" });
        const t = el("button", {
          class: "hn-toggle",
          type: "button",
          role: "switch",
          "aria-checked": v[key] ? "true" : "false",
          "aria-label": label,
        });
        t.addEventListener("click", () => ui.visibilidad.update((x) => ({ ...x, [key]: !x[key] })));
        row.append(el("span", {}, label), t);
        return row;
      };
      visBox.append(
        toggle("MOB", "mob"),
        toggle("FAB ◉", "fab"),
        toggle("Nota de escala", "scaleNote"),
        toggle("Retícula", "graticule"),
        toggle("Balizas OSM online", "seamarksOnline"),
      );
    }),
  );

  // Unidades: defaults náuticos (kn / nm / m).
  const unCard = el("div", { class: "hn-card" });
  unCard.append(el("div", { class: "hn-card-title" }, "Unidades"));
  const unBox = el("div");
  unCard.append(unBox);
  body.append(unCard);
  const select = (options: string[], value: string, onChange: (v: string) => void): HTMLElement => {
    const sel = el("select", { class: "hn-search hn-unit-select" });
    for (const o of options) {
      const opt = el("option", { value: o }, o);
      if (o === value) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  };
  cleanup.push(
    effect(() => {
      clear(unBox);
      const u = ui.unidades();
      const row = el("div", { class: "hn-unit-fields" });
      row.append(
        el(
          "label",
          { class: "hn-field" },
          el("span", { class: "hn-field-label" }, "Velocidad"),
          select(["kn", "km/h"], u.speed === "kmh" ? "km/h" : "kn", (v) =>
            ui.unidades.update((x) => ({ ...x, speed: v === "km/h" ? "kmh" : "kn" })),
          ),
        ),
        el(
          "label",
          { class: "hn-field" },
          el("span", { class: "hn-field-label" }, "Distancia"),
          select(["nm", "km"], u.distance, (v) => ui.unidades.update((x) => ({ ...x, distance: v as DistanceUnit }))),
        ),
        el(
          "label",
          { class: "hn-field" },
          el("span", { class: "hn-field-label" }, "Profundidad"),
          select(["m", "ft"], u.depth, (v) => ui.unidades.update((x) => ({ ...x, depth: v as DepthUnit }))),
        ),
      );
      unBox.append(row);
    }),
  );

  body.append(alarmsCard(ui, cleanup));
  body.append(themeCard(ui, cleanup));

  // UX-N.5b — los datos no se mezclan con los interruptores: entrada destacada
  // a la sección propia "Datos sin conexión".
  const datosCard = el("button", { class: "hn-card hn-datos-link", type: "button" });
  datosCard.append(
    el("span", { class: "hn-card-title" }, "Datos sin conexión"),
    el("span", { class: "hn-offline-info" }, "Pronósticos y cartas guardadas ›"),
  );
  datosCard.addEventListener("click", () => goTo(ui, "datos"));
  body.append(datosCard);
}
