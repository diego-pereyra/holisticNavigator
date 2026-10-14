import test from "node:test";
import assert from "node:assert/strict";

import { evalAlarms, DEFAULT_ALARMS, anchorAlarm, mobFix, type AlarmState } from "./alarms.ts";
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

// 0,0005° de latitud ≈ 55,6 m: sirve para quedar dentro o fuera de un radio.
const WATCH = { lat: -34.6, lon: -58.4, radiusM: 50 };

test("E9.3 fondeo: dentro del radio no suena", () => {
  assert.equal(anchorAlarm({ lat: -34.6002, lon: -58.4 }, WATCH), false);
});

test("E9.3 fondeo: fuera del radio suena", () => {
  assert.equal(anchorAlarm({ lat: -34.601, lon: -58.4 }, WATCH), true);
});

test("E9.3 MOB: rumbo de vuelta hacia la caída y distancia", () => {
  const mob = { lat: -34.6, lon: -58.4, t: 0 };
  const south = mobFix({ lat: -34.61, lon: -58.4, t: 0 }, mob);
  assert.ok(south.bearingDeg < 0.5 || south.bearingDeg > 359.5, `rumbo ${south.bearingDeg}`);
  const west = mobFix({ lat: -34.6, lon: -58.41, t: 0 }, mob);
  assert.ok(Math.abs(west.bearingDeg - 90) < 1, `rumbo ${west.bearingDeg}`);
  assert.ok(west.distanceNm > 0.4 && west.distanceNm < 0.6, `dist ${west.distanceNm}`);
});

test("E9.3 MOB: cronómetro desde la caída", () => {
  const mob = { lat: -34.6, lon: -58.4, t: 1_000_000 };
  const f = mobFix({ lat: -34.6, lon: -58.4, t: 1_000_000 + 95_000 }, mob);
  assert.equal(f.elapsedS, 95);
  assert.ok(f.distanceNm < 0.01);
});
