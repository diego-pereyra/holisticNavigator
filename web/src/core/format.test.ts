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
