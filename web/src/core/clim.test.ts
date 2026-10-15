import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CLIM_SCALES,
  getCell,
  sampleAlongRoute,
  type ClimCell,
  type ClimMonth,
} from "./clim.ts";

function month(m: number): ClimMonth {
  const name = `m${String(m).padStart(2, "0")}.bin`;
  const bytes = readFileSync(new URL(`../../../data/clim/${name}`, import.meta.url));
  return {
    grid: [360, 180],
    origin: [-180, -90],
    fields: 9,
    scales: CLIM_SCALES,
    data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  };
}

const dirFrom = (c: ClimCell): number =>
  ((Math.atan2(-c.wu, -c.wv) * 180) / Math.PI + 360) % 360;

test("E8.2 alisio en Cabo Verde (16N, 24W) en enero", () => {
  const cell = getCell(month(1), 16, -24);
  assert.ok(cell !== null, "sin dato en (16N, 24W)");
  assert.ok(cell.ws >= 15 && cell.ws <= 25, `ws=${cell.ws} kn fuera de 15-25`);
  const dir = dirFrom(cell);
  assert.ok(dir >= 45 && dir <= 60, `dirección=${dir.toFixed(0)}° fuera de 45-60 (NE)`);
  assert.ok(cell.st > 65, `constancia=${cell.st}% no > 65`);
});

test("E8.2 corriente del Golfo (> 1 kn) en (35N, 75W)", () => {
  for (let m = 1; m <= 12; m++) {
    const cell = getCell(month(m), 35, -75);
    assert.ok(cell !== null, `sin dato en (35N, 75W) en el mes ${m}`);
    const cur = Math.hypot(cell.cu, cell.cv);
    assert.ok(cur > 1, `mes ${m}: corriente=${cur.toFixed(2)} kn no > 1`);
  }
});

test("E8.2 riesgo ciclónico en el Caribe (15N, 65W) en septiembre", () => {
  const cell = getCell(month(9), 15, -65);
  assert.ok(cell !== null, "sin dato en (15N, 65W)");
  assert.ok(cell.tc > 0, `tc=${cell.tc} no > 0`);
});

test("E8.2 muestrea la ruta cada 60 nm y saltea tierra", () => {
  const route = { type: "LineString", coordinates: [[-24, 16], [-40, 24]] as [number, number][] };
  const samples = sampleAlongRoute(month(1), route, 60);
  assert.ok(samples.length >= 3, `muy pocos puntos: ${samples.length}`);
  assert.equal(samples[0]!.distNm, 0);
  assert.ok(Math.abs(samples[0]!.lat - 16) < 1e-6 && Math.abs(samples[0]!.lon - (-24)) < 1e-6);
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i]!.distNm - samples[i - 1]!.distNm;
    assert.ok(d > 1 && d <= 60 + 1e-6, `paso ${d.toFixed(2)} nm fuera de rango`);
  }
});
