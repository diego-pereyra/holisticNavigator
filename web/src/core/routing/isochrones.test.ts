import assert from "node:assert/strict";
import { test } from "node:test";

import { genericPolar } from "./polar.ts";
import {
  multiRouteCoords,
  routeOptimal,
  routeOptimalMulti,
  routingModeConfig,
  traverseRoute,
  type IsoInput,
  type IsoMultiInput,
  type RoutingMode,
} from "./isochrones.ts";
import type { Landmask } from "./landmask.ts";
import type { WindField } from "./windfield.ts";
import type { LonLat } from "../navigation.ts";

function uniform(dir: number, speed: number): WindField {
  return () => ({ dir, speed });
}

// Máscara sin tierra.
function noLand(): Landmask {
  return { width: 3600, height: 1800, isLand: () => false, isLandWithMargin: () => false };
}

// Máscara con un bloque de tierra (grados) y margen.
function blockLand(w: number, s: number, e: number, n: number): Landmask {
  const inside = (lat: number, lon: number): boolean => lat >= s && lat <= n && lon >= w && lon <= e;
  return {
    width: 3600,
    height: 1800,
    isLand: (lat, lon) => inside(lat, lon),
    isLandWithMargin: (lat, lon, nm) => {
      const m = nm / 60;
      return inside(lat, lon) || inside(lat, lon + m) || inside(lat, lon - m) || inside(lat + m, lon) || inside(lat - m, lon);
    },
  };
}

function distToLineNm(p: LonLat, a: LonLat, b: LonLat): number {
  const x = p[0] - a[0];
  const y = p[1] - a[1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const cross = Math.abs(dy * x - dx * y) / (len || 1);
  return cross * 60; // grados → nm (aprox. en latitud)
}

function base(over: Partial<IsoInput>): IsoInput {
  return {
    from: [0, 0],
    to: [0, 5],
    startMs: 0,
    wind: uniform(240, 12),
    polar: genericPolar(),
    land: noLand(),
    ...over,
  };
}

test("E12.5 viento uniforme de cola → una pata ~empopada", () => {
  const res = routeOptimal(base({}));
  assert.equal(res.reached, true);
  assert.ok(res.waypoints.length >= 2, "al menos origen y destino");
  assert.ok(res.waypoints.length <= 4, `una pata, no un zigzag (${res.waypoints.length})`);
  assert.ok(res.nm <= 5 * 60 * 1.15, `poco rodeo: ${res.nm.toFixed(0)} nm`);
  assert.equal(res.tacks, 0, "sin bordos");
});

test("E12.5 proa pura → ceñida en zigzag con bordos", () => {
  // Viento del norte puro: el rumbo directo (N) está en el cono muerto.
  const res = routeOptimal(base({ wind: uniform(0, 14) }));
  assert.equal(res.reached, true);
  assert.ok(res.tacks >= 1, `debe virar (${res.tacks})`);
  assert.ok(res.waypoints.length >= 3, "trazado con bordos");
  const a: LonLat = [0, 0];
  const b: LonLat = [0, 5];
  const maxDev = Math.max(...res.waypoints.map((w) => distToLineNm([w.lon, w.lat], a, b)));
  assert.ok(maxDev > 5, `la ceñida se aparta de la recta (${maxDev.toFixed(0)} nm)`);
});

test("E12.5 calma → motor, línea recta", () => {
  const res = routeOptimal(base({ wind: uniform(0, 0), to: [0, 3] }));
  assert.equal(res.reached, true);
  assert.ok(res.waypoints.length <= 3, `línea recta (${res.waypoints.length})`);
  for (const w of res.waypoints) {
    assert.ok(distToLineNm([w.lon, w.lat], [0, 0], [0, 3]) < 3, "sin rodeo");
  }
});

test("E12.5 traverseRoute estima ETA, viento máx y distancia", () => {
  const res = traverseRoute([[0, 0], [0, 3]], 0, uniform(0, 12), genericPolar());
  assert.ok(Math.abs(res.nm - 180) < 6, `nm ${res.nm.toFixed(0)}`);
  assert.equal(res.windMax, 12);
  assert.ok(res.etaMs > 0, "ETA finita");
});

test("E12.5 tierra en el medio → rodeo con margen", () => {
  const land = blockLand(-0.6, 2.0, 0.6, 2.4);
  const res = routeOptimal(base({ from: [0, 0], to: [0, 4], wind: uniform(90, 14), land }));
  assert.equal(res.reached, true);
  assert.ok(res.nm > 4 * 60, `rodea la tierra (${res.nm.toFixed(0)} nm)`);
  for (const w of res.waypoints) {
    assert.ok(!land.isLandWithMargin(w.lat, w.lon, 3), `waypoint en tierra (${w.lat},${w.lon})`);
  }
});

test("E12.5 Canarias → Barbados con viento sintético en < 5 s", () => {
  const t0 = Date.now();
  const res = routeOptimal(
    base({
      from: [-16, 28],
      to: [-59.5, 13],
      wind: uniform(45, 15),
      config: { maxSteps: 400 },
    }),
  );
  const elapsed = Date.now() - t0;
  assert.equal(res.reached, true);
  assert.ok(res.etaMs > 0);
  assert.ok(elapsed < 5000, `tardó ${elapsed} ms`);
});

// E12.6 — optimización tramo a tramo y modos de ponderación.

function routeMulti(over: Partial<IsoMultiInput>) {
  return routeOptimalMulti({
    anchors: [
      [0, 0],
      [0, 6],
    ],
    startMs: 0,
    wind: uniform(240, 12),
    polar: genericPolar(),
    land: noLand(),
    ...over,
  });
}

test("E12.6 destino detrás de una isla de 1 celda → el trazado la rodea", () => {
  // Isla de una sola celda (0,1° × 0,1°) centrada en el origen.
  const island = blockLand(-0.05, -0.05, 0.05, 0.05);
  const res = routeOptimal(
    base({ from: [0.6, 0], to: [-0.6, 0], wind: uniform(90, 12), land: island }),
  );
  assert.equal(res.reached, true, "tiene que llegar por arriba o por abajo");
  for (const w of res.waypoints) {
    assert.ok(!island.isLandWithMargin(w.lat, w.lon, 3), `pisó la isla en (${w.lat},${w.lon})`);
  }
  const maxDev = Math.max(...res.waypoints.map((w) => Math.abs(w.lat)));
  assert.ok(maxDev > 0.1, `debe rodear la isla (${maxDev.toFixed(2)}°)`);
});

test("E12.6 waypoint obligatorio intermedio → el trazado pasa por él", () => {
  const res = routeMulti({ anchors: [[0, 0], [0, 3], [0, 6]] });
  assert.equal(res.reached, true);
  assert.equal(res.segments.length, 2, "un tramo por par de obligatorios");
  assert.deepEqual(res.anchors, [[0, 0], [0, 3], [0, 6]]);
  const coords = multiRouteCoords(res);
  assert.deepEqual(coords[0], [0, 0]);
  assert.deepEqual(coords[coords.length - 1], [0, 6]);
  assert.ok(
    coords.some((c) => c[0] === 0 && c[1] === 3),
    "el trazado pasa por el obligatorio intermedio",
  );
});

test("E12.6 modos: Confort el más abierto, Crucero intermedio, Regata ETA mínimo", () => {
  // Viento del norte: el rumbo directo (N) cae en el cono muerto → todos ciñen.
  const from: LonLat = [0, 0];
  const to: LonLat = [0, 6];
  const wind = uniform(0, 14);
  const opts = (mode: RoutingMode) => ({
    from,
    to,
    startMs: 0,
    wind,
    polar: genericPolar(),
    land: noLand(),
    config: routingModeConfig(mode),
  });
  const conf = routeOptimal(opts("confort"));
  const cru = routeOptimal(opts("crucero"));
  const reg = routeOptimal(opts("regata"));
  assert.ok(conf.reached && cru.reached && reg.reached);

  assert.ok(reg.etaMs < cru.etaMs, `Regata llega antes que Crucero (${reg.etaMs} < ${cru.etaMs})`);
  assert.ok(cru.etaMs < conf.etaMs, `Crucero llega antes que Confort (${cru.etaMs} < ${conf.etaMs})`);
  // "Más abierto" = el trazado más largo (menos ceñida): Confort > Crucero > Regata.
  assert.ok(conf.nm > cru.nm, `Confort recorre más millas que Crucero (${conf.nm} > ${cru.nm})`);
  assert.ok(cru.nm > reg.nm, `Crucero recorre más millas que Regata (${cru.nm} > ${reg.nm})`);
});
