import test from "node:test";
import assert from "node:assert/strict";

import { isNight, sunTimes } from "./sun.ts";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

test("T11.5 Panamá: salida antes de la puesta, en rangos UTC razonables", () => {
  const dateMs = Date.UTC(2024, 2, 20, 0, 0, 0);
  const s = sunTimes(8.98, -79.52, dateMs);
  assert.ok(s, "sin horas solares");
  assert.ok(s!.sunriseMs < s!.sunsetMs);
  const sunriseH = (s!.sunriseMs - dateMs) / 3600000;
  const sunsetH = (s!.sunsetMs - dateMs) / 3600000;
  assert.ok(sunriseH > 10 && sunriseH < 12, `sunrise=${iso(s!.sunriseMs)}`);
  assert.ok(sunsetH > 22 && sunsetH < 24, `sunset=${iso(s!.sunsetMs)}`);
});

test("T11.5 Falmouth: verano boreal con muchas horas de luz", () => {
  const dateMs = Date.UTC(2024, 5, 21, 0, 0, 0);
  const s = sunTimes(50.15, -5.07, dateMs);
  assert.ok(s, "sin horas solares");
  const daylightH = (s!.sunsetMs - s!.sunriseMs) / 3600000;
  assert.ok(daylightH > 15 && daylightH < 18, `daylight h=${daylightH}`);
});

test("T11.5 isNight en Panamá", () => {
  const night = Date.UTC(2024, 2, 20, 3, 0, 0);
  const noon = Date.UTC(2024, 2, 20, 17, 0, 0);
  assert.equal(isNight(8.98, -79.52, night), true);
  assert.equal(isNight(8.98, -79.52, noon), false);
});

test("T11.5 en el hemisferio norte amanece antes en junio que en enero", () => {
  const jan = Date.UTC(2024, 0, 1);
  const jun = Date.UTC(2024, 5, 1);
  const a = sunTimes(36, -6, jan)!;
  const b = sunTimes(36, -6, jun)!;
  const janTime = a.sunriseMs - jan;
  const junTime = b.sunriseMs - jun;
  assert.ok(junTime < janTime, `jan=${janTime} jun=${junTime}`);
});
