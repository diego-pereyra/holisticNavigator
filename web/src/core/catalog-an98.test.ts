// Caso de prueba de la ruta Cornell AN98 (Cristobal → Miami, variante AN98A)
// y de la importación de su GPX de ejemplo como ruta propia editable.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseFact } from "./catalog.ts";
import type { RouteDetail, RouteVariant } from "./catalog.ts";
import { parseRouteFile } from "./gpx.ts";
import { haversineNm } from "./navigation.ts";
import { importedToOwn, isOwnCode, totalNm } from "./routes-own.ts";

const factsUrl = new URL("../../public/catalog/facts/AN.jsonl", import.meta.url);
const gpxUrl = new URL(
  "../../../sponsors/IG/posteos/2026-11-11-costera/ruta-panama-miami.gpx",
  import.meta.url,
);

// Los 12 waypoints canónicos de AN98A, en orden. El catálogo intercala además
// puntos sintéticos "Costa N" (corregidos a aguas profundas) entre ellos.
const CANONICAL: ReadonlyArray<readonly [string, number, number]> = [
  ["Cristobal", 9.388333, -79.918333],
  ["Cristobal N", 9.441667, -79.908333],
  ["Farallones", 9.666667, -79.641667],
  ["Jamaica SE", 17.266667, -75.933333],
  ["Navassa W", 18.416667, -75.133333],
  ["Cuba E", 20.166667, -73.95],
  ["Fraile N", 20.433333, -74.188333],
  ["Old S", 22.175, -77.458333],
  ["Old N", 22.85, -78.758333],
  ["Santaren", 24.133333, -79.5],
  ["Cut", 25.766667, -80.075],
  ["Miami", 25.763333, -80.131667],
];

const SYNTHETIC = /^Costa \d+$/;

function loadAn98(): RouteDetail {
  const lines = readFileSync(factsUrl, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  for (const line of lines) {
    const detail = parseFact(line);
    if (detail?.code === "AN98") return detail;
  }
  assert.fail("AN98 no aparece en web/public/catalog/facts/AN.jsonl");
}

function an98a(detail: RouteDetail): RouteVariant {
  const variant = detail.variants.find((v) => v.id === "AN98A");
  assert.ok(variant, "falta la variante AN98A");
  return variant;
}

test("AN98A existe en el catálogo: Cristobal → Miami, 1254 nm", () => {
  const detail = loadAn98();
  assert.equal(detail.from, "Cristobal");
  assert.equal(detail.to, "Miami");

  const variant = an98a(detail);
  assert.equal(variant.from, "Cristobal");
  assert.equal(variant.to, "Miami");
  assert.equal(variant.nm, 1254);
});

test("AN98A tiene los 12 waypoints canónicos con nombre y coordenadas", () => {
  const variant = an98a(loadAn98());

  const canonical = variant.waypoints.filter((w) => !SYNTHETIC.test(w.name));
  assert.deepEqual(
    canonical.map((w) => [w.name, w.lat, w.lon]),
    CANONICAL.map(([name, lat, lon]) => [name, lat, lon]),
  );

  // Los 8 puntos "Costa N" son correcciones sintéticas a aguas profundas.
  const synthetic = variant.waypoints.filter((w) => SYNTHETIC.test(w.name));
  assert.equal(synthetic.length, 8);
  assert.ok(synthetic.every((w) => w.corrected));
  assert.equal(variant.waypoints.length, CANONICAL.length + synthetic.length);
});

test("AN98A suma 1254 nm (o muy cerca) sobre todos sus waypoints", () => {
  const variant = an98a(loadAn98());
  let sum = 0;
  for (let i = 0; i + 1 < variant.waypoints.length; i++) {
    const a = variant.waypoints[i]!;
    const b = variant.waypoints[i + 1]!;
    // Distancia haversine, mismo criterio que core/routes-own.ts.
    sum += haversineNm(a.lat, a.lon, b.lat, b.lon);
  }
  assert.ok(
    Math.abs(sum - 1254) < 1,
    `la suma de tramos dio ${sum.toFixed(2)} nm, se esperaba ~1254 nm`,
  );
});

test("el GPX de ejemplo AN98 se importa como ruta propia válida", () => {
  const xml = readFileSync(gpxUrl, "utf8");
  const imported = parseRouteFile("ruta-panama-miami.gpx", xml);
  assert.ok(imported, "el GPX de ejemplo debe parsear");
  assert.ok(imported.name.includes("Cristobal") && imported.name.includes("Miami"));
  assert.equal(imported.points.length, CANONICAL.length);
  assert.deepEqual(
    imported.points.map((p) => [p.lat, p.lon]),
    CANONICAL.map(([, lat, lon]) => [lat, lon]),
  );

  const own = importedToOwn(imported, "MIA-an98a", 1_700_000_000_000);
  assert.ok(isOwnCode(own.id));
  assert.equal(own.waypoints.length, CANONICAL.length);
  assert.ok(own.waypoints.every((w) => w.mandatory));
  assert.deepEqual(
    own.waypoints.map((w) => [w.lat, w.lon]),
    CANONICAL.map(([, lat, lon]) => [lat, lon]),
  );
  assert.ok(Math.abs(totalNm(own) - 1243.99) < 1, `distancia ${totalNm(own)}`);
});
