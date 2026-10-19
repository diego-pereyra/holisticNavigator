// E13.1 — Persistencia y descarga del paquete de pronóstico.
//
// IndexedDB (vía KeyValueStore, base `hn`) con la clave fija `hn.forecast.<id>`
// (un paquete por caja). El paquete se guarda como binario compacto (Int16
// escala 0,1). UX-N.2 (D2): las cajas son de primera clase (`punto-<hash>`,
// `vista`, `<código de ruta>`), así que un índice liviano en
// `hn.forecast.index` permite listarlas todas y borrarlas por fila.

import {
  forecastBytes,
  forecastKind,
  fetchForecast,
  packForecast,
  unpackForecast,
  type BBox,
  type ForecastKind,
  type ForecastPackage,
} from "../core/forecast.ts";
import type { KeyValueStore } from "./store.ts";

// Índice de cajas guardadas (el KeyValueStore no enumera claves). No colisiona
// con `hn.forecast.<id>`: ningún id de caja es "index".
export const FORECAST_INDEX_KEY = "hn.forecast.index";

export interface ForecastEntry {
  id: string;
  kind: ForecastKind;
  bytes: number;
  savedAt: number; // ms epoch de la descarga (base de la edad visible)
  bbox: BBox;
}

export function forecastKey(id: string): string {
  return `hn.forecast.${id}`;
}

function validEntry(x: unknown): x is ForecastEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Partial<ForecastEntry>;
  return (
    typeof e.id === "string" &&
    typeof e.bytes === "number" &&
    typeof e.savedAt === "number" &&
    Array.isArray(e.bbox) &&
    e.bbox.length === 4 &&
    e.bbox.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

// Lista de cajas guardadas, de la más nueva a la más vieja.
export async function listForecasts(store: KeyValueStore): Promise<ForecastEntry[]> {
  let raw: string | null;
  try {
    raw = await store.get(FORECAST_INDEX_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(validEntry)
      .map((e) => ({ ...e, kind: forecastKind(e.id) }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

async function writeIndex(store: KeyValueStore, entries: ForecastEntry[]): Promise<void> {
  await store.put(FORECAST_INDEX_KEY, JSON.stringify(entries));
}

export async function storeForecast(store: KeyValueStore, pkg: ForecastPackage): Promise<void> {
  const blob = new Blob([packForecast(pkg)], { type: "application/octet-stream" });
  await store.putBlob(forecastKey(pkg.id), blob);
  const entries = await listForecasts(store);
  const entry: ForecastEntry = {
    id: pkg.id,
    kind: forecastKind(pkg.id),
    bytes: forecastBytes(pkg),
    savedAt: pkg.fetchedAt,
    bbox: pkg.bbox,
  };
  await writeIndex(store, [entry, ...entries.filter((e) => e.id !== pkg.id)]);
}

export async function loadForecast(store: KeyValueStore, id: string): Promise<ForecastPackage | null> {
  const blob = await store.getBlob(forecastKey(id));
  if (!blob) return null;
  try {
    return unpackForecast(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

export async function removeForecast(store: KeyValueStore, id: string): Promise<void> {
  await store.removeBlob(forecastKey(id));
  const entries = await listForecasts(store);
  await writeIndex(
    store,
    entries.filter((e) => e.id !== id),
  );
}

// Descarga real (Open-Meteo Forecast + Marine), con progreso 0..1, y la guarda.
// `bbox` va sin margen: `fetchForecast` agrega los 300 nm de la casa.
export async function downloadForecast(
  store: KeyValueStore,
  id: string,
  bbox: BBox,
  onProgress?: (ratio: number) => void,
): Promise<ForecastPackage> {
  const pkg = await fetchForecast(bbox, 3, 7, { id, onProgress });
  await storeForecast(store, pkg);
  return pkg;
}
