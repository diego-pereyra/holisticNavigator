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

// E12.13b — la duración de la comparación del optimizador es una DURACIÓN
// (etaMs - startMs), nunca la fecha de llegada (el número de 5 cifras de Diego).
test("E12.13b el optimizador resta startMs antes de formatear la duración", () => {
  assert.ok(
    !/duracionTexto\([^)]*\.etaMs\s*\/\s*3600_000/.test(src),
    "duracionTexto no puede recibir etaMs/3600_000 (fecha de epoch)",
  );
  const matches = src.match(/duracionTexto\(\([^)]*\.etaMs - job\.startMs\) \/ 3600_000\)/g) ?? [];
  assert.ok(matches.length >= 3, `esperaba >=3 renders con (etaMs - startMs), hay ${matches.length}`);
});

test("E12.13b duracionTexto delega en breakdownDuration (un solo desglose)", () => {
  const body = bodyOf("duracionTexto");
  assert.ok(body.includes("breakdownDuration"), "duracionTexto usa el desglose único");
});

// BT1.1 — "Apoyar el proyecto" es un único punto en Ajustes: dos canales con
// roles distintos, entre Tema y "Datos sin conexión", y nada en navegación.
test("BT1.1 Apoyar: dos canales en Ajustes, entre Tema y Datos sin conexión", () => {
  const ajustes = bodyOf("renderAjustes");
  assert.ok(ajustes.includes("ENLACE_KOFI"), "Ajustes ofrece Ko-fi");
  assert.ok(ajustes.includes("ENLACE_SPONSORS"), "Ajustes ofrece Sponsors");
  assert.equal(
    (ajustes.match(/noopener/g) ?? []).length,
    2,
    "una fila por canal, cada una con rel noopener",
  );
  assert.ok(
    ajustes.indexOf("ENLACE_KOFI") < ajustes.indexOf("ENLACE_SPONSORS"),
    "Ko-fi va primero y Sponsors segundo",
  );
  assert.ok(
    ajustes.indexOf("themeCard(ui, cleanup)") < ajustes.indexOf("hn-apoyar"),
    "la tarjeta va después de Tema",
  );
  assert.ok(
    ajustes.indexOf("hn-apoyar") < ajustes.indexOf("Datos sin conexión"),
    "la tarjeta va antes de Datos sin conexión",
  );
});

test("BT1.1 Apoyar: constante única, fuera de pantallas de navegación y sin pop-ups", () => {
  const sinImports = src.replace(/^import[\s\S]*?;$/gm, "");
  const ajustes = bodyOf("renderAjustes");
  for (const nombre of ["ENLACE_KOFI", "ENLACE_SPONSORS"]) {
    const total = (sinImports.match(new RegExp(nombre, "g")) ?? []).length;
    const enAjustes = (ajustes.match(new RegExp(nombre, "g")) ?? []).length;
    assert.equal(total, enAjustes, `${nombre} solo se usa dentro de renderAjustes`);
  }
  assert.ok(!/window\.open|alert\(|confirm\(/.test(ajustes), "Apoyar no abre pop-ups");
  assert.equal(
    (src.match(/hn-apoyar/g) ?? []).length,
    (ajustes.match(/hn-apoyar/g) ?? []).length,
    "el bloque Apoyar no aparece en otras pantallas",
  );
});

