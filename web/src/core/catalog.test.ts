import test from "node:test";
import assert from "node:assert/strict";

import { monthScore } from "./catalog.ts";

test("monthScore: mejor época sin ciclones → 3 ideal", () => {
  const s = monthScore({ bestMonths: [6], stormMonths: [7, 8] }, 6);
  assert.equal(s.score, 3);
  assert.equal(s.label, "✔ ideal");
});

test("monthScore: mejor época con ciclones posibles → 2 con cuidado", () => {
  const s = monthScore({ bestMonths: [6], stormMonths: [6, 7] }, 6);
  assert.equal(s.score, 2);
  assert.equal(s.label, "✔ con cuidado");
});

test("monthScore: fuera de época sin ciclones → 1 posible", () => {
  const s = monthScore({ bestMonths: [6], stormMonths: [7] }, 1);
  assert.equal(s.score, 1);
  assert.equal(s.label, "— posible");
});

test("monthScore: temporada de ciclones fuera de época → 0 evitar", () => {
  const s = monthScore({ bestMonths: [6], stormMonths: [7, 8, 9] }, 8);
  assert.equal(s.score, 0);
  assert.equal(s.label, "⚠ evitar");
});
