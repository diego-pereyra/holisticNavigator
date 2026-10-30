// Plantillas de polares por eslora (E12.3): cuando se elige la plantilla del
// ajuste "polares del barco", la polar se escala desde la genérica de 40 pies
// y los ajustes editados se validan antes de persistir.
import test from "node:test";
import assert from "node:assert/strict";
import { boatSpeed, genericPolar } from "./polar.ts";
import {
  PLANTILLA_GENERICA_ID,
  POLAR_TEMPLATES,
  polarDePlantilla,
  validarPolar,
} from "./polar-templates.ts";

test("E12.3 plantillas por eslora: catálogo de 27 a 45 pies con ids únicos", () => {
  assert.deepEqual(
    POLAR_TEMPLATES.map((t) => t.pies),
    [27, 30, 33, 36, 40, 45],
  );
  assert.equal(new Set(POLAR_TEMPLATES.map((t) => t.id)).size, POLAR_TEMPLATES.length);
  const g = POLAR_TEMPLATES.find((t) => t.pies === 40)!;
  assert.equal(g.id, PLANTILLA_GENERICA_ID);
  assert.equal(g.factor, 1);
});

test("E12.3 la plantilla de 40 pies coincide con la polar genérica", () => {
  const p40 = polarDePlantilla(PLANTILLA_GENERICA_ID);
  const gen = genericPolar();
  assert.deepEqual(p40.table, gen.table);
  assert.deepEqual(p40.tws, gen.tws);
});

test("E12.3 las plantillas escalan la velocidad, no el viento", () => {
  const base = genericPolar();
  const p27 = polarDePlantilla("crucero-27");
  const p45 = polarDePlantilla("crucero-45");
  assert.deepEqual(p27.tws, base.tws);
  assert.deepEqual(p27.twa, base.twa);
  // Menos pies → menos velocidad; más pies → más velocidad (misma celda).
  const i = base.twa.indexOf(90);
  const j = base.tws.indexOf(12);
  assert.ok(base.table[i]![j]! > p27.table[i]![j]!);
  assert.ok(p45.table[i]![j]! > base.table[i]![j]!);
  // La escala respeta la física del casco (√LWL): entre 27 y 45 pies.
  assert.ok(p45.table[i]![j]! / p27.table[i]![j]! < 45 / 27);
  // Celdas en 0 siguen en 0 (cono muerto de la tabla, plantillas 27 y 45).
  assert.equal(p27.table[0]![j]!, 0);
  assert.equal(p45.table[0]![j]!, 0);
});

test("E12.3 boatSpeed con plantillas: 45 pies ceñida rinde más que 27 pies", () => {
  const twa = 50;
  const tws = 15;
  assert.ok(boatSpeed(polarDePlantilla("crucero-45"), twa, tws) > boatSpeed(polarDePlantilla("crucero-27"), twa, tws));
});

test("E12.3 validarPolar acepta la genérica y devuelve copia completa", () => {
  const v = validarPolar(genericPolar());
  assert.ok(v);
  assert.deepEqual(v, genericPolar());
});

test("E12.3 validarPolar rechaza tablas rotas y recorta config fuera de rango", () => {
  assert.equal(validarPolar(null), null);
  assert.equal(validarPolar({ twa: [0], tws: [4], table: [[0]] }), null);
  assert.equal(validarPolar({ twa: [0, 90], tws: [4, 6], table: [[0, 0]] }), null);
  assert.equal(validarPolar({ twa: [0, 90], tws: [4, 6], table: [[0, "x"], [0, 0]] }), null);
  const roto = validarPolar({
    twa: [0, 90],
    tws: [4, 6],
    table: [
      [0, 0],
      [0, 3],
    ],
    config: { deadAngle: 42, maxRunAngle: 30, factorRealismo: 5 },
  });
  // Cono muerto mayor que empopada: tabla válida pero config imposible.
  assert.equal(roto, null);
  const fuera = validarPolar({
    twa: [0, 90],
    tws: [4, 6],
    table: [
      [0, 0],
      [0, 3],
    ],
    config: { factorRealismo: 9 },
  });
  assert.equal(fuera!.config.factorRealismo, 1);
});
