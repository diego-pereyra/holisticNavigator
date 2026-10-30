import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { ENLACE_KOFI, ENLACE_SPONSORS } from "./enlaces.ts";

// Los esperados se arman por partes para que este test no sea una segunda
// ocurrencia literal de las URLs en web/src/ (la guardia las cuenta).
const ESPERADO_KOFI = ["https:", "", "ko-fi.com", "holisticnavigator"].join("/");
const ESPERADO_SPONSORS = ["https:", "", "github.com", "sponsors", "diego-pereyra"].join("/");

const fuente = readFileSync(new URL("./enlaces.ts", import.meta.url), "utf8");
const enlacesDoc = readFileSync(new URL("../../../sponsors/ENLACES.md", import.meta.url), "utf8");

function fuentes(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    return entry.isDirectory() ? fuentes(url) : [url];
  });
}

test("BT1.1 enlaces: cada URL es exactamente la declarada (sin query ni barra final)", () => {
  assert.equal(ENLACE_KOFI, ESPERADO_KOFI);
  assert.equal(ENLACE_SPONSORS, ESPERADO_SPONSORS);
  for (const url of [ENLACE_KOFI, ENLACE_SPONSORS]) {
    assert.ok(!url.endsWith("/"), `sin barra final: ${url}`);
    assert.ok(!url.includes("?"), `sin query: ${url}`);
  }
});

test("BT1.1 enlaces: sponsors/ENLACES.md contiene los dos, en el mismo orden", () => {
  assert.ok(enlacesDoc.includes(ENLACE_KOFI), "ENLACES.md declara Ko-fi");
  assert.ok(enlacesDoc.includes(ENLACE_SPONSORS), "ENLACES.md declara Sponsors");
  assert.ok(
    enlacesDoc.indexOf(ENLACE_KOFI) < enlacesDoc.indexOf(ENLACE_SPONSORS),
    "Ko-fi va antes que Sponsors también en ENLACES.md",
  );
});

test("BT1.1 enlaces: enlaces.ts solo declara estas dos URLs", () => {
  const urls = fuente.match(/https?:\/\/[^\s"'`]+/g) ?? [];
  assert.equal(urls.length, 2, `esperaba 2 URLs declaradas, hay ${urls.length}`);
  for (const url of urls) {
    assert.ok(url === ENLACE_KOFI || url === ENLACE_SPONSORS, `URL no declarada: ${url}`);
  }
});

test("BT1.1 enlaces: cada URL aparece una sola vez en web/src/ (guardia anti-duplicación)", () => {
  const archivos = fuentes(new URL("../", import.meta.url)).filter((url) => url.pathname.endsWith(".ts"));
  for (const [nombre, url] of [
    ["ENLACE_KOFI", ENLACE_KOFI],
    ["ENLACE_SPONSORS", ENLACE_SPONSORS],
  ] as const) {
    const ocurrencias = archivos.reduce((total, archivo) => {
      const texto = readFileSync(archivo, "utf8");
      return total + texto.split(url).length - 1;
    }, 0);
    assert.equal(ocurrencias, 1, `${nombre} debe aparecer una sola vez en web/src/ (hay ${ocurrencias})`);
  }
});
