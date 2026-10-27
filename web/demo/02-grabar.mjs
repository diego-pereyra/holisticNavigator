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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vp = espec.viewport;

function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function srtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.000`;
}

async function actuar(page, a) {
  try {
    switch (a.t) {
      case "wait":
        await sleep(a.v ?? 1500);
        return true;
      case "click-sel":
        await page.locator(a.sel).first().click({ timeout: 8000 });
        return true;
      case "click-texto":
        await page.getByText(a.v, { exact: false }).first().click({ timeout: 8000 });
        return true;
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
      case "pan":
        await page.mouse.move(vp.width * a.v[0], vp.height * a.v[1]);
        await page.mouse.down();
        await page.mouse.move(vp.width * (a.v[0] - 0.12), vp.height * a.v[1], { steps: 25 });
        await page.mouse.up();
        return true;
      case "wheel":
        await page.mouse.move(vp.width / 2, vp.height / 2);
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
async function bootCase(page, casoId, problemas) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
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
  const nombre = `demo-${caso.orden}-${caso.id}`;
  console.log(`grabando ${nombre} — ${caso.titulo}`);
  const ctx = await browser.newContext({
    viewport: vp,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2, // pantalla de celular nítida
    permissions: ["geolocation"],
    geolocation: { latitude: -34.9, longitude: -56.2, accuracy: 50 },
    recordVideo: { dir: OUT, size: vp },
  });
  const page = await ctx.newPage();
  const problemas = [];
  page.on("console", (m) => { if (m.type() === "error") problemas.push(m.text().slice(0, 140)); });
  page.on("pageerror", (e) => problemas.push("pageerror: " + String(e?.message ?? e).slice(0, 140)));

  try {
    await bootCase(page, caso.id, problemas);
    await page.screenshot({ path: join(OUT, "shots", `${caso.id}.png`) }).catch(() => undefined);
    let fallos = 0;
    for (const a of caso.acciones) {
      if (!(await actuar(page, a))) fallos++;
    }
    await sleep(caso.dur_ms ?? 6000);
    if (fallos > 0) casosFallidos++;
    narracion.push(`## ${caso.orden} · ${caso.titulo} (${mmss(caso.dur_ms ?? 6000)})\n\n${caso.narracion}\n\n_video: ${nombre}.mp4_\n`);
    writeFileSync(join(OUT, `${nombre}.srt`), subtitulos(caso.narracion, caso.dur_ms ?? 6000).join("\n") + "\n");
  } finally {
    await ctx.close(); // cierra el .webm de este caso
    // El video del caso es el .webm recién salido (Playwright lo llama page@<hash>).
    const pendientes = readdirSync(OUT).filter((f) => f.endsWith(".webm") && !f.startsWith("demo-"));
    if (pendientes.length) {
      const { renameSync } = await import("node:fs");
      renameSync(join(OUT, pendientes[0]), join(OUT, `${nombre}.webm`));
    }
  }
}

await browser.close();
writeFileSync(join(OUT, "demo-narracion.md"), narracion.join("\n") + (casosFallidos ? `\n> Aviso: ${casosFallidos} caso(s) con acciones no encontradas\n` : ""));
console.log(`DEMO LISTA — ${OutVideos()} · casos con acciones fallidas: ${casosFallidos}`);
function OutVideos() {
  return readdirSync(OUT).filter((f) => f.endsWith(".webm")).map((f) => join(OUT, f)).join(" · ");
}
