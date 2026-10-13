import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveContext, type Basin, type VariantGeometry } from "./context.ts";

const BASINS: Record<string, Basin> = JSON.parse(
  readFileSync(new URL("../../../data/catalog/v3/basins.json", import.meta.url), "utf-8"),
).regions;

interface GeoJsonFeature {
  properties: { code?: string; variant?: string; wpNames?: string[] };
  geometry: { type: string; coordinates: [number, number][] };
}

function loadVariants(codeFilter?: Set<string>): VariantGeometry[] {
  const doc = JSON.parse(
    readFileSync(new URL("../../../data/catalog/v3/routes.geojson", import.meta.url), "utf-8"),
  ) as { features: GeoJsonFeature[] };
  const out: VariantGeometry[] = [];
  for (const f of doc.features) {
    if (f.geometry.type !== "LineString") continue;
    const code = f.properties.code ?? "";
    if (codeFilter && !codeFilter.has(code)) continue;
    out.push({
      code,
      variant: f.properties.variant ?? code,
      coords: f.geometry.coordinates,
      names: f.properties.wpNames ?? [],
    });
  }
  return out;
}

test("T2.3 región: Panamá → Atlántico Tropical", () => {
  assert.equal(resolveContext(9.5, -79.6, 8, BASINS, []).region, "Atlántico Tropical");
});

test("T2.3 región: Fiji (ambos lados del antimeridiano) → Pacífico Sur", () => {
  assert.equal(resolveContext(-18, 178, 1, BASINS, []).region, "Pacífico Sur");
  assert.equal(resolveContext(-18, -179, 1, BASINS, []).region, "Pacífico Sur");
});

test("T2.3 región: Golfo de Cádiz → Atlántico Norte", () => {
  assert.equal(resolveContext(36, -6, 7, BASINS, []).region, "Atlántico Norte");
});

test("T2.3 región: Atlántico Sur fuera de temporada todo el año", () => {
  const ctx = resolveContext(-40, 10, 1, BASINS, []);
  assert.equal(ctx.region, "Atlántico Sur");
  for (let m = 1; m <= 12; m++) {
    assert.equal(resolveContext(-40, 10, m, BASINS, []).inStormSeason, false);
  }
  assert.equal(ctx.inStormSeason, false);
});

test("T2.3 cercanas: AN32 aparece con el conjunto controlado", () => {
  const variants = loadVariants(new Set(["AN32", "AN16", "AN124"]));
  const ctx = resolveContext(36, -6, 7, BASINS, variants);
  assert.equal(ctx.region, "Atlántico Norte");
  const codes = ctx.nearby.map((n) => n.code);
  assert.ok(codes.includes("AN32"), `nearby=${codes.join(",")}`);
});

test("T2.3 cercanas: tope 8 y orden por distancia", () => {
  const variants = loadVariants();
  const ctx = resolveContext(36, -6, 7, BASINS, variants);
  assert.ok(ctx.nearby.length <= 8);
  for (let i = 1; i < ctx.nearby.length; i++) {
    assert.ok(ctx.nearby[i - 1]!.distanceNm <= ctx.nearby[i]!.distanceNm);
  }
});
