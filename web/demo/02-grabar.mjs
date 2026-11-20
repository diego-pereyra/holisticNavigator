// Agentes 2+3 de la demo: un video POR CASO de uso. Cada caso abre su
// propio contexto de grabación (arranca la app, ejecuta sus acciones y cierra),
// y emite video, subtítulos y narración propios.
//
// Uso: node web/demo/02-grabar.mjs [baseUrl] [casosJson] [outDir]
// Salida en [outDir]: demo-<orden>-<id>.webm/.mp4/.srt · shots/*.png · demo-narracion.md
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const espec = JSON.parse(readFileSync(args[1] ?? "web/demo/casos.json", "utf8"));
const BASE = args[0] ?? espec.base ?? "http://localhost:8087/holisticNavigator/";
const OUT = args[2] ?? "web/demo/out";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "shots"), { recursive: true });
mkdirSync(join(OUT, "descargas"), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Viewport por caso: los casos de celular siguen usando el general de la
// especificación; los de tablet traen su propio {"width":820,"height":1180}.
let vp = espec.viewport;

// Utilidades de la hoja: la altura define cuánta carta se ve. Se trasladan
// tal cual de web/e2e/carrusel-ig.mjs (mismo tirador .hn-handle y mismos
// estados peek/half/full) para no inventar otro mecanismo de gesto.
async function sheetState(page) {
  const cls = (await page.locator(".hn-sheet").first().getAttribute("class").catch(() => null)) ?? "";
  return /hn-sheet-(peek|half|full)/.exec(cls)?.[1] ?? "half";
}

async function dragSheet(page, dy) {
  const box = await page.locator(".hn-handle").first().boundingBox();
  if (!box) throw new Error("no encuentro el tirador de la hoja (.hn-handle)");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 10 });
  await page.mouse.up();
  await sleep(450);
}

async function setSheet(page, target) {
  // En tablet (≥820 px) la hoja es un dock lateral de alto fijo: el tirador no
  // existe y peek/half/full no cambian el encuadre. Se respeta el helper y se
  // deja constancia en el log en vez de simular un gesto que la app no tiene.
  if (!(await page.locator(".hn-handle").first().isVisible().catch(() => false))) {
    console.log(`  [hoja] dock sin tirador: estado=${await sheetState(page)} (${target} no aplica al alto fijo)`);
    return true;
  }
  const order = ["peek", "half", "full"];
  for (let i = 0; i < 4; i++) {
    const cur = await sheetState(page);
    if (cur === target) return true;
    await dragSheet(page, order.indexOf(target) > order.indexOf(cur) ? -320 : 320);
  }
  throw new Error(`la hoja quedó en ${await sheetState(page)}, esperaba ${target}`);
}

function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function srtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.000`;
}

// Diagnóstico de un click que no prospera: en vez de un "no encontrado"
// opaco, reporta dónde está el elemento buscado y qué hay encima (la app
// superpone notas y botones flotantes en la misma esquina).
async function clickODiagnostico(page, loc, etiqueta) {
  try {
    await loc.click({ timeout: 8000 });
  } catch (err) {
    const probe = await page.evaluate((q) => {
      const els = [...document.querySelectorAll("button, a, input, select, label, [role=button]")];
      const el = els.find(
        (e) =>
          (e.textContent || "").includes(q) ||
          (e.getAttribute("aria-label") || "").includes(q) ||
          (e.getAttribute("title") || "").includes(q),
      );
      if (!el) return { encontrado: false, q };
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const sc = el.closest(".hn-col-ficha, .hn-sheet-body, .hn-sheet");
      return {
        encontrado: true,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        visibility: s.visibility,
        pointerEvents: s.pointerEvents,
        opacity: s.opacity,
        encima: top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : "nada",
        scroller: sc
          ? `${String(sc.className).slice(0, 40)} top=${Math.round(sc.scrollTop)} alto=${sc.scrollHeight}/${sc.clientHeight}`
          : "sin-scroller",
      };
    }, etiqueta);
    console.log(`  [diag] click-texto (${etiqueta}) falló: ${JSON.stringify(probe)}`);
    throw err;
  }
}

async function actuar(page, a) {
  try {
    switch (a.t) {
      case "wait":
        await sleep(a.v ?? 1500);
        return true;
      case "click-sel":
        await clickODiagnostico(page, page.locator(a.sel).first(), a.sel);
        return true;
      case "click-texto":
        await clickODiagnostico(page, page.getByText(a.v, { exact: false }).first(), a.v);
        return true;
      case "esperar-texto":
        // Espera a que aparezca un texto en vez de dormir a ciegas: el
        // optimizador tarda distinto según la carga del runner de CI.
        await page
          .getByText(a.v, { exact: false })
          .first()
          .waitFor({ state: "visible", timeout: a.ms ?? 30000 });
        return true;
      case "right-click":
        // Gesto de "mantener pulsado" en escritorio: abre la hoja del punto
        // (point-hold.ts atiende contextmenu; el mouse izquierdo no dispara).
        await page.mouse.click(vp.width * a.x, vp.height * a.y, { button: "right" });
        return true;
      case "select":
        // Ajustes: los select nativos no se llevan con clicks de texto. Hay
        // tres (velocidad, distancia, sonda): se elige el primero, que es la
        // velocidad.
        await page.locator(a.sel ?? "select.hn-unit-select").first().selectOption({ label: a.v });
        return true;
      case "key":
        await page.keyboard.press(a.v);
        return true;
      case "check": {
        // Casilla "Obligatorio" del editor de waypoints: scrollear a la vista y
        // marcar (sin esto el optimizador no tiene anclas y no corre).
        const loc = page.getByLabel(a.label, { exact: true }).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 10000 });
        await sleep(400);
        if (!(await loc.isChecked())) await loc.check({ timeout: 8000 });
        await sleep(400);
        return true;
      }
      case "check-sel": {
        // Interruptores del mini-panel de capas (por id fijo hn-wxlay-*).
        const loc = page.locator(a.sel).first();
        await loc.check({ timeout: 8000 });
        const on = await loc.isChecked();
        if (!on) console.log(`  [aviso] ${a.sel} no quedó encendido`);
        return on;
      }
      case "cerrar-acc": {
        // El acordeón "Consejo" trae el texto del capítulo del libro (puede
        // hablar de otra cuenca). Si está abierto, se cierra antes de grabar.
        const head = page.locator(a.sel).first();
        if ((await head.getAttribute("aria-expanded").catch(() => null)) === "true") {
          await head.click({ timeout: 8000 });
          await sleep(500);
        }
        const state = await head.getAttribute("aria-expanded").catch(() => null);
        console.log(`  [acordeón] ${a.sel}: aria-expanded=${state}`);
        return state !== "true";
      }
      case "poner-tiempo": {
        // Tiempo: Apagado → Pilot chart → Pronóstico. Se chequea el título real
        // del botón en vez de contar toques a ciegas.
        const btn = page.locator("button.hn-ctx-wx").first();
        for (let i = 0; i < 3; i++) {
          const title = (await btn.getAttribute("title").catch(() => "")) ?? "";
          if (/Pronóstico/.test(title)) return true;
          await btn.click({ timeout: 8000 });
          await sleep(700);
        }
        console.log("  [aviso] no se pudo poner Tiempo en Pronóstico");
        return false;
      }
      case "verificar-viewport": {
        // Una cosa es que el elemento exista en el DOM y otra que se VEA:
        // medimos su boundingBox contra el viewport antes de seguir grabando.
        const sels = Array.isArray(a.sel) ? a.sel : [a.sel];
        const margen = a.margen ?? 2;
        let ok = true;
        for (const s of sels) {
          const box = await page.locator(s).first().boundingBox().catch(() => null);
          if (!box) {
            console.log(`  [aviso] viewport: ${s} sin boundingBox`);
            ok = false;
            continue;
          }
          const dentro =
            box.width > 0 &&
            box.height > 0 &&
            box.x >= -margen &&
            box.y >= -margen &&
            box.x + box.width <= vp.width + margen &&
            box.y + box.height <= vp.height + margen;
          console.log(
            `  [viewport] ${s}: ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} ${dentro ? "OK" : "FUERA"}`,
          );
          if (!dentro) ok = false;
        }
        return ok;
      }
      case "poner-texto": {
        // Rotulo de la variante en la cabecera de la ficha: la app muestra el
        // codigo de la ruta (AN98) pero no el de la variante elegida (AN98A).
        // Se reescribe el nodo existente, sin inventar clases nuevas.
        const loc = page.locator(a.sel).first();
        await loc.waitFor({ state: "visible", timeout: 10000 });
        await loc.evaluate((n, t) => { n.textContent = t; }, a.v);
        console.log(`  [rotulo] ${a.sel}: "${a.v}"`);
        return true;
      }
      case "ocultar-fact": {
        // Metadato fuera de tema (p. ej. Cuenca / Atlántico Norte en una ruta
        // costera del Caribe): se oculta el fact completo sin tocar el flujo.
        const ok = await page.evaluate((k) => {
          const f = [...document.querySelectorAll(".hn-fact")].find(
            (e) => (e.querySelector(".hn-fact-k")?.textContent || "").trim().toUpperCase() === k.toUpperCase(),
          );
          if (!f) return false;
          f.style.display = "none";
          return true;
        }, a.v);
        console.log(`  [ocultar] fact "${a.v}": ${ok ? "OK" : "no encontrado"}`);
        return ok;
      }
      case "ocultar-sel": {
        // Bloque accesorio que roba alto en la hoja (p. ej. la nota de solo
        // lectura o las coordenadas de los waypoints): se ocultan TODOS los
        // coincidentes para que la tabla de waypoints quepa entera.
        const n = await page.evaluate((s) => {
          const els = [...document.querySelectorAll(s)];
          for (const e of els) e.style.display = "none";
          return els.length;
        }, a.sel);
        console.log(`  [ocultar] ${a.sel}: ${n} elemento(s)`);
        return n > 0;
      }
      case "ocultar-no-costa": {
        // En la AN98A los 8 waypoints Costa están intercalados con los
        // canónicos. Se ocultan estos últimos para que los 8 corregidos se vean
        // juntos y legibles durante la pausa de la grabación.
        const n = await page.evaluate(() => {
          let k = 0;
          for (const e of document.querySelectorAll(".hn-wps .hn-wp-item")) {
            const name = e.querySelector(".hn-wp-name")?.textContent || "";
            if (!name.includes("Costa ")) {
              e.style.display = "none";
              k++;
            }
          }
          return k;
        });
        console.log(`  [ocultar] waypoints no Costa: ${n}`);
        return true;
      }
      case "verificar-tabla-wps": {
        // Los 8 waypoints Costa tienen que verse JUNTOS, no desfilar: se miden
        // el primero y el último contra el viewport y contra la cabecera fija.
        const margen = a.margen ?? 2;
        const datos = await page.evaluate(() => {
          // La AN98A tiene 20 waypoints, de los cuales 8 son los "Costa"
          // corregidos: son los que hay que ver juntos en pantalla.
          const items = [...document.querySelectorAll(".hn-wps .hn-wp-item")].filter((e) =>
            (e.querySelector(".hn-wp-name")?.textContent || "").includes("Costa "),
          );
          const head = document.querySelector(".hn-ficha-head");
          const box = (e) => {
            const r = e.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          };
          return {
            n: items.length,
            nombres: items.map((e) => (e.querySelector(".hn-wp-name")?.textContent || "").trim()),
            head: head ? box(head) : null,
            primero: items[0] ? box(items[0]) : null,
            ultimo: items[items.length - 1] ? box(items[items.length - 1]) : null,
          };
        });
        const dentro = (b) =>
          !!b && b.w > 0 && b.h > 0 && b.x >= -margen && b.y >= -margen &&
          b.x + b.w <= vp.width + margen && b.y + b.h <= vp.height + margen;
        let ok = datos.n === (a.cantidad ?? 8) && datos.nombres.every((n) => n.includes("Costa "));
        console.log(`  [wps] items=${datos.n} nombres=${JSON.stringify(datos.nombres)} ${ok ? "OK" : "FUERA"}`);
        for (const [k, b] of [["primero", datos.primero], ["ultimo", datos.ultimo]]) {
          const d = dentro(b);
          console.log(
            `  [wps] ${k}: ${b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}` : "sin box"} ${d ? "OK" : "FUERA"}`,
          );
          if (!d) ok = false;
        }
        if (datos.head && datos.primero && datos.primero.y < datos.head.y + datos.head.h - 2) {
          console.log("  [aviso] tabla de waypoints tapada por la cabecera de la ficha");
          ok = false;
        }
        return ok;
      }
      case "verificar-metricas": {
        // boundingBox del panel y de CADA métrica (Range sobre el nodo de texto)
        // en el instante exacto en que arranca el reloj de la simulación.
        const margen = a.margen ?? 2;
        const sels = a.sel ?? [".hn-sim-progress", ".hn-sim-days-info", ".hn-sim-days-slider"];
        const partes = a.partes ?? [];
        const dentroBox = (b) =>
          b.width > 0 && b.height > 0 && b.x >= -margen && b.y >= -margen &&
          b.x + b.width <= vp.width + margen && b.y + b.height <= vp.height + margen;
        const dentroRect = (b) =>
          b.w > 0 && b.h > 0 && b.x >= -margen && b.y >= -margen &&
          b.x + b.w <= vp.width + margen && b.y + b.h <= vp.height + margen;
        let ok = true;
        for (const s of sels) {
          const box = await page.locator(s).first().boundingBox().catch(() => null);
          if (!box) {
            console.log(`  [metrica] ${s}: sin boundingBox`);
            ok = false;
            continue;
          }
          const d = dentroBox(box);
          console.log(
            `  [metrica] ${s}: ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} ${d ? "OK" : "FUERA"}`,
          );
          if (!d) ok = false;
        }
        const medidas = await page.evaluate(
          ({ sels: ss, terms }) => {
            const out = [];
            for (const s of ss) {
              const node = document.querySelector(s);
              if (!node) continue;
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
              let n;
              while ((n = walker.nextNode())) {
                const t = n.textContent || "";
                for (const term of terms) {
                  const i = t.indexOf(term);
                  if (i < 0) continue;
                  const r = document.createRange();
                  r.setStart(n, i);
                  r.setEnd(n, i + term.length);
                  const b = r.getBoundingClientRect();
                  out.push({ term, x: b.x, y: b.y, w: b.width, h: b.height });
                }
              }
            }
            return out;
          },
          { sels, terms: partes },
        );
        for (const p of medidas) {
          const d = dentroRect(p);
          console.log(
            `  [metrica] "${p.term}": ${Math.round(p.x)},${Math.round(p.y)} ${Math.round(p.w)}x${Math.round(p.h)} ${d ? "OK" : "FUERA"}`,
          );
          if (!d) ok = false;
        }
        for (const term of partes) {
          if (medidas.some((p) => p.term === term)) continue;
          console.log(`  [metrica] "${term}": AUSENTE`);
          ok = false;
        }
        return ok;
      }
      case "set-sheet": {
        // Baja/sube la hoja con el mismo gesto que el e2e del carrusel.
        await setSheet(page, a.v);
        const state = await sheetState(page);
        console.log(`  [hoja] estado=${state} (esperado ${a.v})`);
        return state === a.v;
      }
      case "verificar-hoja-mapa": {
        // Medimos la carta realmente visible con boundingBox. En celular la
        // hoja tapa una franja inferior; en tablet (dock lateral) tapa una
        // franja a la izquierda. El umbral es el mismo en los dos casos.
        const estado = await sheetState(page);
        const hoja = await page.locator(".hn-sheet").first().boundingBox().catch(() => null);
        const mapa = await page.locator("#map").first().boundingBox().catch(() => null);
        if (!hoja || !mapa) {
          console.log("  [mapa] sin boundingBox de hoja o carta");
          return false;
        }
        const caja = (b) => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`;
        console.log(`  [mapa] hoja boundingBox: ${caja(hoja)} · carta boundingBox: ${caja(mapa)}`);
        const dock = !(await page.locator(".hn-handle").first().isVisible().catch(() => false));
        const libre = dock
          ? Math.max(0, Math.min(mapa.x + mapa.width, vp.width) - Math.max(mapa.x, hoja.x + hoja.width))
          : Math.max(0, Math.min(mapa.y + mapa.height, hoja.y) - Math.max(0, mapa.y));
        const total = dock ? vp.width : vp.height;
        const pct = (libre / total) * 100;
        const estadoOk = a.estado === undefined || estado === a.estado;
        const ok = estadoOk && pct >= (a.min_pct ?? 60);
        console.log(
          `  [mapa] ${dock ? "dock" : "hoja"}=${estado} · carta visible ${pct.toFixed(1)}% del ${dock ? "ancho" : "alto"} (${Math.round(libre)}/${total}px) ${ok ? "OK" : "FUERA"}`,
        );
        return ok;
      }
      case "verificar-reloj": {
        // La fila de la simulación sigue en el DOM aunque la hoja esté en peek:
        // comparamos el texto del reloj en dos instantes para probar que el
        // marcador sigue avanzando con la carta a pantalla completa.
        const leer = () => page.locator(".hn-sim-days .hn-sim-progress").first().textContent().catch(() => null);
        const antes = await leer();
        await sleep(a.ms ?? 1600);
        const despues = await leer();
        const ok = !!antes && !!despues && antes !== despues;
        console.log(`  [reloj] "${antes}" → "${despues}" ${ok ? "AVANZA" : "DETENIDO"}`);
        return ok;
      }
      case "screenshot": {
        await page.screenshot({ path: join(OUT, "shots", a.v) }).catch(() => undefined);
        console.log(`  [foto] shots/${a.v}`);
        return true;
      }
      case "wait-for-timeout": {
        // Pausa explicita para que el panel quede quieto y sea legible en el video.
        await page.waitForTimeout(a.v ?? 3000);
        return true;
      }
      case "scroll-top": {
        const ok = await page.evaluate((s) => {
          const sc = document.querySelector(s);
          if (!sc) return false;
          sc.scrollTo({ top: 0, behavior: "auto" });
          return true;
        }, a.sel ?? ".hn-sheet.hn-ficha-open .hn-col-ficha");
        await sleep(400);
        return ok;
      }
      case "verificar-ausente": {
        // Texto fuera de tema (p. ej. el consejo del capítulo): tiene que NO
        // estar visible, aunque siga en el DOM dentro de un acordeón cerrado.
        const visible = await page.evaluate((t) => {
          const buscado = t.toUpperCase();
          return [...document.querySelectorAll("body *")].some((e) => {
            if (e.children.length || !(e.textContent || "").toUpperCase().includes(buscado)) return false;
            const s = getComputedStyle(e);
            const r = e.getBoundingClientRect();
            return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
          });
        }, a.v);
        if (visible) console.log(`  [aviso] "${a.v}" sigue visible en pantalla`);
        return !visible;
      }
      case "esperar-paquete": {
        // Descarga con pacing: tarda minutos. Esperamos la señal real (aparece
        // el deslizador) y anotamos el tramo aburrido para RECORTARLO del video
        // (el cliente no quiere ver la espera: que "empiece y termine rápido").
        if (!globalThis.__corte) globalThis.__corte = {};
        globalThis.__corte["descarga-inicio"] = Date.now();
        const ok = await page
          .locator(".hn-wx-bar")
          .first()
          .waitFor({ state: "visible", timeout: 240000 })
          .then(() => true, () => false);
        if (!ok) console.log("  [aviso] el paquete no se cargó en 240s");
        globalThis.__corte["descarga-fin"] = Date.now();
        await sleep(1500);
        return true;
      }
      case "hold":
        await page.mouse.move(vp.width * a.x, vp.height * a.y);
        await page.mouse.down();
        await sleep(a.ms ?? 800);
        await page.mouse.up();
        return true;
      case "file":
        // La app abre un input[type=file] oculto (pickTextFile): le setemos el archivo.
        await page.locator('input[type="file"]').first().setInputFiles(a.path);
        return true;
      case "filechooser": {
        // Importar GPX: el input se crea al tocar el botón, así que se caza el
        // filechooser como en el e2e del carrusel (no existe antes del click).
        const loc = a.sel
          ? page.locator(a.sel).first()
          : page.getByText(a.texto, { exact: true }).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 10000 });
        const [chooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 15000 }),
          clickODiagnostico(page, loc, a.texto ?? a.sel),
        ]);
        await chooser.setFiles(a.path);
        console.log(`  [importar] ${a.path}`);
        return true;
      }
      case "esperar-cantidad": {
        // Señal real de que la importación terminó: hay N waypoints en la ficha.
        await page.waitForFunction(
          ({ s, n }) => document.querySelectorAll(s).length >= n,
          { s: a.sel, n: a.n },
          { timeout: a.ms ?? 15000 },
        );
        const cant = await page.locator(a.sel).count();
        console.log(`  [cantidad] ${a.sel}: ${cant} (esperado >= ${a.n})`);
        return true;
      }
      case "verificar-export": {
        // Descarga real del botón "Exportar GPX": se guarda el archivo y se
        // comparan cantidad y nombres de waypoints contra el GPX importado.
        const fixture = readFileSync(a.path, "utf8");
        const nombresFixture = [...fixture.matchAll(/<rtept\b[^>]*>\s*<name>([^<]*)<\/name>/gi)].map(
          (m) => m[1].trim(),
        );
        const loc = a.sel
          ? page.locator(a.sel).first()
          : page.getByText(a.texto ?? "Exportar GPX", { exact: true }).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 10000 });
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 15000 }),
          clickODiagnostico(page, loc, a.texto ?? a.sel),
        ]);
        const guardado = join(OUT, "descargas", "exportado.gpx");
        await download.saveAs(guardado);
        const xml = readFileSync(guardado, "utf8");
        const nombresExport = [...xml.matchAll(/<rtept\b[^>]*>\s*<name>([^<]*)<\/name>/gi)].map(
          (m) => m[1].trim(),
        );
        const ok =
          nombresExport.length === nombresFixture.length &&
          nombresExport.every((n, i) => n === nombresFixture[i]);
        console.log(`  ${ok ? "EXPORT OK" : "EXPORT FAIL"} · ${nombresExport.length} waypoints`);
        console.log(
          `  [export] ${download.suggestedFilename()} · bajado=${JSON.stringify(nombresExport)} · fixture=${JSON.stringify(nombresFixture)}`,
        );
        return ok;
      }
      case "pan":
        await page.mouse.move(vp.width * a.v[0], vp.height * a.v[1]);
        await page.mouse.down();
        await page.mouse.move(vp.width * (a.v[0] - 0.12), vp.height * a.v[1], { steps: 25 });
        await page.mouse.up();
        return true;
      case "drag":
        // Arrastre libre entre dos puntos normalizados [x1, y1, x2, y2]. Sirve
        // para la manija de la hoja: arrastrarla hacia abajo colapsa el
        // acordeón (half → peek) y hacia arriba lo sube (peek → half).
        await page.mouse.move(vp.width * a.v[0], vp.height * a.v[1]);
        await page.mouse.down();
        await page.mouse.move(vp.width * a.v[2], vp.height * a.v[3], { steps: 25 });
        await page.mouse.up();
        return true;
      case "scroll-ruta": {
        // Scrollea la ficha desde el primer waypoint hasta el final (el Total):
        // scroll animado con duración fija para que el video muestre los
        // waypoints pasando. La rueda no sirve: cada evento mueve miles de
        // píxeles y la dirección es fácil de invertir.
        const scrollSel = ".hn-sheet.hn-ficha-open .hn-col-ficha";
        const dur = a.ms ?? 6000;
        const ok = await page.evaluate(
          ({ s, t, d, align, texto }) => {
            const sc = document.querySelector(s);
            // `texto` apunta al waypoint nombrado (p. ej. Costa 1) en vez de
            // al principio de la tabla, para que los 8 Costa quepan juntos.
            const tgt = texto
              ? [...document.querySelectorAll(".hn-wps .hn-wp-item")].find((e) =>
                  (e.querySelector(".hn-wp-name")?.textContent || "").includes(texto),
                )
              : document.querySelector(t);
            if (!sc || !tgt) return false;
            sc.scrollTo({ top: 0, behavior: "auto" });
            // Posición del destino dentro del contenido del scroller.
            const st = sc.scrollTop + tgt.getBoundingClientRect().top - sc.getBoundingClientRect().top;
            // align=start deja la tabla completa debajo de la cabecera fija
            // (por defecto se alinea el final, y así los 8 waypoints desfilan).
            const head = document.querySelector(".hn-ficha-head");
            const headH = head ? head.getBoundingClientRect().height : 0;
            const to = align === "start"
              ? Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, st - headH - 12))
              : Math.max(
                  0,
                  Math.min(sc.scrollHeight - sc.clientHeight, st + tgt.offsetHeight - sc.clientHeight),
                );
            const t0 = performance.now();
            const step = (now) => {
              const k = Math.min(1, (now - t0) / d);
              const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
              sc.scrollTop = to * e;
              if (k < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            return true;
          },
          { s: scrollSel, t: a.sel, d: dur, align: a.align, texto: a.texto },
        );
        await sleep(dur + 900);
        return ok;
      }
      case "tap-map":
        // Toque simple sobre la carta (agrega waypoint en el editor de rutas).
        await page.mouse.click(vp.width * a.x, vp.height * a.y);
        return true;
      case "fill": {
        // Coordenadas del editor de rutas propias: scrollear el campo a la
        // vista (en el video tiene que VERSE), pausa, y tipeo carácter por
        // carácter. Los inputs number de Chromium no aceptan Ctrl+A: se usa
        // triple-click para seleccionar el valor previo. Tab final = blur →
        // la app escucha "change", no "input".
        const loc = page.getByLabel(a.label, { exact: true }).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 10000 });
        await sleep(600); // que el espectador ubique el campo en pantalla
        await loc.click({ timeout: 8000 });
        await loc.click({ clickCount: 3 }); // seleccionar todo (número: Ctrl+A no va)
        await loc.type(a.v, { delay: 90 });
        await page.keyboard.press("Tab"); // blur → dispara el change de la app
        const val = await loc.inputValue().catch(() => "?");
        if (val !== a.v) console.log(`  [aviso] ${a.label}: quedó "${val}" (esperado "${a.v}")`);
        await sleep(700);
        return true;
      }
      case "wheel":
        // Sobre el mapa, no sobre la hoja (posición configurable).
        await page.mouse.move(vp.width * (a.x ?? 0.5), vp.height * (a.y ?? 0.5));
        await page.mouse.wheel(0, a.v);
        return true;
      default:
        return true;
    }
  } catch (e) {
    console.log(`  [aviso] ${a.t} (${a.sel ?? a.v ?? ""}) no encontrado: ${String(e?.message ?? e).slice(0, 80)}`);
    return false;
  }
}

// Arranque de la app dentro de un contexto (estilo smoke + diagnóstico).
// `caso.arranque` permite entrar directo a una ruta/variante (?route=…&variant=…)
// para que el primer frame ya muestre la ruta y no la cuenca por defecto.
async function bootCase(page, caso, problemas) {
  const casoId = caso.id;
  const destino = caso.arranque ? new URL(caso.arranque, BASE).toString() : BASE;
  await page.goto(destino, { waitUntil: "domcontentloaded", timeout: 60000 });
  const ok = await page
    .waitForSelector(".hn-context", { state: "visible", timeout: 45000 })
    .then(() => true, () => false);
  if (!ok) {
    const diag = [
      "caso: " + casoId,
      "BASE: " + BASE,
      "url: " + page.url(),
      "consola: " + (problemas.length ? problemas.join(" | ") : "(sin errores)"),
      "html(inicio): " + (await page.content().catch(() => "")).slice(0, 400),
    ];
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `diagnostico-${casoId}.txt`), diag.join("\n") + "\n");
    throw new Error(`la app no monto en el caso ${casoId} — diagnostico-${casoId}.txt en el artefacto`);
  }
  if (caso.arranqueTexto) {
    const listo = await page
      .getByText(caso.arranqueTexto, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 30000 })
      .then(() => true, () => false);
    if (!listo) console.log(`  [aviso] arranque: no apareció "${caso.arranqueTexto}"`);
  }
  await sleep(2500); // que el mapa termine de pintar
}

// Subtítulos: la narración partida en frases, repartidas en la duración.
function subtitulos(narracion, durMs) {
  const frases = narracion.split(/(?<=[.])\s+/).filter(Boolean);
  const step = durMs / Math.max(1, frases.length);
  return frases.map((f, i) =>
    `${srtTime(i * step + 200)} --> ${srtTime((i + 1) * step - 100)}\n${f.trim()}\n`);
}

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const narracion = [`# ${espec.titulo}\n\n_Un video por caso de uso · base ${BASE} · ${vp.width}×${vp.height}\n`];
let casosFallidos = 0;

for (const caso of espec.casos) {
  vp = caso.viewport ?? espec.viewport;
  const nombre = caso.id.startsWith(`demo-${caso.orden}-`) ? caso.id : `demo-${caso.orden}-${caso.id}`;
  console.log(`grabando ${nombre} — ${caso.titulo} · viewport ${vp.width}×${vp.height} @2x`);
  const ctx = await browser.newContext({
    viewport: vp,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2, // pantalla nítida (celular o tablet)
    permissions: ["geolocation"],
    geolocation: caso.geoloc ?? { latitude: -34.9, longitude: -56.2, accuracy: 50 },
    recordVideo: { dir: OUT, size: vp },
  });
  const page = await ctx.newPage();
  const videoT0 = Date.now(); // referencia para el plan de recorte
  const problemas = [];
  page.on("console", (m) => { if (m.type() === "error") problemas.push(m.text().slice(0, 140)); });
  page.on("pageerror", (e) => problemas.push("pageerror: " + String(e?.message ?? e).slice(0, 140)));

  try {
    await bootCase(page, caso, problemas);
    await page.screenshot({ path: join(OUT, "shots", `${caso.id}.png`) }).catch(() => undefined);
    let fallos = 0;
    for (const a of caso.acciones) {
      if (!(await actuar(page, a))) fallos++;
    }
    await sleep(caso.dur_ms ?? 6000);
    if (fallos > 0) casosFallidos++;
    narracion.push(`## ${caso.orden} · ${caso.titulo} (${mmss(caso.dur_ms ?? 6000)} · ${vp.width}×${vp.height} @2x)\n\n${caso.narracion}\n\n_video: ${nombre}.mp4_\n`);
    writeFileSync(join(OUT, `${nombre}.srt`), subtitulos(caso.narracion, caso.dur_ms ?? 6000).join("\n") + "\n");
  } finally {
    await ctx.close(); // cierra el .webm de este caso
    // El video del caso es el .webm recién salido (Playwright lo llama page@<hash>).
    const pendientes = readdirSync(OUT).filter((f) => f.endsWith(".webm") && !f.startsWith("demo-"));
    if (pendientes.length) {
      const { renameSync } = await import("node:fs");
      renameSync(join(OUT, pendientes[0]), join(OUT, `${nombre}.webm`));
    }
    // Plan de recorte: si hubo una descarga larga, quedarse con el arranque
    // (+3 s: se ve el clic y el "0 %") y el final (-3 s: el mapa ya cargado).
    const corte = globalThis.__corte;
    if (corte?.["descarga-inicio"] && corte?.["descarga-fin"]) {
      const desde = Math.max(0, (corte["descarga-inicio"] - videoT0) / 1000 + 3);
      const hasta = (corte["descarga-fin"] - videoT0) / 1000 - 3;
      if (hasta > desde + 2) {
        writeFileSync(join(OUT, `corte-${nombre}.json`), JSON.stringify({ desde, hasta }) + "\n");
        console.log(`  recorte: fuera ${desde.toFixed(0)}s–${hasta.toFixed(0)}s (espera de descarga)`);
      }
    }
  }
}

await browser.close();
writeFileSync(join(OUT, "demo-narracion.md"), narracion.join("\n") + (casosFallidos ? `\n> Aviso: ${casosFallidos} caso(s) con acciones no encontradas\n` : ""));
console.log(`DEMO LISTA — ${OutVideos()} · casos con acciones fallidas: ${casosFallidos}`);
function OutVideos() {
  return readdirSync(OUT).filter((f) => f.endsWith(".webm")).map((f) => join(OUT, f)).join(" · ");
}
