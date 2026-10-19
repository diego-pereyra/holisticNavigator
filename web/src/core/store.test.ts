import test from "node:test";
import assert from "node:assert/strict";

import {
  computed,
  effect,
  navAlarmGate,
  normalizeUiMode,
  signal,
  sustainedSog,
  uiModeAuto,
  untracked,
} from "./store.ts";
import { DEFAULT_ALARMS, type AlarmState } from "./alarms.ts";
import type { NavFix } from "./navigation.ts";
import { KEYS, type KeyValueStore } from "../platform/store.ts";

test("signal guarda y notifica", () => {
  const s = signal(1);
  const seen: number[] = [];
  const off = s.subscribe((v) => seen.push(v));
  s.set(2);
  s.set(2);
  s.update((v) => v + 1);
  off();
  s.set(99);
  assert.equal(s(), 99);
  assert.deepEqual(seen, [2, 3]);
});

test("computed deriva y se recalcula al cambiar la dependencia", () => {
  const a = signal(2);
  const b = signal(3);
  const sum = computed(() => a() + b());
  const seen: number[] = [];
  sum.subscribe((v) => seen.push(v));
  a.set(10);
  b.set(20);
  assert.equal(sum(), 30);
  assert.deepEqual(seen, [13, 30]);
});

test("effect corre al inicio y ante cambios; dispose lo detiene", () => {
  const s = signal(0);
  const seen: number[] = [];
  const stop = effect(() => seen.push(s()));
  s.set(1);
  stop();
  s.set(2);
  assert.deepEqual(seen, [0, 1]);
});

test("untracked lee señales sin suscribir el effect", () => {
  const tracked = signal(0);
  const ignored = signal(10);
  const seen: number[] = [];
  const stop = effect(() => {
    tracked();
    seen.push(untracked(() => ignored()));
  });
  ignored.set(11);
  assert.deepEqual(seen, [10]);
  tracked.set(1);
  assert.deepEqual(seen, [10, 11]);
  stop();
  assert.equal(untracked(() => ignored()), 11);
});

// --- UX-N.3: modos Planificar / Navegar --------------------------------------

interface Fix { lat: number; lon: number; t: number }

// Recorrido a velocidad constante: 1° de latitud = 60 nm. Sirve para armar la
// ventana de fijas de los últimos minutos sin tocar el GPS.
function track(toMs: number, seconds: number, stepS: number, kn: number): Fix[] {
  const out: Fix[] = [];
  for (let s = seconds; s >= 0; s -= stepS) {
    out.push({ lat: -34 + (kn * (s / 3600)) / 60, lon: -58, t: toMs - s * 1000 });
  }
  return out;
}

function still(toMs: number, seconds: number, stepS: number): Fix[] {
  const out: Fix[] = [];
  for (let s = seconds; s >= 0; s -= stepS) out.push({ lat: -34, lon: -58, t: toMs - s * 1000 });
  return out;
}

const NONE: AlarmState = { active: null, silencedFor: null };
// navAlarmGate solo lee xteNm y distanceNm del NavFix.
const navFix = (xteNm: number, distanceNm: number): NavFix =>
  ({ xteNm, distanceNm }) as unknown as NavFix;

test("UX-N.3 SOG sostenido con ruta activa engancha Navegar", () => {
  const now = 1_700_000_000_000;
  const fixes = track(now, 200, 10, 5);
  assert.equal(sustainedSog(fixes, now), true);
  assert.equal(uiModeAuto(fixes, now, true, "planificar", now), "navegar");
});

test("UX-N.3 sin ruta activa nunca engancha Navegar", () => {
  const now = 1_700_000_000_000;
  const fixes = track(now, 200, 10, 5);
  assert.equal(uiModeAuto(fixes, now, false, "planificar", now), "planificar");
});

test("UX-N.3 una ventana corta de fijas no alcanza para enganchar", () => {
  const now = 1_700_000_000_000;
  const fixes = track(now, 60, 10, 5);
  assert.equal(sustainedSog(fixes, now), false);
  assert.equal(uiModeAuto(fixes, now, true, "planificar", now), "planificar");
});

test("UX-N.3 parado no engancha Navegar", () => {
  const now = 1_700_000_000_000;
  const fixes = still(now, 200, 10);
  assert.equal(uiModeAuto(fixes, now, true, "planificar", now), "planificar");
});

test("UX-N.3 Navegar se desengancha a los 2 minutos de estar parado", () => {
  const now = 1_700_000_000_000;
  const fixes = still(now, 200, 10);
  assert.equal(uiModeAuto(fixes, now, true, "navegar", now - 300_000), "planificar");
});

test("UX-N.3 un Navegar forzado a mano no se cae antes de los 2 minutos", () => {
  const now = 1_700_000_000_000;
  const fixes = still(now, 200, 10);
  assert.equal(uiModeAuto(fixes, now, true, "navegar", now - 30_000), "navegar");
});

test("UX-N.3 en Planificar un desvío de 3 nm NO produce alarma", () => {
  const st = navAlarmGate("planificar", navFix(3, 500), DEFAULT_ALARMS, NONE);
  assert.deepEqual(st, { active: null, silencedFor: null });
});

test("UX-N.3 en Navegar el mismo desvío sí produce alarma", () => {
  const st = navAlarmGate("navegar", navFix(3, 500), DEFAULT_ALARMS, NONE);
  assert.deepEqual(st, { active: "xte", silencedFor: null });
});

test("UX-N.3 en Navegar la llegada tiene prioridad y suena", () => {
  const st = navAlarmGate("navegar", navFix(0, 0.5), DEFAULT_ALARMS, NONE);
  assert.deepEqual(st, { active: "arrival", silencedFor: null });
});

test("UX-N.3 el modo se valida al leer hn.settings", () => {
  assert.equal(normalizeUiMode("navegar"), "navegar");
  assert.equal(normalizeUiMode("planificar"), "planificar");
  assert.equal(normalizeUiMode("otro"), null);
  assert.equal(normalizeUiMode(null), null);
  assert.equal(normalizeUiMode(42), null);
});

function memStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    get: (k) => Promise.resolve(map.get(k) ?? null),
    put: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    remove: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    putBlob: () => Promise.resolve(),
    getBlob: () => Promise.resolve(null),
    removeBlob: () => Promise.resolve(),
  };
}

test("UX-N.3 el modo persiste en hn.settings y sobrevive la recarga", async () => {
  const store = memStore();
  await store.put(KEYS.settings, JSON.stringify({ uiMode: "navegar", routingMode: "crucero" }));
  const raw = JSON.parse((await store.get(KEYS.settings))!) as { uiMode?: unknown };
  assert.equal(normalizeUiMode(raw.uiMode), "navegar");
  // Sin nada guardado (o con basura) el modo por defecto es Planificar.
  const empty = memStore();
  const none = JSON.parse((await empty.get(KEYS.settings)) ?? "{}") as { uiMode?: unknown };
  assert.equal(normalizeUiMode(none.uiMode), null);
});
