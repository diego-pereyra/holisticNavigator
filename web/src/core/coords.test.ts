import test from "node:test";
import assert from "node:assert/strict";

import { formatLat, formatLon } from "./coords.ts";

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
