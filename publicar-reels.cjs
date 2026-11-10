// Uso: node publicar-reels.cjs <video.mp4> <pie.txt> [cookies.json]
// Receta IG probada (v5): + (New post) → Post → video → OK → Crop "Original" → Next → pie → Share.
// Todas las rutas dentro del workspace (los agentes no acceden a /tmp).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = '/home/diego/workspace/holisticNavigator';
const REEL = path.resolve(process.argv[2]);
const CAPTION = fs.readFileSync(path.resolve(process.argv[3]), 'utf8').trim();
const COOKIES = process.argv[4] ? path.resolve(process.argv[4]) : path.join(ROOT, 'sponsors/IG/posteos/2026-11-10-reels/ig-cookies.json');
const SHOTS = path.join(ROOT, 'sponsors/IG/posteos/2026-11-10-reels/shots');
fs.mkdirSync(SHOTS, { recursive: true });
const tag = path.basename(REEL, '.mp4');

async function run() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies(JSON.parse(fs.readFileSync(COOKIES, 'utf8')));
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${tag}-${n}.png`) }).catch(() => {});

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
    if (geos.length) { await page.mouse.click(geos[0].x, geos[0].y); console.log('OK popup'); await page.waitForTimeout(2000); return true; }
    return false;
  }
  async function nextGeo() {
    const g = await page.evaluate(() => {
      const hits = [];
      for (const el of document.querySelectorAll('[role=dialog] *')) {
        if (/^Next$/.test((el.textContent || '').trim())) {
          const r = el.getBoundingClientRect();
          if (r.width > 5 && r.height > 5) hits.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width });
        }
      }
      return hits.sort((a, b) => a.w - b.w)[0] || null;
    });
    if (g) { await page.mouse.click(g.x, g.y); await page.waitForTimeout(5000); return true; }
    return false;
  }

  await page.goto('https://www.instagram.com/holisticnavigator.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.locator('svg[aria-label="New post"]').first().click();
  await page.waitForTimeout(2000);
  await clickOk();
  const p = await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (/^Post$/.test((el.textContent || '').trim())) {
        const r = el.getBoundingClientRect();
        if (r.width > 30 && r.height > 10 && r.height < 60)
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (!p) { await shot('sin-post'); throw new Error('no encontré opción Post'); }
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(3000);
  await page.locator('input[type="file"][accept*="video"]').first().setInputFiles(REEL);
  console.log('VIDEO SET', REEL);
  await page.waitForTimeout(12000);
  await clickOk();

  // pantalla Crop: abrir Select crop y elegir "Original"
  const sc = await page.evaluate(() => {
    for (const el of document.querySelectorAll('[role=dialog] [role=button], [role=dialog] svg')) {
      if ((el.getAttribute('aria-label') || '') === 'Select crop') {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (sc) {
    await page.mouse.click(sc.x, sc.y);
    await page.waitForTimeout(1500);
    const ops = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[role=dialog] [role=menu] *, [role=dialog] div, [role=dialog] [role=button]')) {
        const t = (el.textContent || '').trim();
        if (/^(Original|1:1|4:5|16:9|9:16|Full|Uncrop|Sin recorte|No crop|Original \(9:16\))$/i.test(t)) {
          const r = el.getBoundingClientRect();
          if (r.width > 10 && r.height > 10) out.push({ t, x: r.x + r.width / 2, y: r.y + r.height / 2 });
        }
      }
      return out;
    });
    console.log('OPCIONES DE CROP:', JSON.stringify(ops));
    await shot('crop-menu');
    const orig = ops.find(o => /original/i.test(o.t)) || ops.find(o => /9:16/i.test(o.t)) || ops[0];
    if (orig) {
      await page.mouse.click(orig.x, orig.y);
      console.log('elegido:', orig.t);
      await page.waitForTimeout(2000);
      await shot('crop-elegido');
    }
  } else console.log('no vi Select crop (quizá no hay crop para este video)');

  // Next hasta pie
  for (let i = 0; i < 4; i++) {
    if (await clickOk()) await page.waitForTimeout(1500);
    const captionYa = await page.locator('[role=dialog] [role="textbox"][contenteditable="true"], [role=dialog] textarea').first().count();
    if (captionYa) { console.log('pie disponible (tras', i, 'next)'); break; }
    if (!(await nextGeo())) { console.log('stop: sin Next en', i); break; }
    await shot('next' + i);
  }
  const cap = page.locator('[role=dialog] [role="textbox"][contenteditable="true"], [role=dialog] textarea').first();
  if (await cap.count()) { await cap.click().catch(() => {}); await page.keyboard.insertText(CAPTION); console.log('PIE SET'); }
  await page.waitForTimeout(2000);
  const share = page.locator('[role=dialog] [role=button]:text-is("Share"), [role=dialog] button:text-is("Share")').first();
  if (await share.count()) { await share.click({ timeout: 5000 }).catch(() => {}); console.log('SHARE'); }
  else { console.log('Share no visto'); await shot('sin-share'); }
  await page.waitForTimeout(180000);
  await shot('post-share');
  await browser.close();
  console.log('LISTO', tag);
}

run().catch(e => { console.error('ERR', e.message); process.exit(1); });
