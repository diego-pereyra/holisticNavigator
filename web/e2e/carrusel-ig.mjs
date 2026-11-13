// E2E del carrusel de Instagram: abre la app, importa el GPX de AN98A y deja
// las cuatro placas de la historia en e2e-screenshots/ (390×844, 2×).
//
// Uso: node web/e2e/carrusel-ig.mjs [url] [salida]
// Requiere Playwright (solo en CI: `npm i --no-save playwright`). En WSL no hay
// browser real: lo corre .github/workflows/e2e-carrusel.yml contra un build
// servido con HTTP Range, igual que el smoke y el UAT.
//
// Placas:
//   01 mejor momento del libro (marzo/abril/diciembre, ciclones junio–noviembre)
//   02 consejo (Navassa, canal Viejo, evitar agosto–octubre)
//   03 ruta AN98A en el mapa + tabla de waypoints
//   04 ruta propia importada (MIA-…), optimización al viento y simulación
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const base = process.argv[2] ?? "http://localhost:8087/holisticNavigator/";
const out = resolve(root, process.argv[3] ?? "e2e-screenshots");
const gpx = join(
  root,
  "sponsors/IG/posteos/2026-11-11-costera/ruta-panama-miami.gpx",
);

if (!existsSync(gpx)) {
  console.error(`[carrusel] falta el GPX de AN98A: ${gpx}`);
  process.exit(2);
}

const VIEWPORT = { width: 390, height: 844 };
const DPR = 2;
const SHOT = {
  momento: "carrusel-01-momento.png",
  consejos: "carrusel-02-consejos.png",
  ruta: "carrusel-03-ruta.png",
  optimiza: "carrusel-04-optimiza.png",
};

mkdirSync(out, { recursive: true });

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
      .screenshot({ path: join(out, `carrusel-99-error-${name}.png`) })
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

  // --- arranque: AN98 del libro (la ficha trae mejor época, ciclones y consejo) ---
  await page.goto(new URL("?route=AN98&variant=AN98A", base).toString(), {
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
    .filter({ hasText: "AN98" })
    .waitFor({ timeout: 20_000 });
  await page.locator(".hn-facts").waitFor({ timeout: 20_000 });
  log("ficha AN98 cargada");

  // El arranque por URL abre la ficha antes de que llegue la geometría: al
  // tocar la variante se dibuja y se encuadra la ruta AN98A en el mapa.
  await fase("encuadrar AN98A", async () => {
    await abrirAcordeon("Variantes");
    const an98a = page.locator(".hn-variant").filter({ hasText: "AN98A" }).first();
    await an98a.waitFor({ state: "visible", timeout: 10_000 });
    await an98a.click();
    await page.waitForTimeout(900);
  });

  // Placa 1: mejor momento. El libro dice marzo/abril/diciembre; el mes de
  // planificación se pone en marzo para que el veredicto lo confirme.
  await fase("placa 1 · mejor momento", async () => {
    const marzo = page.locator('.hn-months .hn-month[title="marzo"]').first();
    await scrollFichaTo(marzo, "center");
    await marzo.click();
    await waitText("marzo está en la mejor época");
    await waitText("marzo a abril, diciembre");
    await waitText("junio a noviembre");
    await setSheet("full");
    await scrollFichaTo(page.locator(".hn-months").first());
    await page.waitForTimeout(400);
    await shot(SHOT.momento);
  });

  // Placa 2: el consejo del libro (viento, Navassa, canal Viejo, agosto-octubre).
  await fase("placa 2 · consejos", async () => {
    const consejo = await abrirAcordeon("Consejo");
    await waitText("Navassa");
    await waitText("canal Viejo");
    await scrollFichaTo(consejo);
    await page.waitForTimeout(400);
    await shot(SHOT.consejos);
  });

  // Placa 3: la ruta AN98A en el mapa, con la tabla de waypoints a la vista.
  await fase("placa 3 · ruta", async () => {
    await setSheet("half");
    await abrirAcordeon("Waypoints");
    const lista = page.locator(".hn-wps").first();
    await lista.waitFor({ state: "visible", timeout: 10_000 });
    const count = await page.locator(".hn-wps .hn-wp-item").count();
    if (count < 12) {
      throw new Error(`la tabla de waypoints tiene ${count} filas, esperaba al menos 12`);
    }
    await waitText("Cristobal");
    await waitText("Miami");
    // El tramo que importa de la historia: oeste de Cuba (Cuba E → Old S/N).
    const cuba = page
      .locator(".hn-wps .hn-wp-item")
      .filter({ hasText: "Cuba E" })
      .first();
    await scrollFichaTo(cuba, "center");
    await page.waitForTimeout(400);
    await shot(SHOT.ruta);  });

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
      () => document.querySelectorAll(".hn-own-wp").length >= 12,
      null,
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
    console.log(`CARRUSEL OK · 4 capturas en ${out}`);
  }
  for (const a of avisos) console.log(" [aviso] " + a);
  if (fallas.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
