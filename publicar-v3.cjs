const { chromium } = require('playwright');
const fs = require('fs');

const REEL = '/tmp/reel-final.mp4';
const CAPTION = fs.readFileSync('/home/diego/workspace/holisticNavigator/sponsors/IG/posteos/2026-10-30-optimizar/pie.txt', 'utf8').trim();

async function run() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies(JSON.parse(fs.readFileSync('/tmp/ig-cookies.json', 'utf8')));
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: `/tmp/ig-${n}.png` }).catch(() => {});

  // aceptar popup con OK si está presente (búsqueda global, no solo dialog)
  async function clickOk() {
    const geos = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, [role=button], div, span')) {
        if (/^OK$/.test((el.textContent || '').trim())) {
          const r = el.getBoundingClientRect();
          if (r.width > 30 && r.width < 700 && r.height > 20 && r.height < 120) {
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            if (top && (top === el || el.contains(top) || top.contains(el)))
              out.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
          }
        }
      }
      return out;
    });
    if (geos.length) {
      console.log('POPUP OK detectado, click en', Math.round(geos[0].x), Math.round(geos[0].y));
      await page.mouse.click(geos[0].x, geos[0].y);
      await page.waitForTimeout(2500);
      return true;
    }
    return false;
  }

  await page.goto('https://www.instagram.com/holisticnavigator.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const notNow = page.locator('[role=button]:has-text("Not now")').first();
  if (await notNow.count()) { await notNow.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1000); }

  await page.locator('svg[aria-label="New post"]').first().click();
  await page.waitForTimeout(2000);
  await clickOk();
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
  await page.mouse.click(dump[0].x + dump[0].w / 2, dump[0].y + dump[0].h / 2);
  await page.waitForTimeout(3000);
  const vin = page.locator('input[type="file"][accept*="video"]').first();
  await vin.setInputFiles(REEL);
  console.log('1) VIDEO SET');
  await page.waitForTimeout(12000);
  await clickOk();

  // Next ×N (hasta la pantalla de pie) maneja OK en cada paso
  for (let paso = 1; paso <= 4; paso++) {
    let ok = false;
    for (const c of [
      page.locator('[role=dialog] [role=button]:has-text("Next"), [role=dialog] button:has-text("Next")').first(),
      page.locator('svg[aria-label="Next"], svg[aria-label="Siguiente"]').first(),
    ]) { if (await c.count()) { try { await c.click({ timeout: 4000 }); ok = true; break; } catch {} } }
    if (!ok) {
      await clickOk();
      await page.waitForTimeout(2000);
      const geo = await page.evaluate(() => {
        const hits = [];
        for (const el of document.querySelectorAll('[role=dialog] *')) {
          if (/^Next$/.test((el.textContent || '').trim())) {
            const r = el.getBoundingClientRect();
            if (r.width > 5 && r.height > 5) hits.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, tag: el.tagName });
          }
        }
        return hits;
      });
      console.log(`Next ${paso} candidatos Geo:`, JSON.stringify(geo));
      if (geo.length) { await page.mouse.click(geo[0].x, geo[0].y); ok = true; }
    }
    console.log(`Next ${paso}:`, ok);
    if (!ok) break;
    await page.waitForTimeout(5000);
    await shot(`p3-${paso}`);
    await clickOk();
    // si ya apareció el caption editor, frenar
    if (await page.locator('[role=dialog] [role="textbox"][contenteditable="true"], [role=dialog] textarea').first().count()) {
      console.log('pantalla de pie detectada');
      break;
    }
  }
  const cap = page.locator('[role=dialog] [role="textbox"][contenteditable="true"], [role=dialog] textarea').first();
  if (await cap.count()) { await cap.click().catch(() => {}); await page.keyboard.insertText(CAPTION); console.log('2) PIE SET'); }
  await page.waitForTimeout(2000);
  await shot('p3-pie');
  const share = page.locator('[role=dialog] [role=button]:text-is("Share"), [role=dialog] button:text-is("Share")').first();
  if (await share.count()) { await share.click({ timeout: 5000 }).catch(() => {}); console.log('3) SHARE'); }
  else { console.log('SHARE no encontrado'); await shot('p3-sin-share'); }
  await page.waitForTimeout(180000); // mantener abierto hasta que termine el proceso
  await shot('v3-final');
  await clickOk();
  const perfil = await page.goto('https://www.instagram.com/holisticnavigator.app/', { waitUntil: 'domcontentloaded' }).then(() => page.evaluate(() => (document.body.textContent || '').replace(/\s+/g, ' ')).then(t => (t.match(/(\d+)\s*posts?/i) || [])[1])).catch(() => '?');
  console.log('POSTS EN PERFIL:', perfil);
  await page.waitForTimeout(30000);
  await browser.close();
}

run().catch(e => { console.error('ERR', e.message); process.exit(1); });
