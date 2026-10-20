import { test } from "node:test";
import assert from "node:assert/strict";
import { streamlines, type StreamField } from "./streamlines.ts";

// Campo uniforme hacia el este (dx=1, dy=0): todas las líneas son rectas
// horizontales y paralelas.
const eastward = (mag = 10): StreamField => ({
  at: () => ({ dx: 1, dy: 0, mag }),
});

// Campo con cizalla: dx depende de la latitud → curvas.
const shear: StreamField = {
  at: (lon, lat) => {
    const a = (lat * Math.PI) / 30;
    return { dx: Math.cos(a), dy: Math.sin(a), mag: 10 };
  },
};

test("E13.5 campo uniforme → líneas rectas y paralelas", () => {
  const lines = streamlines(eastward(), [-10, -5, 10, 5], 4, 0.25, { rng: () => 0.5, jitter: 0 });
  assert.ok(lines.length > 0, "hay líneas");
  for (const line of lines) {
    // Todas las latitudes de una línea son iguales ⇒ recta horizontal.
    const lat0 = line[0]![1];
    for (const p of line) assert.ok(Math.abs(p[1] - lat0) < 1e-9, "y constante");
    // Y crece hacia el este.
    assert.ok(line[line.length - 1]![0] > line[0]![0], "avanza hacia el este");
  }
});

test("E13.5 campo con cizalla → curvas", () => {
  const lines = streamlines(shear, [-30, -15, 30, 15], 4, 0.25, { rng: () => 0.5, jitter: 0, maxSteps: 40 });
  const curved = lines.some((line) => {
    if (line.length < 3) return false;
    const y0 = line[0]![1];
    return line.some((p) => Math.abs(p[1] - y0) > 0.5);
  });
  assert.ok(curved, "alguna línea se curva");
});

test("E13.5 calma bajo el umbral → cero líneas", () => {
  const calm: StreamField = { at: () => ({ dx: 1, dy: 0, mag: 0.3 }) };
  const lines = streamlines(calm, [-10, -5, 10, 5], 4, 0.25, { minMag: 2, rng: () => 0.5, jitter: 0 });
  assert.equal(lines.length, 0);
});

test("E13.5 espaciado por píxeles: más zoom ⇒ más líneas", () => {
  // Mismo viewport y mismo spacing en píxeles; a más zoom, menos grados por
  // píxel ⇒ la rejilla de siembra se aprieta y caen más líneas.
  const vp: [number, number, number, number] = [-10, -10, 10, 10];
  const z3 = streamlines(eastward(), vp, 70, 0.05, { rng: () => 0.5, jitter: 0, maxSteps: 200 });
  const z5 = streamlines(eastward(), vp, 70, 0.02, { rng: () => 0.5, jitter: 0, maxSteps: 200 });
  const z8 = streamlines(eastward(), vp, 70, 0.008, { rng: () => 0.5, jitter: 0, maxSteps: 200 });
  assert.ok(z3.length < z5.length, `z3 (${z3.length}) < z5 (${z5.length})`);
  assert.ok(z5.length < z8.length, `z5 (${z5.length}) < z8 (${z8.length})`);
  assert.ok(z3.length >= 2, "siempre hay alguna línea");
});

test("E13.5 la integración se corta al salir de la caja", () => {
  const lines = streamlines(eastward(), [-1, -1, 1, 1], 4, 0.1, {
    rng: () => 0.5,
    jitter: 0,
    stepDeg: 0.5,
    maxSteps: 24,
  });
  assert.ok(lines.length > 0);
  for (const line of lines) {
    for (const p of line) {
      assert.ok(p[0] >= -1 && p[0] <= 1, "lon dentro de la caja");
      assert.ok(p[1] >= -1 && p[1] <= 1, "lat dentro de la caja");
    }
  }
});

test("E13.5 sin campo (null) no hay líneas", () => {
  const empty: StreamField = { at: () => null };
  assert.equal(streamlines(empty, [-10, -5, 10, 5], 4, 0.25, { rng: () => 0.5 }).length, 0);
});
