import test from "node:test";
import assert from "node:assert/strict";

import { voyageDistanceNm, voyageToGpx, withPoint } from "./voyage.ts";

test("distancia de la bitácora suma tramos", () => {
  const log = {
    name: "T",
    points: [
      { t: 0, lat: 0, lon: 0 },
      { t: 1, lat: 0, lon: 1 },
    ],
  };
  assert.ok(Math.abs(voyageDistanceNm(log) - 60) < 0.5);
});

test("withPoint ignora puntos sin movimiento ni tiempo", () => {
  let log = { name: "T", points: [{ t: 10_000, lat: 0, lon: 0 }] };
  const same = withPoint(log, 0.00001, 0, 11_000);
  assert.equal(same.points.length, 1);
  const moved = withPoint(log, 0.2, 0, 11_000);
  assert.equal(moved.points.length, 2);
});

test("voyageToGpx incluye trkpt con hora UTC", () => {
  const log = {
    name: "Travesía",
    points: [{ t: Date.UTC(2024, 0, 1, 12, 0, 0), lat: 10, lon: -20 }],
  };
  const gpx = voyageToGpx(log);
  assert.ok(gpx.includes("<trkpt"));
  assert.ok(gpx.includes("2024-01-01T12:00:00Z"));
  assert.ok(gpx.includes("<name>Travesía</name>"));
});
