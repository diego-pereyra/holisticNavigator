import test from "node:test";
import assert from "node:assert/strict";

import { computed, effect, signal } from "./store.ts";

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
