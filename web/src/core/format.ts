import { haversineNm, initialBearingDeg } from "./navigation.ts";

// Formateo con unidades (UX-N.4). Por defecto náutico: velocidad kn,
// distancia nm, profundidad m. Soporta km/h, km, ft.

export type SpeedUnit = "kn" | "kmh";
export type DistanceUnit = "nm" | "km";
export type DepthUnit = "m" | "ft";

export interface Units {
  speed: SpeedUnit;
  distance: DistanceUnit;
  depth: DepthUnit;
}

export const DEFAULT_UNITS: Units = {
  speed: "kn",
  distance: "nm",
  depth: "m",
};

const KM_PER_NM = 1.852;
export const FT_PER_M = 3.280839895;

export function formatSpeed(
  knots: number | null | undefined,
  units: Units = DEFAULT_UNITS,
  decimal = true,
): string {
  if (knots === null || knots === undefined || Number.isNaN(knots)) return "—";
  const digits = decimal ? 1 : 0;
  if (units.speed === "kn") {
    return `${knots.toFixed(digits).replace(".", ",")} kn`;
  }
  const kmh = knots * KM_PER_NM;
  return `${kmh.toFixed(digits).replace(".", ",")} km/h`;
}

export function formatDistance(nm: number | null | undefined, units: Units = DEFAULT_UNITS, decimal = true): string {
  if (nm === null || nm === undefined || Number.isNaN(nm)) return "—";
  if (units.distance === "nm") {
    if (decimal) return `${nm.toFixed(1).replace(".", ",")} nm`;
    return `${Math.round(nm).toLocaleString("es-AR")} nm`;
  }
  const km = nm * KM_PER_NM;
  if (decimal) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km).toLocaleString("es-AR")} km`;
}

export function formatDepth(m: number | null | undefined, units: Units = DEFAULT_UNITS): string {
  if (m === null || m === undefined || Number.isNaN(m)) return "—";
  if (units.depth === "m") {
    return `${Math.round(m).toLocaleString("es-AR")} m`;
  }
  const ft = m * FT_PER_M;
  return `${Math.round(ft).toLocaleString("es-AR")} ft`;
}

// E12.13 — duración estimada de una travesía, en días de navegación. Se
// redondea a media jornada (21,2 → "21"; 20,5 → "20,5") porque así se cuenta un
// día de navegación; un viaje que no llega a media se muestra con décimas para
// no decir "0 días". El "≈" va siempre: es un estimado de planificación, no
// una ETA.
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  const days = ms / 86_400_000;
  const half = Math.round(days * 2) / 2;
  const r = days > 0 && half === 0 ? Math.max(0.1, Math.round(days * 10) / 10) : half;
  const txt = Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
  return `≈ ${txt} ${r === 1 ? "día" : "días"}`;
}

// --- UX-N.4b: visibilidad y persistencia ------------------------------------

export interface Visibility {
  mob: boolean;
  fab: boolean;
  scaleNote: boolean;
  graticule: boolean;
  seamarksOnline: boolean;
}

export const DEFAULT_VISIBILITY: Visibility = {
  mob: true,
  fab: true,
  scaleNote: true,
  graticule: true,
  seamarksOnline: true,
};

const VIS_KEYS: (keyof Visibility)[] = ["mob", "fab", "scaleNote", "graticule", "seamarksOnline"];

// Aplica lo persistido sobre los defaults: solo booleanos; ignora basura.
export function applyVisibility(v: unknown): Visibility {
  const out: Visibility = { ...DEFAULT_VISIBILITY };
  if (v && typeof v === "object") {
    for (const k of VIS_KEYS) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === "boolean") out[k] = x;
    }
  }
  return out;
}

// Aplica lo persistido sobre los defaults náuticos; ignora valores inválidos.
export function applyUnits(v: unknown): Units {
  const out: Units = { ...DEFAULT_UNITS };
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (r["speed"] === "kn" || r["speed"] === "kmh") out.speed = r["speed"];
    if (r["distance"] === "nm" || r["distance"] === "km") out.distance = r["distance"];
    if (r["depth"] === "m" || r["depth"] === "ft") out.depth = r["depth"];
  }
  return out;
}

// El MOB activo manda: aunque el interruptor esté apagado, se ve.
export function mobButtonVisible(vis: Visibility, hasPosition: boolean, mobActive: boolean): boolean {
  return mobActive || (vis.mob && hasPosition);
}

// --- UX-N.5 T11.3: Medir (distancias y rumbos por tramo) ---------------------

export interface MeasurePoint {
  lat: number;
  lon: number;
}

export interface MeasureLeg {
  from: MeasurePoint;
  to: MeasurePoint;
  distanceNm: number;
  bearingDeg: number;
}

export interface MeasureResult {
  legs: MeasureLeg[];
  totalNm: number;
}

export function measureLegs(points: MeasurePoint[]): MeasureResult {
  const legs: MeasureLeg[] = [];
  let totalNm = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const distanceNm = haversineNm(from.lat, from.lon, to.lat, to.lon);
    legs.push({ from, to, distanceNm, bearingDeg: initialBearingDeg(from.lat, from.lon, to.lat, to.lon) });
    totalNm += distanceNm;
  }
  return { legs, totalNm };
}

// --- UX-N.5 T9.1: nav-to-wp (posición → próximo waypoint) --------------------

export interface LatLon {
  lat: number;
  lon: number;
}

// Coordenadas [lon, lat] de la línea nav-to-wp, o null si no corresponde
// dibujarla: hace falta ruta activa, posición y un waypoint destino.
export function navToWpLine(
  hasActiveRoute: boolean,
  pos: LatLon | null,
  next: LatLon | null,
): [number, number][] | null {
  if (!hasActiveRoute || !pos || !next) return null;
  return [
    [pos.lon, pos.lat],
    [next.lon, next.lat],
  ];
}
