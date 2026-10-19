// Campo de viento (E12.5, ADR-008 §Decisión componente 3).
//
// Interfaz única `wind(lat, lon, t) → {dir, speed} | null` para el motor de
// isócronas. `dir` es la dirección meteorológica (de dónde viene el viento, en
// grados) y `speed` en nudos. Dos implementaciones:
//
// - `forecastWindField(pkg, clim)`: pronóstico del paquete E13.1 interpolado
//   bilinealmente en el espacio y linealmente en el tiempo dentro del
//   horizonte; más allá (o si la celda no tiene dato) cae a la climatología del
//   mes ("clima medio").
// - `climateWindField(clim)`: climatología sola, para "Ruta del mes".
//
// Internamente se trabaja con componentes u/v (este/norte) porque interpolar el
// ángulo de dirección cruza mal por el 0°/360°.

import { decodeForecast, FORECAST_MISSING, type ForecastPackage } from "../forecast.ts";
import { getCell, type ClimMonth } from "../clim.ts";

export interface WindPoint {
  /** Dirección de dónde viene el viento, grados [0, 360). */
  dir: number;
  /** Intensidad en nudos. */
  speed: number;
}

export type WindField = (lat: number, lon: number, tMs: number) => WindPoint | null;

function normLon(lon: number): number {
  let x = (((lon + 180) % 360) + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

function dirFromUV(u: number, v: number): number {
  return ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
}

function toWind(u: number, v: number): WindPoint {
  return { dir: dirFromUV(u, v), speed: Math.hypot(u, v) };
}

// E12.9 — anillo de búsqueda de la celda de agua más cercana cuando la celda
// consultada no tiene viento (tierra en la máscara o en la climatología). Radio
// ~0,5°: el viento de un punto tocado en el mapa está garantizado.
const RING_STEP_DEG = 0.1;
const RING_MAX_DEG = 0.5;
const RING_DIRS = 8;

function ringWind(at: (lat: number, lon: number) => WindPoint | null, lat: number, lon: number): WindPoint | null {
  const direct = at(lat, lon);
  if (direct) return direct;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  for (let r = RING_STEP_DEG; r <= RING_MAX_DEG + 1e-9; r += RING_STEP_DEG) {
    for (let k = 0; k < RING_DIRS; k++) {
      const a = (k * 2 * Math.PI) / RING_DIRS;
      const w = at(lat + r * Math.cos(a), lon + (r * Math.sin(a)) / cosLat);
      if (w) return w;
    }
  }
  return null;
}

// Climatología del mes: `wu`/`wv` son componentes u/v; si el vector es nulo se
// usa `ws` como intensidad sin dirección (el motor la trata como calma).
function climateWind(clim: ClimMonth, lat: number, lon: number): WindPoint | null {
  // E12.9 — `getCell` es (lat, lon); con los argumentos invertidos Canarias
  // consultaba África y devolvía "sin datos de viento" en pleno océano.
  const cell = getCell(clim, lat, normLon(lon));
  if (!cell) return null;
  const mag = Math.hypot(cell.wu, cell.wv);
  if (mag < 0.05) return { dir: 0, speed: Math.max(0, cell.ws) };
  return toWind(cell.wu, cell.wv);
}

// E12.9 — un ancla es VERDAD: si la celda consultada no tiene viento, se toma el
// de la celda de agua más cercana en vez de anular el punto. Sin esto el motor
// no arranca desde un puerto (la celda del ancla es tierra).
export function climateWindField(clim: ClimMonth): WindField {
  return (lat, lon) => ringWind((la, lo) => climateWind(clim, la, lo), lat, lon);
}

function cellUV(pkg: ForecastPackage, c: number, r: number, ti: number): { u: number; v: number } | null {
  const { cols, rows } = pkg;
  const step = pkg.times.length;
  if (c < 0 || r < 0 || c >= cols || r >= rows || ti < 0 || ti >= step) return null;
  const base = (r * cols + c) * step + ti;
  const s = decodeForecast(pkg.vars.wind_speed[base] ?? FORECAST_MISSING);
  const d = decodeForecast(pkg.vars.wind_direction[base] ?? FORECAST_MISSING);
  if (s === null || d === null) return null;
  const rad = (d * Math.PI) / 180;
  return { u: -s * Math.sin(rad), v: -s * Math.cos(rad) };
}

// u/v en una posición y un índice de tiempo fraccionario (bilineal en espacio,
// lineal en tiempo). `null` si no hay ningún dato en el entorno.
function sampleUV(pkg: ForecastPackage, lat: number, lon: number, tf: number): { u: number; v: number } | null {
  const { cols, rows, bbox } = pkg;
  if (cols < 2 || rows < 2) return null;
  const dx = (bbox[2] - bbox[0]) / (cols - 1);
  const dy = (bbox[3] - bbox[1]) / (rows - 1);
  const fx = (normLon(lon) - bbox[0]) / dx;
  const fy = (lat - bbox[1]) / dy;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const tx = fx - c0;
  const ty = fy - r0;
  const ti0 = Math.floor(tf);
  const tt = tf - ti0;

  const grid = (ti: number): { u: number; v: number } | null => {
    let u = 0;
    let v = 0;
    let wsum = 0;
    const corners: [number, number, number][] = [
      [c0, r0, (1 - tx) * (1 - ty)],
      [c0 + 1, r0, tx * (1 - ty)],
      [c0, r0 + 1, (1 - tx) * ty],
      [c0 + 1, r0 + 1, tx * ty],
    ];
    for (const [c, r, w] of corners) {
      if (w === 0) continue;
      const uv = cellUV(pkg, c, r, ti);
      if (!uv) continue;
      u += uv.u * w;
      v += uv.v * w;
      wsum += w;
    }
    return wsum > 0 ? { u: u / wsum, v: v / wsum } : null;
  };

  const a = grid(ti0);
  const b = grid(ti0 + 1);
  if (a && b) return { u: a.u + (b.u - a.u) * tt, v: a.v + (b.v - a.v) * tt };
  return a ?? b;
}

// Hora (ms) del último paso del paquete; más allá rige la climatología.
export function forecastHorizon(pkg: ForecastPackage): number {
  return pkg.times.length > 0 ? pkg.times[pkg.times.length - 1]! : pkg.fetchedAt;
}

export function forecastWindField(pkg: ForecastPackage, clim: ClimMonth | null): WindField {
  const base = pkg.times[0] ?? pkg.fetchedAt;
  const stepMs = pkg.stepHours * 3600_000;
  const last = forecastHorizon(pkg);
  const climField = clim ? climateWindField(clim) : null;
  const { bbox } = pkg;
  const inBox = (lat: number, lon: number): boolean => {
    const x = normLon(lon);
    return x >= bbox[0] && x <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
  };
  return (lat, lon, tMs) => {
    if (tMs > last && climField) return climField(lat, lon, tMs);
    const tf = stepMs > 0 ? (tMs - base) / stepMs : 0;
    const ti = Math.max(0, Math.min(pkg.times.length - 1, tf));
    const uv = sampleUV(pkg, lat, lon, ti);
    if (uv) return toWind(uv.u, uv.v);
    // E12.9 — bordes de la caja: si la celda consultada no tiene dato (celdas
    // del borde sin pareja para la interpolación) se busca en un anillo dentro
    // de la caja antes de caer a la climatología.
    if (inBox(lat, lon)) {
      const w = ringWind((la, lo) => {
        if (!inBox(la, lo)) return null;
        const p = sampleUV(pkg, la, lo, ti);
        return p ? toWind(p.u, p.v) : null;
      }, lat, lon);
      if (w) return w;
    }
    return climField ? climField(lat, lon, tMs) : null;
  };
}

// ¿La hora cae más allá del horizonte del pronóstico? El resultado del enrutado
// lo usa para avisar "clima medio" más allá del pronóstico.
export function beyondForecast(pkg: ForecastPackage | null, tMs: number): boolean {
  return pkg !== null && tMs > forecastHorizon(pkg);
}
