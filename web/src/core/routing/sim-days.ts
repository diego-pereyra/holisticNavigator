// Simulación en el tiempo sobre el trazado optimizado (pedido de Diego 2026-11-10).
//
// El optimizador devuelve waypoints con ETA (`etaMs`): un barco que navega con
// el viento de cada momento. Acá convertimos ese trazado en una travesía por
// días — dónde está el barco al cierre de cada día, cuánto navegó, a qué
// velocidad media, con qué rumbo y qué viento tenía — para que la UI pueda
// mostrarlo con un contador ("Día 3 de 9") sin recortar ni inventar datos.
//
// Lógica pura: sin DOM ni MapLibre. Los puntos del trazado no incluyen el
// efecto de las maniobras (viradas/trasluchadas) porque el optimizador ya las
// resolvió en la geometría; acá solo interpolamos en el tiempo.

import { haversineNm, initialBearingDeg, type LonLat } from "../navigation.ts";
import type { IsoMultiResult } from "./isochrones.ts";
import type { WindField } from "./windfield.ts";

export interface TrackPoint {
  lat: number;
  lon: number;
  tMs: number;
}

export interface SimDay {
  /** Día 1-based desde la partida. */
  day: number;
  /** Momento en que cierra el día (capado a la llegada). */
  tMs: number;
  lat: number;
  lon: number;
  /** Millas navegadas durante el día. */
  nm: number;
  /** Velocidad media sobre el fondo del día (kn). */
  sogKn: number;
  /** Rumbo medio del día (grados verdaderos, 0 = norte). */
  cogDeg: number;
  /** Viento al cierre del día; null si el campo no tiene dato. */
  twsKn: number | null;
  twdDeg: number | null;
  /** El día quedó corto porque el barco llegó antes de las 24 h. */
  partial: boolean;
}

export const DAY_MS = 24 * 3600_000;

// Trazado completo del resultado multi-tramo con tiempos absolutos. Los
// anclas intermedias ya vienen en `segments[i].etaMs` (fin del tramo i).
export function optTrack(result: IsoMultiResult, startMs: number): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const first = result.anchors[0];
  if (!first) return pts;
  pts.push({ lat: first[1], lon: first[0], tMs: startMs });
  result.segments.forEach((seg, i) => {
    for (const p of seg.points) pts.push({ lat: p.lat, lon: p.lon, tMs: p.etaMs });
    const anchor = result.anchors[i + 1];
    if (anchor) pts.push({ lat: anchor[1], lon: anchor[0], tMs: seg.etaMs });
  });
  return pts;
}

// Posición interpolada (lineal) en el instante t dentro del trazado.
export function positionAt(track: TrackPoint[], tMs: number): TrackPoint | null {
  const n = track.length;
  if (n === 0) return null;
  if (tMs <= track[0]!.tMs) return { ...track[0]! };
  if (tMs >= track[n - 1]!.tMs) return { ...track[n - 1]! };
  // Búsqueda binaria del tramo que contiene tMs.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid]!.tMs <= tMs) lo = mid;
    else hi = mid;
  }
  const a = track[lo]!;
  const b = track[hi]!;
  const span = b.tMs - a.tMs;
  const f = span > 0 ? (tMs - a.tMs) / span : 1;
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, tMs };
}

// Millas recorridas entre dos instantes, sumando cada tramo del trazado (no la
// cuerda entre extremos: un día con viradas navega más que su línea recta).
export function distanceBetween(track: TrackPoint[], t0: number, t1: number): number {
  if (track.length === 0 || t1 <= t0) return 0;
  const p0 = positionAt(track, t0);
  const p1 = positionAt(track, t1);
  if (!p0 || !p1) return 0;
  let nm = 0;
  let prev = p0;
  for (const p of track) {
    if (p.tMs <= t0) continue;
    if (p.tMs >= t1) break;
    nm += haversineNm(prev.lat, prev.lon, p.lat, p.lon);
    prev = p;
  }
  nm += haversineNm(prev.lat, prev.lon, p1.lat, p1.lon);
  return nm;
}

// Un día = bloque de 24 h desde la partida; el último se corta en la llegada.
export function simulateDays(track: TrackPoint[], wind: WindField | null): SimDay[] {
  if (track.length < 2) return [];
  const start = track[0]!.tMs;
  const end = track[track.length - 1]!.tMs;
  const total = end - start;
  if (total <= 0) return [];
  const days: SimDay[] = [];
  let t0 = start;
  let day = 1;
  while (t0 < end) {
    const plannedEnd = start + day * DAY_MS;
    const t1 = Math.min(plannedEnd, end);
    const a = positionAt(track, t0);
    const b = positionAt(track, t1);
    if (a && b) {
      const nm = distanceBetween(track, t0, t1);
      const hours = (t1 - t0) / 3600_000;
      const w = wind ? wind(b.lat, b.lon, t1) : null;
      days.push({
        day,
        tMs: t1,
        lat: b.lat,
        lon: b.lon,
        nm,
        sogKn: hours > 0 ? nm / hours : 0,
        cogDeg: nm > 0.01 ? initialBearingDeg(a.lat, a.lon, b.lat, b.lon) : 0,
        twsKn: w ? w.speed : null,
        twdDeg: w ? w.dir : null,
        partial: t1 - t0 < DAY_MS - 60_000,
      });
    }
    // Llegada exacta en el borde del día: no agregar un día vacío.
    if (t1 >= end - 60_000) break;
    t0 = t1;
    day++;
  }
  return days;
}

// Coordenadas [lon, lat] del tramo ya navegado hasta `days`, para dibujar la
// estela del barco simulada.
export function trackUntil(track: TrackPoint[], tMs: number): LonLat[] {
  const coords: LonLat[] = [];
  for (const p of track) {
    if (p.tMs > tMs) break;
    coords.push([p.lon, p.lat]);
  }
  const pos = positionAt(track, tMs);
  if (pos) {
    const last = coords[coords.length - 1];
    if (!last || last[0] !== pos.lon || last[1] !== pos.lat) coords.push([pos.lon, pos.lat]);
  }
  return coords;
}
