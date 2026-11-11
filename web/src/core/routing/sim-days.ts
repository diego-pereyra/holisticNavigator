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
import { relative, type IsoMultiResult } from "./isochrones.ts";
import { boatSpeed, type Polar } from "./polar.ts";
import type { WindField } from "./windfield.ts";

export interface TrackPoint {
  lat: number;
  lon: number;
  tMs: number;
}

export interface SimStep {
  /** Paso 0-based desde la partida. */
  index: number;
  /** Día 1-based desde la partida. */
  day: number;
  /** Momento en que cierra el día (capado a la llegada). */
  tMs: number;
  lat: number;
  lon: number;
  /** Millas navegadas durante el paso. */
  nm: number;
  /** Velocidad media sobre el fondo del paso (kn). */
  sogKn: number;
  /** Rumbo medio del paso (grados verdaderos, 0 = norte). */
  cogDeg: number;
  /** Viento en ese instante; null si el campo no tiene dato. */
  twsKn: number | null;
  twdDeg: number | null;
  /** El paso quedó corto porque el barco llegó antes del cierre. */
  partial: boolean;
}

export const DAY_MS = 24 * 3600_000;
// La travesía se muestra cada 3 h (pedido de Diego 2026-11-11): alcanza para
// ver cambiar el pronóstico sin una lista interminable de puntos.
export const STEP_H = 3;
export const STEP_MS = STEP_H * 3600_000;

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

// Trazado con tiempos absolutos a partir de una ruta elegida (la del libro o
// la propia): camina pata por pata con el viento del punto medio, igual que
// `traverseRoute`, pero conservando cada waypoint con su ETA para simular.
export function timedTrack(
  coords: LonLat[],
  startMs: number,
  wind: WindField,
  polar: Polar,
): TrackPoint[] {
  const pts: TrackPoint[] = [];
  if (coords.length === 0) return pts;
  let t = startMs;
  pts.push({ lat: coords[0]![1], lon: coords[0]![0], tMs: t });
  for (let i = 0; i + 1 < coords.length; i++) {
    const [alon, alat] = coords[i]!;
    const [blon, blat] = coords[i + 1]!;
    const legNm = haversineNm(alat, alon, blat, blon);
    if (legNm <= 0) continue;
    const heading = initialBearingDeg(alat, alon, blat, blon);
    const wp = wind((alat + blat) / 2, (alon + blon) / 2, t);
    let speed = wp ? boatSpeed(polar, Math.abs(relative(heading, wp.dir)), wp.speed) : 0;
    if (speed <= 0) speed = boatSpeed(polar, polar.config.deadAngle, wp?.speed ?? 0);
    if (speed <= 0) speed = 0.1;
    t += (legNm / speed) * 3600_000;
    pts.push({ lat: blat, lon: blon, tMs: t });
  }
  return pts;
}

// Un paso = bloque de `stepH` horas desde la partida; el último se corta en la
// llegada. Cada paso informa posición, millas, SOG, rumbo y el viento que hay
// en ese instante, para que la UI muestre el pronóstico cambiando.
export function simulateSteps(
  track: TrackPoint[],
  wind: WindField | null,
  stepH: number = STEP_H,
): SimStep[] {
  if (track.length < 2) return [];
  const stepMs = Math.max(1, stepH) * 3600_000;
  const start = track[0]!.tMs;
  const end = track[track.length - 1]!.tMs;
  const total = end - start;
  if (total <= 0) return [];
  const steps: SimStep[] = [];
  let t0 = start;
  let index = 0;
  while (t0 < end) {
    const t1 = Math.min(start + (index + 1) * stepMs, end);
    const a = positionAt(track, t0);
    const b = positionAt(track, t1);
    if (a && b) {
      const nm = distanceBetween(track, t0, t1);
      const hours = (t1 - t0) / 3600_000;
      const w = wind ? wind(b.lat, b.lon, t1) : null;
      steps.push({
        index,
        day: 1 + Math.floor((t1 - start - 1) / DAY_MS),
        tMs: t1,
        lat: b.lat,
        lon: b.lon,
        nm,
        sogKn: hours > 0 ? nm / hours : 0,
        cogDeg: nm > 0.01 ? initialBearingDeg(a.lat, a.lon, b.lat, b.lon) : 0,
        twsKn: w ? w.speed : null,
        twdDeg: w ? w.dir : null,
        partial: t1 - t0 < stepMs - 60_000,
      });
    }
    // Llegada exacta en el borde del paso: no agregar un paso vacío.
    if (t1 >= end - 60_000) break;
    t0 = t1;
    index++;
  }
  return steps;
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
