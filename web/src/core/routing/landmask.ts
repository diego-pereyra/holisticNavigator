// Máscara de tierra (ADR-008 §Decisión componente 1 / T12.1).
//
// `basemap/land.bits` es una rejilla de bits de 0,1° (3 600 × 1 800), origen
// (-180, -90), filas de sur a norte y 1 = tierra, generada por
// `tools/build_landmask.py`. Consulta O(1); el margen costero se obtiene
// dilatando k celdas.

export const LANDMASK_WIDTH = 3600;
export const LANDMASK_HEIGHT = 1800;
export const LANDMASK_CELL_DEG = 0.1;
export const LANDMASK_BYTES = (LANDMASK_WIDTH * LANDMASK_HEIGHT) / 8; // 810 000

// Celdas por grado (10, porque la rejilla es de 0,1°).
const PER_DEG = 1 / LANDMASK_CELL_DEG;

// E12.6 — índice de celda sin off-by-one de coma flotante: se multiplica por 10
// (en vez de dividir por 0,1, que para 0,1 da 900,99… y cae en la celda 900) y
// se toma el piso. Se multiplica por `PER_DEG` y no se suma 0,5: sumar media
// celda correría la costa media celda (0,05°) y desalinearía la máscara (ver
// BLOCKERS.md).
function cellIndex(v: number, origin: number, count: number): number {
  let i = Math.floor((v + origin) * PER_DEG);
  i = i >= count ? i - count : i < 0 ? i + count : i;
  return i;
}

// Igual que `cellIndex` pero acotado (no envuelve): para la fila (latitud).
function rowIndex(lat: number): number {
  const r = Math.floor((lat + 90) * PER_DEG);
  return r < 0 ? 0 : r >= LANDMASK_HEIGHT ? LANDMASK_HEIGHT - 1 : r;
}

// Vuelta en la antimeridiana para una columna ya calculada.
function wrapCol(c: number): number {
  return c >= LANDMASK_WIDTH ? c - LANDMASK_WIDTH : c < 0 ? c + LANDMASK_WIDTH : c;
}

export interface Landmask {
  readonly width: number;
  readonly height: number;
  /** ¿La posición (lat, lon) cae en una celda de tierra? */
  isLand(lat: number, lon: number): boolean;
  /** Ídem, considerando un margen costero de `nm` millas náuticas. */
  isLandWithMargin(lat: number, lon: number, nm: number): boolean;
}

export function decodeLandmask(bytes: Uint8Array): Landmask {
  if (bytes.length !== LANDMASK_BYTES) {
    throw new Error(`land.bits pesa ${bytes.length} B (esperado ${LANDMASK_BYTES})`);
  }

  // Índice de celda de una posición normalizada: fila = (lat+90)·10 (clamp),
  // columna = (lon+180)·10 (con vuelta en la antimeridiana). Rápido a
  // propósito: es el camino de la consulta O(1).
  const isLand = (lat: number, lon: number): boolean => {
    const col = cellIndex(lon, 180, LANDMASK_WIDTH);
    const row = rowIndex(lat);
    const i = row * LANDMASK_WIDTH + col;
    return (bytes[i >> 3]! & (128 >> (i & 7))) !== 0;
  };

  const isLandWithMargin = (lat: number, lon: number, nm: number): boolean => {
    if (!(nm > 0)) return isLand(lat, lon);
    const k = Math.max(1, Math.ceil(nm / 6)); // 6 nm ≈ 0,1° de latitud
    const col = cellIndex(lon, 180, LANDMASK_WIDTH);
    const row = rowIndex(lat);

    const r0 = row - k < 0 ? 0 : row - k;
    const r1 = row + k >= LANDMASK_HEIGHT ? LANDMASK_HEIGHT - 1 : row + k;
    for (let r = r0; r <= r1; r++) {
      const base = r * LANDMASK_WIDTH;
      for (let dc = -k; dc <= k; dc++) {
        const c = wrapCol(col + dc);
        const i = base + c;
        if ((bytes[i >> 3]! & (128 >> (i & 7))) !== 0) return true;
      }
    }
    return false;
  };

  return { width: LANDMASK_WIDTH, height: LANDMASK_HEIGHT, isLand, isLandWithMargin };
}

export async function loadLandmask(base = document.baseURI): Promise<Landmask> {
  const res = await fetch(new URL("basemap/land.bits", base));
  if (!res.ok) throw new Error(`basemap/land.bits: ${res.status}`);
  return decodeLandmask(new Uint8Array(await res.arrayBuffer()));
}
