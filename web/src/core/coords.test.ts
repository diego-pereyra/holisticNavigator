import test from "node:test";
import assert from "node:assert/strict";

import { formatLat, formatLon, parseCoords } from "./coords.ts";

test("T3.4 formatLat entero", () => {
  assert.equal(formatLat(50.0), "50°00.0'N");
});

test("T3.4 formatLon fraccionario oeste", () => {
  assert.equal(formatLon(-5.033333), "005°02.0'W");
});

test("T3.4 cero y hemisferios", () => {
  assert.equal(formatLat(0), "00°00.0'N");
  assert.equal(formatLon(0), "000°00.0'E");
  assert.equal(formatLat(-33.9), "33°54.0'S");
  assert.equal(formatLon(-179.99), "179°59.4'W");
});

test("T3.4 redondeo al minuto 0,1 lleva de grado", () => {
  assert.equal(formatLat(1.99999), "02°00.0'N");
});

test("T2.2 parseCoords decimal lat lon", () => {
  assert.deepEqual(parseCoords("15.5 -60.2"), { lat: 15.5, lon: -60.2 });
});

test("T2.2 parseCoords grados y minutos con hemisferio", () => {
  const p = parseCoords("15°30'N 60°12'W");
  assert.ok(p);
  assert.equal(p.lat, 15.5);
  assert.equal(p.lon, -60.2);
});

test("T2.2 parseCoords minutes separados sin símbolo", () => {
  const p = parseCoords("15 30.0 N 60 12.0 W");
  assert.ok(p);
  assert.ok(Math.abs(p.lat - 15.5) < 1e-9);
  assert.ok(Math.abs(p.lon + 60.2) < 1e-9);
});

test("T2.2 parseCoords texto inválido", () => {
  assert.equal(parseCoords("más o menos ahí"), null);
});
