// Store reactivo mínimo (ADR-007, sin framework): señales con tres entradas:
// signal, computed y effect. Auto-seguimiento de dependencias por lectura.

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
