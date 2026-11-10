// Uso: node verificar-reels.cjs — lista los reels del perfil con cookies de sesión.
const { chromium } = require('playwright');
const fs = require('fs');

async function run() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies(JSON.parse(fs.readFileSync('/home/diego/workspace/holisticNavigator/sponsors/IG/posteos/2026-11-10-reels/ig-cookies.json', 'utf8')));
  const page = await ctx.newPage();
  await page.goto('https://www.instagram.com/holisticnavigator.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const data = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')) out.push(a.getAttribute('href'));
    return out;
  });
  console.log('SHORTCODES:', JSON.stringify([...new Set(data)]));
  await browser.close();
}
run().catch(e => { console.error('ERR', e.message); process.exit(1); });
