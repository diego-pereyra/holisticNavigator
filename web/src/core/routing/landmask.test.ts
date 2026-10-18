import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { decodeLandmask, LANDMASK_BYTES, type Landmask } from "./landmask.ts";

function mask(): Landmask {
  const bytes = readFileSync(new URL("../../../../data/land/land.bits", import.meta.url));
  assert.equal(bytes.byteLength, LANDMASK_BYTES);
  return decodeLandmask(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

test("E12.1 Panamá (9,5 N, 79,6 W) es tierra", () => {
  assert.ok(mask().isLand(9.5, -79.6));
});

test("E12.1 Gibraltar (Peñón, 36,14 N, 5,35 W) es tierra", () => {
  assert.ok(mask().isLand(36.14, -5.35));
});

test("E12.1 (15 N, 60 W) es mar", () => {
  assert.ok(!mask().isLand(15, -60));
});

test("E12.1 margen de 3 nm sobre la costa de Portugal (Cabo da Roca)", () => {
  const m = mask();
  const lat = 38.78;
  const lon = -9.5;
  const nmLon = (nm: number): number => nm / (60 * Math.cos((lat * Math.PI) / 180));
  assert.ok(m.isLandWithMargin(lat, lon - nmLon(2), 3), "a 2 nm de la costa debe ser tierra");
  assert.ok(!m.isLandWithMargin(lat, lon - nmLon(5), 3), "a 5 nm de la costa debe ser mar");
});

// E12.7 — índice de celda con multiplicación por 10 y épsilon (no /0,1): evita
// que un borde exacto (p. ej. -89.9 → 0,9999…) caiga en la celda vecina.
function cellIdx(lat: number, lon: number): number {
  const row = Math.floor((lat + 90) * 10 + 1e-6);
  const col = Math.floor((lon + 180) * 10 + 1e-6);
  return row * 3600 + col;
}

function oneCell(lat: number, lon: number): Landmask {
  const bytes = new Uint8Array(LANDMASK_BYTES);
  const i = cellIdx(lat, lon);
  bytes[i >> 3]! |= 128 >> (i & 7);
  return decodeLandmask(bytes);
}

test("E12.7 bordes exactos de celda no tienen off-by-one (p. ej. -3.8)", () => {
  // -3.8 es el borde inferior de la celda 862: debe resolver a ESA celda, no a la 863.
  const m = oneCell(-3.8, 0);
  assert.ok(m.isLand(-3.8, 0), "el borde exacto pertenece a su celda (862)");
  assert.ok(m.isLand(-3.79, 0), "un poco por dentro sigue siendo la misma celda");
  assert.ok(!m.isLand(-3.81, 0), "un poco por fuera ya es la celda de abajo (861)");
  assert.ok(!m.isLand(-3.7, 0), "la celda de arriba es otra (863)");
  assert.ok(!m.isLand(-3.9, 0), "la celda de abajo es otra");

  // 0.1: dividir por 0,1 da 900,99… (celda 900). El borde es la celda 901.
  const m2 = oneCell(0.1, 0);
  assert.ok(m2.isLand(0.1, 0), "0.1 exacto cae en su celda, no en la de abajo");
  assert.equal(cellIdx(0.1, 0), 901 * 3600 + 1800);

  // -89.9: sin el épsilon, (lat+90)*10 da 0,9999… y caería en la celda 0;
  // con el épsilon cae en la celda 1 (su borde exacto).
  const m3 = oneCell(-89.9, 0);
  assert.ok(m3.isLand(-89.9, 0), "el épsilon evita la celda vecina");
  assert.equal(cellIdx(-89.9, 0), 1 * 3600 + 1800);
});

test("E12.1 consulta de 1 000 000 de puntos en < 50 ms", () => {
  const m = mask();
  const query = (): number => {
    let hits = 0;
    for (let i = 0; i < 1_000_000; i++) {
      const lat = ((i * 37) % 170) - 85;
      const lon = ((i * 131) % 360) - 180;
      if (m.isLand(lat, lon)) hits++;
    }
    return hits;
  };
  assert.ok(query() > 0, "sin aciertos de tierra"); // calentamiento JIT
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const t0 = performance.now();
    query();
    best = Math.min(best, performance.now() - t0);
  }
  assert.ok(best < 50, `${best.toFixed(1)} ms para 1 000 000 de consultas`);
});
