import test from "node:test";
import assert from "node:assert/strict";

import {
  boatSpeed,
  createPolar,
  DEFAULT_POLAR_CONFIG,
  genericPolar,
  interpolatePolar,
  MPS_TO_KN,
  parsePolar,
} from "./polar.ts";

// Polar ORC reducida de un crucero de 40 pies (nudos): filas = TWA, columnas = TWS.
const ORC_TWA = [0, 30, 42, 60, 90, 120, 150, 180];
const ORC_TWS = [4, 6, 8, 10, 12, 14, 16, 20];
const ORC_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0.4, 1.9, 2.8, 3.4, 3.8, 4.0, 4.1, 4.0],
  [0, 2.7, 3.7, 4.4, 4.9, 5.2, 5.3, 5.2],
  [0, 3.3, 4.5, 5.5, 6.3, 6.8, 7.0, 7.1],
  [0, 3.7, 5.0, 6.1, 7.0, 7.6, 7.9, 8.1],
  [0, 3.6, 4.9, 5.9, 6.8, 7.4, 7.8, 8.0],
  [0, 3.0, 4.2, 5.2, 6.1, 6.8, 7.3, 7.6],
  [0, 2.7, 3.7, 4.6, 5.5, 6.1, 6.6, 7.0],
];

// Texto de la polar con el separador pedido; `scale` sirve para armar la versión
// en m/s (1 / MPS_TO_KN).
function orcText(sep: string, scale = 1): string {
  const f = (v: number): string => String(Math.round(v * scale * 1000) / 1000);
  const head = ["TWA\\TWS", ...ORC_TWS.map(f)].join(sep);
  const body = ORC_TWA.map((a, i) => [String(a), ...ORC_TABLE[i]!.map(f)].join(sep));
  return [head, ...body].join("\n");
}

// --- motor de consulta -------------------------------------------------

test("E12.3 interpolación bilineal contra valores conocidos", () => {
  const p = createPolar([0, 90], [10, 20], [[2, 4], [8, 16]], {
    deadAngle: 0,
    maxRunAngle: 180,
    motorTws: 0,
  });
  // Esquinas exactas.
  assert.equal(interpolatePolar(p, 0, 10), 2);
  assert.equal(interpolatePolar(p, 0, 20), 4);
  assert.equal(interpolatePolar(p, 90, 10), 8);
  assert.equal(interpolatePolar(p, 90, 20), 16);
  // Centro de la celda: media de las cuatro esquinas.
  assert.equal(interpolatePolar(p, 45, 15), 7.5);
  assert.equal(boatSpeed(p, 45, 15), 7.5);
  // Clamp fuera de rango.
  assert.equal(interpolatePolar(p, 0, 5), 2);
  assert.equal(interpolatePolar(p, 0, 30), 4);
});

test("E12.3 cono muerto y empopada devuelven 0", () => {
  const p = genericPolar();
  assert.equal(p.config.deadAngle, 42);
  assert.equal(p.config.maxRunAngle, 165);
  assert.equal(boatSpeed(p, 30, 12), 0, "ceñida dentro del cono muerto");
  assert.equal(boatSpeed(p, -30, 12), 0, "el TWA se toma en valor absoluto");
  assert.ok(boatSpeed(p, 42, 12) > 0, "a 42° ya se navega");
  assert.ok(Math.abs(boatSpeed(p, 42, 12) - 4.9) < 0.01, "≈5 kn con 12 kn de TWS");
  assert.equal(boatSpeed(p, 170, 12), 0, "más allá de la empopada máxima");
  assert.ok(boatSpeed(p, 165, 12) > 0, "a 165° todavía se navega");
  // Un ángulo absoluto y su negativo rinden igual.
  assert.equal(boatSpeed(p, 120, 16), boatSpeed(p, -120, 16));
});

test("E12.3 la polar genérica está a la altura de un crucero de 40 pies", () => {
  const p = genericPolar();
  // Pico de través ~8 kn con 15–20 kn de TWS.
  assert.ok(boatSpeed(p, 90, 16) >= 7.8 && boatSpeed(p, 90, 16) <= 8.4, `reach ${boatSpeed(p, 90, 16)}`);
  assert.ok(boatSpeed(p, 110, 20) >= 8 && boatSpeed(p, 110, 20) <= 8.8);
  // Cono muerto por defecto.
  assert.equal(p.config.motorTws, DEFAULT_POLAR_CONFIG.motorTws);
});

test("E12.3 el factor de realismo escala toda la tabla", () => {
  const full = genericPolar({ factorRealismo: 1 });
  const real = genericPolar({ factorRealismo: 0.7 });
  assert.ok(Math.abs(boatSpeed(real, 90, 16) - 0.7 * boatSpeed(full, 90, 16)) < 1e-9);
  assert.ok(Math.abs(boatSpeed(real, 60, 12) - 0.7 * boatSpeed(full, 60, 12)) < 1e-9);
});

test("E12.3 motor bajo el umbral de viento", () => {
  const p = genericPolar();
  assert.equal(boatSpeed(p, 90, 5), 4, "con 5 kn de TWS va a motor");
  assert.equal(boatSpeed(p, 90, 3), 4);
  assert.equal(boatSpeed(p, 30, 4), 4, "el motor cubre también el cono muerto con poco viento");
  assert.ok(Math.abs(boatSpeed(p, 90, 8) - 5.0) < 1e-9, "con viento ya navega");
  // Umbral configurable.
  const always = genericPolar({ motorTws: 0, motorKn: 5 });
  assert.ok(Math.abs(boatSpeed(always, 90, 8) - 5.0) < 1e-9);
});

// --- E12.3: parser del formato tabulado -------------------------------

function toText(sep: string, scale = 1): string {
  const f = (v: number): string => String(Math.round(v * scale * 1000) / 1000);
  const head = ["TWA\\TWS", ...ORC_TWS.map(f)].join(sep);
  const body = ORC_TWA.map((a, i) => [String(a), ...ORC_TABLE[i]!.map(f)].join(sep));
  return [head, ...body].join("\n");
}

test("E12.3 parser CSV: cabecera de TWS y filas de TWA", () => {
  const p = parsePolar(toText(","));
  assert.deepEqual(p.tws, ORC_TWS);
  assert.deepEqual(p.twa, ORC_TWA);
  assert.equal(p.config.deadAngle, 42);
  assert.equal(interpolatePolar(p, 90, 12), 7.0);
});

test("E12.3 parser TSV y punto y coma; ordena TWA descendente", () => {
  const tsv = parsePolar(toText("\t"));
  assert.deepEqual(tsv.twa, ORC_TWA);
  assert.deepEqual(tsv.tws, ORC_TWS);

  const semi = parsePolar(toText(";"));
  assert.deepEqual(semi.twa, ORC_TWA);

  // Mismas filas al revés: el parser las ordena por TWA.
  const reversed = [
    "TWA\\TWS," + ORC_TWS.join(","),
    ...[...ORC_TABLE.keys()].reverse().map((i) => [ORC_TWA[i], ...ORC_TABLE[i]!].join(",")),
  ].join("\n");
  assert.deepEqual(parsePolar(reversed).twa, ORC_TWA);
});

test("E12.3 parser detecta m/s por magnitud y normaliza a nudos", () => {
  const ms = parsePolar(toText(",", 1 / MPS_TO_KN));
  assert.ok(Math.abs(ms.tws[ms.tws.length - 1]! - 20) < 0.02, `TWS ${ms.tws}`);
  assert.ok(Math.abs(interpolatePolar(ms, 90, 12) - 7.0) < 0.03);
  // Forzando unidades no convierte.
  const forced = parsePolar(toText(",", 1 / MPS_TO_KN), { units: "kn" });
  assert.ok(Math.abs(forced.tws[forced.tws.length - 1]! - 20 / MPS_TO_KN) < 0.02);
});

test("E12.3 parser sin cabecera usa la escalera de TWS por defecto", () => {
  const noHead = ORC_TWA.map((a, i) => [a, ...ORC_TABLE[i]!].join(" ")).join("\n");
  const p = parsePolar(noHead);
  assert.deepEqual(p.twa, ORC_TWA);
  assert.deepEqual(p.tws.slice(0, ORC_TWS.length), ORC_TWS);
});

test("E12.3 createPolar valida las dimensiones", () => {
  assert.throws(() => createPolar([0, 90], [10, 20], [[1, 2]]), /filas/);
  assert.throws(() => createPolar([0, 90], [10, 20], [[1, 2, 3], [4, 5, 6]]), /columnas/);
});
