import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DAY_MS,
  distanceBetween,
  optTrack,
  positionAt,
  simulateDays,
  trackUntil,
  type TrackPoint,
} from "./sim-days.ts";
import type { IsoMultiResult } from "./isochrones.ts";

const wind12 = () => ({ dir: 270, speed: 12 });

// Recta al norte: 1° de latitud por día (≈ 60 nm).
function straight(): TrackPoint[] {
  return [
    { lat: 0, lon: 0, tMs: 0 },
    { lat: 1, lon: 0, tMs: DAY_MS },
    { lat: 2, lon: 0, tMs: 2 * DAY_MS },
  ];
}

test("positionAt interpola dentro del tramo y clava los extremos", () => {
  const t = straight();
  const mid = positionAt(t, DAY_MS / 2)!;
  assert.ok(Math.abs(mid.lat - 0.5) < 1e-9, `lat intermedia (${mid.lat})`);
  assert.equal(positionAt(t, -100)!.lat, 0, "antes del inicio → origen");
  assert.equal(positionAt(t, 9 * DAY_MS)!.lat, 2, "después del fin → destino");
});

test("simulateDays: recta de 2 días → 2 días de ~60 nm a 2,5 kn", () => {
  const days = simulateDays(straight(), wind12);
  assert.equal(days.length, 2);
  const d1 = days[0]!;
  assert.equal(d1.day, 1);
  assert.ok(Math.abs(d1.nm - 60) < 0.5, `millas del día 1 (${d1.nm.toFixed(1)})`);
  assert.ok(Math.abs(d1.sogKn - 2.5) < 0.05, `SOG del día 1 (${d1.sogKn.toFixed(2)})`);
  assert.ok(Math.abs(d1.cogDeg - 0) < 0.5, `rumbo del día 1 (${d1.cogDeg.toFixed(1)})`);
  assert.equal(d1.twsKn, 12);
  assert.equal(d1.twdDeg, 270);
  assert.equal(d1.partial, false);
  assert.ok(Math.abs(d1.lat - 1) < 1e-6, "al cierre del día 1 está en lat 1");
});

test("simulateDays: llegada a mitad de día → último día partial", () => {
  const t: TrackPoint[] = [
    { lat: 0, lon: 0, tMs: 0 },
    { lat: 1, lon: 0, tMs: DAY_MS },
    { lat: 1.5, lon: 0, tMs: 1.5 * DAY_MS },
  ];
  const days = simulateDays(t, null);
  assert.equal(days.length, 2);
  assert.equal(days[0]!.partial, false);
  assert.equal(days[1]!.partial, true);
  assert.equal(days[1]!.twsKn, null, "sin campo de viento → null, no inventa");
});

test("simulateDays: sin viento ni movimiento → lista vacía, no revienta", () => {
  assert.deepEqual(simulateDays([], wind12), []);
  assert.deepEqual(simulateDays([{ lat: 0, lon: 0, tMs: 0 }], wind12), []);
  const same: TrackPoint[] = [
    { lat: 0, lon: 0, tMs: 0 },
    { lat: 0, lon: 0, tMs: 0 },
  ];
  assert.deepEqual(simulateDays(same, wind12), []);
});

test("distanceBetween suma las patas (un zigzag navega más que su cuerda)", () => {
  const zig: TrackPoint[] = [
    { lat: 0, lon: 0, tMs: 0 },
    { lat: 0, lon: 0.5, tMs: 12 * 3600_000 },
    { lat: 0, lon: 0, tMs: DAY_MS },
  ];
  const nm = distanceBetween(zig, 0, DAY_MS);
  // 0,5° de longitud en el ecuador ≈ 30 nm por pata → ~60 nm.
  assert.ok(nm > 58 && nm < 62, `millas del zigzag (${nm.toFixed(1)})`);
  assert.ok(distanceBetween(zig, 0, DAY_MS) > 59, "no toma la cuerda (0 nm)");
});

test("optTrack arma anclas y puntos con los ETA de cada tramo", () => {
  const result: IsoMultiResult = {
    reached: true,
    etaMs: 2 * DAY_MS,
    nm: 120,
    tacks: 0,
    gybes: 0,
    windMax: 12,
    anchors: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    segments: [
      { reached: true, etaMs: DAY_MS, nm: 60, tacks: 0, gybes: 0, windMax: 12, points: [{ lon: 0, lat: 0.5, etaMs: DAY_MS / 2 }], isochrones: [] },
      { reached: true, etaMs: 2 * DAY_MS, nm: 60, tacks: 0, gybes: 0, windMax: 12, points: [], isochrones: [] },
    ],
    isochrones: [],
    steps: 10,
  };
  const track = optTrack(result, 1000);
  assert.equal(track.length, 4, "origen + intermedio del tramo 1 + ancla + destino");
  assert.equal(track[0]!.tMs, 1000);
  assert.equal(track[1]!.lat, 0.5);
  assert.equal(track[2]!.lat, 1);
  assert.equal(track[3]!.lat, 2);
  assert.equal(track[3]!.tMs, 2 * DAY_MS);
});

test("trackUntil recorta la estela en el instante pedido", () => {
  const coords = trackUntil(straight(), DAY_MS / 2);
  assert.equal(coords.length, 2);
  assert.deepEqual(coords[0], [0, 0]);
  assert.ok(Math.abs(coords[1]![1] - 0.5) < 1e-9, "último punto interpolado");
});
