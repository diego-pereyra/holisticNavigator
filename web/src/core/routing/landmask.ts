// Máscara de tierra (ADR-008 §Decisión componente 1 / T12.1).
//
// `basemap/land.bits` es una rejilla de bits de 0,1° (3 600 × 1 800), origen
// (-180, -90), filas de sur a norte y 1 = tierra, generada por
// `tools/build_landmask.py`. Consulta O(1); el margen costero (E12.8) sale de una
// transformada de distancia chamfer calculada una vez al decodificar.

export const LANDMASK_WIDTH = 3600;
export const LANDMASK_HEIGHT = 1800;
export const LANDMASK_CELL_DEG = 0.1;
export const LANDMASK_BYTES = (LANDMASK_WIDTH * LANDMASK_HEIGHT) / 8; // 810 000

// E12.8 — transformada de distancia: distancia en nm de cada celda a la costa
// más cercana. Se guarda en décimas de nm (enteros) para no ocupar 26 MB.
const NM_PER_DEG_LAT = 60;
const DIST_SCALE = 10; // décimas de nm
const DIST_MAX = 0xffff; // sin tierra cerca (6553,5 nm)
const HALF_CELL_NM = 3; // 0,05° de latitud: media celda, para medir a la costa
const V_STEP = Math.round(LANDMASK_CELL_DEG * NM_PER_DEG_LAT * DIST_SCALE); // 60

// Celdas por grado (10, porque la rejilla es de 0,1°).
const PER_DEG = 1 / LANDMASK_CELL_DEG;

// E12.6/E12.7 — índice de celda sin off-by-one de coma flotante: se multiplica
// por 10 (en vez de dividir por 0,1, que para 0,1 da 900,99… y cae en la celda
// 900) y se suman 1e-6 para que un valor que cae apenas por debajo del entero
// (p. ej. -89.9 → 0,9999…) no baje a la celda vecina. No se suma 0,5 (media
// celda): eso correría la costa 0,05° y desalinearía la máscara (ver BLOCKERS.md).
const INDEX_EPS = 1e-6;

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
  // propósito: es el camino de la consulta O(1). (lat+90) y (lon+180) son
  // siempre ≥ 0, así que el truncado `| 0` equivale a Math.floor y evita la
  // llamada; el índice va inline (sin cellIndex/rowIndex) porque este es el
  // camino de 1 000 000 de consultas.
  const isLand = (lat: number, lon: number): boolean => {
    let col = ((lon + 180) * PER_DEG + INDEX_EPS) | 0;
    if (col >= LANDMASK_WIDTH) col -= LANDMASK_WIDTH;
    else if (col < 0) col += LANDMASK_WIDTH;
    let row = ((lat + 90) * PER_DEG + INDEX_EPS) | 0;
    row = row < 0 ? 0 : row >= LANDMASK_HEIGHT ? LANDMASK_HEIGHT - 1 : row;
    const i = row * LANDMASK_WIDTH + col;
    return (bytes[i >> 3]! & (128 >> (i & 7))) !== 0;
  };

  // E12.8 — transformada de distancia (chamfer de dos pasadas, 8 vecinos). El
  // paso horizontal se pondera por cos(latitud) fila por fila, así el margen es
  // una distancia real en millas y no una caja de celdas (que bloqueaba canales
  // de menos de ~12 nm de lado a lado).
  const dist = new Uint16Array(LANDMASK_WIDTH * LANDMASK_HEIGHT);
  const W = LANDMASK_WIDTH;
  const Hh = LANDMASK_HEIGHT;
  const wgt = new Int32Array(Hh); // paso horizontal (escalado) por fila
  const diag = new Int32Array(Hh);
  for (let r = 0; r < Hh; r++) {
    const lat = r * LANDMASK_CELL_DEG - 90 + LANDMASK_CELL_DEG / 2;
    const hStep = Math.max(1, Math.round(LANDMASK_CELL_DEG * NM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180) * DIST_SCALE));
    wgt[r] = hStep;
    diag[r] = Math.round(Math.hypot(V_STEP, hStep));
  }
  // Pasada forward (arriba-izquierda → abajo-derecha); la siembra (tierra = 0,
  // mar = DIST_MAX) va acá mismo para no recorrer la rejilla dos veces.
  for (let r = 0; r < Hh; r++) {
    const base = r * W;
    const up = base - W;
    const hStep = wgt[r]!;
    const dg = diag[r]!;
    for (let c = 0; c < W; c++) {
      const i = base + c;
      if ((bytes[i >> 3]! & (128 >> (i & 7))) !== 0) {
        dist[i] = 0;
        continue;
      }
      let d = DIST_MAX;
      const cl = c > 0 ? c - 1 : W - 1;
      const cr = c < W - 1 ? c + 1 : 0;
      if (r > 0) {
        let t = dist[up + c]! + V_STEP;
        if (t < d) d = t;
        t = dist[up + cl]! + dg;
        if (t < d) d = t;
        t = dist[up + cr]! + dg;
        if (t < d) d = t;
      }
      const tl = dist[base + cl]! + hStep;
      if (tl < d) d = tl;
      dist[i] = d > DIST_MAX ? DIST_MAX : d;
    }
  }
  // Pasada backward (abajo-derecha → arriba-izquierda).
  for (let r = Hh - 1; r >= 0; r--) {
    const base = r * W;
    const down = base + W;
    const hStep = wgt[r]!;
    const dg = diag[r]!;
    for (let c = W - 1; c >= 0; c--) {
      const i = base + c;
      let d = dist[i]!;
      if (d === 0) continue;
      const cl = c > 0 ? c - 1 : W - 1;
      const cr = c < W - 1 ? c + 1 : 0;
      if (r < Hh - 1) {
        let t = dist[down + c]! + V_STEP;
        if (t < d) d = t;
        t = dist[down + cl]! + dg;
        if (t < d) d = t;
        t = dist[down + cr]! + dg;
        if (t < d) d = t;
      }
      let t = dist[base + cr]! + hStep;
      if (t < d) d = t;
      dist[i] = d > DIST_MAX ? DIST_MAX : d;
    }
  }

  const isLandWithMargin = (lat: number, lon: number, nm: number): boolean => {
    if (!(nm > 0)) return isLand(lat, lon);
    let col = ((lon + 180) * PER_DEG + INDEX_EPS) | 0;
    if (col >= LANDMASK_WIDTH) col -= LANDMASK_WIDTH;
    else if (col < 0) col += LANDMASK_WIDTH;
    let row = ((lat + 90) * PER_DEG + INDEX_EPS) | 0;
    row = row < 0 ? 0 : row >= LANDMASK_HEIGHT ? LANDMASK_HEIGHT - 1 : row;
    // Media celda de gracia implícita: la costa es el borde de la celda, no su
    // centro; así el margen de 3 nm bloquea 3 nm de verdad.
    return dist[row * LANDMASK_WIDTH + col]! < (nm + HALF_CELL_NM) * DIST_SCALE;
  };

  return { width: LANDMASK_WIDTH, height: LANDMASK_HEIGHT, isLand, isLandWithMargin };
}

export async function loadLandmask(base = document.baseURI): Promise<Landmask> {
  const res = await fetch(new URL("basemap/land.bits", base));
  if (!res.ok) throw new Error(`basemap/land.bits: ${res.status}`);
  return decodeLandmask(new Uint8Array(await res.arrayBuffer()));
}
