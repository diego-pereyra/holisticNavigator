const { chromium } = require('playwright');
const fs = require('fs');

const REEL = '/home/diego/workspace/holisticNavigator/reel_compressed.mp4';
const CAPTION = fs.readFileSync('/home/diego/workspace/holisticNavigator/sponsors/IG/posteos/2026-10-30-optimizar/pie.txt', 'utf8').trim();

async function run() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies(JSON.parse(fs.readFileSync('/tmp/ig-cookies.json', 'utf8')));
  const page = await ctx.newPage();

  const shot = (n) => page.screenshot({ path: `/tmp/ig-${n}.png` }).catch(() => {});

  await page.goto('https://www.instagram.com/holisticnavigator.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await shot('cuenta-cargada');

  const notNow = page.locator('[role=button]:has-text("Not now")').first();
  if (await notNow.count()) { await notNow.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1500); }

  // "+" -> menu -> Post
  await page.locator('svg[aria-label="New post"]').first().click();
  await page.waitForTimeout(2000);
  const dump = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const t = (el.textContent || '').trim();
      if (/^Post$/.test(t)) {
        const r = el.getBoundingClientRect();
        if (r.width > 30 && r.height > 10 && r.height < 60) out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
      }
    }
    return out;
  });
  if (!dump.length) { console.log('NO MENU'); await shot('no-menu'); await browser.close(); return; }
  const p = dump[0];
  await page.mouse.click(p.x + p.w / 2, p.y + p.h / 2);
  await page.waitForTimeout(3000);

  // video input (mounted dialog)
  const vin = page.locator('input[type="file"][accept*="video"]').first();
  if (!(await vin.count())) { console.log('NO VIDEO INPUT'); await shot('no-input'); await browser.close(); return; }
  await vin.setInputFiles(REEL);
  console.log('1) VIDEO SET');
  await page.waitForTimeout(12000);
  await shot('paso-1-video-subido');

  // helper: click Next / arrow button
  async function clickNext(tag) {
    const cands = [
      page.locator('[role=dialog] [role=button]:has-text("Next"), [role=dialog] button:has-text("Next")').first(),
      page.locator('[role=dialog] [role=button]:has-text("Siguiente")').first(),
      page.locator('svg[aria-label="Next"], svg[aria-label="Siguiente"]').first(),
      page.locator('svg[aria-label="arrow icon"], svg[aria-label="Next icon"]').first(),
    ];
    for (const c of cands) {
      if (await c.count()) {
        try { await c.click({ timeout: 4000 }); console.log(`2) Next clicked via [${c._selector || 'sel'}] for ${tag}`); return true; } catch {}
      }
    }
    console.log('NO NEXT for', tag);
    await shot(`sin-next-${tag}`);
    return false;
  }

  if (!(await clickNext('1'))) { await browser.close(); return; }
  await page.waitForTimeout(5000);
  await shot('paso-2-tras-next1');

  // step 2 might be crop/adjust -> another Next
  const dlgT = await page.locator('[role=dialog]').first().textContent().catch(() => '');
  console.log('dialog after next1:', (dlgT || '').replace(/\s+/g, ' ').slice(0, 400));

  if (/Crop|Recort|Adjust|Ajust/.test(dlgT) || await page.locator('svg[aria-label="Next"]').count()) {
    if (await clickNext('2')) {
      await page.waitForTimeout(5000);
      await shot('paso-3-tras-next2');
    }
  }

  // cover step? (Reel asks cover) - try continue if visible
  if (/Cover|Portada/.test(await page.locator('[role=dialog]').first().textContent().catch(() => ''))) {
    await clickNext('cover');
    await page.waitForTimeout(4000);
    await shot('paso-4-cover');
  }

  // caption fill
  const cap = page.locator('[role=dialog] [role="textbox"][contenteditable="true"], [role=dialog] textarea').first();
  if (await cap.count()) {
    await cap.click();
    await page.keyboard.insertText(CAPTION);
    console.log('3) CAPTION SET');
  } else {
    console.log('NO CAPTION FIELD - dumping dialog');
    const t = await page.locator('[role=dialog]').first().textContent().catch(() => '');
    console.log('dialog:', (t || '').replace(/\s+/g, ' ').slice(0, 600));
  }
  await page.waitForTimeout(3000);
  await shot('paso-5-pie-cargado');

  // share
  const shareCands = [
    page.locator('[role=dialog] [role=button]:text-is("Share"), [role=dialog] button:text-is("Share")').first(),
    page.locator('[role=dialog] [role=button]:text-is("Compartir")').first(),
  ];
  let shared = false;
  for (const s of shareCands) {
    if (await s.count()) { await s.click({ timeout: 5000 }).catch(() => {}); shared = true; break; }
  }
  console.log(shared ? '4) SHARE CLICKED' : 'SHARE NOT FOUND');
  await page.waitForTimeout(15000);
  await shot('paso-6-post-share');
  console.log('URL final:', page.url());
  const dlgF = await page.locator('[role=dialog]').first().textContent().catch(() => '');
  console.log('dialog final:', (dlgF || '').replace(/\s+/g, ' ').slice(0, 300));

  fs.writeFileSync('/tmp/ig-shared.flag', shared ? '1' : '0');
  await page.waitForTimeout(120000);
  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
