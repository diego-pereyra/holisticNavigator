// Bitácora de travesía (T9.5): puntos, distancia y export GPX.

import { haversineNm, initialBearingDeg } from "./navigation.ts";

export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
}

export interface Note {
  t: number;
  lat: number;
  lon: number;
  text: string;
}

export interface VoyageLog {
  name: string;
  points: TrackPoint[];
  notes?: Note[];
}

export interface DailyReport {
  nm24h: number;
  avgKn24h: number;
  avgCogDeg24h: number;
  totalNm: number;
  hours: number;
  daysToGo?: number;
}

export function voyageNotes(log: VoyageLog): Note[] {
  return log.notes ?? [];
}

export function voyageDistanceNm(log: VoyageLog): number {
  let sum = 0;
  for (let i = 0; i < log.points.length - 1; i++) {
    const a = log.points[i]!;
    const b = log.points[i + 1]!;
    sum += haversineNm(a.lat, a.lon, b.lat, b.lon);
  }
  return sum;
}

export function withPoint(
  log: VoyageLog,
  lat: number,
  lon: number,
  t: number,
  minGapNm = 0.05,
  minGapMs = 3000,
): VoyageLog {
  const last = log.points[log.points.length - 1];
  if (last) {
    const moved = haversineNm(last.lat, last.lon, lat, lon);
    if (moved < minGapNm && t - last.t < minGapMs) return log;
  }
  return { ...log, points: [...log.points, { t, lat, lon }] };
}

const HOUR_MS = 3_600_000;

// Parte diario (E9.4): mediciones de las últimas 24 h sobre el track, más el
// total de la travesía y una estimación de días restantes a este ritmo.
export function dailyReport(log: VoyageLog, nowMs: number, remainingNm?: number): DailyReport {
  const pts = log.points;
  const totalNm = voyageDistanceNm(log);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const hours = first && last ? Math.max(0, last.t - first.t) / HOUR_MS : 0;

  const cutoff = nowMs - 24 * HOUR_MS;
  let nm24h = 0;
  let winStart: number | null = null;
  let winEnd = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (a.t < cutoff) continue;
    const d = haversineNm(a.lat, a.lon, b.lat, b.lon);
    nm24h += d;
    if (winStart === null) winStart = a.t;
    winEnd = b.t;
    const brg = (initialBearingDeg(a.lat, a.lon, b.lat, b.lon) * Math.PI) / 180;
    x += Math.cos(brg) * d;
    y += Math.sin(brg) * d;
  }
  const windowHours = winStart !== null ? Math.max(0, winEnd - winStart) / HOUR_MS : 0;
  const avgKn24h = windowHours > 0 ? nm24h / windowHours : 0;
  const avgCogDeg24h = nm24h > 0 ? (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360 : 0;

  const rate = avgKn24h > 0 ? avgKn24h : hours > 0 ? totalNm / hours : 0;
  const daysToGo =
    remainingNm !== undefined && remainingNm > 0 && rate > 0 ? remainingNm / rate / 24 : undefined;

  return { nm24h, avgKn24h, avgCogDeg24h, totalNm, hours, ...(daysToGo !== undefined ? { daysToGo } : {}) };
}
