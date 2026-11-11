import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DAY_MS,
  distanceBetween,
  optTrack,
  positionAt,
  simulateSteps,
  timedTrack,
  trackUntil,
  type TrackPoint,
} from "./sim-days.ts";
import { traverseRoute, type IsoMultiResult } from "./isochrones.ts";
import { genericPolar } from "./polar.ts";

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

test("simulateSteps: recta de 2 días → 16 pasos de 3 h a 2,5 kn", () => {
  const steps = simulateSteps(straight(), wind12);
  assert.equal(steps.length, 16, "2 días cada 3 h");
  const s1 = steps[0]!;
  assert.equal(s1.index, 0);
  assert.equal(s1.day, 1);
  assert.ok(Math.abs(s1.nm - 7.5) < 0.1, `millas del paso 1 (${s1.nm.toFixed(2)})`);
  assert.ok(Math.abs(s1.sogKn - 2.5) < 0.05, `SOG del paso 1 (${s1.sogKn.toFixed(2)})`);
  assert.ok(Math.abs(s1.cogDeg - 0) < 0.5, `rumbo del paso 1 (${s1.cogDeg.toFixed(1)})`);
  assert.equal(s1.twsKn, 12);
  assert.equal(s1.twdDeg, 270);
  assert.equal(s1.partial, false);
  assert.ok(Math.abs(s1.tMs - 3 * 3600_000) < 1, "cierra a las 3 h");
  assert.equal(steps[7]!.day, 1, "el paso 8 sigue en el día 1");
  assert.equal(steps[8]!.day, 2, "el paso 9 ya es día 2");
  assert.equal(steps[15]!.day, 2);
  assert.ok(Math.abs(steps[15]!.lat - 2) < 1e-6, "llega al destino");
});

test("simulateSteps: llegada a mitad de paso → último paso partial", () => {
  const t: TrackPoint[] = [
    { lat: 0, lon: 0, tMs: 0 },
    { lat: 1, lon: 0, tMs: DAY_MS },
    { lat: 1.5, lon: 0, tMs: DAY_MS + 4 * 3600_000 },
  ];
  const steps = simulateSteps(t, null);
  assert.equal(steps.length, 10, "9 pasos de 3 h + el corte de llegada");
  assert.equal(steps[8]!.partial, false);
  assert.equal(steps[9]!.partial, true);
  assert.equal(steps[9]!.twsKn, null, "sin campo de viento → null, no inventa");
});

test("simulateSteps: sin viento ni movimiento → lista vacía, no revienta", () => {
  assert.deepEqual(simulateSteps([], wind12), []);
  assert.deepEqual(simulateSteps([{ lat: 0, lon: 0, tMs: 0 }], wind12), []);
  const same: TrackPoint[] = [
    { lat: 0, lon: 0, tMs: 0 },
    { lat: 0, lon: 0, tMs: 0 },
  ];
  assert.deepEqual(simulateSteps(same, wind12), []);
});

test("timedTrack coincide con traverseRoute del optimizador", () => {
  const coords: [number, number][] = [
    [0, 0],
    [0.5, 1],
    [0.2, 2],
  ];
  const wind = () => ({ dir: 250, speed: 14 });
  const polar = genericPolar();
  const track = timedTrack(coords, 1000, wind, polar);
  const agg = traverseRoute(coords, 1000, wind, polar);
  assert.equal(track.length, 3);
  assert.equal(track[0]!.tMs, 1000);
  assert.ok(Math.abs(track[2]!.tMs - agg.etaMs) < 1, "misma ETA que el optimizador");
  assert.ok(track[1]!.tMs > track[0]!.tMs && track[2]!.tMs > track[1]!.tMs, "tiempos crecientes");
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
