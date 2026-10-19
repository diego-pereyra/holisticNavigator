// UAT de la app en browser real (corre en CI — ver .github/workflows/uat.yml).
//
// MIDE, NO VALIDA: recorre los journeys clave a dos viewports (celular
// vertical y tablet apaisada), cuenta toques, captura cada paso y registra
// hallazgos (afordanzas que no se encuentran, recursos que fallan, errores
// de consola). Escrito contra la UI rediseñada (UX-N.1..N.7).
//
// Uso:   node web/uat/uat.mjs http://localhost:8087/holisticNavigator/ web/uat/out
// Salida: <out>/<viewport>/*.png + <out>/uat-<viewport>.json
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8087/holisticNavigator/";
const OUT = process.argv[3] ?? "web/uat/out";
const VIEWPORTS = [
  { name: "phone-390", width: 390, height: 844 },
  { name: "tablet-1180", width: 1180, height: 820 },
];

const SHOT_FAILS = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (b) => b === true;

// ---------------------------------------------------------------- tester

function tester(page, dir, journey) {
  let taps = 0;
  let shotN = 0;
  const steps = [];

  const shot = async (label) => {
    shotN++;
    try {
      await page.screenshot({ path: join(dir, `${journey}-${String(shotN).padStart(2, "0")}-${label}.png`) });
    } catch (e) {
      SHOT_FAILS.push(`${journey} #${shotN} (${label}): ${String(e?.message ?? e).slice(0, 140)}`);
    }
  };

  const note = (label, found, extra = "") => steps.push({ label, found, extra, taps });

  const tap = async (label, locator, opts = {}) => {
    taps++;
    try {
      await locator.first().click({ timeout: 4000, ...opts });
      note(label, true);
      return true;
    } catch {
      note(label, false, "no se encontró");
      return false;
    }
  };

  const tapText = (label, text) => tap(label, page.getByText(text, { exact: false }));

  const waitText = async (label, text, ms = 8000) => {
    try {
      await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: ms });
      note(`espera: ${label}`, true);
      return true;
    } catch {
      note(`espera: ${label}`, false, `no apareció en ${ms} ms`);
      return false;
    }
  };

  const exists = async (label, locator) => {
    const found = await locator
      .first()
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true, () => false);
    note(`existe: ${label}`, found);
    return found;
  };

  return { shot, tap, tapText, waitText, exists, note, get taps() { return taps; }, get steps() { return steps; } };
}

// ------------------------------------------------------------- selectores

const ctxBtn = (page, hasText) =>
  page.locator(".hn-context button, .hn-context [role='button']").filter({ hasText });
const tab = (page, label) => page.locator(".hn-tab").filter({ hasText: label });

// ------------------------------------------------------------- journeys

async function jArranque(page, t) {
  await page.goto(BASE, { waitUntil: "load", timeout: 30_000 });
  const loaded = await page
    .waitForSelector("#hn-loading.done", { state: "attached", timeout: 15_000 })
    .then(() => true, () => false);
  t.note("arranca en < 15 s", loaded);
  const ctx = await t.exists("barra de contexto", page.locator(".hn-context"));
  await t.exists("FAB ◉", page.locator(".hn-fab"));
  await t.shot("arranque");
  if (!ctx) {
    // Diagnóstico: ¿montó la shell o quedó la pantalla de error?
    const dump = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => "");
    t.note(`diagnóstico de arranque: ${JSON.stringify(dump).slice(0, 220)}`, false);
  }
}

// J1 — "¿Qué viento hay acá?" — el flujo NUEVO: long-press → Clima acá.
async function jClimaEnUnPunto(page, t) {
  await sleep(1200);
  const { width, height } = page.viewportSize();
  // El gesto real es táctil: `installMapHold` ignora `pointerType === "mouse"`
  // (el mouse usa click derecho), así que un mouse down/up no dispara nada.
  const x = width / 2;
  const y = height / 2;
  const pointer = (type) =>
    page.evaluate(
      ({ x, y, type }) => {
        const c = document.querySelector("#map canvas");
        if (!c) return;
        c.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
          }),
        );
      },
      { x, y, type },
    );
  await pointer("pointerdown");
  await sleep(800);
  await pointer("pointerup");
  const hoja = page.getByText("Clima acá", { exact: false });
  const hayHoja = await hoja.first().waitFor({ state: "visible", timeout: 2500 }).then(() => true, () => false);
  t.note("long-press abre la hoja de acciones", hayHoja);
  await t.shot("longpress");
  if (hayHoja) {
    const clima = await t.tap("Clima acá", hoja);
    if (clima) {
      await sleep(900);
      await t.waitText("panel del clima con datos (kn)", /kn|nudos|velocidad/i, 6000);
    }
    await t.shot("clima-en-el-punto");
    await page.keyboard.press("Escape").catch(() => undefined);
    await sleep(400);
  }
}

// J2 — Elegir y seguir una ruta
async function jSeguirRuta(page, t) {
  await t.tap("tab Rutas", tab(page, "Rutas"));
  const rows = page.locator(".hn-row");
  try {
    await rows.first().waitFor({ state: "visible", timeout: 10_000 });
    t.note("la lista de rutas carga", true);
  } catch {
    t.note("la lista de rutas carga", false, "sin .hn-row a los 10 s");
  }
  await t.tap("primera ruta de la lista", rows);
  await sleep(800);
  await t.shot("ficha");
  await t.tap("Seguir", page.getByText("Seguir", { exact: true }));
  await sleep(1500);
  const nav = await page
    .locator(".hn-navstrip, #hn-navstrip, .hn-nav")
    .first()
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true, () => false);
  t.note("la tira de navegación aparece al seguir", nav);
  await t.shot("navegando");
  await t.tap("Dejar de seguir", page.getByText("Dejar de seguir"));
  await t.shot("dejar-de-seguir");
}

// J3 — Optimizar con el viento
async function jOptimizar(page, t) {
  await t.tap("tab Rutas", tab(page, "Rutas"));
  const rows = page.locator(".hn-row");
  try { await rows.first().waitFor({ state: "visible", timeout: 10_000 }); } catch { /* ya medido en J2 */ }
  await t.tap("abrir una ruta", rows);
  const panel = page.locator("#hn-optimize, .hn-optimize");
  try { await panel.first().scrollIntoViewIfNeeded({ timeout: 4000 }); } catch { /* hallazgo abajo */ }
  const btn = page.getByText(/Optimizar con el viento|Ruta del mes/, { exact: false });
  const corrio = await t.tap("Optimizar", btn);
  if (corrio) {
    const listo = await page
      .getByText(/vs |Aplicar|Descartar|Calculando/i)
      .first()
      .waitFor({ state: "visible", timeout: 200_000 })
      .catch(() => null);
    t.note("el cálculo termina (≤ 200 s)", listo !== null);
    await sleep(1000);
    await t.shot("optimizada");
    await t.tap("Descartar", page.getByText("Descartar"));
  }
  await t.shot("optimizar-final");
}

// J4 — MOB (seguridad: presión larga sobre el botón)
async function jMob(page, t) {
  // Sin posición, el chip de posición arranca el GPS de una (no abre el menú,
  // así que "Usar GPS" no existe todavía): es la afordancia correcta.
  await t.tap("Usar GPS (chip de posición)", page.locator(".hn-ctx-pos"));
  await sleep(2500);
  const mob = page.locator(".hn-mob");
  const hayBoton = await t.exists("botón MOB visible", mob);
  if (hayBoton) {
    try {
      await mob.first().click({ delay: 700, timeout: 4000 });
      t.note("presión larga marca MOB", true);
    } catch {
      t.note("presión larga marca MOB", false);
    }
    await sleep(800);
    await t.shot("mob-activo");
    await t.tap("Terminar MOB", page.getByText("Terminar MOB"));
    await t.shot("mob-terminado");
  } else {
    await t.shot("mob-sin-posicion");
  }
}

// J5 — Clima: pilot chart, capas y mes (el chip "Cuándo" abre el selector)
async function jClimaModos(page, t) {
  await t.tap("Tiempo → pilot chart", ctxBtn(page, "≈"));
  await sleep(800);
  await t.exists("panel de capas del clima", page.locator(".hn-wx-stack"));
  await t.tap("apagar capa Olas", page.locator(".hn-wx-layers label").filter({ hasText: "Olas" }));
  await t.shot("capas");
  await t.tap("Tiempo (apagar)", ctxBtn(page, "≈"));
  const cuando = page.locator(".hn-ctx-when");
  const hayCuando = await t.tap("chip Cuándo", cuando);
  if (hayCuando) {
    const menu = page.locator("#hn-month-menu, .hn-month-menu");
    const abierto = await menu.first().waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
    t.note("Cuándo abre el selector de mes", abierto);
    await t.shot("selector-de-mes");
    if (abierto) await t.tap("elegir marzo", menu.locator("button, [role='button']").filter({ hasText: /mar/i }));
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

// J6 — Ajustes (unidades, visibilidad del MOB, tema adentro)
async function jAjustes(page, t) {
  const ajustes = page.locator(".hn-ctx-ajustes");
  const abrio = await t.tap("⚙ Ajustes", ajustes);
  if (abrio) {
    await sleep(600);
    await t.shot("ajustes");
    await t.waitText("Unidades", "Unidades", 3000);
    await t.waitText("Visibilidad", "Visibilidad", 3000);
    await t.waitText("Tema", "Tema", 3000);
    const mobToggle = page.locator("label, .hn-set-row").filter({ hasText: /MOB/i }).first();
    const hay = await t.tap("interruptor MOB", mobToggle);
    if (hay) {
      await sleep(600);
      const visible = await page.locator(".hn-mob").first().isVisible().catch(() => false);
      t.note("ocultar MOB lo oculta de verdad", visible === false);
      await t.shot("mob-oculto");
      await t.tap("interruptor MOB (volver)", mobToggle);
      await sleep(400);
    }
    await t.shot("ajustes-final");
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

// --------------------------------------------------------------- runner

async function runViewport(vp) {
  const dir = join(OUT, vp.name);
  mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: true,
    isMobile: vp.width < 800,
    permissions: ["geolocation"],
    geolocation: { latitude: 15, longitude: -55, accuracy: 50 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const httpErrors = [];
  const failedRequests = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.url()}`); });
  page.on("requestfailed", (r) => failedRequests.push(`${r.url()} · ${r.failure()?.errorText ?? ""}`));

  const journeys = [
    ["arranque", jArranque],
    ["j1-clima-en-un-punto", jClimaEnUnPunto],
    ["j2-seguir-ruta", jSeguirRuta],
    ["j3-optimizar", jOptimizar],
    ["j4-mob", jMob],
    ["j5-clima-y-mes", jClimaModos],
    ["j6-ajustes", jAjustes],
  ];

  const results = [];
  for (const [name, fn] of journeys) {
    const t = tester(page, dir, name);
    const t0 = Date.now();
    try {
      await fn(page, t);
    } catch (e) {
      t.note(`journey abortado: ${String(e.message ?? e).slice(0, 200)}`, false, "excepción");
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    results.push({
      journey: name,
      taps: t.taps,
      pasosFallidos: t.steps.filter((s) => !s.found).map((s) => s.label),
      steps: t.steps,
      ms: Date.now() - t0,
    });
  }

  await browser.close();
  return {
    viewport: `${vp.width}x${vp.height}`,
    journeys: results,
    erroresConsola: consoleErrors.slice(0, 30),
    erroresPagina: pageErrors.slice(0, 30),
    http: httpErrors.slice(0, 30),
    recursosFallidos: failedRequests.slice(0, 30),
    capturasFallidas: SHOT_FAILS.splice(0),
  };
}

const summary = {};
for (const vp of VIEWPORTS) {
  summary[vp.name] = await runViewport(vp);
  writeFileSync(join(OUT, `uat-${vp.name}.json`), JSON.stringify(summary[vp.name], null, 2));
}
writeFileSync(join(OUT, "uat-summary.json"), JSON.stringify(summary, null, 2));

let pngs = 0;
if (existsSync(OUT)) {
  for (const vp of readdirSync(OUT)) {
    const d = join(OUT, vp);
    // Solo las subcarpetas por viewport; en OUT también viven los JSON.
    if (existsSync(d) && statSync(d).isDirectory()) {
      for (const f of readdirSync(d)) if (f.endsWith(".png")) pngs++;
    }
  }
}
console.log(`UAT LISTO — artefactos en ${OUT} (${Object.keys(summary).join(", ")}) · ${pngs} capturas · ${SHOT_FAILS.length} capturas fallidas`);
for (const f of SHOT_FAILS) console.log(`  [shot-fail] ${f}`);
