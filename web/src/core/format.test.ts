import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSpeed, formatDistance, formatDepth, DEFAULT_UNITS } from "./format.ts";

test("formatSpeed kn default", () => {
  assert.equal(formatSpeed(6), "6,0 kn");
  assert.equal(formatSpeed(5.5), "5,5 kn");
  assert.equal(formatSpeed(null), "—");
});

test("formatSpeed kmh", () => {
  const u = { ...DEFAULT_UNITS, speed: "kmh" as const };
  assert.equal(formatSpeed(6, u), "11,1 km/h");
});

test("formatDistance nm", () => {
  assert.equal(formatDistance(10), "10,0 nm");
  assert.equal(formatDistance(100), "100,0 nm");
});

test("formatDistance km", () => {
  const u = { ...DEFAULT_UNITS, distance: "km" as const };
  assert.equal(formatDistance(10, u), "18,5 km");
});

test("formatDistance nm decimal false", () => {
  assert.equal(formatDistance(10, DEFAULT_UNITS, false), "10 nm");
  assert.equal(formatDistance(10.4, DEFAULT_UNITS, false), "10 nm");
});

test("formatDistance km decimal false", () => {
  const u = { ...DEFAULT_UNITS, distance: "km" as const };
  assert.equal(formatDistance(10, u, false), "19 km");
});

test("formatDepth m", () => {
  assert.equal(formatDepth(20), "20 m");
});

test("formatDepth ft", () => {
  const u = { ...DEFAULT_UNITS, depth: "ft" as const };
  assert.equal(formatDepth(10, u), "33 ft");
});

test("defaults", () => {
  assert.equal(DEFAULT_UNITS.speed, "kn");
  assert.equal(DEFAULT_UNITS.distance, "nm");
  assert.equal(DEFAULT_UNITS.depth, "m");
});

import { applyVisibility, applyUnits, mobButtonVisible, DEFAULT_VISIBILITY, DEFAULT_UNITS as DU } from "./format.ts";

test("visibility defaults: todo visible", () => {
  assert.deepEqual(applyVisibility(null), DEFAULT_VISIBILITY);
  assert.deepEqual(applyVisibility({}), DEFAULT_VISIBILITY);
});

test("visibility persistida: sobrevive recarga y respeta defaults", () => {
  const saved = JSON.parse('{"mob":false,"fab":false,"basura":1}');
  const v = applyVisibility(saved);
  assert.equal(v.mob, false);
  assert.equal(v.fab, false);
  assert.equal(v.scaleNote, true);
  assert.equal(v.graticule, true);
  assert.equal(v.seamarksOnline, true);
});

test("mobButtonVisible: activo siempre se ve, oculto con posición se esconde", () => {
  const off = { ...DEFAULT_VISIBILITY, mob: false };
  assert.equal(mobButtonVisible(off, true, false), false);
  assert.equal(mobButtonVisible(off, true, true), true);
  assert.equal(mobButtonVisible(off, false, true), true);
  assert.equal(mobButtonVisible(DEFAULT_VISIBILITY, true, false), true);
  assert.equal(mobButtonVisible(DEFAULT_VISIBILITY, false, false), false);
});

test("unidades persistidas: km/h y km sobreviven", () => {
  const saved = JSON.parse('{"speed":"kmh","distance":"km","depth":"ft","otra":9}');
  const u = applyUnits(saved);
  assert.equal(u.speed, "kmh");
  assert.equal(u.distance, "km");
  assert.equal(u.depth, "ft");
});

test("unidades persistidas: basura cae a defaults náuticos", () => {
  const u = applyUnits({ speed: "mph", distance: 42, depth: "brazas" });
  assert.deepEqual(u, DU);
});
