// Store reactivo mínimo (ADR-007, sin framework): señales con tres entradas:
// signal, computed y effect. Auto-seguimiento de dependencias por lectura.

import { haversineNm, type NavFix } from "./navigation.ts";
import { evalAlarms, type AlarmSettings, type AlarmState } from "./alarms.ts";

export interface ReadonlySignal<T> {
  (): T;
  subscribe(fn: (value: T) => void): () => void;
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

interface SignalNode {
  subs: Set<() => void>;
}

let currentObserver: Set<SignalNode> | null = null;

function track(node: SignalNode): void {
  currentObserver?.add(node);
}

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const node: SignalNode = { subs: new Set() };
  const read = (() => {
    track(node);
    return value;
  }) as Signal<T>;
  read.set = (next: T) => {
    if (Object.is(next, value)) return;
    value = next;
    for (const s of [...node.subs]) s();
  };
  read.update = (fn: (v: T) => T) => read.set(fn(value));
  read.subscribe = (fn: (v: T) => void) => {
    const run = () => fn(value);
    node.subs.add(run);
    return () => node.subs.delete(run);
  };
  return read;
}

function runTracked<T>(fn: () => T): { value: T; deps: Set<SignalNode> } {
  const deps = new Set<SignalNode>();
  const prev = currentObserver;
  currentObserver = deps;
  try {
    return { value: fn(), deps };
  } finally {
    currentObserver = prev;
  }
}

// Ejecuta fn sin registrar dependencias. Útil para leer señales dentro de un
// effect sin que ese effect se vuelva a disparar por ellas.
export function untracked<T>(fn: () => T): T {
  const prev = currentObserver;
  currentObserver = null;
  try {
    return fn();
  } finally {
    currentObserver = prev;
  }
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const node: SignalNode = { subs: new Set() };
  let value: T;
  let deps = new Set<SignalNode>();

  const recompute = (): void => {
    for (const d of deps) d.subs.delete(recompute);
    const result = runTracked(fn);
    value = result.value;
    deps = result.deps;
    for (const d of deps) d.subs.add(recompute);
    for (const s of [...node.subs]) s();
  };
  recompute();

  const read = (() => {
    track(node);
    return value;
  }) as ReadonlySignal<T>;
  read.subscribe = (fn2: (v: T) => void) => {
    const run = () => fn2(value);
    node.subs.add(run);
    return () => node.subs.delete(run);
  };
  return read;
}

export function effect(fn: () => void): () => void {
  let deps = new Set<SignalNode>();
  let disposed = false;

  const run = (): void => {
    if (disposed) return;
    for (const d of deps) d.subs.delete(run);
    deps = runTracked(fn).deps;
    for (const d of deps) d.subs.add(run);
  };
  run();

  return () => {
    disposed = true;
    for (const d of deps) d.subs.delete(run);
    deps = new Set();
  };
}

// --- UX-N.3: modos Planificar / Navegar --------------------------------------
// La UI decide cuándo y cómo suenan las alarmas (D3); acá vive la lógica pura
// de transición entre modos y el gate de las alarmas de navegación.

export type UiMode = "planificar" | "navegar";

const MODE_WINDOW_MS = 120_000;
const MODE_MIN_KN = 0.5;

// SOG ≥ 0,5 kn sostenida por 2 minutos seguidos sobre la ventana de fijas.
export function sustainedSog(
  fixes: ReadonlyArray<{ lat: number; lon: number; t: number }>,
  nowMs: number,
): boolean {
  const win = fixes.filter((f) => nowMs - f.t <= MODE_WINDOW_MS);
  if (win.length < 2) return false;
  const first = win[0]!;
  const last = win[win.length - 1]!;
  const span = last.t - first.t;
  if (span < MODE_WINDOW_MS) return false;
  return haversineNm(first.lat, first.lon, last.lat, last.lon) / (span / 3_600_000) >= MODE_MIN_KN;
}

// Transición automática: engancha con SOG sostenido y ruta activa; se
// desengancha a los 2 minutos de estar parado. `enteredAtMs` protege el modo
// forzado a mano: no se cae antes de los 2 minutos.
export function uiModeAuto(
  fixes: ReadonlyArray<{ lat: number; lon: number; t: number }>,
  nowMs: number,
  hasActiveRoute: boolean,
  current: UiMode,
  enteredAtMs: number,
): UiMode {
  if (!hasActiveRoute) return "planificar";
  if (current === "navegar") {
    if (nowMs - enteredAtMs >= MODE_WINDOW_MS && !sustainedSog(fixes, nowMs)) return "planificar";
    return "navegar";
  }
  return sustainedSog(fixes, nowMs) ? "navegar" : "planificar";
}

// Gate de alarmas de navegación (XTE y llegada): solo evalúan en Navegar.
// MOB y fondeo los decide la UI por su cuenta; evalAlarms no cambia.
export function navAlarmGate(
  mode: UiMode,
  fix: NavFix | null,
  s: AlarmSettings,
  prev: AlarmState,
): AlarmState {
  if (mode !== "navegar") return { active: null, silencedFor: null };
  return evalAlarms(fix, s, prev);
}

// Persistencia: valida el modo leído de hn.settings.
export function normalizeUiMode(v: unknown): UiMode | null {
  return v === "planificar" || v === "navegar" ? v : null;
}
