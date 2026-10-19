// E13.1 — Paquetes de pronóstico en vivo (Open-Meteo Forecast + Marine API).
//
// Lógica pura (sin DOM ni red): caja con margen, grilla, armado de URLs,
// empaquetado Int16 escala 0,1, edad visible y empalme con climatología.
// La descarga real y el guardado en IndexedDB viven en `platform/forecast.ts`;
// acá la red se inyecta por `hooks.fetchJson` para poder probar sin conexión.

import { formatLat, formatLon } from "./coords.ts";

export type BBox = [number, number, number, number]; // [oeste, sur, este, norte]

// Variables del paquete, tal como se exponen a capas y enrutado.
export const FORECAST_VARS = [
  "wind_speed",
  "wind_direction",
  "wind_gusts",
  "pressure",
  "wave_height",
  "wave_direction",
  "wave_period",
  "current_velocity",
  "current_direction",
] as const;

export type ForecastVar = (typeof FORECAST_VARS)[number];

// Correspondencia con los nombres de Open-Meteo y de qué API sale cada una.
// (Nombres fijos: tabla "Nombres fijos" de docs/04-backlog-ux.md.)
const FORECAST_OM: Record<ForecastVar, { api: "forecast" | "marine"; name: string }> = {
  wind_speed: { api: "forecast", name: "wind_speed_10m" },
  wind_direction: { api: "forecast", name: "wind_direction_10m" },
  wind_gusts: { api: "forecast", name: "wind_gusts_10m" },
  pressure: { api: "forecast", name: "pressure_msl" },
  wave_height: { api: "marine", name: "wave_height" },
  wave_direction: { api: "marine", name: "wave_direction" },
  wave_period: { api: "marine", name: "wave_period" },
  current_velocity: { api: "marine", name: "ocean_current_velocity" },
  current_direction: { api: "marine", name: "ocean_current_direction" },
};

export const FORECAST_SCALE = 10; // Int16 = valor × 10 (escala 0,1)
export const FORECAST_MISSING = -32768; // sentinel: sin dato (tierra)
export const FORECAST_MARGIN_NM = 300;
export const FORECAST_POINTS_MAX = 1500;
export const FORECAST_CHUNK = 200;
export const FORECAST_STEP_HOURS = 3;
export const FORECAST_DAYS = 7;

const FORECAST_DAYS_MAX = 16;
const FORECAST_HOST = "https://api.open-meteo.com/v1/forecast";
const MARINE_HOST = "https://marine-api.open-meteo.com/v1/marine";

export interface ForecastPackage {
  id: string;
  issuedAt: number; // ms epoch: emisión del modelo (o la descarga si no se sabe)
  fetchedAt: number; // ms epoch: cuándo se bajó (base de la edad visible)
  bbox: BBox;
  stepHours: number;
  cols: number;
  rows: number;
  times: number[]; // ms epoch, uno por paso
  vars: Record<ForecastVar, Int16Array>; // largo cols*rows*times.length
}

export interface ForecastPoint {
  lat: number;
  lon: number;
}

export interface ForecastGrid {
  cols: number;
  rows: number;
  points: ForecastPoint[]; // fila por lat (de sur a norte), luego longitud
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function normalizeLon(lon: number): number {
  let x = (((lon + 180) % 360) + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

// Caja de la travesía más los nm de margen (1 nm = 1/60° de latitud; en
// longitud se corrige por el coseno de la latitud media).
export function expandBbox(bbox: BBox, marginNm = FORECAST_MARGIN_NM): BBox {
  const [w, s, e, n] = bbox;
  const dLat = marginNm / 60;
  const midLat = (s + n) / 2;
  const cos = Math.max(0.1, Math.cos((midLat * Math.PI) / 180));
  const dLon = marginNm / 60 / cos;
  return [
    Math.max(-180, w - dLon),
    Math.max(-90, s - dLat),
    Math.min(180, e + dLon),
    Math.min(90, n + dLat),
  ];
}

// Bbox envolvente de un trazado (o de la vista actual del mapa).
export function bboxOfTrack(coords: [number, number][]): BBox | null {
  if (coords.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon);
    s = Math.min(s, lat);
    e = Math.max(e, lon);
    n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

// Bbox de la vista actual del mapa (sin travesía seleccionada).
export function bboxOfBounds(bounds: {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}): BBox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

// --- UX-N.2 (D2): las tres cajas de primera clase --------------------------
// Cada paquete se identifica por una caja con id propio: la del punto
// (`punto-<hash>`), la de la vista (`vista`) o la de una ruta (`<código>`).

export type ForecastKind = "punto" | "vista" | "ruta";

// Hash estable de las coordenadas redondeadas a ~1 nm: el mismo punto reusa su
// paquete en vez de acumular cajas gemelas. FNV-1a, en base 36.
export function forecastIdPoint(lat: number, lon: number): string {
  const s = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `punto-${(h >>> 0).toString(36)}`;
}

export function forecastIdView(): string {
  return "vista";
}

// El id de una ruta es su propio código (canal, variante, ruta propia…).
export function forecastKind(id: string): ForecastKind {
  if (id.startsWith("punto-")) return "punto";
  if (id === "vista") return "vista";
  return "ruta";
}

// UX-N.5b — dueño legible de un paquete: cada pronóstico va atado a su caja.
// La ruta usa su código ("AN12"); un punto se nombra por su vínculo ("Clima acá ·
// coords"); la vista es "Vista". El centro puede faltar (paquete sin coordenadas
// en mano): en ese caso el punto queda como "Clima acá" a secas.
export function forecastOwnerName(id: string, center: { lat: number; lon: number } | null = null): string {
  const kind = forecastKind(id);
  if (kind === "vista") return "Vista";
  if (kind === "punto") {
    return center ? `Clima acá · ${formatLat(center.lat)} ${formatLon(center.lon)}` : "Clima acá";
  }
  return id;
}

// Caja del punto: el punto más 300 nm de margen (misma regla que la travesía).
export function pointBbox(lat: number, lon: number, marginNm = FORECAST_MARGIN_NM): BBox {
  return expandBbox([lon, lat, lon, lat], marginNm);
}

// Caja combinada de un trazado (p. ej. pin→destino) más el margen.
export function marginBbox(coords: [number, number][], marginNm = FORECAST_MARGIN_NM): BBox | null {
  const bb = bboxOfTrack(coords);
  return bb ? expandBbox(bb, marginNm) : null;
}

// ¿La caja contiene el punto? Normaliza la longitud (soporta el antimeridano).
export function bboxCovers(box: BBox, lat: number, lon: number): boolean {
  const [w, s, e, n] = box;
  if (lat < s || lat > n) return false;
  const x = ((((lon + 180) % 360) + 360) % 360) - 180;
  return w <= e ? x >= w && x <= e : x >= w || x <= e;
}

// Centro de la caja (para nombrar una caja de punto/vista en la lista offline).
export function bboxCenter(box: BBox): { lat: number; lon: number } {
  return { lat: (box[1] + box[3]) / 2, lon: normalizeLon((box[0] + box[2]) / 2) };
}

// Grilla regular sobre la caja. Bordes incluidos: cols = ancho/res + 1.
export function forecastGrid(bbox: BBox, res: number): { cols: number; rows: number; points: ForecastPoint[] } {
  const [w, s, e, n] = bbox;
  const cols = Math.max(1, Math.round(Math.abs(e - w) / res) + 1);
  const rows = Math.max(1, Math.round(Math.abs(n - s) / res) + 1);
  const points: ForecastPoint[] = [];
  for (let r = 0; r < rows; r++) {
    const lat = Math.min(90, Math.max(-90, s + r * res));
    for (let c = 0; c < cols; c++) {
      points.push({ lat: round4(lat), lon: round4(normalizeLon(w + c * res)) });
    }
  }
  return { cols, rows, points };
}

// Resolución: 1° normal; 0,5° si la caja mide < 20° en ambos ejes; si se pasa
// el tope de puntos, se sube a 2°.
export function forecastResolution(bbox: BBox, maxPoints = FORECAST_POINTS_MAX): number {
  const [w, s, e, n] = bbox;
  const base = Math.abs(e - w) < 20 && Math.abs(n - s) < 20 ? 0.5 : 1;
  for (const res of [base, 1, 2]) {
    if (forecastGrid(bbox, res).points.length <= maxPoints) return res;
  }
  return 2;
}

export function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function encodeForecast(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return FORECAST_MISSING;
  return Math.max(-32767, Math.min(32767, Math.round(v * FORECAST_SCALE)));
}

export function decodeForecast(raw: number): number | null {
  return raw === FORECAST_MISSING ? null : raw / FORECAST_SCALE;
}

export function forecastBytes(pkg: ForecastPackage): number {
  return pkg.cols * pkg.rows * pkg.times.length * FORECAST_VARS.length * 2;
}

export function forecastUrl(points: { lat: number; lon: number }[], days: number): string {
  const p = new URLSearchParams();
  p.set("latitude", points.map((x) => round4(x.lat)).join(","));
  p.set("longitude", points.map((x) => round4(x.lon)).join(","));
  p.set("hourly", "wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl");
  p.set("forecast_days", String(days));
  p.set("timeformat", "unixtime");
  p.set("windspeed_unit", "kn");
  return `${FORECAST_HOST}?${p.toString()}`;
}

export function marineUrl(points: { lat: number; lon: number }[], days: number): string {
  const p = new URLSearchParams();
  p.set("latitude", points.map((x) => round4(x.lat)).join(","));
  p.set("longitude", points.map((x) => round4(x.lon)).join(","));
  p.set(
    "hourly",
    "wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction",
  );
  p.set("forecast_days", String(days));
  p.set("timeformat", "unixtime");
  return `${MARINE_HOST}?${p.toString()}`;
}

export interface ForecastHooks {
  id?: string;
  marginNm?: number;
  onProgress?: (ratio: number) => void;
  now?: () => number;
  fetchJson?: (url: string) => Promise<unknown>;
}

type OmHourly = Record<string, number[] | undefined>;
interface OmLocation {
  hourly?: OmHourly;
}

function asArray(res: unknown): OmLocation[] {
  if (Array.isArray(res)) return res as OmLocation[];
  if (res && typeof res === "object") return [res as OmLocation];
  return [];
}

async function defaultJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pronóstico: HTTP ${res.status}`);
  return res.json();
}

export async function fetchForecast(
  bbox: BBox,
  stepHours = FORECAST_STEP_HOURS,
  days = FORECAST_DAYS,
  hooks: ForecastHooks = {},
): Promise<ForecastPackage> {
  const now = hooks.now ?? (() => Date.now());
  const fetchJson = hooks.fetchJson ?? defaultJson;
  const marginNm = hooks.marginNm ?? FORECAST_MARGIN_NM;
  const clampedDays = Math.max(1, Math.min(FORECAST_DAYS_MAX, days));

  const box = expandBbox(bbox, marginNm);
  const res = forecastResolution(box);
  const grid = forecastGrid(box, res);
  const parts = chunks(grid.points, FORECAST_CHUNK);
  const total = parts.length * 2;
  let done = 0;
  const bump = (): void => {
    done++;
    hooks.onProgress?.(total === 0 ? 1 : done / total);
  };

  const forecastRes: OmLocation[][] = [];
  const marineRes: OmLocation[][] = [];
  for (const part of parts) {
    forecastRes.push(asArray(await fetchJson(forecastUrl(part, clampedDays))));
    bump();
    marineRes.push(asArray(await fetchJson(marineUrl(part, clampedDays))));
    bump();
  }

  const allTimes: number[] = forecastRes[0]?.[0]?.hourly?.["time"] ?? [];
  const maxSteps = Math.floor((clampedDays * 24) / stepHours);
  const idx: number[] = [];
  for (let i = 0; i < allTimes.length && idx.length < maxSteps; i += stepHours) idx.push(i);
  const times = idx.map((i) => (allTimes[i] ?? 0) * 1000);

  const count = grid.cols * grid.rows * times.length;
  const vars = {} as Record<ForecastVar, Int16Array>;
  for (const v of FORECAST_VARS) vars[v] = new Int16Array(count).fill(FORECAST_MISSING);

  for (let p = 0; p < parts.length; p++) {
    const fc = forecastRes[p] ?? [];
    const mc = marineRes[p] ?? [];
    const part = parts[p] ?? [];
    for (let j = 0; j < part.length; j++) {
      const gIdx = p * FORECAST_CHUNK + j;
      for (const v of FORECAST_VARS) {
        const spec = FORECAST_OM[v];
        const hourly = spec.api === "marine" ? mc[j]?.hourly : fc[j]?.hourly;
        const series = hourly?.[spec.name];
        if (!series || times.length === 0) continue;
        const base = gIdx * times.length;
        for (let t = 0; t < idx.length; t++) {
          vars[v][base + t] = encodeForecast(series[idx[t]!]);
        }
      }
    }
  }

  const stamp = now();
  return {
    id: hooks.id ?? "vista",
    issuedAt: stamp,
    fetchedAt: stamp,
    bbox: box,
    stepHours,
    cols: grid.cols,
    rows: grid.rows,
    times,
    vars,
  };
}

// Edad visible siempre (regla 7 de §6 ter).
export function ageText(fetchedAt: number, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  if (min < 2) return "recién actualizado";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} días`;
}

export function getForecastAge(pkg: ForecastPackage, now = Date.now()): string {
  return ageText(pkg.fetchedAt, now);
}

export function forecastLastTime(pkg: ForecastPackage): number {
  return pkg.times.length > 0 ? pkg.times[pkg.times.length - 1]! : pkg.fetchedAt;
}

// ¿La hora cae más allá del horizonte del paquete? Ahí se usa la climatología
// del mes y hay que decirlo ("clima medio").
export function empalmeConClimatología(pkg: ForecastPackage, timeMs: number): boolean {
  return timeMs > forecastLastTime(pkg);
}

// Empaquetado binario compacto para IndexedDB: cabecera JSON + Int16 crudos.
export function packForecast(pkg: ForecastPackage): ArrayBuffer {
  const meta = {
    schema: 1,
    id: pkg.id,
    issuedAt: pkg.issuedAt,
    fetchedAt: pkg.fetchedAt,
    bbox: pkg.bbox,
    stepHours: pkg.stepHours,
    cols: pkg.cols,
    rows: pkg.rows,
    times: pkg.times,
    vars: FORECAST_VARS,
  };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const count = pkg.cols * pkg.rows * pkg.times.length;
  const body = new Int16Array(count * FORECAST_VARS.length);
  let off = 0;
  for (const v of FORECAST_VARS) {
    body.set(pkg.vars[v].subarray(0, count), off);
    off += count;
  }
  const buf = new ArrayBuffer(4 + json.byteLength + body.byteLength);
  const view = new DataView(buf);
  view.setUint32(0, json.byteLength, true);
  new Uint8Array(buf, 4, json.byteLength).set(json);
  new Uint8Array(buf, 4 + json.byteLength).set(new Uint8Array(body.buffer));
  return buf;
}

export function unpackForecast(buf: ArrayBuffer): ForecastPackage {
  const view = new DataView(buf);
  const jsonLen = view.getUint32(0, true);
  const meta = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 4, jsonLen)),
  ) as {
    id: string;
    issuedAt: number;
    fetchedAt: number;
    bbox: BBox;
    stepHours: number;
    cols: number;
    rows: number;
    times: number[];
    vars: ForecastVar[];
  };
  const count = meta.cols * meta.rows * meta.times.length;
  const bytes = new Uint8Array(buf, 4 + jsonLen);
  const body = new Int16Array(count * meta.vars.length);
  new Uint8Array(body.buffer).set(bytes.subarray(0, body.byteLength));
  const vars = {} as Record<ForecastVar, Int16Array>;
  let off = 0;
  for (const v of meta.vars) {
    vars[v] = body.slice(off, off + count);
    off += count;
  }
  return {
    id: meta.id,
    issuedAt: meta.issuedAt,
    fetchedAt: meta.fetchedAt,
    bbox: meta.bbox,
    stepHours: meta.stepHours,
    cols: meta.cols,
    rows: meta.rows,
    times: meta.times,
    vars,
  };
}
