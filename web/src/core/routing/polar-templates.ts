// Plantillas de polares por eslora (E12.3, ADR-008 §componente 2).
//
// La polar genérica rige un crucero de 40 pies; las plantillas la escalan por
// eslora (la velocidad máx crece como √eslora: la velocidad de casco de un
// crucero es 1,34·√LWL, ADR-008). El usuario elige la plantilla más cercana en
// el formulario de Ajustes y edita la tabla; los ajustes persisten en
// hn.settings junto con la plantailla de la que partió.
import { DEFAULT_POLAR_CONFIG, genericPolar, type Polar, type PolarConfig } from "./polar.ts";

export interface PolarTemplate {
  id: string;
  nombre: string;
  pies: number;
  // Escala de velocidades respecto de la genérica de 40 pies.
  factor: number;
}

// La polar genérica de 40 pies se comporta como cualquier plantilla.
export const PLANTILLA_GENERICA_ID = "crucero-40";

const PIES = [27, 30, 33, 36, 40, 45];

function plantilla(pies: number): PolarTemplate {
  const factor = Math.round(Math.sqrt(pies / 40) * 100) / 100;
  return { id: pies === 40 ? PLANTILLA_GENERICA_ID : `crucero-${pies}`, nombre: `Crucero · ${pies} pies`, pies, factor };
}

export const POLAR_TEMPLATES: PolarTemplate[] = [...PIES].map((pies) => plantilla(pies));

function redondear0_1(v: number): number {
  return Math.round(v * 10) / 10;
}

// Polar de una plantilla: la genérica sin escalar (40 pies) o la tabla de
// velocidades escalada por factor; TWS queda igual (no escala el viento).
export function polarDePlantilla(id: string, config: Partial<PolarConfig> = {}): Polar {
  const t = POLAR_TEMPLATES.find((p) => p.id === id);
  if (!t) throw new Error(`polar: plantilla desconocida: ${id}`);
  const base = genericPolar(config);
  if (t.factor === 1) return base;
  return {
    twa: base.twa,
    tws: base.tws,
    table: base.table.map((row) => row.map((v) => redondear0_1(v * t.factor))),
    config: { ...DEFAULT_POLAR_CONFIG, ...base.config },
  };
}

function esListaNumérica(v: unknown, min: number, max: number): v is number[] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max) &&
    // La interpolación bilineal exige ejes ordenados.
    v.every((n, i) => i === 0 || (n as number) > (v as number[])[i - 1]!)
  );
}

// Valida una polar leída de hn.settings (o de una importación instala a mano):
// devuelve una copia saneada con la config por defecto completada, o null si
// la estructura no sirve. factorRealismo se recorta al rango ADR 0,7–1,0.
export function validarPolar(v: unknown): Polar | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Partial<Polar>;
  if (!esListaNumérica(p.twa, 0, 180) || !esListaNumérica(p.tws, 1, 60)) return null;
  if (!Array.isArray(p.table) || p.table.length !== p.twa.length) return null;
  const ancho = p.tws.length;
  const table: number[][] = [];
  for (const row of p.table) {
    if (!Array.isArray(row) || row.length !== ancho || !row.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 30)) {
      return null;
    }
    table.push([...row]);
  }
  const c: Partial<PolarConfig> = p.config ?? {};
  // Ángulos y umbral fuera de rango: se rechaza (estructura corrupta). El
  // factor de realismo se recorta al rango ADR 0,7–1,0.
  const tiene = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const deadOk = !c.deadAngle || (tiene(c.deadAngle) && c.deadAngle >= 0 && c.deadAngle <= 60);
  const runOk = !c.maxRunAngle || (tiene(c.maxRunAngle) && c.maxRunAngle >= 90 && c.maxRunAngle <= 180);
  if (!deadOk || !runOk) return null;
  const dead = tiene(c.deadAngle) ? c.deadAngle : DEFAULT_POLAR_CONFIG.deadAngle;
  const run = tiene(c.maxRunAngle) ? c.maxRunAngle : DEFAULT_POLAR_CONFIG.maxRunAngle;
  if (dead >= run) return null;
  const config: PolarConfig = {
    deadAngle: dead,
    maxRunAngle: run,
    factorRealismo: tiene(c.factorRealismo) ? clamp(c.factorRealismo, 0.7, 1) : DEFAULT_POLAR_CONFIG.factorRealismo,
    motorTws: tiene(c.motorTws) && c.motorTws >= 0 ? clamp(c.motorTws, 0, 20) : DEFAULT_POLAR_CONFIG.motorTws,
    motorKn: tiene(c.motorKn) && c.motorKn >= 0 ? clamp(c.motorKn, 0, 12) : DEFAULT_POLAR_CONFIG.motorKn,
  };
  return { twa: [...p.twa], tws: [...p.tws], table, config };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
