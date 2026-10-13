// Smoke test de browser real (CI): abre la app construida y falla si no arranca.
// Uso: node web/smoke.mjs http://localhost:8087/holisticNavigator/
// Requiere `playwright` instalado (solo en CI: npm i --no-save playwright).
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:8087/";
const problems = [];
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("console", (m) => { if (m.type() === "error") problems.push(`console.error: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
page.on("response", (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

await page.goto(url, { waitUntil: "load" });
const ok = await page.waitForSelector("#hn-loading.done", { timeout: 15_000 }).then(() => true, () => false);
if (!ok) problems.push("la pantalla de carga sigue visible a los 15 s: " + (await page.textContent("#hn-loading").catch(() => "")));
if (!(await page.$(".hn-context"))) problems.push("no existe .hn-context (la UI no se montó)");
await page.screenshot({ path: "smoke.png" }).catch(() => undefined);
await browser.close();

if (problems.length > 0) {
  console.error("SMOKE FAIL\n" + problems.map((p) => " - " + p).join("\n"));
  process.exit(1);
}
console.log("SMOKE OK: mapa y UI montados, sin errores en consola");
