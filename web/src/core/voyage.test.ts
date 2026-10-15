import test from "node:test";
import assert from "node:assert/strict";

import { dailyReport, voyageDistanceNm, withPoint } from "./voyage.ts";

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

test("dailyReport mide 144 nm, 6 kn y rumbo 090 en 24 h", () => {
  const now = Date.UTC(2024, 0, 3, 0, 0, 0);
  const points = [];
  for (let h = 0; h <= 48; h++) {
    points.push({ t: now - (48 - h) * 3_600_000, lat: 0, lon: h * 0.1 });
  }
  const r = dailyReport({ name: "T", points }, now);
  assert.ok(Math.abs(r.nm24h - 144) <= 1, `nm24h ${r.nm24h}`);
  assert.ok(Math.abs(r.avgKn24h - 6) < 0.1, `avgKn24h ${r.avgKn24h}`);
  assert.ok(Math.abs(r.avgCogDeg24h - 90) < 1, `cog ${r.avgCogDeg24h}`);
  assert.ok(Math.abs(r.totalNm - 288) < 2);
  assert.ok(Math.abs(r.hours - 48) < 0.01);
});

test("dailyReport estima días restantes a este ritmo", () => {
  const now = Date.UTC(2024, 0, 3, 0, 0, 0);
  const points = [];
  for (let h = 0; h <= 24; h++) points.push({ t: now - (24 - h) * 3_600_000, lat: 0, lon: h * 0.1 });
  const r = dailyReport({ name: "T", points }, now, 288);
  assert.ok(r.daysToGo !== undefined);
  assert.ok(Math.abs(r.daysToGo! - 2) < 0.05);
});
