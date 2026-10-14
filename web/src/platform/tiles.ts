// Zonas de la carta de detalle descargables (E10.2).
//
// El workflow `tiles.yml` publica `world-z6.pmtiles` y una tesela PMTiles por
// zona (`zones/<id>.pmtiles`, zoom 7–10). El deploy las copia al propio sitio
// (mismo origen: sin CORS ni bloqueos). Acá vive la descarga a IndexedDB, el
// índice de zonas y las capas/source que el mapa usa para dibujarlas.

import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { type KeyValueStore } from "./store.ts";

export interface ZoneMeta {
  nombre: string;
  bbox: [number, number, number, number];
  bytes: number;
  sha256?: string;
  url?: string;
  seamarks?: { url?: string; bytes?: number };
}

export interface TilesIndex {
  world?: { url?: string; bytes?: number; sha256?: string; built?: string };
  zones?: Record<string, ZoneMeta>;
}

export interface ZoneState {
  id: string;
  meta: ZoneMeta;
  saved: boolean;
  bytes?: number;
  date?: string;
}

export interface DownloadResult {
  blob: Blob;
  bytes: number;
  date: string;
  seamarks?: string;
}

// Enganchas que la UI usa para avisarle al mapa (main.ts) que una zona se
// descargó o se borró.
export interface ZoneHooks {
  add(id: string, blob: Blob, meta: ZoneMeta, seamarks?: string): void;
  remove(id: string): void;
}

// El índice de zonas queda guardado para poder resolver nombres y bbox sin red
// (la prueba de E10.2 es justamente recargar en modo avión).
const INDEX_KEY = "hn.tiles.index";

export function zoneKey(id: string): string {
  return `hn.tiles.${id}`;
}

export function zoneInfoKey(id: string): string {
  return `hn.tiles.${id}.info`;
}

// Balizas de la zona (E10.3): el GeoJSON de puntos se guarda como string.
export function zoneSeamarksKey(id: string): string {
  return `hn.tiles.${id}.seamarks`;
}

export function zoneProtocolName(id: string): string {
  return `zone-${id}`;
}

export function zoneSourceId(id: string): string {
  return `detail-${id}`;
}

export function zoneSeamarkSourceId(id: string): string {
  return `seamarks-${id}`;
}

export function zoneLayerIds(id: string): string[] {
  return [
    `detail-water-${id}`,
    `detail-earth-${id}`,
    `detail-boundary-${id}`,
    `detail-place-${id}`,
    `detail-${id}-poi`,
    `seamarks-${id}-sym`,
    `seamarks-${id}-name`,
  ];
}

// Las mismas capas que la carta mundial (`detail`, E10.1), más una de puertos y
// balizas (`pois` de OSM). Ahora a zoom 7–10, que es el rango que traen las
// zonas.
export function zoneLayers(id: string): LayerSpecification[] {
  const source = zoneSourceId(id);
  return [
    {
      id: `detail-water-${id}`,
      type: "fill",
      source,
      "source-layer": "water",
      minzoom: 7,
      paint: { "fill-color": "#0b1626" },
    },
    {
      id: `detail-earth-${id}`,
      type: "fill",
      source,
      "source-layer": "earth",
      minzoom: 7,
      paint: { "fill-color": "#1c2733" },
    },
    {
      id: `detail-boundary-${id}`,
      type: "line",
      source,
      "source-layer": "boundaries",
      minzoom: 7,
      filter: ["==", ["get", "kind"], "country"],
      paint: { "line-color": "#3a4a5a", "line-width": 0.6 },
    },
    {
      id: `detail-place-${id}`,
      type: "symbol",
      source,
      "source-layer": "places",
      minzoom: 7,
      layout: { "text-field": ["get", "name"], "text-size": 11 },
      paint: { "text-color": "#9FB0C0", "text-halo-color": "#0b1626", "text-halo-width": 1 },
    },
    {
      id: `detail-${id}-poi`,
      type: "symbol",
      source,
      "source-layer": "pois",
      minzoom: 8,
      filter: ["in", ["get", "kind"], ["literal", ["harbor", "marina", "lighthouse"]]],
      layout: {
        "text-field": [
          "concat",
          ["case", ["==", ["get", "kind"], "lighthouse"], "🏮", "⚓"],
          " ",
          ["coalesce", ["get", "name"], ""],
        ],
        "text-size": 11,
      },
      paint: { "text-color": "#9FB0C0", "text-halo-color": "#0b1626", "text-halo-width": 1 },
    },
  ];
}

// Símbolo por tipo de baliza (E10.3) y color por `colour`. Se dibujan desde
// zoom 11; el nombre, desde 13.
const SEAMARK_SYMBOL: ExpressionSpecification = [
  "match", ["get", "type"],
  ["buoy_lateral", "beacon_lateral"], "●",
  ["buoy_cardinal", "beacon_cardinal"], "◆",
  "buoy_safe_water", "○",
  "buoy_isolated_danger", "◉",
  ["buoy_special", "beacon_special"], "▲",
  ["light_major", "light_minor", "lighthouse"], "✦",
  "harbour", "⚓",
  "mooring", "⊙",
  "●",
];

const SEAMARK_COLOR: ExpressionSpecification = [
  "match", ["get", "colour"],
  "red", "#FF5252",
  "green", "#69F0AE",
  "yellow", "#FFD740",
  "black", "#E0E0E0",
  "white", "#E0E0E0",
  "#B0BEC5",
];

export function zoneSeamarkLayers(id: string): LayerSpecification[] {
  const source = zoneSeamarkSourceId(id);
  return [
    {
      id: `seamarks-${id}-sym`,
      type: "symbol",
      source,
      minzoom: 11,
      layout: {
        "text-field": SEAMARK_SYMBOL,
        "text-size": 16,
        "text-allow-overlap": true,
        "text-padding": 2,
      },
      paint: {
        "text-color": SEAMARK_COLOR,
        "text-halo-color": "#0b1626",
        "text-halo-width": 1.2,
      },
    },
    {
      id: `seamarks-${id}-name`,
      type: "symbol",
      source,
      minzoom: 13,
      filter: ["has", "name"],
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: { "text-color": "#CFE3F2", "text-halo-color": "#0b1626", "text-halo-width": 1 },
    },
  ];
}

// Nombre en castellano del tipo de baliza, para el popup (E10.3).
const SEAMARK_LABELS: Record<string, string> = {
  buoy_lateral: "boya lateral",
  beacon_lateral: "baliza lateral",
  buoy_cardinal: "boya de cardenal",
  beacon_cardinal: "baliza de cardenal",
  buoy_safe_water: "boya de aguas navegables",
  buoy_isolated_danger: "boya de peligro aislado",
  buoy_special: "boya especial",
  beacon_special: "baliza especial",
  light_major: "faro",
  light_minor: "luz",
  lighthouse: "faro",
  harbour: "puerto",
  mooring: "boya de amarre",
};

export function seamarkLabel(type: string): string {
  return SEAMARK_LABELS[type] ?? type;
}

// Tamaño del mundo z≤6 según la release publicada; sirve de referencia en el
// panel si el índice todavía no llegó.
export const WORLD_BYTES_FALLBACK = 45073486;

export async function loadTilesIndex(store: KeyValueStore): Promise<TilesIndex | null> {
  const url = new URL("tiles/tiles.json", document.baseURI).toString();
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (res.ok) {
      const idx = (await res.json()) as TilesIndex;
      void store.put(INDEX_KEY, JSON.stringify(idx));
      return idx;
    }
  } catch {
    /* sin red */
  }
  const saved = await store.get(INDEX_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as TilesIndex;
  } catch {
    return null;
  }
}

// Descarga una zona leyendo el cuerpo por partes para poder mostrar el avance.
// El Blob queda guardado en IndexedDB (clave `hn.tiles.<id>`).
export async function downloadZone(
  store: KeyValueStore,
  id: string,
  onProgress?: (ratio: number) => void,
): Promise<DownloadResult> {
  const url = new URL(`tiles/zones/${id}.pmtiles`, document.baseURI).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`zona ${id}: HTTP ${res.status}`);
  const total = Number(res.headers.get("Content-Length")) || 0;
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.byteLength;
      if (total > 0 && onProgress) onProgress(Math.min(1, received / total));
    }
  } else {
    const buf = new Uint8Array(await res.arrayBuffer());
    chunks.push(buf);
    received = buf.byteLength;
    onProgress?.(1);
  }
  if (total > 0) onProgress?.(1);
  const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
  const date = new Date().toISOString().slice(0, 10);
  await store.putBlob(zoneKey(id), blob);
  await store.put(zoneInfoKey(id), JSON.stringify({ bytes: blob.size, date }));

  // Balizas (E10.3): el GeoJSON de puntos viaja con la zona. Si el sitio no lo
  // tiene, la zona igual queda descargada (sin balizas).
  let seamarks: string | undefined;
  const smUrl = new URL(`tiles/zones/${id}-seamarks.geojson`, document.baseURI).toString();
  try {
    const smRes = await fetch(smUrl, { cache: "no-cache" });
    if (smRes.ok) {
      seamarks = await smRes.text();
      await store.put(zoneSeamarksKey(id), seamarks);
    }
  } catch {
    /* sin balizas */
  }
  return { blob, bytes: blob.size, date, seamarks };
}

export async function getZone(store: KeyValueStore, id: string): Promise<Blob | null> {
  return store.getBlob(zoneKey(id));
}

export async function getZoneInfo(
  store: KeyValueStore,
  id: string,
): Promise<{ bytes: number; date: string } | null> {
  const text = await store.get(zoneInfoKey(id));
  if (!text) return null;
  try {
    return JSON.parse(text) as { bytes: number; date: string };
  } catch {
    return null;
  }
}

export async function getZoneSeamarks(store: KeyValueStore, id: string): Promise<string | null> {
  return store.get(zoneSeamarksKey(id));
}

export async function deleteZone(store: KeyValueStore, id: string): Promise<void> {
  await store.removeBlob(zoneKey(id));
  await store.remove(zoneInfoKey(id));
  await store.remove(zoneSeamarksKey(id));
}

export async function loadTilesIndexSaved(store: KeyValueStore): Promise<TilesIndex | null> {
  const saved = await store.get(INDEX_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as TilesIndex;
  } catch {
    return null;
  }
}

// Estado por zona para el panel: si está descargada, cuánto ocupa y cuándo.
export async function listZones(store: KeyValueStore): Promise<ZoneState[]> {
  const idx = (await loadTilesIndex(store)) ?? (await loadTilesIndexSaved(store));
  const zones = idx?.zones ?? {};
  const out: ZoneState[] = [];
  for (const [id, meta] of Object.entries(zones)) {
    const blob = await store.getBlob(zoneKey(id));
    const info = blob ? await getZoneInfo(store, id) : null;
    out.push({
      id,
      meta,
      saved: blob !== null,
      bytes: blob?.size ?? meta.bytes,
      date: info?.date,
    });
  }
  return out;
}

// ¿El viewport [w,s,e,n] toca la caja de la zona? (sin cruzar el antimeridiano)
export function bboxTouches(
  viewport: [number, number, number, number],
  box: [number, number, number, number],
): boolean {
  const [w1, s1, e1, n1] = viewport;
  const [w2, s2, e2, n2] = box;
  return w1 <= e2 && e1 >= w2 && s1 <= n2 && n1 >= s2;
}
