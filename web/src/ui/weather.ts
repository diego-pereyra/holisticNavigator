// Pilot charts en la carta (E8.3, ADR-009 §5 y §6): cinco capas `wx-*` que
// dibujan el viento medio, las flechas de viento, las corrientes, los ciclones
// y el hielo del mes de planificación. Los datos vienen de `core/clim.ts`; acá
// solo se arma el GeoJSON y se pintan las capas. El modo Pronóstico (E13)
// reutilizará las mismas capas con otra fuente.

import type { Map as MlMap, GeoJSONSource, ExpressionSpecification } from "maplibre-gl";
import { getCell, sampleAlongRoute, type ClimLineString, type ClimMonth } from "../core/clim.ts";
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
  0.8,
  2,
  2.6,
  4,
  4,
];

export const WX_CYCLONE_COLOR = "#C62828";
export const WX_CYCLONE_OPACITY: ExpressionSpecification = [
  "step",
  ["get", "tc"],
  0.18,
  3,
  0.45,
];

export const WX_ICE_COLOR = "#d7ecf7";

const HATCH_ID = "wx-hatch";

export const WX_LAYER_IDS = ["wx-field", "wx-current", "wx-arrows", "wx-cyclone", "wx-ice"] as const;

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
    paint: { "fill-color": WX_FIELD_COLOR, "fill-opacity": 0.5 },
  });
  map.addLayer({
    id: "wx-current",
    type: "line",
    source: "wx-current",
    minzoom: 3,
    paint: { "line-color": WX_CURRENT_COLOR, "line-width": WX_CURRENT_WIDTH, "line-opacity": 0.85 },
  });
  map.addLayer({
    id: "wx-arrows",
    type: "line",
    source: "wx-arrows",
    paint: { "line-color": "#eef4fb", "line-width": WX_ARROW_WIDTH, "line-opacity": WX_ARROW_OPACITY },
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
    paint: { "fill-color": WX_ICE_COLOR, "fill-opacity": 0.75 },
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
        arrows.push(segmentFeature([lon, lat], tip, { ws: round1(cell.ws), st: Math.round(cell.st) }));
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
  setData(map, "wx-current", current);
  setData(map, "wx-cyclone", cyclone);
  setData(map, "wx-ice", ice);

  // Refuerza las propiedades que dependen de la data (por si el estilo se recargó).
  map.setPaintProperty("wx-field", "fill-color", WX_FIELD_COLOR);
  map.setPaintProperty("wx-arrows", "line-width", WX_ARROW_WIDTH);
  map.setPaintProperty("wx-arrows", "line-opacity", WX_ARROW_OPACITY);
  map.setPaintProperty("wx-current", "line-color", WX_CURRENT_COLOR);
  map.setPaintProperty("wx-cyclone", "fill-opacity", WX_CYCLONE_OPACITY);
  map.setPaintProperty("wx-ice", "fill-color", WX_ICE_COLOR);
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
