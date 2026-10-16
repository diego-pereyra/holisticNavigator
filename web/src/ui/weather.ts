// Pilot charts en la carta (E8.3, ADR-009 §5 y §6): cinco capas `wx-*` que
// dibujan el viento medio, las flechas de viento, las corrientes, los ciclones
// y el hielo del mes de planificación. Los datos vienen de `core/clim.ts`; acá
// solo se arma el GeoJSON y se pintan las capas. El modo Pronóstico (E13)
// reutilizará las mismas capas con otra fuente.

import type { Map as MlMap, GeoJSONSource, ExpressionSpecification } from "maplibre-gl";
import { getCell, sampleAlongRoute, type ClimLineString, type ClimMonth } from "../core/clim.ts";
import {
  FORECAST_MISSING,
  decodeForecast,
  forecastLastTime,
  type ForecastPackage,
} from "../core/forecast.ts";
import { initialBearingDeg } from "../core/navigation.ts";

export type WeatherMode = "off" | "pilot" | "forecast";

export const WEATHER_ORDER: WeatherMode[] = ["off", "pilot", "forecast"];

export const WEATHER_LABEL: Record<WeatherMode, string> = {
  off: "Apagado",
  pilot: "Pilot chart",
  forecast: "Pronóstico",
};

// Rampa de viento en nudos (ADR §5): 0–5–10–15–20–30–40+.
export const WX_WIND_STOPS = [0, 5, 10, 15, 20, 30, 40];
export const WX_WIND_COLORS = [
  "#2c5f8a",
  "#3e8e7e",
  "#7cb342",
  "#fdd835",
  "#fb8c00",
  "#e53935",
  "#8e24aa",
];

export const WX_FIELD_COLOR: ExpressionSpecification = [
  "step",
  ["get", "ws"],
  WX_WIND_COLORS[0]!,
  5,
  WX_WIND_COLORS[1]!,
  10,
  WX_WIND_COLORS[2]!,
  15,
  WX_WIND_COLORS[3]!,
  20,
  WX_WIND_COLORS[4]!,
  30,
  WX_WIND_COLORS[5]!,
  40,
  WX_WIND_COLORS[6]!,
];

// Largo ∝ ws y opacidad ∝ st: un alisio se ve firme, un viento variable tenue.
export const WX_ARROW_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "ws"],
  0,
  0.6,
  20,
  3,
  40,
  5.5,
];
export const WX_ARROW_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "st"],
  0,
  0.15,
  50,
  0.5,
  100,
  0.95,
];

export const WX_CURRENT_COLOR = "#2e9bff";
export const WX_CURRENT_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "mag"],
  0,
  0.5,
  2,
  1.6,
  4,
  2.6,
];
// E13.3: las corrientes van discontinuas para distinguirlas de rutas y costas.
export const WX_CURRENT_DASH: [number, number] = [1.6, 2];

export const WX_CYCLONE_COLOR = "#C62828";
export const WX_CYCLONE_OPACITY: ExpressionSpecification = [
  "step",
  ["get", "tc"],
  0.18,
  3,
  0.45,
];

export const WX_ICE_COLOR = "#d7ecf7";

// E13.2 — Pronóstico en vivo: isobaras cada 4 hPa y olas por altura/dirección.
export const WX_ISOBAR_COLOR = "#e6eef7";
export const WX_ISOBAR_INTERVAL = 4;

export const WX_WAVE_STOPS = [0, 1, 2, 3, 4, 6];
export const WX_WAVE_COLORS = ["#1b3a5c", "#1e5f8f", "#2e9bff", "#42c8c0", "#fdd835", "#e53935"];
export const WX_WAVE_COLOR: ExpressionSpecification = [
  "step",
  ["get", "h"],
  WX_WAVE_COLORS[0]!,
  1,
  WX_WAVE_COLORS[1]!,
  2,
  WX_WAVE_COLORS[2]!,
  3,
  WX_WAVE_COLORS[3]!,
  4,
  WX_WAVE_COLORS[4]!,
  6,
  WX_WAVE_COLORS[5]!,
];
export const WX_WAVE_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "h"],
  0,
  0.6,
  2,
  2,
  4,
  3.4,
  8,
  5,
];

const HATCH_ID = "wx-hatch";

// Fuentes/líneas del pilot chart y del pronóstico, más las dos capas auxiliares
// (círculo de las flechas y etiqueta de las isobaras) que comparten sus claves.
export const WX_LAYER_IDS = [
  "wx-field",
  "wx-current",
  "wx-arrows",
  "wx-arrows-dot",
  "wx-cyclone",
  "wx-ice",
  "wx-isobars",
  "wx-isobar-labels",
  "wx-waves",
] as const;

// E13.3 — Selector de capas. Seis interruptores persisten en `hn.settings.wxLayers`.
// `wind` enciende el tinte (wx-field) y las flechas (wx-arrows + su círculo).
export type WxLayerKey = "wind" | "current" | "waves" | "isobars" | "cyclone" | "ice";

export type WxLayers = Record<WxLayerKey, boolean>;

export const WX_LAYERS: { key: WxLayerKey; label: string }[] = [
  { key: "wind", label: "Viento" },
  { key: "current", label: "Corrientes" },
  { key: "waves", label: "Olas" },
  { key: "isobars", label: "Isobaras" },
  { key: "cyclone", label: "Ciclones" },
  { key: "ice", label: "Hielo" },
];

// Por defecto Viento y Corrientes encendidos; el resto apagado.
export function defaultWxLayers(): WxLayers {
  return { wind: true, current: true, waves: false, isobars: false, cyclone: false, ice: false };
}

// Capas del mapa que enciende cada interruptor (los símbolos de isobara y el
// círculo de las flechas comparten fuente con su capa de línea).
const WX_LAYER_TO_IDS: Record<WxLayerKey, string[]> = {
  wind: ["wx-field", "wx-arrows", "wx-arrows-dot"],
  current: ["wx-current"],
  waves: ["wx-waves"],
  isobars: ["wx-isobars", "wx-isobar-labels"],
  cyclone: ["wx-cyclone"],
  ice: ["wx-ice"],
};

export function applyWxLayers(map: MlMap, layers: WxLayers): void {
  const all = new Set<string>(WX_LAYER_IDS);
  for (const ids of Object.values(WX_LAYER_TO_IDS)) for (const id of ids) all.add(id);
  for (const id of all) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  }
  for (const { key } of WX_LAYERS) {
    if (!layers[key]) continue;
    for (const id of WX_LAYER_TO_IDS[key]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    }
  }
}

// Densidad de flechas por zoom (ADR §5): z≤2 cada 4°, z3 cada 2°, z≥4 cada 1°.
export function weatherStride(zoom: number): number {
  const z = Math.floor(zoom);
  return z <= 2 ? 4 : z === 3 ? 2 : 1;
}

// --------------------------------------------------------------- capas

export function initWeatherLayers(map: MlMap): void {
  if (map.getLayer("wx-field")) return;
  addHatch(map);
  const empty = { type: "FeatureCollection", features: [] as object[] };
  for (const id of WX_LAYER_IDS) map.addSource(id, { type: "geojson", data: empty });

  map.addLayer({
    id: "wx-field",
    type: "fill",
    source: "wx-field",
    paint: { "fill-color": WX_FIELD_COLOR, "fill-opacity": 0.35 },
  });
  map.addLayer({
    id: "wx-current",
    type: "line",
    source: "wx-current",
    minzoom: 3,
    paint: {
      "line-color": WX_CURRENT_COLOR,
      "line-width": WX_CURRENT_WIDTH,
      "line-opacity": 0.85,
      "line-dasharray": WX_CURRENT_DASH,
    },
  });
  map.addLayer({
    id: "wx-arrows",
    type: "line",
    source: "wx-arrows",
    paint: { "line-color": WX_FIELD_COLOR, "line-width": WX_ARROW_WIDTH, "line-opacity": WX_ARROW_OPACITY },
  });
  map.addLayer({
    id: "wx-arrows-dot",
    type: "circle",
    source: "wx-arrows-dot",
    paint: { "circle-color": WX_FIELD_COLOR, "circle-radius": 2.4, "circle-opacity": WX_ARROW_OPACITY },
  });
  map.addLayer({
    id: "wx-cyclone",
    type: "fill",
    source: "wx-cyclone",
    paint: { "fill-pattern": HATCH_ID, "fill-color": WX_CYCLONE_COLOR, "fill-opacity": WX_CYCLONE_OPACITY },
  });
  map.addLayer({
    id: "wx-ice",
    type: "fill",
    source: "wx-ice",
    paint: { "fill-color": WX_ICE_COLOR, "fill-opacity": 0.6 },
  });
  map.addLayer({
    id: "wx-isobars",
    type: "line",
    source: "wx-isobars",
    paint: { "line-color": WX_ISOBAR_COLOR, "line-width": 1, "line-opacity": 0.8 },
  });
  map.addLayer({
    id: "wx-isobar-labels",
    type: "symbol",
    source: "wx-isobar-labels",
    layout: {
      "text-field": ["get", "label"],
      "text-size": 10,
      "text-allow-overlap": false,
      "text-padding": 4,
    },
    paint: { "text-color": "#eef4fb", "text-halo-color": "#0b1626", "text-halo-width": 1.2 },
  });
  map.addLayer({
    id: "wx-waves",
    type: "line",
    source: "wx-waves",
    paint: { "line-color": WX_WAVE_COLOR, "line-width": WX_WAVE_WIDTH, "line-opacity": 0.9 },
  });
}

export function clearWeather(map: MlMap): void {
  for (const id of WX_LAYER_IDS) setData(map, id, []);
}

// Repinta el mes: reemplaza la data de las cinco capas con las celdas de mar
// visibles en la vista actual, muestreadas según el zoom.
export function updateWeather(map: MlMap, clim: ClimMonth, _month = 0): void {
  const stride = weatherStride(map.getZoom());
  const b = map.getBounds();
  const west = b.getWest();
  const east = b.getEast();
  const south = b.getSouth();
  const north = b.getNorth();

  const field: object[] = [];
  const arrows: object[] = [];
  const dots: object[] = [];
  const current: object[] = [];
  const cyclone: object[] = [];
  const ice: object[] = [];

  const [nx, ny] = clim.grid;
  const [ox, oy] = clim.origin;
  const half = stride / 2;

  for (let i = 0; i < ny; i += stride) {
    const lat = oy + i;
    if (lat + half < south || lat - half > north) continue;
    for (let j = 0; j < nx; j += stride) {
      const lon = ox + j;
      if (!lonInBounds(lon, west, east, half)) continue;
      const cell = getCell(clim, lat, lon);
      if (cell === null) continue;

      const box = boxRing(lon, lat, half);
      field.push(polygonFeature(box, { ws: round1(cell.ws) }));

      const mag = Math.hypot(cell.wu, cell.wv);
      if (mag > 0.05) {
        const len = stride * clamp(0.2 + cell.ws / 60, 0.25, 1.1);
        const tip: [number, number] = [lon + (cell.wu / mag) * len, lat + (cell.wv / mag) * len];
        const props = { ws: round1(cell.ws), st: Math.round(cell.st) };
        arrows.push(segmentFeature([lon, lat], tip, props));
        dots.push(pointFeature(tip, props));
      }

      const cmag = Math.hypot(cell.cu, cell.cv);
      if (cmag >= 0.15) {
        const len = stride * clamp(0.2 + cmag * 0.7, 0.25, 1.3);
        const tip: [number, number] = [lon + (cell.cu / cmag) * len, lat + (cell.cv / cmag) * len];
        current.push(segmentFeature([lon, lat], tip, { mag: round2(cmag) }));
      }

      if (cell.tc >= 1) cyclone.push(polygonFeature(box, { tc: round1(cell.tc) }));
      if (cell.ice >= 15) ice.push(polygonFeature(box, { ice: Math.round(cell.ice) }));
    }
  }

  setData(map, "wx-field", field);
  setData(map, "wx-arrows", arrows);
  setData(map, "wx-arrows-dot", dots);
  setData(map, "wx-current", current);
  setData(map, "wx-cyclone", cyclone);
  setData(map, "wx-ice", ice);
  // Las del pronóstico quedan apagadas en modo pilot chart.
  setData(map, "wx-isobars", []);
  setData(map, "wx-isobar-labels", []);
  setData(map, "wx-waves", []);

  // Refuerza las propiedades que dependen de la data (por si el estilo se recargó).
  map.setPaintProperty("wx-field", "fill-color", WX_FIELD_COLOR);
  map.setPaintProperty("wx-field", "fill-opacity", 0.35);
  map.setPaintProperty("wx-arrows", "line-color", WX_FIELD_COLOR);
  map.setPaintProperty("wx-arrows", "line-width", WX_ARROW_WIDTH);
  map.setPaintProperty("wx-arrows", "line-opacity", WX_ARROW_OPACITY);
  map.setPaintProperty("wx-arrows-dot", "circle-color", WX_FIELD_COLOR);
  map.setPaintProperty("wx-current", "line-color", WX_CURRENT_COLOR);
  map.setPaintProperty("wx-cyclone", "fill-opacity", WX_CYCLONE_OPACITY);
  map.setPaintProperty("wx-ice", "fill-color", WX_ICE_COLOR);
}

// ----------------------------------------------------- pronóstico E13.2

export const SLIDER_SLOTS = Math.floor((16 * 24) / 3); // 16 días a 3 h

const DAY_ABBR = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// Hora (ms epoch) del paso `index` del deslizador, alineada con el paquete.
export function slotTime(pkg: ForecastPackage, index: number): number {
  const base = pkg.times[0] ?? pkg.fetchedAt;
  return base + index * pkg.stepHours * 3600_000;
}

// Paso más cercano a "ahora" (botón del deslizador).
export function nearestSlot(pkg: ForecastPackage, nowMs: number): number {
  const base = pkg.times[0] ?? pkg.fetchedAt;
  const i = Math.round((nowMs - base) / (pkg.stepHours * 3600_000));
  return Math.max(0, Math.min(SLIDER_SLOTS - 1, i));
}

// "mié 14 · 15:00 UTC".
export function hourLabel(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DAY_ABBR[d.getUTCDay()]} ${d.getUTCDate()} · ${hh}:${mm} UTC`;
}

// Índice del paso del paquete más cercano a la hora pedida.
export function nearestForecastIndex(pkg: ForecastPackage, ms: number): number {
  const base = pkg.times[0] ?? pkg.fetchedAt;
  const last = pkg.times.length - 1;
  const i = Math.round((ms - base) / (pkg.stepHours * 3600_000));
  return Math.max(0, Math.min(last, i));
}

// Isobaras cada 4 hPa (marching squares con interpolación lineal en los bordes
// de cada celda de la grilla de presión). Devuelve las líneas; `isobarLabels`
// devuelve los puntos con el número en hPa para la capa de símbolos.
export function isobars(pkg: ForecastPackage, index: number): object[] {
  return marchIsobars(pkg, index).lines;
}

export function isobarLabels(pkg: ForecastPackage, index: number): object[] {
  return marchIsobars(pkg, index).labels;
}

function marchIsobars(pkg: ForecastPackage, index: number): { lines: object[]; labels: object[] } {
  const { cols, rows, bbox } = pkg;
  const step = pkg.times.length;
  const lines: object[] = [];
  const labels: object[] = [];
  if (cols < 2 || rows < 2 || step === 0) return { lines, labels };
  const at = (c: number, r: number): number => {
    const raw = pkg.vars.pressure[(r * cols + c) * step + index] ?? FORECAST_MISSING;
    const v = decodeForecast(raw);
    return v === null ? NaN : v;
  };
  const dx = (bbox[2] - bbox[0]) / (cols - 1);
  const dy = (bbox[3] - bbox[1]) / (rows - 1);
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v00 = at(c, r);
      const v10 = at(c + 1, r);
      const v01 = at(c, r + 1);
      const v11 = at(c + 1, r + 1);
      if (Number.isNaN(v00) || Number.isNaN(v10) || Number.isNaN(v01) || Number.isNaN(v11)) continue;
      const lo = Math.min(v00, v10, v01, v11);
      const hi = Math.max(v00, v10, v01, v11);
      const x0 = bbox[0] + c * dx;
      const y0 = bbox[1] + r * dy;
      for (
        let L = Math.ceil(lo / WX_ISOBAR_INTERVAL) * WX_ISOBAR_INTERVAL;
        L <= hi;
        L += WX_ISOBAR_INTERVAL
      ) {
        if (L === 0) continue;
        const pts: [number, number][] = [];
        if ((v00 - L) * (v10 - L) < 0) pts.push([x0 + ((L - v00) / (v10 - v00)) * dx, y0]);
        if ((v10 - L) * (v11 - L) < 0) pts.push([x0 + dx, y0 + ((L - v10) / (v11 - v10)) * dy]);
        if ((v01 - L) * (v11 - L) < 0) pts.push([x0 + ((L - v01) / (v11 - v01)) * dx, y0 + dy]);
        if ((v00 - L) * (v01 - L) < 0) pts.push([x0, y0 + ((L - v01) / (v01 - v00)) * dy]);
        if (pts.length >= 2) lines.push(segmentFeature(pts[0]!, pts[1]!, { hpa: L }));
        if (pts.length === 4) lines.push(segmentFeature(pts[2]!, pts[3]!, { hpa: L }));
        // Una etiqueta (el número en hPa) cada tanto; la colisión de MapLibre
        // descarta las que se solapan, así queda legible a cualquier zoom.
        if (pts.length >= 2 && (c + r) % 6 === 0) {
          const a = pts[0]!;
          const b = pts[1]!;
          labels.push(pointFeature([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { label: String(L) }));
        }
      }
    }
  }
  return { lines, labels };
}

// Flechas de ola: la dirección del API es de dónde vienen, así que la flecha
// apunta hacia donde van; el largo es proporcional a la altura.
export function waveArrows(pkg: ForecastPackage, index: number, stride = 1): object[] {
  const { cols, rows, bbox } = pkg;
  const step = pkg.times.length;
  if (step === 0) return [];
  const dh = pkg.vars.wave_height;
  const dd = pkg.vars.wave_direction;
  const dx = cols > 1 ? (bbox[2] - bbox[0]) / (cols - 1) : 0;
  const dy = rows > 1 ? (bbox[3] - bbox[1]) / (rows - 1) : 0;
  const s = Math.max(1, Math.round(stride));
  const features: object[] = [];
  for (let r = 0; r < rows; r += s) {
    for (let c = 0; c < cols; c += s) {
      const p = (r * cols + c) * step + index;
      const h = decodeForecast(dh[p] ?? FORECAST_MISSING);
      const dirRaw = decodeForecast(dd[p] ?? FORECAST_MISSING);
      if (h === null || dirRaw === null || h < 0.3) continue;
      const to = ((dirRaw + 180) * Math.PI) / 180;
      const len = clamp(0.4 + h * 0.6, 0.5, 3);
      const lon = bbox[0] + c * dx;
      const lat = bbox[1] + r * dy;
      features.push(
        segmentFeature(
          [round2(lon - Math.sin(to) * len * 0.5), round2(lat - Math.cos(to) * len * 0.5)],
          [round2(lon + Math.sin(to) * len * 0.5), round2(lat + Math.cos(to) * len * 0.5)],
          { h: round1(h), dir: Math.round(dirRaw) },
        ),
      );
    }
  }
  return features;
}

// Olas del mes (climatología) para el empalme más allá del horizonte: sin
// dirección (la climatología no la guarda), color por altura.
function climateWaves(map: MlMap, clim: ClimMonth): object[] {
  const stride = weatherStride(map.getZoom());
  const b = map.getBounds();
  const west = b.getWest();
  const east = b.getEast();
  const south = b.getSouth();
  const north = b.getNorth();
  const [nx, ny] = clim.grid;
  const [ox, oy] = clim.origin;
  const half = stride / 2;
  const out: object[] = [];
  for (let i = 0; i < ny; i += stride) {
    const lat = oy + i;
    if (lat + half < south || lat - half > north) continue;
    for (let j = 0; j < nx; j += stride) {
      const lon = ox + j;
      if (!lonInBounds(lon, west, east, half)) continue;
      const cell = getCell(clim, lat, lon);
      if (!cell || cell.hs <= 0) continue;
      out.push(polygonFeature(boxRing(lon, lat, half), { h: round1(cell.hs) }));
    }
  }
  return out;
}

// Repinta el pronóstico para la hora pedida. Devuelve true si la hora ya está
// fuera del horizonte del paquete y se usó la climatología del mes.
export function updateForecastWeather(
  map: MlMap,
  clim: ClimMonth | null,
  pkg: ForecastPackage,
  timeMs: number,
): boolean {
  for (const id of ["wx-field", "wx-arrows", "wx-arrows-dot", "wx-current", "wx-cyclone", "wx-ice"]) {
    setData(map, id, []);
  }
  if (timeMs > forecastLastTime(pkg)) {
    setData(map, "wx-isobars", []);
    setData(map, "wx-isobar-labels", []);
    setData(map, "wx-waves", clim ? climateWaves(map, clim) : []);
    return true;
  }
  const index = nearestForecastIndex(pkg, timeMs);
  setData(map, "wx-isobars", isobars(pkg, index));
  setData(map, "wx-isobar-labels", isobarLabels(pkg, index));
  setData(map, "wx-waves", waveArrows(pkg, index, weatherStride(map.getZoom())));
  map.setPaintProperty("wx-isobars", "line-color", WX_ISOBAR_COLOR);
  map.setPaintProperty("wx-waves", "line-color", WX_WAVE_COLOR);
  map.setPaintProperty("wx-waves", "line-width", WX_WAVE_WIDTH);
  return false;
}

// ------------------------------------------------------- resumen de ruta

export interface RouteWindSummary {
  ws: number;
  dirDeg: number;
  dirLabel: string;
  st: number;
  currentKn: number;
  currentFwd: boolean;
  tc: number;
  risk: "bajo" | "moderado" | "alto";
}

const COMPASS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

export function compassPoint(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return COMPASS[Math.round(d / 22.5) % 16]!;
}

// "Viento medio en ruta" (ADR §6): promedia la climatología a lo largo del
// trazado (muestreo cada 60 nm). Dirección e intensidad del viento medio,
// constancia, componente de la corriente a favor/en contra y riesgo ciclónico.
export function summarizeRoute(clim: ClimMonth, route: ClimLineString): RouteWindSummary | null {
  const samples = sampleAlongRoute(clim, route, 60);
  if (samples.length === 0) return null;

  let su = 0;
  let sv = 0;
  let ws = 0;
  let st = 0;
  let cu = 0;
  let cv = 0;
  let tc = 0;
  for (const s of samples) {
    su += s.cell.wu;
    sv += s.cell.wv;
    ws += s.cell.ws;
    st += s.cell.st;
    cu += s.cell.cu;
    cv += s.cell.cv;
    tc = Math.max(tc, s.cell.tc);
  }
  const n = samples.length;
  const mu = su / n;
  const mv = sv / n;
  const dirDeg = ((Math.atan2(-mu, -mv) * 180) / Math.PI + 360) % 360;

  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const brg = (initialBearingDeg(first.lat, first.lon, last.lat, last.lon) * Math.PI) / 180;
  const fwd = (cu / n) * Math.sin(brg) + (cv / n) * Math.cos(brg);

  return {
    ws: ws / n,
    dirDeg,
    dirLabel: compassPoint(dirDeg),
    st: st / n,
    currentKn: Math.hypot(cu / n, cv / n),
    currentFwd: fwd >= 0,
    tc,
    risk: tc >= 3 ? "alto" : tc >= 1 ? "moderado" : "bajo",
  };
}

// --------------------------------------------------------------- internos

function addHatch(map: MlMap): void {
  if (typeof document === "undefined") return;
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.strokeStyle = WX_CYCLONE_COLOR;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-2, size + 2);
  ctx.lineTo(size + 2, -2);
  ctx.moveTo(-2, size * 2 + 2);
  ctx.lineTo(size * 2 + 2, -2);
  ctx.stroke();
  try {
    map.addImage(HATCH_ID, ctx.getImageData(0, 0, size, size));
  } catch {
    /* la imagen ya estaba registrada */
  }
}

function setData(map: MlMap, id: string, features: object[]): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  src?.setData({ type: "FeatureCollection", features } as never);
}

function lonInBounds(lon: number, west: number, east: number, margin: number): boolean {
  if (west <= east) return lon >= west - margin && lon <= east + margin;
  return lon >= west - margin || lon <= east + margin;
}

function boxRing(lon: number, lat: number, half: number): [number, number][] {
  return [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ];
}

function polygonFeature(ring: [number, number][], props: Record<string, unknown>): object {
  return { type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ring] } };
}

function segmentFeature(a: [number, number], b: [number, number], props: Record<string, unknown>): object {
  return { type: "Feature", properties: props, geometry: { type: "LineString", coordinates: [a, b] } };
}

function pointFeature(p: [number, number], props: Record<string, unknown>): object {
  return { type: "Feature", properties: props, geometry: { type: "Point", coordinates: p } };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
