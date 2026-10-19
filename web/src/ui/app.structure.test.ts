import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// UX-N.5b — guardia de estructura: los datos (pronósticos, cartas) no viven en
// Ajustes. Ajustes es preferencias + un enlace a la sección propia "Datos".
// La UI corre en el navegador (smoke test en CI); acá solo se protege el reparto.
const src = readFileSync(new URL("./app.ts", import.meta.url), "utf8");

function bodyOf(name: string): string {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `no existe ${name}`);
  const next = src.indexOf("\nfunction ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

test("UX-N.5b Ajustes no mezcla datos: enlaza a la sección propia", () => {
  const ajustes = bodyOf("renderAjustes");
  assert.ok(!ajustes.includes("listForecasts"), "Ajustes no lista paquetes de datos");
  assert.ok(!ajustes.includes("offlineCard"), "Ajustes no arma la tarjeta de datos");
  assert.ok(ajustes.includes('goTo(ui, "datos")'), "Ajustes enlaza a Datos sin conexión");
});

test("UX-N.5b existe la sección Datos y el bloque de pronóstico de la ruta", () => {
  assert.ok(src.includes("function renderDatos("), "existe renderDatos");
  assert.ok(src.includes("function routeForecastBlock("), "la ficha tiene su bloque de pronóstico");
  assert.ok(!src.includes("Pronóstico de la travesía"), "muere el nombre genérico");
});
