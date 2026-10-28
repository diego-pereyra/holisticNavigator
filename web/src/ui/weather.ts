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

// E13.5 — Viento y corriente como líneas de flujo ("ríos"), no flechas por
// celda. La rejilla de siembra va en PÍXELES de pantalla, así a cualquier zoom
// el trazo tiene el mismo aire. Dos idiomas: el viento fino y multicolor, la
// corriente gruesa y de un solo azul, por debajo.
// E13.6 — Viento y corriente como flechitas discretas: espaciado por píxeles.
export const WX_WIND_SPACING_PX = 80;
export const WX_CURRENT_SPACING_PX = 120;
export const WX_WAVE_SPACING_PX = 100;
// Umbrales: las calmas no se dibujan.
export const WX_WIND_MIN_KN = 2;
export const WX_CURRENT_MIN_KN = 0.5;
// Largo FIJO del segmento (en grados): el color dice la intensidad, no el largo.
export const WX_WIND_LEN_DEG = 0.4;
export const WX_CURRENT_LEN_DEG = 0.35;

// E13.6 — Viento fino: 1,25 px fijos, color por la rampa y opacidad por la
// constancia de la pilot chart (0,15→0,95); en pronóstico queda firme (0,85).
export const WX_WIND_LINE_WIDTH = 1.25;
export const WX_WIND_LINE_OPACITY: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "st"],
  0,
  0.15,
  50,
  0.5,
  100,
  0.85,
];
// E13.6 — flechas finas de ancho fijo (ya no escalan con la fuerza).
export const WX_ARROW_WIDTH = WX_WIND_LINE_WIDTH;
export const WX_ARROW_OPACITY = WX_WIND_LINE_OPACITY;

export const WX_CURRENT_COLOR = "#2e9bff";
// E13.6 — Corriente también fina y sólida (el dash a tamaño chico era ruido).
export const WX_CURRENT_WIDTH = WX_WIND_LINE_WIDTH;
export const WX_CURRENT_OPACITY = 0.8;

// E13.6 — Punta de flecha: triángulo con el ápice en el extremo del vector y las
// dos alas atrás, perpendiculares a la dirección. Cabeza chica (~15 % del largo)
// para no engordar la flechita.
export const WX_HEAD_BACK = 0.16;
export const WX_HEAD_HALF = 0.1;

// E13.7 — La punta es la misma para viento, corriente y olas; cambia la
// proporción (`back` = avance de las alas sobre el largo, `half` = media
// separación entre alas) y un tope absoluto en grados, para que una corriente no
// salga como un cometa sobre un tramo largo.
export interface HeadShape {
  back: number;
  half: number;
  maxDeg: number;
}

export const WX_HEAD_WIND: HeadShape = { back: WX_HEAD_BACK, half: WX_HEAD_HALF, maxDeg: Infinity };
// Corriente: punta más chica todavía, discreta.
export const WX_HEAD_CURRENT: HeadShape = { back: 0.12, half: 0.08, maxDeg: 0.3 };
// Olas: punta intermedia, mismo tope absoluto.
export const WX_HEAD_WAVE: HeadShape = { back: 0.14, half: 0.09, maxDeg: 0.3 };


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
export const WX_ISOBAR_COLOR = "#9FB0C0";
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

// Fuentes/líneas del pilot chart y del pronóstico, más las capas auxiliares
// (punta de flecha y etiqueta de las isobaras) que comparten sus claves.
export const WX_LAYER_IDS = [
  "wx-field",
  "wx-current",
  "wx-current-head",
  "wx-arrows",
  "wx-arrows-head",
  "wx-cyclone",
  "wx-ice",
  "wx-isobars",
  "wx-isobar-labels",
  "wx-waves",
  "wx-waves-head",
] as const;

// E13.3 — Selector de capas. Siete interruptores persisten en `hn.settings.wxLayers`.
// `wind` enciende las líneas de flujo del viento (wx-arrows + su punta); `windField`
// (E13.5) el tinte de fondo (wx-field), apagado por defecto para no tapar el mapa.
export type WxLayerKey = "wind" | "windField" | "current" | "waves" | "isobars" | "cyclone" | "ice";

export type WxLayers = Record<WxLayerKey, boolean>;

export const WX_LAYERS: { key: WxLayerKey; label: string }[] = [
  { key: "wind", label: "Viento" },
  { key: "windField", label: "Fondo de viento" },
  { key: "current", label: "Corrientes" },
  { key: "waves", label: "Olas" },
  { key: "isobars", label: "Isobaras" },
  { key: "cyclone", label: "Ciclones" },
  { key: "ice", label: "Hielo" },
];

// Por defecto Viento y Corrientes encendidos; el fondo de viento y el resto,
// apagado.
export function defaultWxLayers(): WxLayers {
  return {
    wind: true,
    windField: false,
    current: true,
    waves: false,
    isobars: false,
    cyclone: false,
    ice: false,
  };
}

// Capas del mapa que enciende cada interruptor (los símbolos de isobara y la
// punta de las flechas comparten fuente con su capa de línea).
const WX_LAYER_TO_IDS: Record<WxLayerKey, string[]> = {
  wind: ["wx-arrows", "wx-arrows-head"],
  windField: ["wx-field"],
  current: ["wx-current", "wx-current-head"],
  waves: ["wx-waves", "wx-waves-head"],
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
    paint: { "fill-color": WX_FIELD_COLOR, "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: "wx-current",
    type: "line",
    source: "wx-current",
    minzoom: 3,
    paint: {
      "line-color": WX_CURRENT_COLOR,
      "line-width": WX_CURRENT_WIDTH,
      "line-opacity": WX_CURRENT_OPACITY,
    },
  });
  map.addLayer({
    id: "wx-current-head",
    type: "fill",
    source: "wx-current-head",
    minzoom: 3,
    paint: { "fill-color": WX_CURRENT_COLOR, "fill-opacity": WX_CURRENT_OPACITY },
  });
  map.addLayer({
    id: "wx-arrows",
    type: "line",
    source: "wx-arrows",
    paint: { "line-color": WX_FIELD_COLOR, "line-width": WX_ARROW_WIDTH, "line-opacity": WX_ARROW_OPACITY },
  });
  map.addLayer({
    id: "wx-arrows-head",
    type: "fill",
    source: "wx-arrows-head",
    paint: { "fill-color": WX_FIELD_COLOR, "fill-opacity": WX_ARROW_OPACITY },
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
    paint: { "line-color": WX_ISOBAR_COLOR, "line-width": 0.75, "line-opacity": 0.55 },
  });
  map.addLayer({
    id: "wx-isobar-labels",
    type: "symbol",
    source: "wx-isobar-labels",
    layout: {
      "text-field": ["get", "label"],
      "text-size": 9,
      "text-allow-overlap": false,
      "text-padding": 4,
    },
    paint: { "text-color": "#9FB0C0", "text-halo-color": "#0b1626", "text-halo-width": 1.2 },
  });
  map.addLayer({
    id: "wx-waves",
    type: "line",
    source: "wx-waves",
    paint: { "line-color": WX_WAVE_COLOR, "line-width": WX_WAVE_WIDTH, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "wx-waves-head",
    type: "fill",
    source: "wx-waves-head",
    paint: { "fill-color": WX_WAVE_COLOR, "fill-opacity": 0.9 },
  });
}

export function clearWeather(map: MlMap): void {
  for (const id of WX_LAYER_IDS) setData(map, id, []);
}

// Repinta el mes: reemplaza la data de las capas con las celdas de mar visibles.
export function updateWeather(map: MlMap, clim: ClimMonth, _month = 0): void {
  const areaStride = weatherStride(map.getZoom());
  const wS = climateSamples(map, clim, pxStride(map, 1, WX_WIND_SPACING_PX));
  const cS = climateSamples(map, clim, pxStride(map, 1, WX_CURRENT_SPACING_PX));
  const aS = climateSamples(map, clim, areaStride);
  applyWindLayers(map, buildWeatherFeatures(aS, areaStride, wS, cS));
  // Las del pronóstico quedan apagadas en modo pilot chart.
  setData(map, "wx-isobars", []);
  setData(map, "wx-isobar-labels", []);
  setData(map, "wx-waves", []);
  setData(map, "wx-waves-head", []);
  paintWindLayers(map);
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
// de cada celda de la grilla de presión). Los tramos de cada nivel se cosen en
// polilíneas contiguas; `isobarLabels` devuelve una etiqueta hPa por polilínea.
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
  // Tramos por nivel; luego se cosen en polilíneas contiguas.
  const byLevel = new Map<number, [Pt, Pt][]>();
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
        // Cruce sobre los cuatro bordes: arriba, derecha, abajo, izquierda.
        const e: (Pt | null)[] = [null, null, null, null];
        if ((v00 - L) * (v10 - L) < 0) e[0] = [x0 + ((L - v00) / (v10 - v00)) * dx, y0];
        if ((v10 - L) * (v11 - L) < 0) e[1] = [x0 + dx, y0 + ((L - v10) / (v11 - v10)) * dy];
        if ((v01 - L) * (v11 - L) < 0) e[2] = [x0 + ((L - v01) / (v11 - v01)) * dx, y0 + dy];
        if ((v00 - L) * (v01 - L) < 0) e[3] = [x0, y0 + ((L - v00) / (v01 - v00)) * dy];
        if (!e[0] && !e[1] && !e[2] && !e[3]) continue;
        const list = byLevel.get(L) ?? [];
        byLevel.set(L, list);
        if (e[0] && e[1] && e[2] && e[3]) {
          // Silla: dos diagonales opuestas cruzan el nivel. El signo de v00 decide
          // qué pares se unen, así no se descarta ningún punto.
          if (v00 > L) list.push([e[0], e[3]], [e[1], e[2]]);
          else list.push([e[0], e[1]], [e[2], e[3]]);
        } else {
          const pts = e.filter((p): p is Pt => p !== null);
          if (pts.length === 2) list.push([pts[0]!, pts[1]!]);
        }
      }
    }
  }
  for (const [L, segs] of byLevel) {
    for (const poly of stitchSegments(segs)) {
      if (poly.length < 2) continue;
      lines.push(lineFeature(poly, { hpa: L }));
      const mid = midpointOf(poly);
      if (mid) labels.push(pointFeature(mid, { label: String(L) }));
    }
  }
  return { lines, labels };
}

// Flechas de ola: la dirección del API es de dónde vienen, así que la flecha
// apunta hacia donde van; el largo es proporcional a la altura. El vector y su
// punta salen del mismo cálculo, así la punta cae justo en el extremo de la raya.
interface WaveVector {
  tail: Pt;
  tip: Pt;
  dirX: number;
  dirY: number;
  len: number;
  props: Record<string, unknown>;
}

function waveVectors(pkg: ForecastPackage, index: number, stride: number): WaveVector[] {
  const { cols, rows, bbox } = pkg;
  const step = pkg.times.length;
  if (step === 0) return [];
  const dh = pkg.vars.wave_height;
  const dd = pkg.vars.wave_direction;
  const dx = cols > 1 ? (bbox[2] - bbox[0]) / (cols - 1) : 0;
  const dy = rows > 1 ? (bbox[3] - bbox[1]) / (rows - 1) : 0;
  const s = Math.max(1, Math.round(stride));
  const out: WaveVector[] = [];
  for (let r = 0; r < rows; r += s) {
    for (let c = 0; c < cols; c += s) {
      const p = (r * cols + c) * step + index;
      const h = decodeForecast(dh[p] ?? FORECAST_MISSING);
      const dirRaw = decodeForecast(dd[p] ?? FORECAST_MISSING);
      if (h === null || dirRaw === null || h < 0.3) continue;
      const to = ((dirRaw + 180) * Math.PI) / 180;
      const raw = clamp(0.4 + h * 0.6, 0.5, 3);
      const lon = bbox[0] + c * dx;
      const lat = bbox[1] + r * dy;
      const tail: Pt = [round2(lon - Math.sin(to) * raw * 0.5), round2(lat - Math.cos(to) * raw * 0.5)];
      const tip: Pt = [round2(lon + Math.sin(to) * raw * 0.5), round2(lat + Math.cos(to) * raw * 0.5)];
      const vx = tip[0] - tail[0];
      const vy = tip[1] - tail[1];
      const d = Math.hypot(vx, vy);
      out.push({
        tail,
        tip,
        dirX: d > 0 ? vx / d : Math.sin(to),
        dirY: d > 0 ? vy / d : Math.cos(to),
        len: d,
        props: { h: round1(h), dir: Math.round(dirRaw) },
      });
    }
  }
  return out;
}

export function waveArrows(pkg: ForecastPackage, index: number, stride = 1): object[] {
  return waveVectors(pkg, index, stride).map((v) => segmentFeature(v.tail, v.tip, v.props));
}

// Punta de las olas: mismo sentido que la flecha, color por altura.
export function waveHeads(pkg: ForecastPackage, index: number, stride = 1): object[] {
  return waveVectors(pkg, index, stride).map((v) =>
    headFeature(v.tip, v.dirX, v.dirY, v.len, v.props, WX_HEAD_WAVE),
  );
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
  const areaStride = weatherStride(map.getZoom());
  if (timeMs > forecastLastTime(pkg)) {
    // Fuera del horizonte: viento y corriente desde la climatología del mes.
    const wS = clim ? climateSamples(map, clim, pxStride(map, 1, WX_WIND_SPACING_PX)) : [];
    const cS = clim ? climateSamples(map, clim, pxStride(map, 1, WX_CURRENT_SPACING_PX)) : [];
    const aS = clim ? climateSamples(map, clim, areaStride) : [];
    applyWindLayers(map, clim ? buildWeatherFeatures(aS, areaStride, wS, cS) : EMPTY_CELL_ARROWS);
    setData(map, "wx-isobars", []);
    setData(map, "wx-isobar-labels", []);
    setData(map, "wx-waves", clim ? climateWaves(map, clim) : []);
    // La climatología no guarda dirección de ola: no hay punta que poner.
    setData(map, "wx-waves-head", []);
    return true;
  }

  const index = nearestForecastIndex(pkg, timeMs);
  const cellDeg = pkg.cols > 1 ? Math.abs(pkg.bbox[2] - pkg.bbox[0]) / (pkg.cols - 1) : 0.5;
  const waveStride = pxStride(map, cellDeg, WX_WAVE_SPACING_PX);
  const wS = forecastWindSamples(pkg, index, pxStride(map, cellDeg, WX_WIND_SPACING_PX));
  const cS = forecastWindSamples(pkg, index, pxStride(map, cellDeg, WX_CURRENT_SPACING_PX));
  const aS = forecastWindSamples(pkg, index, areaStride);
  applyWindLayers(map, buildWeatherFeatures(aS, areaStride, wS, cS));
  setData(map, "wx-isobars", isobars(pkg, index));
  setData(map, "wx-isobar-labels", isobarLabels(pkg, index));
  setData(map, "wx-waves", waveArrows(pkg, index, waveStride));
  setData(map, "wx-waves-head", waveHeads(pkg, index, waveStride));
  paintWindLayers(map);
  map.setPaintProperty("wx-isobars", "line-color", WX_ISOBAR_COLOR);
  map.setPaintProperty("wx-waves", "line-color", WX_WAVE_COLOR);
  map.setPaintProperty("wx-waves", "line-width", WX_WAVE_WIDTH);
  map.setPaintProperty("wx-waves-head", "fill-color", WX_WAVE_COLOR);
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

type Pt = [number, number];

// Muestra de una celda: fondo (tinte), viento, corriente, ciclón e hielo.
// `dirX/dirY` y `cdirX/cdirY` son vectores unitarios hacia donde VA el flujo;
// `wmag`/`cmag` son las magnitudes (para no dibujar calmas).
interface WxSample {
  lon: number;
  lat: number;
  ws: number;
  st: number;
  wmag: number;
  dirX: number;
  dirY: number;
  cmag: number;
  cdirX: number;
  cdirY: number;
  tc: number;
  ice: number;
}

interface CellFeatures {
  field: object[];
  cyclone: object[];
  ice: object[];
}

interface ArrowFeatures {
  wind: object[];
  windHeads: object[];
  current: object[];
  currentHeads: object[];
}

const EMPTY_CELL_ARROWS: CellFeatures & ArrowFeatures = {
  field: [],
  cyclone: [],
  ice: [],
  wind: [],
  windHeads: [],
  current: [],
  currentHeads: [],
};

// Grados de longitud por píxel de pantalla: traduce el espaciado en píxeles a
// grados. Se toma de los límites visibles y el ancho del canvas; si el mapa
// todavía no tiene canvas, se cae a 1024 px.
function degPerPx(map: MlMap): number {
  const b = map.getBounds();
  const spanDeg = Math.abs(b.getEast() - b.getWest());
  const canvas = (map as unknown as { getCanvas?: () => { clientWidth?: number; width?: number } })
    .getCanvas?.();
  const px = canvas?.clientWidth || canvas?.width || 1024;
  return spanDeg > 0 ? spanDeg / px : 0.05;
}

// E13.6 — flechitas discretas: celdas muestreadas cada `spacingPx` de pantalla
// (viento ~80 px, corriente ~120 px). A cualquier zoom cae la misma cantidad.
function pxStride(map: MlMap, cellDeg: number, spacingPx: number): number {
  if (cellDeg <= 0) return 1;
  return Math.max(1, Math.round((spacingPx * degPerPx(map)) / cellDeg));
}

// Celdas de fondo/ciclón/hielo (desde `area`), flechas de viento (desde `wind`)
// y rayas de corriente (desde `current`). Cada capa tiene su propio espaciado en
// píxeles, así que se muestrean por separado. La flecha y la raya llevan su punta
// (triángulo) en el extremo.
function buildWeatherFeatures(
  area: WxSample[],
  areaStride: number,
  wind: WxSample[],
  current: WxSample[],
): CellFeatures & ArrowFeatures {
  const field: object[] = [];
  const windLines: object[] = [];
  const windHeads: object[] = [];
  const currentLines: object[] = [];
  const currentHeads: object[] = [];
  const cyclone: object[] = [];
  const ice: object[] = [];
  const half = areaStride / 2;
  for (const s of area) {
    const box = boxRing(s.lon, s.lat, half);
    field.push(polygonFeature(box, { ws: round1(s.ws) }));
    if (s.tc >= 1) cyclone.push(polygonFeature(box, { tc: round1(s.tc) }));
    if (s.ice >= 15) ice.push(polygonFeature(box, { ice: Math.round(s.ice) }));
  }
  for (const s of wind) {
    if (s.wmag < WX_WIND_MIN_KN) continue; // calma
    const len = WX_WIND_LEN_DEG; // largo FIJO: el color dice la intensidad
    const tip: Pt = [s.lon + s.dirX * len, s.lat + s.dirY * len];
    const props = { ws: round1(s.ws), st: Math.round(s.st) };
    windLines.push(segmentFeature([s.lon, s.lat], tip, props));
    windHeads.push(headFeature(tip, s.dirX, s.dirY, len, props, WX_HEAD_WIND));
  }
  for (const s of current) {
    if (s.cmag < WX_CURRENT_MIN_KN) continue; // calma
    const len = WX_CURRENT_LEN_DEG;
    const tip: Pt = [s.lon + s.cdirX * len, s.lat + s.cdirY * len];
    const props = { mag: round2(s.cmag) };
    currentLines.push(segmentFeature([s.lon, s.lat], tip, props));
    currentHeads.push(headFeature(tip, s.cdirX, s.cdirY, len, props, WX_HEAD_CURRENT));
  }
  return {
    field,
    cyclone,
    ice,
    wind: windLines,
    windHeads,
    current: currentLines,
    currentHeads,
  };
}

function applyWindLayers(map: MlMap, f: CellFeatures & ArrowFeatures): void {
  setData(map, "wx-field", f.field);
  setData(map, "wx-arrows", f.wind);
  setData(map, "wx-arrows-head", f.windHeads);
  setData(map, "wx-current", f.current);
  setData(map, "wx-current-head", f.currentHeads);
  setData(map, "wx-cyclone", f.cyclone);
  setData(map, "wx-ice", f.ice);
}

// Refuerza las propiedades que dependen de la data (por si el estilo se recargó).
function paintWindLayers(map: MlMap): void {
  map.setPaintProperty("wx-field", "fill-color", WX_FIELD_COLOR);
  map.setPaintProperty("wx-field", "fill-opacity", 0.15);
  map.setPaintProperty("wx-arrows", "line-color", WX_FIELD_COLOR);
  map.setPaintProperty("wx-arrows", "line-width", WX_ARROW_WIDTH);
  map.setPaintProperty("wx-arrows", "line-opacity", WX_ARROW_OPACITY);
  map.setPaintProperty("wx-arrows-head", "fill-color", WX_FIELD_COLOR);
  map.setPaintProperty("wx-arrows-head", "fill-opacity", WX_ARROW_OPACITY);
  map.setPaintProperty("wx-current", "line-color", WX_CURRENT_COLOR);
  map.setPaintProperty("wx-current-head", "fill-color", WX_CURRENT_COLOR);
  map.setPaintProperty("wx-current-head", "fill-opacity", 0.95);
  map.setPaintProperty("wx-cyclone", "fill-opacity", WX_CYCLONE_OPACITY);
  map.setPaintProperty("wx-ice", "fill-color", WX_ICE_COLOR);
}

// Celdas de mar visibles en la vista actual, muestreadas cada `stride` celdas
// (la pilot chart tiene celdas de 1°).
function climateSamples(map: MlMap, clim: ClimMonth, stride: number): WxSample[] {
  const b = map.getBounds();
  const west = b.getWest();
  const east = b.getEast();
  const south = b.getSouth();
  const north = b.getNorth();
  const [nx, ny] = clim.grid;
  const [ox, oy] = clim.origin;
  const half = stride / 2;
  const out: WxSample[] = [];
  for (let i = 0; i < ny; i += stride) {
    const lat = oy + i;
    if (lat + half < south || lat - half > north) continue;
    for (let j = 0; j < nx; j += stride) {
      const lon = ox + j;
      if (!lonInBounds(lon, west, east, half)) continue;
      const cell = getCell(clim, lat, lon);
      if (cell === null) continue;
      const wmag = Math.hypot(cell.wu, cell.wv);
      const cmag = Math.hypot(cell.cu, cell.cv);
      out.push({
        lon,
        lat,
        ws: cell.ws,
        st: cell.st,
        wmag,
        dirX: wmag > 0 ? cell.wu / wmag : 0,
        dirY: wmag > 0 ? cell.wv / wmag : 0,
        cmag,
        cdirX: cmag > 0 ? cell.cu / cmag : 0,
        cdirY: cmag > 0 ? cell.cv / cmag : 0,
        tc: cell.tc,
        ice: cell.ice,
      });
    }
  }
  return out;
}

// Viento y corriente del paquete de pronóstico, muestreados cada `stride`
// celdas. La dirección del API es de dónde VIENE el viento, así que la flecha
// apunta hacia donde VA (dir + 180), como en `waveArrows`. `st: 100`.
function forecastWindSamples(pkg: ForecastPackage, index: number, stride: number): WxSample[] {
  const { cols, rows, bbox } = pkg;
  const step = pkg.times.length;
  if (step === 0) return [];
  const dx = cols > 1 ? (bbox[2] - bbox[0]) / (cols - 1) : 0;
  const dy = rows > 1 ? (bbox[3] - bbox[1]) / (rows - 1) : 0;
  const s = Math.max(1, Math.round(stride));
  const out: WxSample[] = [];
  for (let r = 0; r < rows; r += s) {
    for (let c = 0; c < cols; c += s) {
      const p = (r * cols + c) * step + index;
      const speed = decodeForecast(pkg.vars.wind_speed[p] ?? FORECAST_MISSING);
      const dir = decodeForecast(pkg.vars.wind_direction[p] ?? FORECAST_MISSING);
      if (speed === null || dir === null) continue; // sin dato (tierra)
      const to = ((dir + 180) * Math.PI) / 180;
      const cvel = decodeForecast(pkg.vars.current_velocity[p] ?? FORECAST_MISSING);
      const cdir = decodeForecast(pkg.vars.current_direction[p] ?? FORECAST_MISSING);
      const cmag = cvel ?? 0;
      const cAng = ((cdir ?? 0) * Math.PI) / 180;
      out.push({
        lon: bbox[0] + c * dx,
        lat: bbox[1] + r * dy,
        ws: speed,
        st: 100,
        wmag: speed,
        dirX: speed > 0 ? Math.sin(to) : 0,
        dirY: speed > 0 ? Math.cos(to) : 0,
        cmag,
        cdirX: cmag > 0 ? Math.sin(cAng) : 0,
        cdirY: cmag > 0 ? Math.cos(cAng) : 0,
        tc: 0,
        ice: 0,
      });
    }
  }
  return out;
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

// Punta de flecha (E13.6, parametrizada en E13.7): triángulo con el ápice en
// `tip`, hacia donde apunta (dx,dy), y dos alas atrás perpendiculares a la
// dirección. `len` es el largo del vector; `shape` fija cuán atrás van las alas
// y cuánto se separan, con tope absoluto en grados.
function headFeature(
  tip: Pt,
  dx: number,
  dy: number,
  len: number,
  props: Record<string, unknown>,
  shape: HeadShape = WX_HEAD_WIND,
): object {
  const rawBack = len * shape.back;
  const back = Math.min(rawBack, shape.maxDeg);
  const k = rawBack > 0 ? back / rawBack : 0; // 1 salvo que el tope recorte
  const side = len * shape.half * k;
  const bx = tip[0] - dx * back;
  const by = tip[1] - dy * back;
  return polygonFeature(
    [tip, [bx - dy * side, by + dx * side], [bx + dy * side, by - dx * side], tip],
    props,
  );
}

function segmentFeature(a: [number, number], b: [number, number], props: Record<string, unknown>): object {
  return { type: "Feature", properties: props, geometry: { type: "LineString", coordinates: [a, b] } };
}

function lineFeature(coords: Pt[], props: Record<string, unknown>): object {
  return { type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } };
}

// Tolerancia para reconocer que dos extremos son el mismo punto (celdas vecinas
// calculan el cruce con la misma fórmula, así que coinciden salvo ruido de coma
// flotante).
const STITCH_TOL = 1e-4;

// Cose los tramos de un mismo nivel en polilíneas contiguas: une extremos que
// comparten punto (tolerancia STITCH_TOL) y devuelve cada tramo continuo.
function stitchSegments(segments: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt): string => `${Math.round(p[0] / STITCH_TOL)}_${Math.round(p[1] / STITCH_TOL)}`;
  const ends = new Map<string, number[]>();
  segments.forEach((seg, i) => {
    for (const p of seg) {
      const k = key(p);
      const arr = ends.get(k);
      if (arr) arr.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Set<number>();
  const lines: Pt[][] = [];
  const extend = (line: Pt[], front: boolean): void => {
    for (;;) {
      const end = front ? line[0]! : line[line.length - 1]!;
      const cands = ends.get(key(end)) ?? [];
      let next = -1;
      for (const j of cands) {
        if (!used.has(j)) {
          next = j;
          break;
        }
      }
      if (next < 0) return;
      used.add(next);
      const s = segments[next]!;
      const other = key(s[0]) === key(end) ? s[1] : s[0];
      if (front) line.unshift(other);
      else line.push(other);
    }
  };
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const seg = segments[i]!;
    const line: Pt[] = [seg[0], seg[1]];
    extend(line, false);
    extend(line, true);
    if (line.length >= 2) lines.push(line);
  }
  return lines;
}

// Punto medio de una polilínea medido por longitud de arco (para la etiqueta).
function midpointOf(line: Pt[]): Pt | null {
  if (line.length === 0) return null;
  if (line.length === 1) return line[0]!;
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
    lens.push(d);
    total += d;
  }
  if (total === 0) return line[0]!;
  let rem = total / 2;
  for (let i = 0; i < lens.length; i++) {
    if (rem <= lens[i]! || i === lens.length - 1) {
      const t = lens[i]! > 0 ? rem / lens[i]! : 0;
      const a = line[i]!;
      const b = line[i + 1]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    rem -= lens[i]!;
  }
  return line[line.length - 1]!;
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
