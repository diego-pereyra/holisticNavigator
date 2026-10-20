// E13.5 — Líneas de flujo ("como ríos") para viento y corriente. Matemática
// pura: se siembra una rejilla en PANTALLA (cada `spacingPx`, con jitter), se
// integra el campo en pasos chicos y se corta al salir de la caja o tras
// `maxSteps`. El resultado son polilíneas en grados, listas para GeoJSON.
//
// La función no sabe de MapLibre: recibe un `StreamField` que muestrea el
// vector en un (lon, lat) y un factor de escala `degPerPx` para traducir el
// espaciado en píxeles a grados. Así los tests corren con campos sintéticos.

export interface StreamVector {
  // Dirección unitaria hacia donde VA el flujo (no de dónde viene).
  dx: number;
  dy: number;
  // Magnitud (nudos, para viento/corriente). 0 = calma.
  mag: number;
}

export interface StreamField {
  at(lon: number, lat: number): StreamVector | null;
}

export interface StreamOpts {
  // Bajo este umbral (nudos) no se dibuja: las calmas no son ríos.
  minMag?: number;
  // Paso de integración en grados (≈ media celda).
  stepDeg?: number;
  // Corte de seguridad por línea.
  maxSteps?: number;
  // Fracción del espaciado usada como jitter de siembra (0 = rejilla dura).
  jitter?: number;
  // Generador [0,1) inyectable (determinista en tests).
  rng?: () => number;
}

const DEFAULT_MIN_MAG = 0;
const DEFAULT_STEP_DEG = 0.25;
const DEFAULT_MAX_STEPS = 24;
const DEFAULT_JITTER = 0.6;

// Los dos extremos del seed se separan con jitter de media celda a cada lado,
// así las líneas no arrancan todas alineadas pero tampoco se pisan.
function seeded(
  west: number,
  south: number,
  east: number,
  north: number,
  spacingDeg: number,
  jitter: number,
  rng: () => number,
): [number, number][] {
  const seeds: [number, number][] = [];
  if (spacingDeg <= 0) return seeds;
  const cell = spacingDeg;
  const jx = cell * jitter;
  const jy = cell * jitter;
  for (let lat = south - jy; lat <= north + jy; lat += cell) {
    for (let lon = west - jx; lon <= east + jx; lon += cell) {
      seeds.push([lon + (rng() - 0.5) * cell * jitter, lat + (rng() - 0.5) * cell * jitter]);
    }
  }
  return seeds;
}

// Integra desde un seed hacia adelante y hacia atrás (el río se lee completo):
// líneas largas y simétricas, sin colas truncadas por dónde cayó la semilla.
function traceLine(
  field: StreamField,
  seed: [number, number],
  viewport: [number, number, number, number],
  opts: Required<Pick<StreamOpts, "minMag" | "stepDeg" | "maxSteps">>,
): [number, number][] | null {
  const [west, south, east, north] = viewport;
  const inside = (lon: number, lat: number): boolean =>
    lon >= west && lon <= east && lat >= south && lat <= north;

  const walk = (dir: 1 | -1): [number, number][] => {
    const pts: [number, number][] = [];
    let lon = seed[0];
    let lat = seed[1];
    for (let i = 0; i < opts.maxSteps; i++) {
      const v = field.at(lon, lat);
      if (!v || v.mag <= 0 || v.mag < opts.minMag) break;
      lon += v.dx * opts.stepDeg * dir;
      lat += v.dy * opts.stepDeg * dir;
      if (!inside(lon, lat)) break;
      pts.push([lon, lat]);
    }
    return pts;
  };

  const fwd = walk(1);
  const back = walk(-1);
  if (fwd.length + back.length === 0) return null;
  // La línea es [atrás invertido] + [seed] + [adelante].
  const line: [number, number][] = [seed];
  for (let i = back.length - 1; i >= 0; i--) line.unshift(back[i]!);
  for (const p of fwd) line.push(p);
  return line.length >= 2 ? line : null;
}

export function streamlines(
  field: StreamField,
  viewport: [number, number, number, number],
  spacingPx: number,
  degPerPx: number,
  opts: StreamOpts = {},
): [number, number][][] {
  const minMag = opts.minMag ?? DEFAULT_MIN_MAG;
  const stepDeg = opts.stepDeg ?? DEFAULT_STEP_DEG;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const jitter = opts.jitter ?? DEFAULT_JITTER;
  const rng = opts.rng ?? Math.random;

  const [west, south, east, north] = viewport;
  if (east <= west || north <= south || spacingPx <= 0 || degPerPx <= 0) return [];

  const spacingDeg = spacingPx * degPerPx;
  const seeds = seeded(west, south, east, north, spacingDeg, jitter, rng);
  const out: [number, number][][] = [];
  for (const seed of seeds) {
    const line = traceLine(field, seed, viewport, { minMag, stepDeg, maxSteps });
    if (line) out.push(line);
  }
  return out;
}
