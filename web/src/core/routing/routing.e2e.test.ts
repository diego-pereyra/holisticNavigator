// REPRO (architect, E12.9): validación end-to-end del enrutado con la máscara
// REAL y el viento REAL de la climatología — no fixtures. Reproduce el reporte
// de Diego: "sin corredor navegable cerca de (coords) pero está en aguas
// abiertas". Este archivo queda como test de regresión del enrutado.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeLandmask } from "./landmask.ts";
import { routeOptimal } from "./isochrones.ts";
import { genericPolar } from "./polar.ts";
import { climateWindField, type WindField } from "./windfield.ts";
import { CLIM_SCALES, type ClimMonth } from "../clim.ts";

const land = decodeLandmask(
  new Uint8Array(readFileSync(new URL("../../../public/basemap/land.bits", import.meta.url))),
);

const climData = new Uint8Array(readFileSync(new URL("../../../public/clim/m10.bin", import.meta.url)));
const clim: ClimMonth = {
  grid: [360, 180],
  origin: [-180, -90],
  fields: 9,
  scales: CLIM_SCALES,
  data: climData,
};

const T0 = Date.UTC(2026, 9, 18);

test("máscara: aguas abiertas NO bloqueadas con margen 3 nm", () => {
  for (const [lat, lon] of [
    [15, -55],
    [0, -30],
    [35, -45],
    [-20, -15],
    [28, -30],
  ]) {
    assert.equal(land.isLand(lat, lon), false, `(${lat},${lon}) debería ser mar`);
    assert.equal(land.isLandWithMargin(lat, lon, 3), false, `(${lat},${lon}) aguas abiertas no debería bloquear con 3 nm`);
  }
});

function runCase(name: string, wind: WindField, from: [number, number], to: [number, number]) {
  test(`${name}: ${from.join(",")} → ${to.join(",")}`, () => {
    const r = routeOptimal({ from, to, startMs: T0, wind, polar: genericPolar(), land });
    console.log(
      `  [${name}] reached=${r.reached} reason=${r.reason ?? "—"} steps=${r.steps} nm=${Math.round(r.nm)} wps=${r.waypoints.length}`,
    );
    assert.ok(r.reached, `no llegó: ${r.reason ?? "sin motivo"}`);
    // El trazado no pisa tierra (salvo la gracia de los extremos).
    const far = r.waypoints.filter((w) => {
      const dFrom = Math.hypot(w.lat - from[1], w.lon - from[0]);
      const dTo = Math.hypot(w.lat - to[1], w.lon - to[0]);
      return dFrom > 0.25 && dTo > 0.25;
    });
    for (const w of far) {
      assert.equal(land.isLandWithMargin(w.lat, w.lon, 3), false, `waypoint (${w.lat.toFixed(2)},${w.lon.toFixed(2)}) pisa tierra`);
    }
  });
}

const uniforme: WindField = () => ({ dir: 90, speed: 15 });
const octubre = climateWindField(clim);

runCase("viento uniforme E 15 kn", uniforme, [-16, 28], [-59, 13]); // Canarias → Barbados
runCase("climatología octubre", octubre, [-16, 28], [-59, 13]);
runCase("climatología octubre, aguas abiertas", octubre, [-55, 15], [-50, 10]); // el caso de Diego
runCase("SONDA uniforme, origen mar abierto → Barbados (celda de isla)", uniforme, [-55, 15], [-59, 13]);
runCase("SONDA uniforme, origen mar abierto → agua al NE de Barbados", uniforme, [-55, 15], [-58.6, 12.9]);
runCase("SONDA uniforme, origen isla Canarias → agua al NE de Barbados", uniforme, [-16, 28], [-58.6, 12.9]);

// E12.10 — la tabla de waypoints queda navegable: los puntos de paso son solo
// viradas de verdad; los Bordos de la ceñida-popa y las anclas suman lo que
// suman (es la realidad del viaje, y no se recortan).
test("E12.10 Canarias→Barbados: recuento navegable de la tabla", () => {
  const r = routeOptimal({ from: [-16, 28], to: [-59, 13], startMs: T0, wind: uniforme, polar: genericPolar(), land });
  assert.ok(r.reached, `no llegó: ${r.reason ?? "sin motivo"}`);
  const bordos = r.waypoints.filter((w) => w.tack === true).length;
  const pasos = r.waypoints.length - 2 - bordos;
  console.log(`  [E12.10] wps=${r.waypoints.length} bordos=${bordos} pasos=${pasos}`);
  assert.ok(pasos <= 15, `puntos de paso: ${pasos}`);
  assert.ok(r.waypoints.length <= 20, `tabla total: ${r.waypoints.length}`);
});
