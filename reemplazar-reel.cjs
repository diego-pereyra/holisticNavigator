const { chromium } = require('playwright');
const fs = require('fs');

const REEL = '/tmp/reel-final.mp4';
const CAPTION = fs.readFileSync('/home/diego/workspace/holisticNavigator/sponsors/IG/posteos/2026-10-30-optimizar/pie.txt', 'utf8').trim();
const VIEJO = 'https://www.instagram.com/holisticnavigator.app/reel/DfiJjDIMrjd/';

async function run() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies(JSON.parse(fs.readFileSync('/tmp/ig-cookies.json', 'utf8')));
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: `/tmp/ig-${n}.png` }).catch(() => {});

  await page.goto('https://www.instagram.com/holisticnavigator.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const notNow = page.locator('[role=button]:has-text("Not now")').first();
  if (await notNow.count()) { await notNow.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1000); }

  // A) BORRAR reel viejo
  await page.goto(VIEJO, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const opts = page.locator('svg[aria-label="More options"], [aria-label="More options"], svg[aria-label="Más opciones"], svg[aria-label*="ptions"]').first();
  if (await opts.count()) {
    await opts.click().catch(e => console.log('options click err'));
    await page.waitForTimeout(2000);
    await shot('ops-menu');
    // buscar el elemento clickeable cuyo texto exacto sea Delete/Eliminar
    const clicked = await page.evaluate(() => {
      const hit = Array.from(document.querySelectorAll('[role=dialog] [role=button], [role=menu] [role=button], [role=dialog] *'))
        .find(e => /^(Delete|Eliminar)$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 10);
      if (hit) { const r = hit.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
      return null;
    });
    if (clicked) {
      await page.mouse.click(clicked.x, clicked.y);
      await page.waitForTimeout(2500);
      await shot('confirm-borrado');
      // confirmar
      const conf = await page.evaluate(() => {
        const hit = Array.from(document.querySelectorAll('[role=dialog] *'))
          .find(e => /^(Delete|Eliminar)$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 10);
        if (hit) { const r = hit.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
        return null;
      });
      if (conf) { await page.mouse.click(conf.x, conf.y); console.log('BORRADO confirmado'); }
      else { console.log('sin botón de confirmación visible'); await shot('sin-confirm'); }
    } else { console.log('NO Delete en menú — no borro nada'); }
  } else { console.log('no encontré botón opciones en el reel'); }
  await page.waitForTimeout(3000);

  // B) PUBLICAR nuevo
  await page.goto('https://www.instagram.com/holisticnavigator.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.locator('svg[aria-label="New post"]').first().click();
  await page.waitForTimeout(2000);
  const dump = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      if (/^Post$/.test((el.textContent || '').trim())) {
        const r = el.getBoundingClientRect();
        if (r.width > 30 && r.height > 10 && r.height < 60) out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
      }
    }
    return out;
  });
  if (!dump.length) { console.log('SIN MENÚ'); await shot('sin-menu'); await browser.close(); return; }
  await page.mouse.click(dump[0].x + dump[0].w / 2, dump[0].y + dump[0].h / 2);
  await page.waitForTimeout(3000);
  const vin = page.locator('input[type="file"][accept*="video"]').first();
  await vin.setInputFiles(REEL);
  console.log('1) VIDEO NUEVO SET');
  await page.waitForTimeout(12000);

  const cands = () => [
    page.locator('[role=dialog] [role=button]:has-text("Next"), [role=dialog] button:has-text("Next")').first(),
    page.locator('svg[aria-label="Next"], svg[aria-label="Siguiente"]').first(),
  ];
  let ok;
  for (const paso of [1, 2]) {
    ok = false;
    for (const c of cands()) { if (await c.count()) { try { await c.click({ timeout: 4000 }); ok = true; break; } catch {} } }
    console.log(`Next ${paso}:`, ok);
    await page.waitForTimeout(5000);
    await shot(`v2-paso-${paso}`);
  }
  const cap = page.locator('[role=dialog] [role="textbox"][contenteditable="true"], [role=dialog] textarea').first();
  if (await cap.count()) { await cap.click().catch(() => {}); await page.keyboard.insertText(CAPTION); console.log('2) PIE SET'); }
  await page.waitForTimeout(2000);
  await shot('v2-pie');
  const share = page.locator('[role=dialog] [role=button]:text-is("Share"), [role=dialog] button:text-is("Share")').first();
  if (await share.count()) { await share.click({ timeout: 5000 }).catch(() => {}); console.log('3) SHARE'); }
  await page.waitForTimeout(15000);
  await shot('v2-shared');
  console.log('URL final:', page.url());
  await page.waitForTimeout(60000);
  await browser.close();
}

run().catch(e => { console.error('ERR', e.message); process.exit(1); });
