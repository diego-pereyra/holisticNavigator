// E13.1 — Persistencia y descarga del paquete de pronóstico.
//
// IndexedDB (vía KeyValueStore, base `hn`) con la clave fija `hn.forecast.<id>`
// (un paquete "actual" por travesía; "Actualizar" lo reemplaza). El paquete se
// guarda como binario compacto (Int16 escala 0,1).

import { fetchForecast, packForecast, unpackForecast, type BBox, type ForecastPackage } from "../core/forecast.ts";
import type { KeyValueStore } from "./store.ts";

export function forecastKey(id: string): string {
  return `hn.forecast.${id}`;
}

export async function storeForecast(store: KeyValueStore, pkg: ForecastPackage): Promise<void> {
  const blob = new Blob([packForecast(pkg)], { type: "application/octet-stream" });
  await store.putBlob(forecastKey(pkg.id), blob);
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
}

// Descarga real (Open-Meteo Forecast + Marine), con progreso 0..1, y la guarda.
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
