// UX-N.1 — acciones de la hoja `hn-point-actions` (D1). Acá vive lo puro y
// testeable; la hoja y los flujos están en app.ts.

import { forecastHorizon } from "../core/routing/windfield.ts";
import type { ForecastPackage } from "../core/forecast.ts";

export const POINT_ACTIONS = [
  { id: "clima", label: "Clima acá" },
  { id: "medir", label: "Medir desde acá" },
  { id: "optimizar", label: "Optimizar desde acá" },
  { id: "posicion", label: "Fijar posición acá" },
  { id: "waypoint", label: "Waypoint acá" },
] as const;

export type PointActionId = (typeof POINT_ACTIONS)[number]["id"];

// ¿Cubre el paquete de pronóstico este punto a esta hora? Solo dentro de su
// caja y no más allá del horizonte; fuera, la respuesta honesta es "no".
export function forecastCoversPoint(
  pkg: ForecastPackage | null,
  lat: number,
  lon: number,
  tMs: number,
): boolean {
  if (!pkg) return false;
  const x = ((lon + 180) % 360 + 360) % 360 - 180;
  const [w, s, e, n] = pkg.bbox;
  if (lat < s || lat > n) return false;
  // Una caja que cruza el antimeridano tiene oeste > este.
  const inLon = w <= e ? x >= w && x <= e : x >= w || x <= e;
  if (!inLon) return false;
  return tMs <= forecastHorizon(pkg);
}
