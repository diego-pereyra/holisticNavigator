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

  // Índice de celda de una posición normalizada: fila = lat·10 + 900 (clamp),
  // columna = lon·10 + 1800 (con vuelta en la antimeridiana). Rápido a
  // propósito: es el camino de la consulta O(1).
  const isLand = (lat: number, lon: number): boolean => {
    let col = ((lon + 180) * PER_DEG) | 0;
    col = col >= LANDMASK_WIDTH ? col - LANDMASK_WIDTH : col < 0 ? col + LANDMASK_WIDTH : col;
    let row = ((lat + 90) * PER_DEG) | 0;
    row = row < 0 ? 0 : row >= LANDMASK_HEIGHT ? LANDMASK_HEIGHT - 1 : row;
    const i = row * LANDMASK_WIDTH + col;
    return (bytes[i >> 3]! & (128 >> (i & 7))) !== 0;
  };

  const isLandWithMargin = (lat: number, lon: number, nm: number): boolean => {
    if (!(nm > 0)) return isLand(lat, lon);
    const k = Math.max(1, Math.ceil(nm / 6)); // 6 nm ≈ 0,1° de latitud

    let col = ((lon + 180) * PER_DEG) | 0;
    col = col >= LANDMASK_WIDTH ? col - LANDMASK_WIDTH : col < 0 ? col + LANDMASK_WIDTH : col;
    let row = ((lat + 90) * PER_DEG) | 0;
    row = row < 0 ? 0 : row >= LANDMASK_HEIGHT ? LANDMASK_HEIGHT - 1 : row;

    const r0 = row - k < 0 ? 0 : row - k;
    const r1 = row + k >= LANDMASK_HEIGHT ? LANDMASK_HEIGHT - 1 : row + k;
    for (let r = r0; r <= r1; r++) {
      const base = r * LANDMASK_WIDTH;
      for (let dc = -k; dc <= k; dc++) {
        let c = col + dc;
        c = c >= LANDMASK_WIDTH ? c - LANDMASK_WIDTH : c < 0 ? c + LANDMASK_WIDTH : c;
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
