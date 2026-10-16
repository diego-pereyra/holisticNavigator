// Polar del barco (E12.3, ADR-008 §Decisión componente 2, §Plan T12.3).
//
// Lógica pura, sin UI: parser del formato tabulado estándar (Maxsea/Adrena/qtVlm),
// polar genérica de crucero de 40 pies incluida por defecto y motor de consulta
// `boatSpeed` con interpolación bilineal, cono muerto, empopada máxima, factor de
// realismo y velocidad a motor bajo umbral de viento. Es la tercera pieza que
// necesitan los isócronas (E12.5), después de la máscara (E12.1) y el viento.

// Valores tabulados: filas = TWA en grados (0..180), columnas = TWS en nudos.
export interface Polar {
  twa: number[];
  tws: number[];
  table: number[][];
  config: PolarConfig;
}

export interface PolarConfig {
  // Cono muerto: por debajo de este TWA no se navega (0 kn).
  deadAngle: number;
  // Empopada máxima: por encima de este TWA no se navega (0 kn); hay que virar.
  maxRunAngle: number;
  // Factor de realismo 0,7–1,0: escala toda la tabla (barco cargado, casco sucio).
  factorRealismo: number;
  // Velocidad a motor cuando hay poco viento.
  motorTws: number;
  motorKn: number;
}

export const DEFAULT_POLAR_CONFIG: PolarConfig = {
  deadAngle: 42,
  maxRunAngle: 165,
  factorRealismo: 1,
  motorTws: 6,
  motorKn: 4,
};

export const MPS_TO_KN = 1.943844;

// Columnas por defecto cuando una tabla importada no trae cabecera de TWS.
const DEFAULT_TWS = [4, 6, 8, 10, 12, 14, 16, 20, 25, 30, 35, 40];

// Umbral de magnitud para decidir si una tabla importada viene en m/s: las
// columnas de TWS de una polar en nudos superan los 15, las de una en m/s no.
const MS_DETECT_MAX = 15;

function num(cell: string): number {
  const n = Number(cell);
  return Number.isFinite(n) ? n : Number(cell.replace(",", "."));
}

function isNum(cell: string): boolean {
  return cell !== "" && Number.isFinite(num(cell));
}

// Todas las celdas de una línea separadas por `,`, `;`, tabulador o espacios.
function splitCells(line: string): string[] {
  return line.split(/[,;\t ]+/).map((c) => c.trim()).filter((c) => c.length > 0);
}

export interface ParseOptions {
  config?: Partial<PolarConfig>;
  units?: "kn" | "ms" | "auto";
}

// Polar genérica de crucero de 40 pies: ceñida útil desde ~42° (≈5 kn con 12 kn
// de TWS), pico de través ~8 kn con 15–20 kn, empopada hasta 165°. Valores
// plausibles de un crucero oceánico; no busca precisión de regata.
export function genericPolar(config: Partial<PolarConfig> = {}): Polar {
  const twa = [0, 42, 60, 90, 110, 135, 165, 180];
  const tws = [4, 6, 8, 10, 12, 14, 16, 20, 25];
  const table = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 2.6, 3.6, 4.3, 4.9, 5.2, 5.4, 5.4, 5.1],
    [0, 3.3, 4.5, 5.5, 6.3, 6.8, 7.1, 7.2, 6.7],
    [0, 3.6, 5.0, 6.1, 7.0, 7.6, 8.0, 8.2, 7.6],
    [0, 3.6, 4.9, 6.1, 7.1, 7.8, 8.2, 8.4, 7.8],
    [0, 3.4, 4.7, 5.8, 6.8, 7.5, 7.9, 8.2, 7.7],
    [0, 2.9, 4.0, 5.0, 5.9, 6.6, 7.1, 7.5, 7.2],
    [0, 2.7, 3.7, 4.6, 5.5, 6.2, 6.7, 7.2, 7.0],
  ];
  return { twa, tws, table, config: { ...DEFAULT_POLAR_CONFIG, ...config } };
}

// Construye una polar a mano (tests, importaciones ya parseadas).
export function createPolar(
  twa: number[],
  tws: number[],
  table: number[][],
  config: Partial<PolarConfig> = {},
): Polar {
  if (twa.length !== table.length) throw new Error("polar: filas de TWA y tabla no coinciden");
  if (tws.length !== (table[0]?.length ?? 0)) throw new Error("polar: columnas de TWS y tabla no coinciden");
  return { twa, tws, table, config: { ...DEFAULT_POLAR_CONFIG, ...config } };
}

// Parser del formato tabulado estándar: filas = TWA (0–180°), columnas = TWS en
// nudos; separadores `,`, `;` o tabulador. Si la primera fila trae etiquetas
// (p. ej. `TWA\TWS;4;6;8`) sus números son los TWS. Detecta por magnitud si la
// tabla viene en nudos o en m/s y la normaliza a nudos.
export function parsePolar(text: string, opts: ParseOptions = {}): Polar {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error("polar: hacen falta una cabecera y al menos una fila");

  const rows = lines.map(splitCells);
  if (rows.some((r) => r.length === 0)) throw new Error("polar: línea sin celdas");

  // Cabecera: la primera fila con alguna celda no numérica (etiqueta de esquina
  // o `TWS`). Sus números son los TWS. Si no hay, se usa la escalera por defecto
  // recortada al número de columnas de la tabla.
  let tws: number[] | null = null;
  let start = 0;
  if (rows[0]!.some((c) => !isNum(c))) {
    const header = rows[0]!.filter(isNum).map(num);
    if (header.length > 0) {
      tws = header;
      start = 1;
    }
  }

  const twa: number[] = [];
  const table: number[][] = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]!;
    if (!isNum(row[0]!)) continue;
    const speeds = row.slice(1).map(num);
    if (speeds.some((s) => !Number.isFinite(s))) throw new Error(`polar: fila ${i + 1} con valores no numéricos`);
    if (tws === null) tws = defaultTws(speeds.length);
    if (speeds.length !== tws.length) {
      throw new Error(`polar: fila ${i + 1} tiene ${speeds.length} velocidades, se esperaban ${tws.length}`);
    }
    twa.push(num(row[0]!));
    table.push(speeds);
  }
  if (table.length === 0 || tws === null) throw new Error("polar: sin filas de datos");

  // Ordena por TWA ascendente (algunas exportaciones vienen al revés).
  const order = twa.map((_, i) => i).sort((a, b) => twa[a]! - twa[b]!);
  const sorted: Polar = {
    twa: order.map((i) => twa[i]!),
    tws: [...tws].sort((a, b) => a - b),
    table: order.map((i) => table[i]!),
    config: { ...DEFAULT_POLAR_CONFIG, ...(opts.config ?? {}) },
  };

  const units = opts.units ?? "auto";
  const isMs = units === "ms" || (units === "auto" && maxValue(sorted) < MS_DETECT_MAX);
  return isMs ? scalePolar(sorted, MPS_TO_KN) : sorted;
}

function maxValue(p: Polar): number {
  let max = 0;
  for (const v of p.tws) max = Math.max(max, v);
  for (const row of p.table) for (const v of row) max = Math.max(max, v);
  return max;
}

// Escalera de TWS por defecto cuando la tabla no trae cabecera: recorta la lista
// estándar o la extiende de 5 en 5 si faltan columnas.
function defaultTws(n: number): number[] {
  const out = DEFAULT_TWS.slice();
  let last = out[out.length - 1] ?? 4;
  while (out.length < n) {
    last += 5;
    out.push(last);
  }
  return out.slice(0, n);
}

function scalePolar(p: Polar, factor: number): Polar {
  return {
    twa: p.twa,
    tws: p.tws.map((v) => v * factor),
    table: p.table.map((row) => row.map((v) => v * factor)),
    config: p.config,
  };
}

interface Segment {
  i0: number;
  i1: number;
  t: number;
}

// Posición de muestreo dentro de un vector ordenado, con clamp en los extremos.
function segment(axis: number[], v: number): Segment {
  const n = axis.length;
  if (n <= 1) return { i0: 0, i1: 0, t: 0 };
  if (v <= (axis[0] ?? 0)) return { i0: 0, i1: 0, t: 0 };
  if (v >= (axis[n - 1] ?? 0)) return { i0: n - 1, i1: n - 1, t: 0 };
  let i = 0;
  while (i < n - 2 && v >= (axis[i + 1] ?? 0)) i++;
  const a = axis[i] ?? 0;
  const b = axis[i + 1] ?? a;
  return { i0: i, i1: i + 1, t: b === a ? 0 : (v - a) / (b - a) };
}

// Interpolación bilineal (TWA y TWS) sobre la tabla, sin cono muerto ni motor.
// Fuera de los extremos devuelve el borde (clamp).
export function interpolatePolar(polar: Polar, twaDeg: number, twsKn: number): number {
  const { twa, tws, table } = polar;
  const ti = segment(twa, Math.abs(twaDeg));
  const tj = segment(tws, twsKn);
  const v00 = table[ti.i0]?.[tj.i0] ?? 0;
  const v10 = table[ti.i1]?.[tj.i0] ?? 0;
  const v01 = table[ti.i0]?.[tj.i1] ?? 0;
  const v11 = table[ti.i1]?.[tj.i1] ?? 0;
  const a = v00 + (v01 - v00) * tj.t;
  const b = v10 + (v11 - v10) * tj.t;
  return a + (b - a) * ti.t;
}

// Motor de consulta: velocidad del barco en nudos dados TWA y TWS.
//   - TWS por debajo del umbral → motor (cubre cualquier rumbo).
//   - TWA en el cono muerto o por encima de la empopada máxima → 0 kn.
//   - En rango de vela: interpolación bilineal × factor de realismo.
export function boatSpeed(polar: Polar, twaDeg: number, twsKn: number): number {
  const cfg = polar.config;
  if (twsKn < cfg.motorTws) return cfg.motorKn;
  const twa = Math.abs(twaDeg);
  if (twa < cfg.deadAngle) return 0;
  if (twa > cfg.maxRunAngle) return 0;
  return Math.max(0, interpolatePolar(polar, twa, twsKn) * cfg.factorRealismo);
}
