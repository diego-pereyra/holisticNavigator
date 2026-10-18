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
import { formatLat, formatLon } from "../coords.ts";
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
  /** Máximo de waypoints conservados al simplificar (por tramo). */
  maxWaypoints: number;
  // E12.6 — penalizaciones de los modos de enrutado (Confort/Crucero/Regata).
  // Ceñida: por debajo de `beatTwaDeg`, la velocidad se multiplica por un factor
  // que baja linealmente de 1 en `beatTwaDeg` hasta `beatPenaltyMin` en el cono
  // muerto (0 = sin penalización).
  beatTwaDeg: number;
  beatPenaltyMin: number;
  /** Viento fuerte: por encima de `heavyTwsKn`, factor `heavyPenalty` (Infinity = ninguno). */
  heavyTwsKn: number;
  heavyPenalty: number;
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
  maxWaypoints: 40,
  beatTwaDeg: 0,
  beatPenaltyMin: 1,
  heavyTwsKn: Infinity,
  heavyPenalty: 1,
};

// E12.6 — modos de ponderación del optimizador (reglas de Diego): cada uno es un
// preset de `IsoConfig`. Confort vira lo menos posible aunque alargue el ETA;
// Crucero es el equilibrio por defecto; Regata usa la polar cruda (ETA mínimo).
export type RoutingMode = "confort" | "crucero" | "regata";

export interface RoutingModeDef {
  id: RoutingMode;
  label: string;
  hint: string;
  config: Partial<IsoConfig>;
}

export const ROUTING_MODES: RoutingModeDef[] = [
  {
    id: "confort",
    label: "Confort",
    hint: "Casi sin ceñida y viento suave; vira lo menos posible aunque el ETA se alargue.",
    config: { beatTwaDeg: 70, beatPenaltyMin: 0.55, heavyTwsKn: 18, heavyPenalty: 0.6, tackPenaltyMin: 20, maxTws: 22, maxWaypoints: 15 },
  },
  {
    id: "crucero",
    label: "Crucero",
    hint: "Equilibrio: evita la ceñida sin demorar el ETA de forma absurda.",
    config: { beatTwaDeg: 55, beatPenaltyMin: 0.75, heavyTwsKn: 25, heavyPenalty: 0.75, tackPenaltyMin: 10, maxTws: 30, maxWaypoints: 15 },
  },
  {
    id: "regata",
    label: "Regata",
    hint: "Polar cruda, vira seguido y va por el ETA mínimo.",
    config: { beatTwaDeg: 0, beatPenaltyMin: 1, heavyTwsKn: Infinity, heavyPenalty: 1, tackPenaltyMin: 3, maxTws: 45, maxWaypoints: 15 },
  },
];

export const DEFAULT_ROUTING_MODE: RoutingMode = "crucero";

export function routingModeConfig(mode: RoutingMode): Partial<IsoConfig> {
  return (ROUTING_MODES.find((m) => m.id === mode) ?? ROUTING_MODES[1]!).config;
}

export function routingModeLabel(mode: RoutingMode): string {
  return ROUTING_MODES.find((m) => m.id === mode)?.label ?? "Crucero";
}

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
  /** E12.7 — el waypoint cae en una virada (bordo): se numera "Bordo n" al aplicar. */
  tack?: boolean;
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
  /** E12.7 — si no se llegó, por qué (texto corto). Ausente si `reached`. */
  reason?: string;
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
  startMs: number;
  /** Waypoints obligatorios en orden: extremos de cada tramo (>= 2). */
  anchors: LonLat[];
  /** Trazado original completo (para la comparación "vs original"). */
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

// E12.6 — resultado de un tramo entre dos waypoints obligatorios consecutivos.
export interface IsoLegSegment {
  reached: boolean;
  /** ETA absoluta al final del tramo (ms). */
  etaMs: number;
  nm: number;
  tacks: number;
  windMax: number | null;
  /** Puntos optimizados intermedios (sin los extremos obligatorios). */
  points: IsoWaypoint[];
  isochrones: IsochroneLine[];
  /** E12.7 — por qué no llegó este tramo (texto corto). Ausente si llegó. */
  reason?: string;
}

// E12.6 — resultado de la optimización tramo a tramo: la ruta optimizada
// completa es anchors[0] + segments[0].points + anchors[1] + … + anchors[n].
export interface IsoMultiResult {
  reached: boolean;
  etaMs: number;
  nm: number;
  tacks: number;
  windMax: number | null;
  anchors: LonLat[];
  segments: IsoLegSegment[];
  isochrones: IsochroneLine[];
  steps: number;
  /** E12.7 — si algún tramo no llegó, por qué (texto corto). Ausente si `reached`. */
  reason?: string;
}

export type IsoWorkerResponse =
  | { type: "progress"; id: number; progress: IsoProgress }
  | { type: "done"; id: number; result: IsoMultiResult; baseline: IsoBaseline }
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

// E12.6 — factor de velocidad del modo: penaliza la ceñida (por debajo de
// `beatTwaDeg`, bajando hasta `beatPenaltyMin` en el cono muerto) y el viento
// fuerte (por encima de `heavyTwsKn`). Con la config por defecto no penaliza.
function modeSpeedFactor(cfg: IsoConfig, deadAngle: number, twaAbs: number, tws: number): number {
  let f = 1;
  if (cfg.beatTwaDeg > 0 && cfg.beatPenaltyMin < 1 && twaAbs < cfg.beatTwaDeg) {
    const span = Math.max(1, cfg.beatTwaDeg - deadAngle);
    const x = Math.min(1, (cfg.beatTwaDeg - twaAbs) / span);
    f *= 1 - x * (1 - cfg.beatPenaltyMin);
  }
  if (Number.isFinite(cfg.heavyTwsKn) && tws > cfg.heavyTwsKn) f *= cfg.heavyPenalty;
  return f;
}

// E12.7 — un punto está en la "zona exenta" de un ancla (extremo del tramo): se
// admite tierra en el radio de gracia (un puerto puede estar en tierra/a <3 nm).
function inExemptZone(lat: number, lon: number, exempt: LonLat[] | undefined, graceDeg: number): boolean {
  if (!exempt) return false;
  for (const a of exempt) {
    if (Math.abs(lat - a[1]) <= graceDeg && Math.abs(lon - a[0]) <= graceDeg) return true;
  }
  return false;
}

// E12.6/E12.7 — camino libre de tierra en TODO el segmento p→q (no solo en el
// punto de aterrizaje): recorre con paso ≤ 0,05° ("supercover") para no poder
// salvar una isla de una sola celda (0,1°) saltándola de borde a borde. Los
// extremos ancla (puerto de salida/llegada) quedan exentos (`exempt`).
function segmentClear(
  land: Landmask,
  lat0: number,
  lon0: number,
  lat1: number,
  lon1: number,
  marginNm: number,
  exempt?: LonLat[],
  anchor?: { lon: number; lat: number },
) {
  // E12.8 — un waypoint obligatorio (ancla) es correcto por definición: JAMÁS se
  // rechaza por tierra. El optimizador confía en él.
  const ex: LonLat[] = exempt ? [...exempt] : [];
  if (anchor) ex.push([anchor.lon, anchor.lat]);
  // E12.8 — gracia por ancla: la confianza es en el PUNTO del ancla, no en un
  // radio grande. 0,05° (3 nm, igual al margen) deja salir/entrar a un puerto
  // en tierra sin abrir una "zona segura" donde el optimizador recorte tierra.
  // (El 0,2° del spec dejaba navegar 12 nm sobre tierra junto al ancla.)
  const graceDeg = 0.05;
  const dLat = lat1 - lat0;
  const dLon = lon1 - lon0;
  const spanDeg = Math.max(Math.abs(dLat), Math.abs(dLon));
  const steps = Math.max(1, Math.ceil(spanDeg / 0.05));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const lat = lat0 + dLat * f;
    const lon = normLon(lon0 + dLon * f);
    if (inExemptZone(lat, lon, ex, graceDeg)) continue;
    if (land.isLandWithMargin(lat, lon, marginNm)) return false;
  }
  return true;
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
  // E12.6/E12.7 — extremos exentos: el puerto de salida y la llegada pueden estar
  // en tierra o a <3 nm de la costa; la costa del medio sigue validada.
  const exempt: LonLat[] = [opts.from, opts.to];
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

  // E12.7 — el último tramo (salto de anclaje) también se valida: hay que poder
  // entrar al destino (viento navegable y corredor libre, con extremos exentos).
  const reachableEnd = (fromLat: number, fromLon: number, tMs: number): boolean => {
    const wd = wind(dest.lat, dest.lon, tMs);
    if (!wd || wd.speed > cfg.maxTws) return false;
    return segmentClear(land, fromLat, fromLon, dest.lat, dest.lon, cfg.coastMarginNm, exempt, dest);
  };

  // E12.8 — por qué mueren los candidatos, para poder decir DÓNDE y POR QUÉ no
  // se pudo avanzar (antes se diagnosticaba la recta origen→destino: mentía).
  interface Deaths {
    land: number;
    wind: number;
    tws: number;
    tack: number;
    ice: number;
  }
  let reachedCandidate: Node | null = null;
  let reachedDist = Infinity;
  let deathPos: { lat: number; lon: number } | null = null;
  let deathDeaths: Deaths | null = null;

  const expand = (p: Node, dtH: number, out: Node[], nd: Deaths): number => {
    const startLen = out.length;
    const dtMs = dtH * 3600_000;
    const wp = wind(p.lat, p.lon, p.t);
    if (!wp) {
      nd.wind++;
      return out.length - startLen;
    }
    for (const h of headings) {
      const twa = relative(h, wp.dir);
      let speed = boatSpeed(polar, twa, wp.speed);
      if (speed <= 0) continue;
      // El modo penaliza la ceñida y el viento fuerte solo a vela (a motor el
      // rumbo no importa).
      if (wp.speed >= polar.config.motorTws) {
        speed *= modeSpeedFactor(cfg, polar.config.deadAngle, Math.abs(twa), wp.speed);
      }
      if (speed <= 0) continue;
      const advanceNm = speed * dtH;
      const q = advance(p.lat, p.lon, h, advanceNm);
      // E12.6/E12.7: valida TODO el salto, no solo el punto de aterrizaje.
        if (!segmentClear(land, p.lat, p.lon, q.lat, q.lon, cfg.coastMarginNm, exempt, { lat: origin.lat, lon: origin.lon })) {
          nd.land++;
          continue;
        }
      if (ice) {
        const v = ice(q.lat, q.lon, p.t + dtMs);
        if (v !== null && v >= cfg.iceMax) {
          nd.ice++;
          continue;
        }
      }
      const wq = wind(q.lat, q.lon, p.t + dtMs);
      if (!wq) {
        nd.wind++;
        continue;
      }
      if (wq.speed > cfg.maxTws) {
        nd.tws++;
        continue;
      }

      const tack = !Number.isNaN(p.heading) && Math.sign(twa) !== Math.sign(relative(p.heading, wp.dir));
      const tacks = p.tacks + (tack ? 1 : 0);
      if (tacks > cfg.maxTacks) {
        nd.tack++;
        continue;
      }
      const t = p.t + dtMs + (tack ? cfg.tackPenaltyMin * 60_000 : 0);
      const node: Node = { lat: q.lat, lon: q.lon, t, heading: h, tacks, parent: p };
      out.push(node);

      const d = haversineNm(q.lat, q.lon, dest.lat, dest.lon);
      if ((d <= advanceNm * 1.2 || d < 1) && reachableEnd(q.lat, q.lon, node.t)) {
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
    return out.length - startLen;
  };

  while (step < cfg.maxSteps && frontier.length > 0 && !reachedNode) {
    const candidates: Node[] = [];
    reachedCandidate = null;
    reachedDist = Infinity;

    for (const p of frontier) {
      const nd: Deaths = { land: 0, wind: 0, tws: 0, tack: 0, ice: 0 };
      let dtH = nearCoast(land, p.lat, p.lon, cfg.coastDeg) ? cfg.stepCoastH : cfg.stepOceanH;
      let produced = expand(p, dtH, candidates, nd);
      // E12.8 — paso adaptativo: si un punto no produjo ningún candidato y murió
      // por tierra, reintenta con Δt reducido (piso 15 min) para no saltear los
      // canales más angostos que el avance de un paso.
      while (produced === 0 && nd.land > 0 && dtH > 0.25) {
        dtH = Math.max(0.25, dtH / 2);
        produced = expand(p, dtH, candidates, nd);
      }
      if (produced === 0) {
        if (!deathDeaths) deathDeaths = { land: 0, wind: 0, tws: 0, tack: 0, ice: 0 };
        deathDeaths.land += nd.land;
        deathDeaths.wind += nd.wind;
        deathDeaths.tws += nd.tws;
        deathDeaths.tack += nd.tack;
        deathDeaths.ice += nd.ice;
      }
    }

    if (candidates.length === 0) {
      // El punto de la frontera más cercano al destino es donde murió.
      for (const p of frontier) {
        if (!deathPos) deathPos = { lat: p.lat, lon: p.lon };
        else if (haversineNm(p.lat, p.lon, dest.lat, dest.lon) < haversineNm(deathPos.lat, deathPos.lon, dest.lat, dest.lon)) deathPos = { lat: p.lat, lon: p.lon };
      }
      if (!deathDeaths) deathDeaths = { land: 0, wind: 0, tws: 0, tack: 0, ice: 0 };
      break;
    }
    deathPos = null;
    deathDeaths = null;

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

  const reached = reachedNode !== null;
  let reason: string | undefined;
  if (!reached) {
    if (deathPos && deathDeaths) {
      const pos = `(${formatLat(deathPos.lat)}, ${formatLon(deathPos.lon)})`;
      const causes: Array<[number, string]> = [
        [deathDeaths.land, `sin corredor navegable cerca de ${pos}`],
        [deathDeaths.wind, `sin datos de viento cerca de ${pos}`],
        [deathDeaths.tws, `viento fuerte (supera el máximo del modo) cerca de ${pos}`],
        [deathDeaths.tack, `se agotó el límite de bordos cerca de ${pos}`],
        [deathDeaths.ice, `el hielo bloquea el paso cerca de ${pos}`],
      ];
      causes.sort((a, b) => b[0] - a[0]);
      reason = causes[0]![0] > 0 ? causes[0]![1] : `no se pudo avanzar cerca de ${pos}`;
    } else {
      reason = "se agotaron los pasos antes de llegar";
    }
  }

  return buildResult(path, dest, opts.startMs, polar, wind, isochrones, step, reached, cfg.maxWaypoints, reason, land, cfg, exempt);
}

// E12.6 — optimización tramo a tramo: los `anchors` son los waypoints
// obligatorios en orden; cada tramo entre consecutivos se optimiza como una
// pasada de isócronas independiente y se concatena.
export interface IsoMultiInput {
  anchors: LonLat[];
  startMs: number;
  wind: WindField;
  polar: Polar;
  land: Landmask;
  ice?: (lat: number, lon: number, tMs: number) => number | null;
  config?: Partial<IsoConfig>;
}

export function routeOptimalMulti(opts: IsoMultiInput): IsoMultiResult {
  const gen = routeOptimalMultiSteps(opts);
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

export function* routeOptimalMultiSteps(opts: IsoMultiInput): Generator<IsoProgress, IsoMultiResult, void> {
  const anchors = opts.anchors;
  const n = Math.max(1, anchors.length - 1);
  const segments: IsoLegSegment[] = [];
  const isochrones: IsochroneLine[] = [];
  let startMs = opts.startMs;
  let nm = 0;
  let tacks = 0;
  let steps = 0;
  let reached = true;
  let windMax: number | null = null;
  let reason: string | undefined;

  for (let leg = 0; leg + 1 < anchors.length; leg++) {
    const gen = routeOptimalSteps({
      from: anchors[leg]!,
      to: anchors[leg + 1]!,
      startMs,
      wind: opts.wind,
      polar: opts.polar,
      land: opts.land,
      ice: opts.ice,
      config: opts.config,
    });
    let cur = gen.next();
    while (!cur.done) {
      yield {
        ratio: Math.min(1, (leg + cur.value.ratio) / n),
        step: cur.value.step,
        maxSteps: cur.value.maxSteps,
        reached: cur.value.reached,
      };
      cur = gen.next();
    }
    const r = cur.value;
    // El primer punto es el ancla de salida; si llegó, el último también es el
    // ancla de llegada (los aporta la UI). Sin llegar, se conserva el último.
    const points = r.reached ? r.waypoints.slice(1, -1) : r.waypoints.slice(1);
    segments.push({
      reached: r.reached,
      etaMs: r.etaMs,
      nm: r.nm,
      tacks: r.tacks,
      windMax: r.windMax,
      points,
      isochrones: r.isochrones,
      ...(r.reached ? {} : { reason: r.reason }),
    });
    for (const iso of r.isochrones) isochrones.push(iso);
    startMs = r.etaMs;
    nm += r.nm;
    tacks += r.tacks;
    steps += r.steps;
    if (r.windMax !== null) windMax = windMax === null ? r.windMax : Math.max(windMax, r.windMax);
    if (!r.reached) {
      reached = false;
      if (!reason) reason = r.reason;
    }
  }

  return { reached, etaMs: startMs, nm, tacks, windMax, anchors, segments, isochrones, steps, ...(reason ? { reason } : {}) };
}

// Ruta optimizada completa (anclas + puntos intermedios de cada tramo). E12.7: si
// un tramo no llegó, se corta ahí (nunca se dibuja una recta ancla-a-ancla).
export function multiRouteCoords(result: IsoMultiResult): LonLat[] {
  const out: LonLat[] = [];
  if (result.anchors.length === 0) return out;
  out.push(result.anchors[0]!);
  for (let i = 0; i < result.segments.length; i++) {
    const seg = result.segments[i]!;
    for (const p of seg.points) out.push([p.lon, p.lat]);
    if (!seg.reached) break;
    const anchor = result.anchors[i + 1];
    if (anchor) out.push(anchor);
  }
  return out;
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
  maxWaypoints: number,
  reason?: string,
  land?: Landmask,
  cfg?: IsoConfig,
  exempt?: LonLat[],
): IsoResult {
  const raw: LonLat[] = path.map((p) => [p.lon, p.lat] as LonLat);
  const etaOf = path.map((p) => p.t);
  // El último punto se ancla al destino exacto si llegamos.
  if (reached && path.length > 0) {
    raw[raw.length - 1] = [dest.lon, dest.lat];
  }

  const idx = simplifyIndices(raw, 0.1);
  let keep = idx;
  const cap = Math.max(2, maxWaypoints);
  if (idx.length > cap) {
    const stride = (idx.length - 1) / (cap - 1);
    const thinned: number[] = [];
    for (let i = 0; i < cap; i++) thinned.push(idx[Math.round(i * stride)]!);
    keep = [...new Set(thinned)].sort((a, b) => a - b);
  }

  // E12.7 — post-verificación de la simplificación: el recorte no puede meter un
  // tramo que cruce tierra con margen ni que cruce viento > máximo del modo. Si
  // pasa, se reintroducen puntos crudos (bisección) hasta que el trazado sea válido.
  if (land && cfg) {
    const marginNm = cfg.coastMarginNm;
    const maxTws = cfg.maxTws;
    const pairOk = (a: number, b: number): boolean => {
      if (!segmentClear(land, raw[a]![1], raw[a]![0], raw[b]![1], raw[b]![0], marginNm, exempt)) return false;
      const midT = (etaOf[a]! + etaOf[b]!) / 2;
      const wm = wind((raw[a]![1] + raw[b]![1]) / 2, normLon((raw[a]![0] + raw[b]![0]) / 2), midT);
      return !(wm && wm.speed > maxTws);
    };
    let guard = 0;
    while (keep.length >= 2 && guard++ < raw.length + 1) {
      let bad = -1;
      for (let k = 0; k + 1 < keep.length; k++) {
        if (!pairOk(keep[k]!, keep[k + 1]!)) { bad = k; break; }
      }
      if (bad < 0) break;
      const a = keep[bad]!;
      const b = keep[bad + 1]!;
      if (b - a < 2) {
        keep = raw.map((_, i) => i);
        break;
      }
      keep = [...keep, Math.floor((a + b) / 2)].sort((x, y) => x - y);
    }
  }

  const waypoints: IsoWaypoint[] = keep.map((i) => {
    const wp: IsoWaypoint = {
      lon: raw[i]![0],
      lat: raw[i]![1],
      etaMs: etaOf[i] ?? etaOf[etaOf.length - 1] ?? 0,
    };
    // E12.7 — marca de virada: el rumbo entra por un lado y sale por el otro.
    if (i > 0 && i < raw.length - 1) {
      const hIn = initialBearingDeg(raw[i - 1]![1], raw[i - 1]![0], raw[i]![1], raw[i]![0]);
      const hOut = initialBearingDeg(raw[i]![1], raw[i]![0], raw[i + 1]![1], raw[i + 1]![0]);
      const w = wind(raw[i]![1], raw[i]![0], wp.etaMs);
      if (w) {
        const sIn = Math.sign(relative(hIn, w.dir));
        const sOut = Math.sign(relative(hOut, w.dir));
        if (sIn !== 0 && sOut !== 0 && sIn !== sOut) wp.tack = true;
      }
    }
    return wp;
  });

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
    ...(reason ? { reason } : {}),
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
