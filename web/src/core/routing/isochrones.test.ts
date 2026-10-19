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

// E12.7 — tramos robustos, contrato de falla y "Bordo n".

// Supercover de test: ¿el segmento a→b cruza tierra con margen?
function segmentCrossesLand(land: Landmask, a: LonLat, b: LonLat, marginNm: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.05));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const lat = a[1] + (b[1] - a[1]) * f;
    const lon = a[0] + (b[0] - a[0]) * f;
    if (land.isLandWithMargin(lat, lon, marginNm)) return true;
  }
  return false;
}

test("E12.7 origen en el puerto (tierra) → arranca y no pisa tierra en el medio", () => {
  // Puerto en tierra: bloque chico (0,06°) que contiene al origen [0,0].
  const port = blockLand(-0.03, -0.03, 0.03, 0.03);
  const res = routeOptimal(base({ from: [0, 0], to: [4, 0], wind: uniform(270, 12), land: port }));
  assert.equal(res.reached, true, "el origen exento deja arrancar");
  for (let i = 1; i < res.waypoints.length - 1; i++) {
    const w = res.waypoints[i]!;
    assert.ok(!port.isLandWithMargin(w.lat, w.lon, 3), `waypoint intermedio en tierra (${w.lat},${w.lon})`);
  }
});

test("E12.7 destino sobre tierra (puerto) → llega y no pisa tierra en el medio", () => {
  const port = blockLand(3.97, -0.03, 4.03, 0.03);
  const res = routeOptimal(base({ from: [0, 0], to: [4, 0], wind: uniform(270, 12), land: port }));
  assert.equal(res.reached, true, "el destino exento admite llegar a un puerto en tierra");
  for (const w of res.waypoints.slice(0, -1)) {
    assert.ok(!port.isLandWithMargin(w.lat, w.lon, 3), `waypoint intermedio en tierra (${w.lat},${w.lon})`);
  }
});

test("E12.7 isla de 1 celda en el medio de un tramo → el salto de anclaje la rodea", () => {
  const island = blockLand(2.95, -0.05, 3.05, 0.05);
  const res = routeMulti({ anchors: [[0, 0], [6, 0]], wind: uniform(270, 12), land: island });
  assert.equal(res.reached, true, "tiene que llegar rodeando la isla");
  const coords = multiRouteCoords(res);
  for (const c of coords) {
    assert.ok(!island.isLandWithMargin(c[1], c[0], 3), `pisó la isla en (${c[1]},${c[0]})`);
  }
  const maxDev = Math.max(...coords.map((c) => Math.abs(c[1])));
  assert.ok(maxDev > 0.1, `debe rodear la isla (${maxDev.toFixed(2)}°)`);
});

test("E12.7 la simplificación no recorta una isla", () => {
  // Isla fina pegada a la recta (lon 0, lat 3): el rodeo es chico y la
  // simplificación (tol 0,1°) lo recorta de un tirón. La post-verificación
  // reintroduce puntos crudos para no cruzar la isla.
  const island = blockLand(0, 2.9, 0.1, 3.1);
  const res = routeOptimal(base({ from: [0, 0], to: [0, 6], wind: uniform(90, 12), land: island }));
  assert.equal(res.reached, true);
  const wps = res.waypoints.map((w) => [w.lon, w.lat] as LonLat);
  for (let i = 0; i + 1 < wps.length; i++) {
    assert.ok(
      !segmentCrossesLand(island, wps[i]!, wps[i + 1]!, 3),
      `la polilínea recortó la isla entre ${wps[i]} y ${wps[i + 1]}`,
    );
  }
});

test("E12.7 tramo irresoluble → reached:false + motivo y sin recta ancla-a-ancla", () => {
  // Muro de tierra de polo a polo: no se puede cruzar.
  const wall = blockLand(2.9, -80, 3.1, 80);
  const res = routeMulti({ anchors: [[0, 0], [6, 0]], wind: uniform(270, 12), land: wall });
  assert.equal(res.reached, false);
  assert.ok(typeof res.reason === "string" && res.reason.length > 0, "hay motivo");
  assert.equal(res.segments[0]!.reached, false);
  assert.ok(typeof res.segments[0]!.reason === "string" && res.segments[0]!.reason.length > 0);
  const coords = multiRouteCoords(res);
  assert.ok(!coords.some((c) => c[0] === 6 && c[1] === 0), "no hay recta hasta el ancla de llegada");
});

test("E12.7 los puntos de virada se marcan como bordo", () => {
  // Viento del norte puro: el rumbo directo (N) cae en el cono muerto → ciñe.
  const res = routeOptimal(base({ from: [0, 0], to: [0, 6], wind: uniform(0, 14) }));
  assert.equal(res.reached, true);
  assert.ok(res.tacks >= 1, `debe virar (${res.tacks})`);
  assert.ok(res.waypoints.some((w) => w.tack === true), "algún waypoint cae en una virada");
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

// E12.8 — margen real, corredores, anclas de confianza y motivo honesto.

// Máscara de test con margen REAL (distancia en nm al rectángulo), como la
// transformada de distancia del landmask real. Tupla [w, s, e, n] en grados.
function fineLand(blocks: Array<[number, number, number, number]>): Landmask {
  const inside = (lat: number, lon: number, b: [number, number, number, number]): boolean =>
    lat >= b[1] && lat <= b[3] && lon >= b[0] && lon <= b[2];
  const distNm = (lat: number, lon: number, b: [number, number, number, number]): number => {
    const dLat = Math.max(0, b[1] - lat, lat - b[3]);
    const dLon = Math.max(0, b[0] - lon, lon - b[2]);
    return Math.hypot(dLat * 60, dLon * 60 * Math.cos((lat * Math.PI) / 180));
  };
  return {
    width: 3600,
    height: 1800,
    isLand: (lat, lon) => blocks.some((b) => inside(lat, lon, b)),
    isLandWithMargin: (lat, lon, nm) => blocks.some((b) => inside(lat, lon, b) || distNm(lat, lon, b) < nm),
  };
}

test("E12.8 canal de 0,2° (12 nm) → el trazado lo atraviesa", () => {
  // Dos masas de tierra a lon ≤ -0,1 y lon ≥ 0,1, unidas por un canal de 12 nm.
  const land = fineLand([
    [-4, -2, -0.1, 2],
    [0.1, -2, 4, 2],
  ]);
  const res = routeOptimal(base({ from: [0, -1], to: [0, 1], wind: uniform(180, 12), land }));
  assert.equal(res.reached, true, "tiene que atravesar el canal");
  for (const w of res.waypoints) {
    assert.ok(!land.isLandWithMargin(w.lat, w.lon, 3), `pisó tierra en (${w.lat},${w.lon})`);
  }
  const maxLon = Math.max(...res.waypoints.map((w) => Math.abs(w.lon)));
  assert.ok(maxLon < 0.15, `tiene que mantenerse dentro del canal (${maxLon.toFixed(3)}°)`);
});

test("E12.8 paso grueso en un canal angosto → el reintento con Δt reducido lo atraviesa", () => {
  // Canal de 0,2° (12 nm) con la costa al este. Con paso grueso (2 h ≈ 12 nm)
  // el avance saltea el corredor; el reintento con Δt a la mitad encuentra rumbo
  // que aterriza adentro. (Sin reintento, este mismo caso no llega.)
  const land = fineLand([
    [-4, -2, -0.1, 2],
    [0.1, -2, 4, 2],
  ]);
  const res = routeOptimal(base({ from: [0, -1], to: [0, 1], wind: uniform(180, 12), land, config: { stepCoastH: 2, stepOceanH: 2 } }));
  assert.equal(res.reached, true, "el paso reducido tiene que encontrar el corredor");
  for (const w of res.waypoints) {
    assert.ok(!land.isLandWithMargin(w.lat, w.lon, 3), `pisó tierra en (${w.lat},${w.lon})`);
  }
});

test("E12.8 motivo honesto: muere lejos del obstáculo → no dice 'bloqueado por tierra'", () => {
  // Isla en lat 2..2,1 entre origen y destino (la recta la cruza) y viento que
  // solo existe en lat ≥ 1: la frontera muere por falta de viento en el origen,
  // no por la isla. El diagnóstico viejo (recta origen→destino) diría
  // "bloqueado por tierra" porque la recta cruza la isla.
  const island = fineLand([[-1, 2, 1, 2.1]]);
  const wind: WindField = (lat) => (lat >= 1 ? { dir: 180, speed: 12 } : null);
  const res = routeOptimal(base({ from: [0, 0], to: [0, 5], wind, land: island }));
  assert.equal(res.reached, false);
  assert.match(res.reason ?? "", /viento/i, `motivo: ${res.reason}`);
  assert.ok(!/tierra/i.test(res.reason ?? ""), `no debe culpar a la tierra: ${res.reason}`);
  assert.ok(/\(\d/.test(res.reason ?? ""), `debe decir dónde murió: ${res.reason}`);
});

test("E12.8 ancla a 1 nm de la costa → el tramo parte y llega sin rechazo", () => {
  const land = fineLand([[0.5, -2, 4, 2]]);
  const res = routeOptimal(base({ from: [0.45, 0], to: [-1, 0], wind: uniform(270, 12), land }));
  assert.equal(res.reached, true, "el ancla pegado a la costa es correcto por definición");
  const last = res.waypoints[res.waypoints.length - 1]!;
  assert.ok(last.lon < 0.5, `llega sin pisar tierra (${last.lon})`);
});

// E12.10 — el trazado dice lo justo: waypoints de paso solo donde el rumbo vira
// de verdad (umbral náutico), Bordos y anclas intactos, tope global honesto.

// Máscara con una isla circular (radio en grados) para forzar rodeos suaves.
function circleLand(cLat: number, cLon: number, rDeg: number): Landmask {
  const rad = (lat: number, lon: number): number =>
    Math.hypot(lat - cLat, (lon - cLon) * Math.cos((cLat * Math.PI) / 180));
  const inside = (lat: number, lon: number): boolean => rad(lat, lon) <= rDeg;
  return {
    width: 3600,
    height: 1800,
    isLand: inside,
    isLandWithMargin: (lat, lon, nm) => rad(lat, lon) <= rDeg + nm / 60,
  };
}

function countPasos(waypoints: Array<{ tack?: boolean }>, anchors: number): number {
  const bordos = waypoints.filter((w) => w.tack === true).length;
  return waypoints.length - anchors - bordos;
}

test("E12.10 curva suave de ~90° en el rodeo → ≤ 5 waypoints de paso", () => {
  // Isla circular grande entre origen y destino: la ruta la rodea en un arco
  // suave de ~120° acumulados. Douglas-Peucker dejaba un punto cada ~6 nm
  // (decenas); el umbral náutico deja solo las viradas de verdad.
  const land = circleLand(1.2, 0, 1.2);
  const res = routeOptimal(base({ from: [-2.5, 0], to: [2.5, 0], wind: uniform(270, 14), land }));
  assert.equal(res.reached, true);
  const pasos = countPasos(res.waypoints, 2);
  assert.ok(pasos <= 5, `waypoints de paso: ${pasos}`);
  assert.ok(res.waypoints.length >= 3, "las anclas y al menos la esquina del arco");
});

test("E12.10 ceñida → todos los Bordos presentes, con cualquier umbral", () => {
  const sinUmbral = routeOptimal(base({ wind: uniform(0, 14) }));
  const conUmbral = routeOptimal(base({ wind: uniform(0, 14), config: { wpTurnDeg: 60 } }));
  const bordos = (r: typeof sinUmbral): number => r.waypoints.filter((w) => w.tack === true).length;
  assert.ok(bordos(sinUmbral) >= 2, `la ceñida tiene bordos (${bordos(sinUmbral)})`);
  assert.equal(bordos(conUmbral), bordos(sinUmbral), "un umbral alto no borra Bordos");
  assert.equal(bordos(conUmbral), conUmbral.tacks, "cada bordo del motor está en la tabla");
});

test("E12.10 rodeo de isla → la esquina de rodeo cae sola en el umbral", () => {
  const island = blockLand(2.95, -0.05, 3.05, 0.05);
  const res = routeOptimal(
    base({ from: [0, 0], to: [6, 0], wind: uniform(270, 12), land: island, config: { wpTurnDeg: 60 } }),
  );
  assert.equal(res.reached, true);
  const maxDev = Math.max(...res.waypoints.map((w) => distToLineNm([w.lon, w.lat], [0, 0], [6, 0])));
  assert.ok(maxDev > 3, `la esquina de rodeo sobrevive con umbral alto (${maxDev.toFixed(1)} nm)`);
});

test("E12.10 muchos tramos → puntos de paso ≤ 40 globales", () => {
  // Canal serpenteante de ~22 dientes cruzado por 4 tramos: la tabla final es
  // un solo trazado (no un tramo por tramo) y el tope de pasos es global.
  const teeth: Array<[number, number, number, number]> = [];
  for (let k = 0; k < 22; k++) {
    const lon0 = 0.5 + k * 0.7;
    if (k % 2 === 0) teeth.push([lon0, 1.1, lon0 + 0.45, 2.2]);
    else teeth.push([lon0, -2.2, lon0 + 0.45, -1.1]);
  }
  const land = fineLand(teeth);
  const res = routeMulti({
    anchors: [[0.1, 0], [4, 0], [8, 0], [12, 0], [16.2, 0]],
    wind: uniform(270, 13),
    land,
  });
  assert.equal(res.reached, true, "la ruta tiene que llegar serpenteano");
  const pts = res.segments.flatMap((s) => s.points);
  const pasos = countPasos(pts, 0);
  assert.ok(pasos <= 40, `pasos globales: ${pasos}`);
  assert.ok(pts.some((p) => p.tack === true), "los Bordos del canal siguen presentes");
});
