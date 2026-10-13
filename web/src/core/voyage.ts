// Bitácora de travesía (T9.5): puntos, distancia y export GPX.

import { haversineNm } from "./navigation.ts";

export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
}

export interface VoyageLog {
  name: string;
  points: TrackPoint[];
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

function isoUtc(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`
  );
}

export function voyageToGpx(log: VoyageLog): string {
  const sb: string[] = [];
  sb.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  sb.push(
    '<gpx version="1.1" creator="Holistic Navigator" ' +
      'xmlns="http://www.topografix.com/GPX/1/1">\n',
  );
  sb.push(`  <trk>\n    <name>${log.name.replace(/</g, "&lt;")}</name>\n`);
  sb.push("    <trkseg>\n");
  for (const p of log.points) {
    sb.push(
      `      <trkpt lat="${p.lat}" lon="${p.lon}"><time>${isoUtc(p.t)}</time></trkpt>\n`,
    );
  }
  sb.push("    </trkseg>\n  </trk>\n</gpx>\n");
  return sb.join("");
}
