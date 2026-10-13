import test from "node:test";
import assert from "node:assert/strict";

import { haversineNm, navigate, type RouteTrack } from "./navigation.ts";
import { kinematics, type Fix } from "./kinematics.ts";

// Serie sintética a 6 kn rumbo norte: 0,1 nm por minuto sobre un meridiano.
function seriesSixKnots(): Fix[] {
  const latStep = 0.1 / 60;
  return [
    { lat: 0, lon: 0, t: 0 },
    { lat: latStep, lon: 0, t: 60_000 },
  ];
}

function northTrack(): RouteTrack {
  return {
    names: ["A", "B"],
    dests: [false, true],
    corrected: [false, false],
    coords: [
      [0, 0],
      [0, 0.1],
    ],
  };
}

test("T9.1 SOG derivada de posiciones ≈ 6 kn", () => {
  const k = kinematics(seriesSixKnots(), null, 6, 60_000);
  assert.ok(k.sogKn != null);
  assert.ok(Math.abs(k.sogKn! - 6) < 0.1, `sog=${k.sogKn}`);
});

test("T9.1 SOG usa speedMps si existe", () => {
  const k = kinematics([{ lat: 0, lon: 0, t: 0, speedMps: 3.0 }], null, 0, 0);
  assert.ok(Math.abs(k.sogKn! - 5.83) < 0.1, `sog=${k.sogKn}`);
});

test("T9.1 ETA al próximo waypoint coherente al minuto", () => {
  const track = northTrack();
  const now = 60_000;
  const nav = navigate(track, 0, 0);
  assert.ok(nav);
  const k = kinematics(seriesSixKnots(), nav, trackLengthMinutes(track), now);
  assert.ok(k.etaNextMs != null);
  const hours = (k.etaNextMs! - now) / 3_600_000;
  assert.ok(Math.abs(hours - 1) < 0.02, `eta h=${hours}`);
});

test("T9.1 VMG máximo a rumbo directo", () => {
  const nav = navigate(northTrack(), 0, 0);
  const k = kinematics(seriesSixKnots(), nav, 6, 60_000);
  assert.ok(k.vmgKn != null);
  assert.ok(Math.abs(k.vmgKn! - 6) < 0.2, `vmg=${k.vmgKn}`);
});

test("T9.1 sin movimiento no hay ETA", () => {
  const k = kinematics([{ lat: 0, lon: 0, t: 0 }, { lat: 0, lon: 0, t: 60_000 }], null, 0, 60_000);
  assert.equal(k.sogKn, 0);
  assert.equal(k.etaDestMs, null);
});

function trackLengthMinutes(track: RouteTrack): number {
  let s = 0;
  for (let i = 0; i < track.coords.length - 1; i++) {
    const a = track.coords[i]!;
    const b = track.coords[i + 1]!;
    s += haversineNm(a[1], a[0], b[1], b[0]);
  }
  return s;
}
