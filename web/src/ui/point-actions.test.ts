import test from "node:test";
import assert from "node:assert/strict";

import { POINT_ACTIONS, forecastCoversPoint } from "./point-actions.ts";
import type { ForecastPackage } from "../core/forecast.ts";

test("UX-N.1 la hoja lista exactamente las 4 acciones de N.1", () => {
  assert.deepEqual(
    POINT_ACTIONS.map((a) => a.id),
    ["clima", "optimizar", "posicion", "waypoint"],
  );
  assert.deepEqual(
    POINT_ACTIONS.map((a) => a.label),
    ["Clima acá", "Optimizar desde acá", "Fijar posición acá", "Waypoint acá"],
  );
});

function pkgOver(bbox: [number, number, number, number], lastMs: number): ForecastPackage {
  return {
    id: "test",
    issuedAt: 0,
    fetchedAt: 0,
    bbox,
    stepHours: 3,
    cols: 1,
    rows: 1,
    times: [0, lastMs],
    vars: {} as ForecastPackage["vars"],
  };
}

test("UX-N.1 el pronóstico cubre el punto solo dentro de su caja y horizonte", () => {
  const pkg = pkgOver([-60, 10, -50, 20], 24 * 3_600_000);
  assert.equal(forecastCoversPoint(pkg, 15, -55, 3_600_000), true, "dentro de la caja");
  assert.equal(forecastCoversPoint(pkg, 15, -40, 3_600_000), false, "fuera de la caja (lon)");
  assert.equal(forecastCoversPoint(pkg, 5, -55, 3_600_000), false, "fuera de la caja (lat)");
  assert.equal(forecastCoversPoint(pkg, 15, -55, 48 * 3_600_000), false, "más allá del horizonte");
  assert.equal(forecastCoversPoint(null, 15, -55, 3_600_000), false, "sin paquete");
});

test("UX-N.1 la caja que cruza el antimeridano cubre longitudes normalizadas", () => {
  const pkg = pkgOver([170, -10, -170, 10], 3_600_000);
  assert.equal(forecastCoversPoint(pkg, 0, 175, 1_000_000), true);
  assert.equal(forecastCoversPoint(pkg, 0, -175, 1_000_000), true);
  assert.equal(forecastCoversPoint(pkg, 0, 0, 1_000_000), false);
});
