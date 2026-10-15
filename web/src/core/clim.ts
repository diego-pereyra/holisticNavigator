// Pilot charts (ADR-009 §2 y §5): carga de un mes, acceso por celda con
// interpolación bilineal y muestreo a lo largo de una ruta.

import {
  pointAlongTrack,
  trackLengthNm,
  type LonLat,
  type RouteTrack,
} from "./navigation.ts";

export interface ClimMonth {
  grid: [number, number];
  origin: [number, number];
  fields: number;
  scales: number[];
  data: Uint8Array;
}

export interface ClimCell {
  wu: number;
  wv: number;
  ws: number;
  st: number;
  hs: number;
  cu: number;
  cv: number;
  tc: number;
  ice: number;
}

export interface RouteClimSample {
  lat: number;
  lon: number;
  distNm: number;
  cell: ClimCell;
}

export interface ClimLineString {
  type?: string;
  coordinates: LonLat[];
}

export const CLIM_SCALES: number[] = [0.5, 0.5, 0.5, 1, 0.25, 0.05, 0.05, 1, 1];
export const CLIM_BYTES = 583_200;
const LAND = 255;

const toI8 = (v: number): number => (v > 127 ? v - 256 : v);

export async function loadMonth(month: number): Promise<ClimMonth> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`mes inválido: ${month}`);
  }
  const mm = String(month).padStart(2, "0");
  const base = document.baseURI;
  const [metaRes, binRes] = await Promise.all([
    fetch(new URL("clim/clim.json", base)),
    fetch(new URL(`clim/m${mm}.bin`, base)),
  ]);
  if (!metaRes.ok) throw new Error(`clim/clim.json: ${metaRes.status}`);
  if (!binRes.ok) throw new Error(`clim/m${mm}.bin: ${binRes.status}`);

  const meta = (await metaRes.json()) as {
    grid?: number[];
    origin?: number[];
    fields?: unknown[];
    scales?: number[];
  };
  const data = new Uint8Array(await binRes.arrayBuffer());
  if (data.length !== CLIM_BYTES) {
    throw new Error(`clim/m${mm}.bin pesa ${data.length} B (esperado ${CLIM_BYTES})`);
  }
  return {
    grid: [meta.grid?.[0] ?? 360, meta.grid?.[1] ?? 180],
    origin: [meta.origin?.[0] ?? -180, meta.origin?.[1] ?? -90],
    fields: Array.isArray(meta.fields) && meta.fields.length > 0 ? meta.fields.length : 9,
    scales:
      Array.isArray(meta.scales) && meta.scales.length === CLIM_SCALES.length
        ? meta.scales
        : CLIM_SCALES,
    data,
  };
}

function decode(clim: ClimMonth, i: number, j: number): ClimCell | null {
  const base = (i * clim.grid[0] + j) * 9;
  const d = clim.data;
  const s = clim.scales;
  const wsByte = d[base + 2]!;
  if (wsByte === LAND) return null;
  return {
    wu: toI8(d[base]!) * s[0]!,
    wv: toI8(d[base + 1]!) * s[1]!,
    ws: wsByte * s[2]!,
    st: d[base + 3]! * s[3]!,
    hs: d[base + 4]! * s[4]!,
    cu: toI8(d[base + 5]!) * s[5]!,
    cv: toI8(d[base + 6]!) * s[6]!,
    tc: d[base + 7]! * s[7]!,
    ice: d[base + 8]! * s[8]!,
  };
}

export function getCell(clim: ClimMonth, lat: number, lon: number): ClimCell | null {
  const [nx, ny] = clim.grid;
  const [ox, oy] = clim.origin;
  const fy = Math.max(0, Math.min(ny - 1, lat - oy));
  const fx = (((lon - ox) % nx) + nx) % nx;

  const i0 = Math.min(ny - 1, Math.floor(fy));
  const j0 = Math.floor(fx) % nx;
  const ti = fy - i0;
  const tx = fx - j0;
  const i1 = Math.min(ny - 1, i0 + 1);
  const j1 = (j0 + 1) % nx;

  const terms: Array<[ClimCell | null, number]> = [
    [decode(clim, i0, j0), (1 - ti) * (1 - tx)],
    [decode(clim, i1, j0), ti * (1 - tx)],
    [decode(clim, i0, j1), (1 - ti) * tx],
    [decode(clim, i1, j1), ti * tx],
  ];

  let total = 0;
  for (const [cell, w] of terms) if (cell !== null) total += w;
  if (total === 0) return null;

  const out: ClimCell = { wu: 0, wv: 0, ws: 0, st: 0, hs: 0, cu: 0, cv: 0, tc: 0, ice: 0 };
  for (const [cell, w] of terms) {
    if (cell === null || w === 0) continue;
    const k = w / total;
    out.wu += cell.wu * k;
    out.wv += cell.wv * k;
    out.ws += cell.ws * k;
    out.st += cell.st * k;
    out.hs += cell.hs * k;
    out.cu += cell.cu * k;
    out.cv += cell.cv * k;
    out.tc += cell.tc * k;
    out.ice += cell.ice * k;
  }
  return out;
}

export function sampleAlongRoute(
  clim: ClimMonth,
  route: ClimLineString,
  stepNm = 60,
): RouteClimSample[] {
  const coords = route.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const track: RouteTrack = {
    names: coords.map((_, i) => `WP ${i}`),
    dests: coords.map(() => false),
    corrected: coords.map(() => false),
    coords,
  };
  const total = trackLengthNm(track);
  if (total <= 0) return [];

  const step = stepNm > 0 ? stepNm : 60;
  const out: RouteClimSample[] = [];
  const push = (d: number): void => {
    const p = pointAlongTrack(track, d);
    if (p === null) return;
    const cell = getCell(clim, p[1], p[0]);
    if (cell !== null) out.push({ lat: p[1], lon: p[0], distNm: d, cell });
  };
  for (let d = 0; d < total; d += step) push(d);
  push(total);
  return out;
}
