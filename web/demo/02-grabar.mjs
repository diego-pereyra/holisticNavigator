// Agentes 2+3 de la demo: recorre los casos de casos.json con Playwright
// grabando video, y emite la narración con marcas de tiempo reales.
//
// Uso: node web/demo/02-grabar.mjs [baseUrl] [casosJson] [outDir]
// Salida en [outDir]: demo.webm · demo-narracion.md · demo.srt · shots/*.png
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";

const args = process.argv.slice(2);
const espec = JSON.parse(readFileSync(args[1] ?? "web/demo/casos.json", "utf8"));
const BASE = args[0] ?? "http://localhost:8087/holisticNavigator/";
const OUT = args[2] ?? "web/demo/out";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "shots"), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mmss(ms) {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function srtTime(ms) {
  const s = Math.round(ms / 1000);
  return `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.000`;
}

async function actuar(page, a, vp) {
  try {
    switch (a.t) {
      case "wait":
        await sleep(a.v ?? 1500);
        return true;
      case "click-sel":
        await page.locator(a.sel).first().click({ timeout: 6000 });
        return true;
      case "click-texto":
        await page.getByText(a.v, { exact: false }).first().click({ timeout: 6000 });
        return true;
      case "hold":
        await page.mouse.move(vp.width * a.x, vp.height * a.y);
        await page.mouse.down();
        await sleep(a.ms ?? 800);
        await page.mouse.up();
        return true;
      case "pan":
        await page.mouse.move(vp.width * a.v[0], vp.height * a.v[1]);
        await page.mouse.down();
        await page.mouse.move(vp.width * (a.v[0] - 0.15), vp.height * a.v[1], { steps: 20 });
        await page.mouse.up();
        return true;
      case "wheel":
        await page.mouse.move(vp.width / 2, vp.height / 2);
        await page.mouse.wheel(0, a.v);
        return true;
      case "slider":
        await page.locator('input[type="range"]').first().fill(String(a.v));
        return true;
      default:
        return true;
    }
  } catch (e) {
    console.log(`  [aviso] acción ${a.t} (${a.sel ?? a.v ?? ""}) no encontró nada: ${String(e?.message ?? e).slice(0, 90)}`);
    return false;
  }
}

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const vp = espec.viewport;
const ctx = await browser.newContext({
  viewport: vp,
  hasTouch: true,
  isMobile: true,
  permissions: ["geolocation"],
  geolocation: { latitude: -34.9, longitude: -56.2, accuracy: 50 },
  recordVideo: { dir: OUT, size: vp },
});
const page = await ctx.newPage();
const problemas = [];
page.on("console", (m) => { if (m.type() === "error") problemas.push(m.text().slice(0, 140)); });

const narracion = [`# ${espec.titulo}\n\n_Base: ${BASE} · viewport ${vp.width}×${vp.height}\n`];
const srt = [];
let t = 0;
let fallos = 0;

for (const caso of espec.casos) {
  const t0 = t;
  await sleep(600);
  await page.screenshot({ path: join(OUT, "shots", `${caso.id}.png`) }).catch(() => undefined);
  for (const a of caso.acciones) {
    const ok = await actuar(page, a, vp);
    if (!ok) fallos++;
  }
  const dur = caso.dur_ms ?? 6000;
  await sleep(dur);
  t += dur;
  narracion.push(`## ${mmss(t0)} — ${caso.titulo}\n\n${caso.narracion}\n`);
  srt.push(`${srt.length + 1}\n${srtTime(t0 + 600)} --> ${srtTime(t0 + dur)}\n${caso.narracion}\n`);
}

await ctx.close();
await browser.close();

const vids = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith(".webm")) : [];
if (vids.length) renameSync(join(OUT, vids[0]), join(OUT, "demo.webm"));

writeFileSync(join(OUT, "demo-narracion.md"), narracion.join("\n") + (problemas.length ? `\n> Aviso: errores de consola en la grabación: ${problemas.join(" · ")}\n` : ""));
writeFileSync(join(OUT, "demo.srt"), srt.join("\n"));
console.log(`DEMO LISTA — ${OUT}/demo.webm · demo-narracion.md · demo.srt · acciones fallidas: ${fallos} · errores de consola: ${problemas.length}`);
