// Borrar un reel publicado reutilizando la lógica UI probada en
// reemplazar-reel.cjs / publicar-v4.cjs (opciones → Delete → confirmar).
// Uso: node borrar-reel.cjs [shortcode] [cookies.json]
const { chromium } = require('playwright');
const fs = require('fs');

const SHORTCODE = process.argv[2] || 'Df7-XSdhPh6';
const COOKIES = process.argv[3] || '/home/diego/workspace/holisticNavigator/sponsors/IG/posteos/2026-11-10-reels/ig-cookies.json';
const PERFIL = 'https://www.instagram.com/holisticnavigator.app/';
const REEL = `${PERFIL}reel/${SHORTCODE}/`;

async function clickDelete(page, etiqueta) {
  const p = await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('[role=dialog] [role=button], [role=menu] [role=button], [role=dialog] *'))
      .find(e => /^(Delete|Eliminar)$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 10);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!p) { console.log(`sin botón ${etiqueta}`); return false; }
  await page.mouse.click(p.x, p.y);
  console.log(`clic ${etiqueta} en ${Math.round(p.x)},${Math.round(p.y)}`);
  return true;
}

async function shortcodes(page) {
  await page.goto(PERFIL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  return page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')]
    .map(a => a.getAttribute('href')))]);
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies(JSON.parse(fs.readFileSync(COOKIES, 'utf8')));
  const page = await ctx.newPage();

  console.log(`borrando ${SHORTCODE} (${REEL})`);
  await page.goto(REEL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  const opts = page.locator('svg[aria-label="More options"], [aria-label="More options"], svg[aria-label="Más opciones"], svg[aria-label*="ptions" i]').first();
  if (!(await opts.count())) { console.log('sin botón de opciones: el reel quizá ya está borrado'); }
  else {
    await opts.click({ timeout: 5000 }).catch(e => console.log('options click err: ' + e.message));
    await page.waitForTimeout(2000);
    if (await clickDelete(page, 'Delete (menú)')) {
      await page.waitForTimeout(2500);
      if (await clickDelete(page, 'Delete (confirmación)')) console.log('BORRADO confirmado en el diálogo');
      else console.log('sin botón de confirmación visible');
    } else console.log('NO Delete en menú — no borro nada');
  }
  await page.waitForTimeout(4000);

  const lista = await shortcodes(page);
  console.log('SHORTCODES:', JSON.stringify(lista));
  const sigue = lista.some(h => h && h.includes(`/reel/${SHORTCODE}/`));
  console.log(sigue ? `FALLO: ${SHORTCODE} sigue en el perfil` : `OK: ${SHORTCODE} ya no aparece en el perfil`);
  await browser.close();
  if (sigue) process.exit(1);
}

run().catch(e => { console.error('ERR', e.message); process.exit(1); });
