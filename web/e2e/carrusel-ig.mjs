// E2E del carrusel de Instagram: abre la app, importa el GPX de la ruta pedida
// y deja las cuatro placas de la historia en el directorio de salida
// (390×844, 2×). Sirve para cualquier ruta del libro con variante en el
// catálogo; los textos y los waypoints salen de los facts, no del código.
//
// Uso: node web/e2e/carrusel-ig.mjs [url] [salida] [codigoRuta] [variante]
//   código   AN98 | AN54 | AN62 | AN73 | … (por defecto AN98)
//   variante la primera del catálogo si se omite
//
// GPX: si existe sponsors/IG/posteos/*/ruta-<código>.gpx se usa ese archivo.
// Si no, se genera al vuelo desde los waypoints de la variante y se deja en el
// directorio de salida. Requiere Playwright (solo en CI: `npm i --no-save
// playwright`). En WSL no hay browser real: lo corre
// .github/workflows/e2e-carrusel.yml contra un build servido con HTTP Range,
// igual que el smoke y el UAT.
//
// Placas:
//   01 mejor momento del libro (meses y ciclones de la ruta cargada)
//   02 consejo del libro (el tip de la ruta cargada)
//   03 ruta de la variante en el mapa + tabla de waypoints
//   04 ruta propia importada del GPX, optimización al viento y simulación
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const base = process.argv[2] ?? "http://localhost:8087/holisticNavigator/";
const out = resolve(root, process.argv[3] ?? "e2e-screenshots");
const code = (process.argv[4] ?? "AN98").trim().toUpperCase();
const variantArg = (process.argv[5] ?? "").trim();

const MONTH_NAME = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// --- catálogo: la ruta y su variante son la fuente de nombres y textos ---
function leerFact(codigo) {
  const dir = join(root, "web/public/catalog/facts");
  const capitulo = /^[A-Za-z]+/.exec(codigo)?.[0]?.toUpperCase() ?? codigo;
  const candidatos = [
    join(dir, `${capitulo}.jsonl`),
    ...readdirSync(dir)
      .filter((n) => n.endsWith(".jsonl") && n !== `${capitulo}.jsonl`)
      .sort()
      .map((n) => join(dir, n)),
  ];
  for (const archivo of candidatos) {
    if (!existsSync(archivo)) continue;
    for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
      if (linea.trim() === "") continue;
      const o = JSON.parse(linea);
      if (o.code === codigo) return o;
    }
  }
  throw new Error(`no encuentro la ruta ${codigo} en web/public/catalog/facts/`);
}

const ruta = leerFact(code);
const variantes = Array.isArray(ruta.variants) ? ruta.variants : [];
if (variantes.length === 0) throw new Error(`la ruta ${code} no tiene variantes en el catálogo`);
const variante = variantArg
  ? variantes.find((v) => v.id === variantArg)
  : variantes[0];
if (!variante) {
  throw new Error(
    `la ruta ${code} no tiene la variante ${variantArg}; hay: ${variantes.map((v) => v.id).join(", ")}`,
  );
}
const variantId = variante.id;
const cuando = ruta.when ?? {};
const bestMonths = Array.isArray(cuando.bestMonths) ? cuando.bestMonths : [];
const bestEs = typeof cuando.bestEs === "string" ? cuando.bestEs : "";
const stormsEs = typeof cuando.stormsEs === "string" ? cuando.stormsEs : "";
const tip = typeof ruta.tip === "string" && ruta.tip !== "" ? ruta.tip : ruta.chapterTip ?? "";
const mes = bestMonths[0] ?? new Date().getUTCMonth() + 1;
const mesNombre = MONTH_NAME[mes - 1] ?? "";

// --- GPX: el de sponsors si ya existe para la ruta; si no, se genera ---
function gpxXml() {
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const nombreMeta = `${code} · ${ruta.from ?? variante.from} → ${ruta.to ?? variante.to}`;
  const desc = `${ruta.title ?? nombreMeta}. Ruta Cornell ${variantId}: ${variante.nm ?? 0} nm. Historia IG de Holistic Navigator.`;
  const lineas = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Holistic Navigator" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    `    <name>${esc(nombreMeta)}</name>`,
    `    <desc>${esc(desc)}</desc>`,
    "  </metadata>",
    "  <rte>",
    `    <name>${esc(`${code} · ${variante.from} → ${variante.to}`)}</name>`,
  ];
  for (const wp of variante.waypoints ?? []) {
    lineas.push(
      `    <rtept lat="${wp.lat}" lon="${wp.lon}"><name>${esc(wp.name)}</name></rtept>`,
    );
  }
  lineas.push("  </rte>", "</gpx>", "");
  return lineas.join("\n");
}

function buscarGpxDeLaRuta(codigo) {
  const dir = join(root, "sponsors/IG/posteos");
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    const candidato = join(dir, entrada.name, `ruta-${codigo}.gpx`);
    if (existsSync(candidato)) return candidato;
  }
  return null;
}

mkdirSync(out, { recursive: true });
let gpx = buscarGpxDeLaRuta(code);
let gpxPropio = false;
if (!gpx) {
  gpx = join(out, `ruta-${code}.gpx`);
  writeFileSync(gpx, gpxXml(), "utf8");
  gpxPropio = true;
}
const gpxTexto = readFileSync(gpx, "utf8");
const wpsGpx = (gpxTexto.match(/<(?:trkpt|rtept|wpt)\b/gi) ?? []).length;

const VIEWPORT = { width: 390, height: 844 };
const DPR = 2;
const SHOT = {
  momento: `carrusel-${code}-01-momento.png`,
  consejos: `carrusel-${code}-02-consejos.png`,
  ruta: `carrusel-${code}-03-ruta.png`,
  optimiza: `carrusel-${code}-04-optimiza.png`,
};

const fallas = [];
const avisos = [];
const log = (...a) => console.log("[carrusel]", ...a);

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
    hasTouch: true,
    isMobile: true,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  });
  const page = await context.newPage();

  page.on("pageerror", (e) => {
    fallas.push(`pageerror: ${e.message}`);
    log("pageerror:", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") log("console.error:", m.text());
  });
  page.on("requestfailed", (r) => {
    log("requestfailed:", r.url(), r.failure()?.errorText ?? "");
  });

  const shot = async (name) => {
    const path = join(out, name);
    await page.screenshot({ path, fullPage: false });
    log("captura:", path);
  };

  const debug = async (name) => {
    await page
      .screenshot({ path: join(out, `carrusel-${code}-99-error-${name}.png`) })
      .catch(() => undefined);
    const text = await page
      .evaluate(() => document.body.innerText.slice(0, 700))
      .catch(() => "");
    log(`estado tras ${name}:`, JSON.stringify(text));
  };

  const fase = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      fallas.push(`${name}: ${e?.message ?? e}`);
      log(`FALLA ${name}:`, e?.message ?? e);
      await debug(name);
    }
  };

  // --- utilidades de la hoja (la altura define cuánto mapa se ve) ---
  const sheetState = async () => {
    const cls = (await page.locator(".hn-sheet").getAttribute("class")) ?? "";
    return /hn-sheet-(peek|half|full)/.exec(cls)?.[1] ?? "half";
  };

  const dragSheet = async (dy) => {
    const box = await page.locator(".hn-handle").boundingBox();
    if (!box) throw new Error("no encuentro el tirador de la hoja (.hn-handle)");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + dy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(450);
  };

  const setSheet = async (target) => {
    const order = ["peek", "half", "full"];
    for (let i = 0; i < 4; i++) {
      const cur = await sheetState();
      if (cur === target) return;
      await dragSheet(order.indexOf(target) > order.indexOf(cur) ? -320 : 320);
    }
    throw new Error(`la hoja quedó en ${await sheetState()}, esperaba ${target}`);
  };

  const waitText = async (text, timeout = 15_000) => {
    const loc = page.getByText(text, { exact: false }).first();
    await loc.waitFor({ state: "visible", timeout });
    return loc;
  };

  // La cabecera de la ficha es sticky: al llevar un bloque al tope hay que
  // descontar su alto o queda tapado. `center` sirve para una fila suelta.
  const scrollFichaTo = async (loc, block = "start") => {
    await loc.evaluate((el, b) => {
      const col = el.closest(".hn-col-ficha");
      if (!col) {
        el.scrollIntoView({ block: b });
        return;
      }
      const head = col.querySelector(".hn-ficha-head");
      const headH = head ? head.getBoundingClientRect().height : 0;
      const top =
        el.getBoundingClientRect().top - col.getBoundingClientRect().top + col.scrollTop;
      const vh = col.clientHeight;
      const eh = el.getBoundingClientRect().height;
      const target = b === "center" ? top - (vh - eh) / 2 : top - headH - 6;
      col.scrollTop = Math.max(0, target);
    }, block);
  };

  const abrirAcordeon = async (title) => {
    const head = page.locator(".hn-acc-head").filter({ hasText: title }).first();
    await scrollFichaTo(head, "center");
    if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
    return head;
  };

  const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Fila de waypoint por nombre exacto (tolera el prefijo ⚑ del destino).
  const filaWaypoint = (name) =>
    page
      .locator(".hn-wps .hn-wp-item")
      .filter({
        has: page.locator(".hn-wp-name", {
          hasText: new RegExp(`^(?:⚑\\s*)?${escaparRegex(name)}$`),
        }),
      })
      .first();

  // --- arranque: la ruta del libro en la variante pedida ---
  await page.goto(new URL(`?route=${code}&variant=${variantId}`, base).toString(), {
    waitUntil: "load",
    timeout: 30_000,
  });
  await page.waitForSelector("#hn-loading.done", {
    state: "attached",
    timeout: 20_000,
  });
  await page.waitForSelector(".hn-context", { timeout: 15_000 });
  await page
    .locator(".hn-ficha-head .hn-h2")
    .filter({ hasText: code })
    .waitFor({ timeout: 20_000 });
  await page.locator(".hn-facts").waitFor({ timeout: 20_000 });
  log(`ficha ${code} cargada (variante ${variantId})`);
  log(gpxPropio ? `GPX generado desde el catálogo: ${gpx}` : `GPX de sponsors: ${gpx}`);

  // El arranque por URL abre la ficha antes de que llegue la geometría: al
  // tocar la variante se dibuja y se encuadra la ruta en el mapa.
  await fase(`encuadrar ${variantId}`, async () => {
    await abrirAcordeon("Variantes");
    const boton = page.locator(".hn-variant").filter({ hasText: variantId }).first();
    await boton.waitFor({ state: "visible", timeout: 10_000 });
    await boton.click();
    await page.waitForTimeout(900);
  });

  // Placa 1: mejor momento de esta ruta (los meses y el veredicto vienen de
  // los facts; el mes elegido es el primero de la mejor época del libro).
  await fase("placa 1 · mejor momento", async () => {
    const botonMes = page.locator(`.hn-months .hn-month[title="${mesNombre}"]`).first();
    await scrollFichaTo(botonMes, "center");
    await botonMes.click();
    await waitText(`${mesNombre} está en la mejor época`);
    if (bestEs) await waitText(bestEs);
    if (stormsEs) await waitText(stormsEs);
    await setSheet("full");
    await scrollFichaTo(page.locator(".hn-months").first());
    await page.waitForTimeout(400);
    await shot(SHOT.momento);
  });

  // Placa 2: el consejo del libro para esta ruta (texto del catálogo).
  await fase("placa 2 · consejos", async () => {
    const consejo = await abrirAcordeon("Consejo");
    if (tip) await waitText(tip);
    await scrollFichaTo(consejo);
    await page.waitForTimeout(400);
    await shot(SHOT.consejos);
  });

  // Placa 3: la variante en el mapa, con la tabla de waypoints a la vista.
  // Los puntos que verificamos salen de la variante, no de AN98.
  await fase("placa 3 · ruta", async () => {
    await setSheet("half");
    await abrirAcordeon("Waypoints");
    const lista = page.locator(".hn-wps").first();
    await lista.waitFor({ state: "visible", timeout: 10_000 });
    const count = await page.locator(".hn-wps .hn-wp-item").count();
    const esperados = (variante.waypoints ?? []).length;
    if (count < esperados) {
      throw new Error(
        `la tabla de waypoints tiene ${count} filas, esperaba ${esperados} de ${variantId}`,
      );
    }
    const waypoints = variante.waypoints ?? [];
    const primero = waypoints[0];
    const ultimo = waypoints[waypoints.length - 1];
    const medio = waypoints[Math.floor((waypoints.length - 1) / 2)];
    for (const wp of [primero, medio, ultimo]) {
      if (wp?.name) {
        await filaWaypoint(wp.name).waitFor({ state: "visible", timeout: 10_000 });
      }
    }
    const fila = medio?.name ? filaWaypoint(medio.name) : lista;
    await scrollFichaTo(fila, "center");
    await page.waitForTimeout(400);
    await shot(SHOT.ruta);
  });

  // Placa 4: importar el GPX como ruta propia (MIA-…), optimizar al viento y
  // simular el recorrido. La ruta propia abre su editor con el panel de modos.
  await fase("placa 4 · optimizar y simular", async () => {
    await page.locator(".hn-back").first().click();
    await page.locator(".hn-tab").filter({ hasText: "Rutas" }).first().click();
    const importar = page
      .getByText("Importar GPX a Mis rutas", { exact: true })
      .first();
    await importar.waitFor({ state: "visible", timeout: 15_000 });
    await importar.scrollIntoViewIfNeeded();

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10_000 }),
      importar.click(),
    ]);
    await chooser.setFiles(gpx);
    log("GPX importado");

    await page.locator(".hn-own-name").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.locator(".hn-optimize").first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.waitForFunction(
      (n) => document.querySelectorAll(".hn-own-wp").length >= n,
      Math.max(2, wpsGpx),
      { timeout: 10_000 },
    );

    // Modo regata (la placa muestra los tres: Confort / Crucero / Regata).
    const regata = page
      .locator(".hn-opt-modes .hn-chip")
      .filter({ hasText: "Regata" })
      .first();
    await regata.scrollIntoViewIfNeeded();
    await regata.click();

    const correr = page
      .locator(".hn-opt-head button")
      .filter({ hasText: /Ruta del mes|Optimizar con el viento/ })
      .first();
    await correr.scrollIntoViewIfNeeded();
    await correr.click();
    log("optimización lanzada; esperando el cálculo…");

    await page.waitForFunction(
      () => {
        const t = document.querySelector(".hn-optimize")?.textContent ?? "";
        return /Optimizada:|No se pudo trazar|No se pudo optimizar|Optimización cancelada/.test(
          t,
        );
      },
      null,
      { timeout: 240_000 },
    );

    const optimizada = await page
      .locator(".hn-opt-stats")
      .first()
      .isVisible()
      .catch(() => false);
    if (optimizada) {
      log("optimización lista");
      await page
        .getByText("Simular la sugerencia", { exact: true })
        .first()
        .click();
    } else {
      avisos.push("el optimizador no llegó; se simula la ruta trazada a mano");
      log("optimización sin llegada; uso 'Simular travesía'");
      const simular = page
        .getByText("Simular travesía", { exact: true })
        .first();
      await simular.scrollIntoViewIfNeeded();
      await simular.click();
    }

    const sim = page.locator(".hn-sim-days").first();
    await sim.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(1200);

    // Pausar y dejar la simulación en un paso intermedio (se ve el rumbo y la ETA).
    const play = page.locator(".hn-sim-btn").first();
    if ((await play.getAttribute("aria-label")) === "Pausar") await play.click();
    const slider = page.locator(".hn-sim-days-slider").first();
    const max = Number((await slider.getAttribute("max")) ?? "1");
    const paso = Math.max(2, Math.floor(max * 0.35));
    await slider.evaluate((el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, paso);
    await page.waitForTimeout(600);

    // La placa muestra el panel completo: modos, ETA y simulación. La hoja
    // entera deja ver el panel; el mapa ya tuvo su placa en la 03.
    await setSheet("full");
    const panel = page.locator(".hn-optimize").first();
    await scrollFichaTo(optimizada ? panel : sim, optimizada ? "start" : "center");
    await page.waitForTimeout(400);
    await shot(SHOT.optimiza);
  });

  if (fallas.length > 0) {
    console.error(`CARRUSEL FAIL · ${fallas.length} problema(s)`);
    for (const f of fallas) console.error(" - " + f);
  } else {
    console.log(`CARRUSEL OK · ${code} · 4 capturas en ${out}`);
  }
  for (const a of avisos) console.log(" [aviso] " + a);
  if (fallas.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
