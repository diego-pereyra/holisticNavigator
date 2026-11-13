// Uso: node publicar-fotos.cjs <pie.txt> <foto1> [foto2] [foto3] [cookies.json]
// Carrusel IG (2–3 fotos): + (New post) → Post → fotos → OK → Crop "Original"
// por foto → Next → pie → Share. Misma receta probada que publicar-reels.cjs.
// Todas las rutas dentro del workspace (los agentes no acceden a /tmp).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = '/home/diego/workspace/holisticNavigator';
const CAPTION = fs.readFileSync(path.resolve(process.argv[2]), 'utf8').trim();
const PHOTOS = process.argv.slice(3).filter((a) => /\.(jpe?g|png)$/i.test(a)).map((a) => path.resolve(a));
let COOKIES = path.join(ROOT, 'sponsors/IG/posteos/2026-11-10-reels/ig-cookies.json');
const maybeCookies = process.argv.slice(3).find((a) => /\.json$/i.test(a));
if (maybeCookies) COOKIES = path.resolve(maybeCookies);
if (PHOTOS.length < 2) {
  console.error('ERR: hacen falta al menos 2 fotos (.jpg/.png) después del pie.txt');
  process.exit(1);
}
const tag = path.basename(PHOTOS[0], path.extname(PHOTOS[0]));
const POST = path.dirname(PHOTOS[0]);
const SHOTS = path.join(POST, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

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
    if (geos.length) {
      await page.mouse.click(geos[0].x, geos[0].y);
      console.log('OK popup');
      await page.waitForTimeout(2000);
      return true;
    }
    return false;
  }

  async function clickNext() {
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
    if (g) {
      await page.mouse.click(g.x, g.y);
      await page.waitForTimeout(3000);
      return true;
    }
    return false;
  }

  // Menú de recorte: abrir "Select crop" y elegir "Original" (IG recorta 1:1
  // si no se toca; el vertical del carrusel se pierde).
  async function cropOriginal(step) {
    const sc = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[role=dialog] [role=button], [role=dialog] svg')) {
        if ((el.getAttribute('aria-label') || '') === 'Select crop') {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });
    if (!sc) {
      console.log('sin Select crop en', step);
      return false;
    }
    await page.mouse.click(sc.x, sc.y);
    await page.waitForTimeout(1200);
    const ops = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[role=dialog] [role=menu] *, [role=dialog] div, [role=dialog] [role=button]')) {
        const t = (el.textContent || '').trim();
        if (/^(Original|1:1|4:5|16:9|9:16|Full|Uncrop|Sin recorte|No crop|Original \(4:5\)|Original \(1:1\))$/i.test(t)) {
          const r = el.getBoundingClientRect();
          if (r.width > 10 && r.height > 10) out.push({ t, x: r.x + r.width / 2, y: r.y + r.height / 2 });
        }
      }
      return out;
    });
    await shot(`crop-menu-${step}`);
    const orig = ops.find((o) => /original/i.test(o.t)) || ops[0];
    if (!orig) {
      console.log('sin opciones de crop en', step, JSON.stringify(ops));
      return false;
    }
    await page.mouse.click(orig.x, orig.y);
    console.log('crop', step, '→', orig.t);
    await page.waitForTimeout(1800);
    return true;
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
  if (!p) {
    await shot('sin-post');
    throw new Error('no encontré opción Post');
  }
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(3000);
  // El diálogo expone 3 inputs: jpeg simple, jpeg/png simple y el de carrusel
  // (multiple). Para varias fotos hay que usar el multiple.
  let input = page.locator('input[type="file"][multiple]').first();
  if (!(await input.count())) input = page.locator('input[type="file"][accept*="image"]').first();
  await input.setInputFiles(PHOTOS);
  console.log('FOTOS SET', PHOTOS.length, PHOTOS.join(' '));
  await page.waitForTimeout(12000);
  await clickOk();

  // Recorte foto por foto: en carrusel cada foto tiene su propio "Select crop".
  for (let i = 0; i < PHOTOS.length; i++) {
    await cropOriginal(i + 1);
    if (i + 1 < PHOTOS.length) {
      // Flecha de la foto siguiente dentro del paso de recorte.
      const advanced = await page.evaluate(() => {
        for (const el of document.querySelectorAll('[role=dialog] [aria-label="Next"], [role=dialog] [aria-label="Siguiente"]')) {
          const r = el.getBoundingClientRect();
          if (r.width > 5) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
        return null;
      });
      if (advanced) {
        await page.mouse.click(advanced.x, advanced.y);
        await page.waitForTimeout(1500);
      } else {
        console.log('sin flecha para foto', i + 2);
      }
    }
  }

  // Pasar de "Editar/Recorte" al pie: Next hasta que aparezca el textbox.
  for (let i = 0; i < 4; i++) {
    if (await clickOk()) await page.waitForTimeout(1200);
    const captionYa = await page.locator('[role=dialog] [role="textbox"][contenteditable="true"], [role=dialog] textarea').first().count();
    if (captionYa) {
      console.log('pie disponible (tras', i, 'next)');
      break;
    }
    if (!(await clickNext())) {
      console.log('stop: sin Next en', i);
      break;
    }
    await shot('next' + i);
  }

  const cap = page.locator('[role=dialog] [role="textbox"][contenteditable="true"], [role=dialog] textarea').first();
  if (await cap.count()) {
    await cap.click().catch(() => {});
    await page.keyboard.insertText(CAPTION);
    console.log('PIE SET');
  }
  await page.waitForTimeout(2000);
  const share = page.locator('[role=dialog] [role=button]:text-is("Share"), [role=dialog] button:text-is("Share")').first();
  if (await share.count()) {
    await share.click({ timeout: 5000 }).catch(() => {});
    console.log('SHARE');
  } else {
    console.log('Share no visto');
    await shot('sin-share');
  }
  await page.waitForTimeout(180000);
  await shot('post-share');
  await browser.close();
  console.log('LISTO', tag);
}

run().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
