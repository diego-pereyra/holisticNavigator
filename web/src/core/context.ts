// Resolver de contexto (T2.3): región por point-in-box, meses de tormenta y
// rutas cercanas (distancia punto→polilínea reutilizando project()).

import { haversineNm, project, type LonLat } from "./navigation.ts";

export interface Basin {
  boxes: number[][];
  stormMonths: number[];
  nhcBasins: string;
  rsmc: string;
}

export interface VariantGeometry {
  code: string;
  variant: string;
  coords: LonLat[];
  names?: string[];
}

export interface NearbyRoute {
  code: string;
  variant: string;
  distanceNm: number;
  nearestWp: string;
}

export interface ResolvedContext {
  region: string | null;
  nhcBasins: string[];
  rsmc: string | null;
  stormMonths: number[];
  inStormSeason: boolean;
  nearby: NearbyRoute[];
}

const MAX_NEARBY = 8;
const MAX_NEARBY_NM = 600;
const FALLBACK_NEARBY = 3;

function inBoxes(boxes: number[][], lon: number, lat: number): boolean {
  for (const b of boxes) {
    if (b.length < 4) continue;
    if (b[0]! <= lon && lon <= b[2]! && b[1]! <= lat && lat <= b[3]!) return true;
  }
  return false;
}

interface Nearest {
  distanceNm: number;
  wpIndex: number;
}

function nearestOnTrack(lat: number, lon: number, coords: LonLat[]): Nearest {
  let best = Number.MAX_VALUE;
  let bestIdx = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const pr = project(a[1], a[0], b[1], b[0], lat, lon);
    let dist: number;
    let idx: number;
    if (pr.alongNm < 0) {
      dist = haversineNm(lat, lon, a[1], a[0]);
      idx = i;
    } else if (pr.alongNm > pr.legNm) {
      dist = haversineNm(lat, lon, b[1], b[0]);
      idx = i + 1;
    } else {
      dist = Math.abs(pr.xteNm);
      idx = i;
    }
    if (dist < best) {
      best = dist;
      bestIdx = idx;
    }
  }
  return { distanceNm: best, wpIndex: bestIdx };
}

export function resolveContext(
  lat: number,
  lon: number,
  month: number,
  basins: Record<string, Basin>,
  variants: VariantGeometry[],
): ResolvedContext {
  let region: string | null = null;
  let basin: Basin | null = null;
  for (const [name, b] of Object.entries(basins)) {
    if (inBoxes(b.boxes, lon, lat)) {
      region = name;
      basin = b;
      break;
    }
  }

  const stormMonths = basin ? [...basin.stormMonths] : [];
  const nhcBasins = basin && basin.nhcBasins ? basin.nhcBasins.split(",").filter((s) => s) : [];

  const distances: NearbyRoute[] = [];
  for (const v of variants) {
    if (v.coords.length < 2) continue;
    const n = nearestOnTrack(lat, lon, v.coords);
    distances.push({
      code: v.code,
      variant: v.variant,
      distanceNm: n.distanceNm,
      nearestWp: v.names?.[n.wpIndex] ?? "",
    });
  }
  distances.sort((a, b) => a.distanceNm - b.distanceNm);
  const within = distances.filter((d) => d.distanceNm <= MAX_NEARBY_NM);
  const nearby = (within.length > 0 ? within : distances).slice(0, within.length > 0 ? MAX_NEARBY : FALLBACK_NEARBY);

  return {
    region,
    nhcBasins,
    rsmc: basin && basin.rsmc ? basin.rsmc : null,
    stormMonths,
    inStormSeason: stormMonths.includes(month),
    nearby,
  };
}
