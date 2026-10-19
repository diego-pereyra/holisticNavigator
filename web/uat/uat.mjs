// UAT de la app en browser real (corre en CI — ver .github/workflows/uat.yml).
//
// MIDE, NO VALIDA: recorre los journeys clave a dos viewports (celular
// vertical y tablet apaisada), cuenta toques, captura cada paso y registra
// hallazgos (afordanzas que no se encuentran, errores de consola, HTTP ≥ 400).
// Es la evidencia de la auditoría UX (Nielsen/ISO 9241) y su re-score.
//
// Uso:   node web/uat/uat.mjs http://localhost:8087/holisticNavigator/ web/uat/out
// Salida: <out>/<viewport>/*.png + <out>/uat-<viewport>.json
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8087/holisticNavigator/";
const OUT = process.argv[3] ?? "web/uat/out";
const VIEWPORTS = [
  { name: "phone-390", width: 390, height: 844 },
  { name: "tablet-1180", width: 1180, height: 820 },
];

// Fallas de captura del viewport en curso (diagnóstico audible: antes se
// tragaban en silencio y el artefacto salía sin fotos).
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

  const note = (label, found, extra = "") =>
    steps.push({ label, found, extra, taps });

  // Un toque real; si la affordance no existe, lo registra y sigue (hallazgo).
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

// ------------------------------------------------------------- journeys

async function jArranque(page, t) {
  await page.goto(BASE, { waitUntil: "load", timeout: 30_000 });
  const loaded = await page
    .waitForSelector("#hn-loading.done", { state: "attached", timeout: 15_000 })
    .then(() => true, () => false);
  t.note("arranca en < 15 s", loaded);
  await t.exists("barra de contexto", page.locator(".hn-context"));
  await t.exists("FAB ◉", page.locator("#hn-fab, .hn-fab"));
  await t.shot("arranque");
}

// J1 — "¿Qué viento hay acá?" (el dolor de Diego: hoy rehén de la ruta)
async function jClimaEnUnPunto(page, t) {
  // 1. Long-press en el mapa: ¿existe la interacción?
  await sleep(1200);
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.down();
  await sleep(800);
  await page.mouse.up();
  await sleep(800);
  const respuesta = await page
    .locator(".hn-modal, .hn-fixband, [class*='action']")
    .first()
    .isVisible({ timeout: 1500 })
    .catch(() => false);
  t.note("long-press en el mapa abre acciones", ok(respuesta));
  await t.shot("longpress");

  // 2. El camino real de hoy: Aquí → Sin conexión → Descargar pronóstico.
  await t.tapText("tab Aquí", "Aquí");
  const panel = page.getByText("Sin conexión", { exact: false });
  try {
    await panel.first().scrollIntoViewIfNeeded({ timeout: 4000 });
  } catch { /* abajo está el hallazgo del botón */ }
  await t.shot("sin-conexion");
  const descargado = await t.tap("descargar pronóstico", page.getByText(/^Descargar|Actualizar|Bajando/, { exact: false }));
  if (descargado) {
    await page
      .getByText(/hace \d|min %|error/i)
      .first()
      .waitFor({ state: "visible", timeout: 90_000 })
      .catch(() => undefined);
    await sleep(1500);
  }
  await t.shot("pronostico-descargado");

  // 3. Activar el modo Pronóstico desde la barra (ciclo ≈: off → pilot → forecast).
  const btnTiempo = page.locator(".hn-context button, .hn-context [role='button']").filter({ hasText: "≈" });
  await t.tap("botón Tiempo (1.er toque: pilot chart)", btnTiempo);
  await t.shot("pilot");
  await t.tap("botón Tiempo (2.do toque: pronóstico)", btnTiempo);
  await t.exists("deslizador de hora", page.locator("#hn-wx-bar, .hn-wx-bar"));
  await t.shot("pronostico-activo");

  // 4. Volver a Apagado para no interferir con los journeys siguientes.
  await t.tap("botón Tiempo (apagar)", btnTiempo);
}

// J2 — Elegir y seguir una ruta
async function jSeguirRuta(page, t) {
  await t.tap("tab Rutas", page.getByRole("button", { name: "Rutas" }).or(page.getByText("Rutas", { exact: true })));
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
    .locator(".hn-nav, .hn-strip, #hn-navstrip")
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  t.note("la tira de navegación aparece al seguir", ok(nav));
  await t.shot("navegando");
  await t.tap("Dejar de seguir", page.getByText("Dejar de seguir"));
  await t.shot("dejar-de-seguir");
}

// J3 — Optimizar con el viento
async function jOptimizar(page, t) {
  await t.tap("tab Rutas", page.getByRole("button", { name: "Rutas" }).or(page.getByText("Rutas", { exact: true })));
  const rows = page.locator(".hn-row");
  try { await rows.first().waitFor({ state: "visible", timeout: 10_000 }); } catch { /* ya registrado en J2 */ }
  await t.tap("abrir una ruta", rows);
  const panel = page.locator("#hn-optimize, .hn-optimize");
  try { await panel.first().scrollIntoViewIfNeeded({ timeout: 4000 }); } catch { /* hallazgo abajo */ }
  const btn = page.getByText(/Optimizar con el viento|Ruta del mes/, { exact: false });
  const corrio = await t.tap("Optimizar", btn);
  if (corrio) {
    const listo = await page
      .getByText(/vs |Aplicar|Descartar|Calculando/i)
      .first()
      .waitFor({ state: "visible", timeout: 150_000 })
      .catch(() => null);
    t.note("el cálculo termina (≤ 150 s)", listo !== null);
    await sleep(1000);
    await t.shot("optimizada");
    await t.tap("Descartar", page.getByText("Descartar"));
  }
  await t.shot("optimizar-final");
}

// J4 — MOB (seguridad: presión larga sobre el botón rojo)
async function jMob(page, t) {
  // Posición: con el geopermiso concedido por el contexto, "Usar GPS" da fixes.
  const gps = page.getByText("Usar GPS", { exact: false });
  await t.tap("Usar GPS", gps);
  await sleep(2500);
  const mob = page.locator("#hn-mob, .hn-mob");
  const hayBoton = await t.exists("botón MOB visible", mob);
  if (hayBoton) {
    try {
      await mob.first().click({ delay: 700, timeout: 4000 }); // hold de 600 ms+
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

// J5 — Pilot chart, selector de capas y mes de planificación
async function jPilotChart(page, t) {
  const btnTiempo = page.locator(".hn-context button, .hn-context [role='button']").filter({ hasText: "≈" });
  await t.tap("Tiempo → pilot chart", btnTiempo);
  await sleep(800);
  await t.exists("panel Capas", page.locator("#hn-wx-stack, .hn-wx-stack"));
  await t.tap("apagar capa Olas", page.locator(".hn-wx-layers label").filter({ hasText: "Olas" }));
  await t.shot("capas");
  await t.tap("botón Tiempo (apagar)", btnTiempo);
  // Mes de planificación
  await t.tap("tab Rutas", page.getByRole("button", { name: "Rutas" }).or(page.getByText("Rutas", { exact: true })));
  const chip = page.getByText(/Salgo en /, { exact: false });
  const hayChip = await t.tap("chip Salgo en {mes}", chip);
  if (hayChip) {
    await sleep(400);
    await t.shot("selector-de-mes");
    await t.tap("elegir marzo", page.locator("#hn-month-menu button, #hn-month-menu [role='button']").filter({ hasText: /mar|Mar/ }));
    await t.shot("mes-elegido");
  }
}

// J6 — Temas (ciclo Día → Noche → Rojo → Auto)
async function jTemas(page, t) {
  const btnTema = page
    .locator(".hn-context button, .hn-context [role='button']")
    .filter({ hasText: /☀|☾|●|◐/ });
  const hay = await t.exists("botón de tema", btnTema);
  if (hay) {
    for (const nombre of ["dia", "noche", "rojo", "auto"]) {
      await t.tap(`tema ${nombre}`, btnTema);
      await sleep(600);
      await t.shot(`tema-${nombre}`);
    }
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
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.url()}`); });

  const journeys = [
    ["arranque", jArranque],
    ["j1-clima-en-un-punto", jClimaEnUnPunto],
    ["j2-seguir-ruta", jSeguirRuta],
    ["j3-optimizar", jOptimizar],
    ["j4-mob", jMob],
    ["j5-pilot-chart-mes", jPilotChart],
    ["j6-temas", jTemas],
  ];

  const results = [];
  for (const [name, fn] of journeys) {
    const t = tester(page, dir, name);
    const t0 = Date.now();
    try {
      await fn(page, t);
    } catch (e) {
      t.note(`journey abortado: ${e.message}`.slice(0, 200), false, "excepción");
    }
    // Reset entre journeys: cerrar ficha, volver a Aquí.
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
    if (existsSync(d)) {
      for (const f of readdirSync(d)) if (f.endsWith(".png")) pngs++;
    }
  }
}
console.log(`UAT LISTO — artefactos en ${OUT} (${Object.keys(summary).join(", ")}) · ${pngs} capturas · ${SHOT_FAILS.length} capturas fallidas`);
for (const f of SHOT_FAILS) console.log(`  [shot-fail] ${f}`);
