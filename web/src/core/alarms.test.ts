import test from "node:test";
import assert from "node:assert/strict";

import { evalAlarms, DEFAULT_ALARMS, type AlarmState } from "./alarms.ts";
import type { NavFix } from "./navigation.ts";

// evalAlarms solo lee xteNm y distanceNm; el resto del NavFix es irrelevante.
function fix(xteNm: number, distanceNm: number): NavFix {
  return { xteNm, distanceNm } as unknown as NavFix;
}

const NONE: AlarmState = { active: null, silencedFor: null };
const S = DEFAULT_ALARMS;

test("E9.2 cruza el umbral de desvío → alarma xte", () => {
  const st = evalAlarms(fix(3, 500), S, NONE);
  assert.deepEqual(st, { active: "xte", silencedFor: null });
});

test("E9.2 vuelve al trazado → se apaga y se olvida el silencio", () => {
  const st = evalAlarms(fix(0.5, 500), S, { active: "xte", silencedFor: "xte" });
  assert.deepEqual(st, { active: null, silencedFor: null });
});

test("E9.2 alarma silenciada no se repite mientras siga activa", () => {
  const st = evalAlarms(fix(3, 500), S, { active: "xte", silencedFor: "xte" });
  assert.deepEqual(st, { active: "xte", silencedFor: "xte" });
});

test("E9.2 se repite tras resolverse y volver a desviarse", () => {
  const off = evalAlarms(fix(0.5, 500), S, { active: "xte", silencedFor: "xte" });
  assert.deepEqual(off, { active: null, silencedFor: null });
  const again = evalAlarms(fix(3, 500), S, off);
  assert.deepEqual(again, { active: "xte", silencedFor: null });
});

test("E9.2 la llegada gana al desvío", () => {
  const st = evalAlarms(fix(3, 0.5), S, NONE);
  assert.deepEqual(st, { active: "arrival", silencedFor: null });
});

test("E9.2 sin fix → sin alarma", () => {
  const st = evalAlarms(null, S, { active: "xte", silencedFor: "xte" });
  assert.deepEqual(st, { active: null, silencedFor: null });
});
