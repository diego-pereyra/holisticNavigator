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
