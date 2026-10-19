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
const FT_PER_M = 3.280839895;

export function formatSpeed(knots: number | null | undefined, units: Units = DEFAULT_UNITS): string {
  if (knots === null || knots === undefined || Number.isNaN(knots)) return "—";
  if (units.speed === "kn") {
    return `${knots.toFixed(1).replace(".", ",")} kn`;
  }
  const kmh = knots * KM_PER_NM;
  return `${kmh.toFixed(1).replace(".", ",")} km/h`;
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
