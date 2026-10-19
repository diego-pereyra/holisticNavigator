import assert from "node:assert/strict";
import { test } from "node:test";

import { forecastHorizon, horizonNotice } from "./windfield.ts";
import type { ForecastPackage } from "../forecast.ts";

const DAY = 86_400_000;

function pkg7d(startMs: number, days: number): ForecastPackage {
  const times: number[] = [];
  for (let i = 0; i <= days; i++) times.push(startMs + i * DAY);
  return {
    id: "test",
    issuedAt: startMs,
    fetchedAt: startMs,
    bbox: [-60, 10, -50, 20],
    stepHours: 24,
    cols: 1,
    rows: 1,
    times,
    vars: {} as ForecastPackage["vars"],
  };
}

test("E12.11 horizonNotice: dentro del horizonte no hay aviso", () => {
  const pkg = pkg7d(0, 7);
  assert.equal(horizonNotice(pkg, forecastHorizon(pkg) - 1), "");
});

test("E12.11 horizonNotice: ETA que supera el horizonte avisa días y fecha", () => {
  const pkg = pkg7d(0, 7);
  const notice = horizonNotice(pkg, 12 * DAY);
  assert.match(notice, /7 días/);
  assert.match(notice, /pilot charts/);
  // La fecha es la del horizonte (día 7 → 08/01 en UTC desde epoch 0).
  assert.match(notice, /hasta 08\/01/);
});

test("E12.11 horizonNotice: sin paquete (ruta del mes) siempre pilot charts", () => {
  const notice = horizonNotice(null, DAY);
  assert.match(notice, /pilot charts del mes/);
  assert.match(notice, /sin pronóstico real/);
});
