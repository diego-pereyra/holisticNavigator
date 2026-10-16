// Motor de isócronas (E12.5, ADR-008 §Decisión componentes 2 y 4).
//
// Lógica pura, sin UI. `routeOptimalSteps(opts)` es un generador que avanza la
// frontera paso a paso (para que el Worker informe progreso y pueda cancelar) y
// `routeOptimal(opts)` lo corre entero (tests y uso directo).
//
// Método de isócronas (Hagiwara): frontera por pasos Δt, abanico de rumbos
// respecto del rumbo directo, velocidad = polar(TWA, TWS) (E12.3), poda por
// sectores angulares desde el origen, coste de virada y límite de bordos;
// restricciones de máscara de tierra (E12.1) con margen, TWS máx e hielo. Las
// ceñidas emergen solas porque la polar no permite rumbos dentro del cono muerto.

import { haversineNm, initialBearingDeg, type LonLat } from "../navigation.ts";
import { boatSpeed, type Polar } from "./polar.ts";
import type { Landmask } from "./landmask.ts";
import type { WindField } from "./windfield.ts";
import type { ForecastPackage } from "../forecast.ts";
import type { ClimMonth } from "../clim.ts";

export interface IsoConfig {
  maxSteps: number;
  /** Δt cerca de costa, en horas (a menos de `coastDeg` de tierra). */
  stepCoastH: number;
  /** Δt en océano, en horas. */
  stepOceanH: number;
  /** Distancia (grados) para considerar un punto "cerca de costa". */
  coastDeg: number;
  /** Abanico de rumbos (grados a cada lado del rumbo directo). */
  fanDeg: number;
  /** Número de rumbos evaluados por punto. */
  headings: number;
  /** Ancho de cada sector de poda (grados). */
  sectorDeg: number;
  maxTws: number;
  iceMax: number;
  /** Margen costero de la máscara, en millas (dilatación de ~1 celda 0,1°). */
  coastMarginNm: number;
  /** Coste de una virada, en minutos (se suma a la ETA del bordo nuevo). */
  tackPenaltyMin: number;
  maxTacks: number;
}

export const DEFAULT_ISO_CONFIG: IsoConfig = {
  maxSteps: 700,
  stepCoastH: 1,
  stepOceanH: 3,
  coastDeg: 2,
  fanDeg: 110,
  headings: 48,
  sectorDeg: 5,
  maxTws: 40,
  iceMax: 15,
  coastMarginNm: 3,
  tackPenaltyMin: 5,
  maxTacks: 200,
};

export interface IsoInput {
  from: LonLat; // [lon, lat]
  to: LonLat;
  startMs: number;
  wind: WindField;
  polar: Polar;
  land: Landmask;
  ice?: (lat: number, lon: number, tMs: number) => number | null;
  config?: Partial<IsoConfig>;
}

export interface IsoWaypoint {
  lon: number;
  lat: number;
  etaMs: number;
}

export interface IsoLeg {
  from: number;
  to: number;
  nm: number;
  windDir: number;
  windSpeed: number;
  /** Ángulo verdadero del viento respecto del rumbo (valor absoluto). */
  twa: number;
  beat: boolean;
  tacks: number;
}

export interface IsochroneLine {
  t: number;
  coords: LonLat[];
}

export interface IsoResult {
  reached: boolean;
  etaMs: number;
  nm: number;
  tacks: number;
  /** Viento máximo encontrado a lo largo del trazado optimizado (kn), o null. */
  windMax: number | null;
  waypoints: IsoWaypoint[];
  legs: IsoLeg[];
  isochrones: IsochroneLine[];
  steps: number;
}

export interface IsoProgress {
  ratio: number;
  step: number;
  maxSteps: number;
  reached: boolean;
}

// Mensajes del Web Worker (isochrones.worker.ts). Los tipos viven acá, en el
// core puro, para que la UI y el worker los compartan sin arrastrar el worker.
export interface IsoWorkerRun {
  type: "run";
  id: number;
  from: LonLat;
  to: LonLat;
  startMs: number;
  /** Trazado original (para la comparación "vs original"). */
  original: LonLat[];
  pkg: ForecastPackage | null;
  clim: ClimMonth | null;
  polar: Polar;
  landBytes: Uint8Array;
  /** Sin pronóstico: solo climatología (botón "Ruta del mes"). */
  climateOnly: boolean;
  config?: Partial<IsoConfig>;
}

export type IsoWorkerRequest = IsoWorkerRun | { type: "cancel"; id: number };

/** ETA / viento máximo / millas del trazado original con el mismo viento. */
export interface IsoBaseline {
  etaMs: number;
  windMax: number;
  nm: number;
}

export type IsoWorkerResponse =
  | { type: "progress"; id: number; progress: IsoProgress }
  | { type: "done"; id: number; result: IsoResult; baseline: IsoBaseline }
  | { type: "cancelled"; id: number }
  | { type: "error"; id: number; message: string };

interface Node {
  lat: number;
  lon: number;
  t: number;
  heading: number;
  tacks: number;
  parent: Node | null;
}

function normLon(lon: number): number {
  let x = (((lon + 180) % 360) + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

// Avance en el plano local desde (lat, lon) con rumbo `headingDeg` y `nm` nm.
function advance(lat: number, lon: number, headingDeg: number, nm: number): { lat: number; lon: number } {
  const rad = (headingDeg * Math.PI) / 180;
  const dLat = (nm * Math.cos(rad)) / 60;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLon = (nm * Math.sin(rad)) / 60 / cosLat;
  return { lat: Math.max(-89.5, Math.min(89.5, lat + dLat)), lon: normLon(lon + dLon) };
}

// Rumbo relativo (TWA) con signo, en [-180, 180].
function relative(heading: number, windDir: number): number {
  let a = ((heading - windDir + 540) % 360) - 180;
  if (a === -180) a = 180;
  return a;
}

// ¿Hay tierra a menos de `coastDeg` del punto? Se muestrea un anillo (la máscara
// no expone una consulta de proximidad de radio grande).
function nearCoast(land: Landmask, lat: number, lon: number, coastDeg: number): boolean {
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  for (let k = 0; k < 16; k++) {
    const ang = (k * Math.PI) / 8;
    const plat = lat + coastDeg * Math.cos(ang);
    const plon = lon + (coastDeg * Math.sin(ang)) / cosLat;
    if (land.isLand(Math.max(-90, Math.min(90, plat)), plon)) return true;
  }
  return false;
}

// Simplificación Douglas–Peucker sobre [lon, lat]; devuelve índices conservados.
function simplifyIndices(coords: LonLat[], tol: number): number[] {
  const keep = new Set<number>();
  if (coords.length === 0) return [];
  keep.add(0);
  keep.add(coords.length - 1);
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const [ax, ay] = coords[a]!;
    const [bx, by] = coords[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let far = -1;
    let maxD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = coords[i]!;
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
      if (d > maxD) {
        maxD = d;
        far = i;
      }
    }
    if (maxD > tol && far !== -1) {
      keep.add(far);
      stack.push([a, far], [far, b]);
    }
  }
  return [...keep].sort((x, y) => x - y);
}

const MAX_WAYPOINTS = 40;

export function routeOptimal(opts: IsoInput): IsoResult {
  const gen = routeOptimalSteps(opts);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

export function* routeOptimalSteps(opts: IsoInput): Generator<IsoProgress, IsoResult, void> {
  const cfg: IsoConfig = { ...DEFAULT_ISO_CONFIG, ...(opts.config ?? {}) };
  const { wind, polar, land, ice } = opts;
  const origin = { lat: opts.from[1], lon: opts.from[0] };
  const dest = { lat: opts.to[1], lon: opts.to[0] };
  const directBearing = initialBearingDeg(origin.lat, origin.lon, dest.lat, dest.lon);

  const headings: number[] = [];
  const n = Math.max(2, cfg.headings);
  for (let i = 0; i < n; i++) {
    const f = (2 * i) / (n - 1) - 1; // -1 .. 1
    headings.push((directBearing + f * cfg.fanDeg + 360) % 360);
  }
  // Con un número par de rumbos el rumbo directo no cae exacto en la muestra;
  // agregarlo evita un zigzag espurio con viento uniforme.
  headings.push(directBearing);

  const isochrones: IsochroneLine[] = [];
  let frontier: Node[] = [
    { lat: origin.lat, lon: origin.lon, t: opts.startMs, heading: NaN, tacks: 0, parent: null },
  ];
  let reachedNode: Node | null = null;
  let closestNode: Node = frontier[0]!;
  let closestDist = haversineNm(origin.lat, origin.lon, dest.lat, dest.lon);
  let step = 0;

  while (step < cfg.maxSteps && frontier.length > 0 && !reachedNode) {
    const candidates: Node[] = [];
    let reachedCandidate: Node | null = null;
    let reachedDist = Infinity;

    for (const p of frontier) {
      const dtH = nearCoast(land, p.lat, p.lon, cfg.coastDeg) ? cfg.stepCoastH : cfg.stepOceanH;
      const dtMs = dtH * 3600_000;
      const wp = wind(p.lat, p.lon, p.t);
      if (!wp) continue;

      for (const h of headings) {
        const twa = relative(h, wp.dir);
        const speed = boatSpeed(polar, twa, wp.speed);
        if (speed <= 0) continue;
        const advanceNm = speed * dtH;
        const q = advance(p.lat, p.lon, h, advanceNm);
        if (land.isLandWithMargin(q.lat, q.lon, cfg.coastMarginNm)) continue;
        if (ice) {
          const v = ice(q.lat, q.lon, p.t + dtMs);
          if (v !== null && v >= cfg.iceMax) continue;
        }
        const wq = wind(q.lat, q.lon, p.t + dtMs);
        if (!wq || wq.speed > cfg.maxTws) continue;

        const tack = !Number.isNaN(p.heading) && Math.sign(twa) !== Math.sign(relative(p.heading, wp.dir));
        const tacks = p.tacks + (tack ? 1 : 0);
        if (tacks > cfg.maxTacks) continue;
        const t = p.t + dtMs + (tack ? cfg.tackPenaltyMin * 60_000 : 0);
        const node: Node = { lat: q.lat, lon: q.lon, t, heading: h, tacks, parent: p };
        candidates.push(node);

        const d = haversineNm(q.lat, q.lon, dest.lat, dest.lon);
        if (d <= advanceNm * 1.2 || d < 1) {
          // Con varios puntos que llegan a la vez, elige el que queda más cerca
          // del destino (evita un último tramo torcido).
          if (!reachedCandidate || d < reachedDist - 0.05 || (Math.abs(d - reachedDist) <= 0.05 && node.t < reachedCandidate.t)) {
            reachedCandidate = node;
            reachedDist = d;
          }
        }
        if (d < closestDist) {
          closestDist = d;
          closestNode = node;
        }
      }
    }

    if (candidates.length === 0) break;

    // Poda por sectores angulares desde el origen: un sobreviviente por sector
    // (el de menor ETA; empate → el más cercano al destino).
    const sectors = Math.max(1, Math.round(360 / cfg.sectorDeg));
    const best = new Map<number, Node>();
    for (const c of candidates) {
      const brg = initialBearingDeg(origin.lat, origin.lon, c.lat, c.lon);
      const key = Math.round(brg / cfg.sectorDeg) % sectors;
      const prev = best.get(key);
      if (!prev || c.t < prev.t - 1 || (Math.abs(c.t - prev.t) <= 1 && haversineNm(c.lat, c.lon, dest.lat, dest.lon) < haversineNm(prev.lat, prev.lon, dest.lat, dest.lon))) {
        best.set(key, c);
      }
    }
    frontier = [...best.values()];

    isochrones.push({
      t: opts.startMs + (step + 1) * cfg.stepOceanH * 3600_000,
      coords: frontier.map((p) => [p.lon, p.lat] as LonLat),
    });

    step++;
    if (reachedCandidate) reachedNode = reachedCandidate;
    yield {
      ratio: Math.min(1, step / cfg.maxSteps),
      step,
      maxSteps: cfg.maxSteps,
      reached: reachedNode !== null,
    };
  }

  const end = reachedNode ?? closestNode;
  const path: Node[] = [];
  for (let cur: Node | null = end; cur; cur = cur.parent) path.push(cur);
  path.reverse();

  return buildResult(path, dest, opts.startMs, polar, wind, isochrones, step, reachedNode !== null);
}

function buildResult(
  path: Node[],
  dest: { lat: number; lon: number },
  _startMs: number,
  polar: Polar,
  wind: WindField,
  isochrones: IsochroneLine[],
  steps: number,
  reached: boolean,
): IsoResult {
  const raw: LonLat[] = path.map((p) => [p.lon, p.lat] as LonLat);
  const etaOf = path.map((p) => p.t);
  // El último punto se ancla al destino exacto si llegamos.
  if (reached && path.length > 0) {
    raw[raw.length - 1] = [dest.lon, dest.lat];
  }

  const idx = simplifyIndices(raw, 0.1);
  let keep = idx;
  if (idx.length > MAX_WAYPOINTS) {
    const stride = (idx.length - 1) / (MAX_WAYPOINTS - 1);
    const thinned: number[] = [];
    for (let i = 0; i < MAX_WAYPOINTS; i++) thinned.push(idx[Math.round(i * stride)]!);
    keep = [...new Set(thinned)].sort((a, b) => a - b);
  }

  const waypoints: IsoWaypoint[] = keep.map((i) => ({
    lon: raw[i]![0],
    lat: raw[i]![1],
    etaMs: etaOf[i] ?? etaOf[etaOf.length - 1] ?? 0,
  }));

  const legs: IsoLeg[] = [];
  let nm = 0;
  for (let k = 0; k + 1 < keep.length; k++) {
    const a = keep[k]!;
    const b = keep[k + 1]!;
    const legNm = haversineNm(raw[a]![1], raw[a]![0], raw[b]![1], raw[b]![0]);
    nm += legNm;
    const heading = initialBearingDeg(raw[a]![1], raw[a]![0], raw[b]![1], raw[b]![0]);
    const midT = (etaOf[a]! + etaOf[b]!) / 2;
    const midLat = (raw[a]![1] + raw[b]![1]) / 2;
    const midLon = (raw[a]![0] + raw[b]![0]) / 2;
    const wp = wind(midLat, midLon, midT);
    const twaAbs = wp ? Math.abs(relative(heading, wp.dir)) : 0;
    let tacks = 0;
    for (let i = a + 1; i <= b; i++) {
      const cur = path[i]!;
      const prev = path[i - 1]!;
      if (!Number.isNaN(cur.heading) && !Number.isNaN(prev.heading)) {
        const s1 = Math.sign(relative(cur.heading, wp?.dir ?? 0));
        const s2 = Math.sign(relative(prev.heading, wp?.dir ?? 0));
        if (s1 !== 0 && s2 !== 0 && s1 !== s2) tacks++;
      }
    }
    legs.push({
      from: k,
      to: k + 1,
      nm: legNm,
      windDir: wp?.dir ?? 0,
      windSpeed: wp?.speed ?? 0,
      twa: twaAbs,
      beat: twaAbs >= polar.config.deadAngle - 3 && twaAbs <= 55,
      tacks,
    });
  }

  const totalTacks = path[path.length - 1]?.tacks ?? 0;
  const etaMs = etaOf[etaOf.length - 1] ?? _startMs;

  let windMax = 0;
  let windSeen = false;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const wp = wind(p.lat, p.lon, etaOf[i]!);
    if (wp) {
      windSeen = true;
      if (wp.speed > windMax) windMax = wp.speed;
    }
  }

  return {
    reached,
    etaMs,
    nm,
    tacks: totalTacks,
    windMax: windSeen ? windMax : null,
    waypoints,
    legs,
    isochrones,
    steps,
  };
}

// Tiempo y viento máximo de un trazado recorrido con el mismo viento y polar
// (para la comparación honesta "vs original"). Si un tramo cae en el cono muerto
// se estima con la velocidad de ceñida al ángulo muerto (el barco vira).
export function traverseRoute(
  coords: LonLat[],
  startMs: number,
  wind: WindField,
  polar: Polar,
): { etaMs: number; windMax: number; nm: number } {
  let t = startMs;
  let windMax = 0;
  let nm = 0;
  for (let i = 0; i + 1 < coords.length; i++) {
    const [alon, alat] = coords[i]!;
    const [blon, blat] = coords[i + 1]!;
    const legNm = haversineNm(alat, alon, blat, blon);
    if (legNm <= 0) continue;
    nm += legNm;
    const heading = initialBearingDeg(alat, alon, blat, blon);
    const wp = wind((alat + blat) / 2, (alon + blon) / 2, t);
    if (!wp) continue;
    windMax = Math.max(windMax, wp.speed);
    let speed = boatSpeed(polar, Math.abs(relative(heading, wp.dir)), wp.speed);
    if (speed <= 0) speed = boatSpeed(polar, polar.config.deadAngle, wp.speed);
    if (speed <= 0) speed = 0.1;
    t += (legNm / speed) * 3600_000;
  }
  return { etaMs: t, windMax, nm };
}
