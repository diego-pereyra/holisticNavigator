// Navegación ortodrómica (ported from Navigation.kt): distancia, rumbo,
// proyección sobre un tramo, resolver de waypoint activo y geometría de rutas.

export const R_NM = 3440.065;

export type LonLat = [number, number];

export interface RouteTrack {
  names: string[];
  dests: boolean[];
  corrected: boolean[];
  coords: LonLat[];
}

export interface NavFix {
  nextIndex: number;
  nextName: string;
  nextIsDest: boolean;
  nextCorrected: boolean;
  nextLon: number;
  nextLat: number;
  bearingDeg: number;
  distanceNm: number;
  xteNm: number;
  alongNm: number;
  legNm: number;
  legIndex: number;
}

export interface Projection {
  xteNm: number;
  alongNm: number;
  legNm: number;
}

const toRad = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function initialBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function project(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
  pLat: number,
  pLon: number,
): Projection {
  const d13 = haversineNm(aLat, aLon, pLat, pLon) / R_NM;
  const legNm = haversineNm(aLat, aLon, bLat, bLon);
  const t12 = toRad(initialBearingDeg(aLat, aLon, bLat, bLon));
  const t13 = toRad(initialBearingDeg(aLat, aLon, pLat, pLon));
  const xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(t13 - t12))));
  const at = Math.atan2(Math.sin(d13) * Math.cos(t13 - t12), Math.cos(d13));
  return { xteNm: xt * R_NM, alongNm: at * R_NM, legNm };
}

export function navigate(track: RouteTrack, lat: number, lon: number): NavFix | null {
  const n = track.coords.length;
  if (n < 2) return null;

  let bestIdx = -1;
  let bestAbs = Number.MAX_VALUE;
  let bestXte = 0;
  let bestAlong = 0;
  let bestLeg = 0;

  let nearestIdx = 1;
  let nearestDist = Number.MAX_VALUE;

  for (let i = 0; i < n - 1; i++) {
    const a = track.coords[i]!;
    const b = track.coords[i + 1]!;
    const pr = project(a[1], a[0], b[1], b[0], lat, lon);
    const dA = haversineNm(lat, lon, a[1], a[0]);
    const dB = haversineNm(lat, lon, b[1], b[0]);
    if (dA < nearestDist) {
      nearestDist = dA;
      nearestIdx = i;
    }
    if (dB < nearestDist) {
      nearestDist = dB;
      nearestIdx = i + 1;
    }
    if (pr.alongNm < 0 || pr.alongNm > pr.legNm) continue;
    if (Math.abs(pr.xteNm) < bestAbs) {
      bestAbs = Math.abs(pr.xteNm);
      bestXte = pr.xteNm;
      bestAlong = pr.alongNm;
      bestLeg = pr.legNm;
      bestIdx = i;
    }
  }

  let legIndex: number;
  let nextIndex: number;
  if (bestIdx >= 0) {
    legIndex = bestIdx;
    nextIndex = Math.min(bestIdx + 1, n - 1);
  } else {
    const ni = Math.max(1, Math.min(nearestIdx, n - 1));
    legIndex = ni - 1;
    nextIndex = ni;
  }

  const wp = track.coords[nextIndex]!;
  return {
    nextIndex,
    nextName: track.names[nextIndex] ?? "",
    nextIsDest: track.dests[nextIndex] ?? false,
    nextCorrected: track.corrected[nextIndex] ?? false,
    nextLon: wp[0],
    nextLat: wp[1],
    bearingDeg: initialBearingDeg(lat, lon, wp[1], wp[0]),
    distanceNm: haversineNm(lat, lon, wp[1], wp[0]),
    xteNm: bestXte,
    alongNm: bestAlong,
    legNm: bestLeg,
    legIndex,
  };
}

export function trackLengthNm(track: RouteTrack): number {
  let s = 0;
  for (let i = 0; i < track.coords.length - 1; i++) {
    const a = track.coords[i]!;
    const b = track.coords[i + 1]!;
    s += haversineNm(a[1], a[0], b[1], b[0]);
  }
  return s;
}

export function pointAlongTrack(track: RouteTrack, nm: number): LonLat | null {
  const n = track.coords.length;
  if (n < 2) return null;
  let remain = Math.max(0, nm);
  for (let i = 0; i < n - 1; i++) {
    const a = track.coords[i]!;
    const b = track.coords[i + 1]!;
    const leg = haversineNm(a[1], a[0], b[1], b[0]);
    if (remain <= leg || i === n - 2) {
      const t = leg < 1e-9 ? 0 : Math.max(0, Math.min(1, remain / leg));
      const lat = a[1] + (b[1] - a[1]) * t;
      const lon = a[0] + (b[0] - a[0]) * t;
      return [lon, lat];
    }
    remain -= leg;
  }
  const last = track.coords[n - 1]!;
  return [last[0], last[1]];
}

interface GeoJsonFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

function numberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const v of value) {
    if (typeof v !== "number") return null;
    out.push(v);
  }
  return out;
}

function boolArray(value: unknown): boolean[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((v) => v === true || v === "true");
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((v) => String(v));
}

export function routeTrackFromGeoJson(geoJson: string | null | undefined): RouteTrack | null {
  if (!geoJson || geoJson.trim() === "") return null;
  let root: unknown;
  try {
    root = JSON.parse(geoJson);
  } catch {
    return null;
  }
  if (typeof root !== "object" || root === null) return null;
  const features = (root as { features?: unknown }).features;
  if (!Array.isArray(features)) return null;
  for (const f of features as GeoJsonFeature[]) {
    const geom = f.geometry;
    if (!geom || geom.type !== "LineString") continue;
    const rawCoords = geom.coordinates;
    if (!Array.isArray(rawCoords)) continue;
    const coords: LonLat[] = [];
    for (const pt of rawCoords) {
      const arr = numberArray(pt);
      if (arr && typeof arr[0] === "number" && typeof arr[1] === "number") {
        coords.push([arr[0], arr[1]]);
      }
    }
    if (coords.length < 2) continue;
    const props = f.properties ?? {};
    const names = stringArray(props["wpNames"]);
    const dests = boolArray(props["wpDests"]);
    const corrected = boolArray(props["wpCorrected"]);
    const an =
      names && names.length === coords.length
        ? names
        : coords.map((_, i) => `WP ${i}`);
    const ad = dests && dests.length === coords.length ? dests : coords.map(() => false);
    const ac =
      corrected && corrected.length === coords.length ? corrected : coords.map(() => false);
    return { names: an, dests: ad, corrected: ac, coords };
  }
  return null;
}
