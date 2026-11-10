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
    if (geos.length) { await page.mouse.click(geos[0].x, geos[0].y); console.log('OK popup clickeado'); await page.waitForTimeout(2000); return true; }
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
      return hits.sort((a, b) => a.w - b.w)[0] || null; // el span chico es el botón real
    });
    if (g) { await page.mouse.click(g.x, g.y); await page.waitForTimeout(5000); return true; }
    return false;
  }

  // 0) borrar reel cuadrado actual DfimxJ-JZC9
  await page.goto('https://www.instagram.com/holisticnavigator.app/reel/DfimxJ-JZC9/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const opts = page.locator('svg[aria-label*="options" i], svg[aria-label*="Options"], svg[aria-label*="opciones" i]').first();
  if (await opts.count()) {
    await opts.click().catch(() => {});
    await page.waitForTimeout(2000);
    const c = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('[role=dialog] *, [role=menu] *'))
        .find(e => /^(Delete|Eliminar)$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 10);
      if (h) { const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
      return null;
    });
    if (c) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(2500);
      const c2 = await page.evaluate(() => {
        const h = Array.from(document.querySelectorAll('[role=dialog] *'))
          .find(e => /^(Delete|Eliminar)$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 10);
        if (h) { const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
        return null;
      });
      if (c2) { await page.mouse.click(c2.x, c2.y); console.log('reel cuadrado borrado'); }
    }
  } else console.log('sin botón opciones (reel quizá ya borrado)');
  await page.waitForTimeout(3000);

  // 1) flujo de publicación
  await page.goto('https://www.instagram.com/holisticnavigator.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.locator('svg[aria-label="New post"]').first().click();
  await page.waitForTimeout(2000);
  await clickOk();
  const dump = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      if (/^Post$/.test((el.textContent || '').trim())) {
        const r = el.getBoundingClientRect();
        if (r.width > 30 && r.height > 10 && r.height < 60) out.push({ x: r.x + r.w === undefined ? 0 : 0, cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
      }
    }
    return out[0] || null;
  });
  if (!dump) { console.log('sin menú Post'); await shot('v4-nomenu'); await browser.close(); return; }
  await page.mouse.click(dump.cx, dump.cy);
  await page.waitForTimeout(3000);
  await page.locator('input[type="file"][accept*="video"]').first().setInputFiles(REEL);
  console.log('VIDEO SET');
  await page.waitForTimeout(12000);
  await clickOk();
  await shot('v4-crop-inicial');

  // 2) EN LA PANTALLA CROP: dump de controles
  const controles = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[role=dialog] button, [role=dialog] [role=button], [role=dialog] svg, [role=dialog] img')) {
      const lab = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      const r = el.getBoundingClientRect();
      if (lab || el.tagName === 'svg') out.push({ tag: el.tagName, lab, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width | 0, h: r.height | 0 });
    }
    // también textos clickeables
    for (const el of document.querySelectorAll('[role=dialog] [role=button]')) {
      const t = (el.textContent || '').trim();
      const r = el.getBoundingClientRect();
      if (t) out.push({ tag: 'rolebutton', lab: t.slice(0, 40), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width | 0, h: r.height | 0 });
    }
    return out;
  });
  console.log('CROP CONTROLES:', JSON.stringify(controles, null, 1).slice(0, 2500));
  fs.writeFileSync('/tmp/ig-v4-controles.json', JSON.stringify(controles, null, 1));

  // 3) probar toggles candidatos: aria-labels con Zoom/Original/Fullscreen/Expand o svg chico dentro del preview
  const cand = controles.filter(c => /zoom|original|full|expand|aspect/i.test(c.lab || ''));
  console.log('candidatos toggles:', JSON.stringify(cand));
  if (cand.length) {
    await page.mouse.click(cand[0].x, cand[0].y);
    await page.waitForTimeout(2500);
    await shot('v4-sin-crop');
  } else {
    console.log('sin toggle claro: pruebo el svg más chico del preview');
    await shot('v4-crop-detail');
  }
  fs.writeFileSync('/tmp/ig-v4-estado.flag', '1');
  await page.waitForTimeout(120000); // abierto para la siguiente fase
  await browser.close();
}

run().catch(e => { console.error('ERR', e.message); });
