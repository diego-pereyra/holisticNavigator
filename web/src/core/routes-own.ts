// Rutas propias (E11.4 / T11.4): modelo puro de waypoints editables, distancia
// por tramo y total, export/import GPX. Las rutas propias se guardan aparte del
// catálogo de Cornell, que nunca se toca.
import { haversineNm, initialBearingDeg } from "./navigation.ts";
import type { ImportedRoute } from "./gpx.ts";

export interface OwnWaypoint {
  name: string;
  lat: number;
  lon: number;
}

export interface OwnRoute {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  waypoints: OwnWaypoint[];
  distanceNm: number;
}

// Prefijo del id de una ruta propia: no colisiona con los códigos del libro.
export const OWN_PREFIX = "MIA-";

export function isOwnCode(code: string): boolean {
  return code.startsWith(OWN_PREFIX);
}

// Nombre por defecto del próximo waypoint (WP1, WP2…), sin repetir los usados.
export function defaultName(route: OwnRoute): string {
  const used = new Set(route.waypoints.map((w) => w.name));
  let n = route.waypoints.length + 1;
  while (used.has(`WP${n}`)) n += 1;
  return `WP${n}`;
}

export function newOwnRoute(id: string, name: string, now = Date.now()): OwnRoute {
  const clean = name.trim() === "" ? "Ruta sin nombre" : name.trim();
  return { id, name: clean, createdAt: now, updatedAt: now, waypoints: [], distanceNm: 0 };
}

export function legNm(route: OwnRoute): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < route.waypoints.length; i++) {
    const a = route.waypoints[i]!;
    const b = route.waypoints[i + 1]!;
    out.push(haversineNm(a.lat, a.lon, b.lat, b.lon));
  }
  return out;
}

export function legBearingsDeg(route: OwnRoute): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < route.waypoints.length; i++) {
    const a = route.waypoints[i]!;
    const b = route.waypoints[i + 1]!;
    out.push(initialBearingDeg(a.lat, a.lon, b.lat, b.lon));
  }
  return out;
}

export function totalNm(route: OwnRoute): number {
  let sum = 0;
  for (const d of legNm(route)) sum += d;
  return sum;
}

function normalize(route: OwnRoute): OwnRoute {
  return { ...route, distanceNm: totalNm(route) };
}

export function addWaypoint(route: OwnRoute, lat: number, lon: number, name?: string): OwnRoute {
  const wp: OwnWaypoint = { name: name?.trim() || defaultName(route), lat, lon };
  return normalize({ ...route, waypoints: [...route.waypoints, wp] });
}

// Inserta un waypoint antes de `index` (0..length); fuera de rango, agrega al final.
export function insertWaypoint(
  route: OwnRoute,
  index: number,
  lat: number,
  lon: number,
  name?: string,
): OwnRoute {
  const len = route.waypoints.length;
  const at = index < 0 || index > len ? len : index;
  const wp: OwnWaypoint = { name: name?.trim() || defaultName(route), lat, lon };
  const waypoints = [...route.waypoints.slice(0, at), wp, ...route.waypoints.slice(at)];
  return normalize({ ...route, waypoints });
}

export function moveWaypoint(route: OwnRoute, index: number, lat: number, lon: number): OwnRoute {
  if (index < 0 || index >= route.waypoints.length) return route;
  const waypoints = route.waypoints.map((w, i) => (i === index ? { ...w, lat, lon } : w));
  return normalize({ ...route, waypoints });
}

export function renameWaypoint(route: OwnRoute, index: number, name: string): OwnRoute {
  const current = route.waypoints[index];
  if (!current) return route;
  const clean = name.trim() === "" ? current.name : name.trim();
  const waypoints = route.waypoints.map((w, i) => (i === index ? { ...w, name: clean } : w));
  return normalize({ ...route, waypoints });
}

export function removeWaypoint(route: OwnRoute, index: number): OwnRoute {
  if (index < 0 || index >= route.waypoints.length) return route;
  const waypoints = route.waypoints.filter((_, i) => i !== index);
  return normalize({ ...route, waypoints });
}

export function reverseRoute(route: OwnRoute): OwnRoute {
  return normalize({ ...route, waypoints: [...route.waypoints].reverse() });
}

// E12.5 — reemplaza todos los waypoints (aplicar la optimización del viento):
// conserva id, nombre y fecha de creación, recalcula la distancia y actualiza
// la fecha de modificación. Waypoints independientes de los de entrada.
export function replaceWaypoints(
  route: OwnRoute,
  points: { name: string; lat: number; lon: number }[],
  now = Date.now(),
): OwnRoute {
  return normalize({
    ...route,
    updatedAt: now,
    waypoints: points.map((w) => ({ name: w.name, lat: w.lat, lon: w.lon })),
  });
}

export function renameRoute(route: OwnRoute, name: string): OwnRoute {
  const clean = name.trim() === "" ? route.name : name.trim();
  return { ...route, name: clean };
}

// E11.5 — sufijo de una ruta copiada: "AN12 (copia)", "Mi salida (copia)".
export function copyName(base: string): string {
  return `${base} (copia)`;
}

// E11.5 — copia editable de una ruta propia: nuevo id y nombre, waypoints
// independientes (editar la copia no toca la original), distancia recalculada.
export function copyOwnRoute(route: OwnRoute, id: string, name: string, now = Date.now()): OwnRoute {
  return normalize({
    id,
    name: name.trim() === "" ? copyName(route.name) : name,
    createdAt: now,
    updatedAt: now,
    waypoints: route.waypoints.map((w) => ({ ...w })),
    distanceNm: 0,
  });
}

// E11.5 — ruta propia a partir de puntos con nombre (copiar una ruta del libro o
// una importada): mismo orden y nombres de waypoint.
export function ownRouteFromPoints(
  id: string,
  name: string,
  points: { name: string; lat: number; lon: number }[],
  now = Date.now(),
): OwnRoute {
  return normalize({
    id,
    name: name.trim() === "" ? "Ruta sin nombre" : name.trim(),
    createdAt: now,
    updatedAt: now,
    waypoints: points.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon })),
    distanceNm: 0,
  });
}

export function ownRouteToGpx(route: OwnRoute): string {
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Holistic Navigator" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <rte>",
    `    <name>${xml(route.name)}</name>`,
  ];
  for (const w of route.waypoints) {
    parts.push(`    <rtept lat="${w.lat}" lon="${w.lon}"><name>${xml(w.name)}</name></rtept>`);
  }
  parts.push("  </rte>", "</gpx>", "");
  return parts.join("\n");
}

export function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Convierte una ruta importada (GPX/KML/CSV) en ruta propia editable.
export function importedToOwn(imported: ImportedRoute, id: string, now = Date.now()): OwnRoute {
  let route = newOwnRoute(id, imported.name, now);
  imported.points.forEach((p, i) => {
    route = addWaypoint(route, p.lat, p.lon, `WP${i + 1}`);
  });
  return { ...route, updatedAt: now };
}

export function serializeOwnRoute(route: OwnRoute): string {
  return JSON.stringify(route);
}

export function parseOwnRoute(text: string): OwnRoute | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<OwnRoute>;
  if (typeof r.id !== "string" || typeof r.name !== "string" || !Array.isArray(r.waypoints)) {
    return null;
  }
  const waypoints: OwnWaypoint[] = [];
  for (const w of r.waypoints) {
    const wp = w as Partial<OwnWaypoint>;
    if (typeof wp.name !== "string" || !Number.isFinite(wp.lat) || !Number.isFinite(wp.lon)) continue;
    waypoints.push({ name: wp.name, lat: wp.lat as number, lon: wp.lon as number });
  }
  return normalize({
    id: r.id,
    name: r.name,
    createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : Date.now(),
    updatedAt: Number.isFinite(r.updatedAt) ? (r.updatedAt as number) : Date.now(),
    waypoints,
    distanceNm: 0,
  });
}
