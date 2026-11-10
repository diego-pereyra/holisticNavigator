const { chromium } = require('playwright');
const fs = require('fs');

const REEL_URL = 'https://www.instagram.com/holisticnavigator.app/reel/DfkOP2RvEGs/';
const PERFILES = [
  'https://www.instagram.com/holisticnavigator.app/reel/DfkOP2RvEGs/',
  'https://www.instagram.com/reel/DfkOP2RvEGs/',
];
const LOG = '/home/diego/workspace/holisticNavigator/sponsors/IG/posteos/2026-10-30-optimizar/metricas.jsonl';
const VEREDICTO = '/home/diego/workspace/holisticNavigator/sponsors/IG/posteos/2026-10-30-optimizar/VEREDICTO.md';
const PUBLICADO_EPOCH = Date.parse('2026-11-09T17:05:00');

function log(obj) {
  fs.mkdirSync(require('path').dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify(obj) + '\n');
  console.log(JSON.stringify(obj));
}

async function run() {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies(JSON.parse(fs.readFileSync('/tmp/ig-cookies.json', 'utf8')));
  const page = await ctx.newPage();

  let html = '', ok = false;
  for (const url of PERFILES) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(6000);
      await page.mouse.move(640, 300); // anti-hover/sleep
      await page.waitForTimeout(6000);
      html = await page.content();
      if (/"video_view_count"|view/.test(html)) { ok = true; break; }
    } catch (e) { console.log('fail', url, e.message.split('\n')[0]); }
  }

  const notNow = page.locator('[role=button]:has-text("Not now")').first();
  if (await notNow.count()) { await notNow.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(2000); html = await page.content(); }

  const num = (s) => {
    if (!s) return null;
    const raw = s.replace(/\u202f/g, '').trim();
    let m = raw.match(/([\d.,]+)([KkMm]?)/);
    if (!m) return null;
    let v = parseFloat(m[1].replace(/\./g, m[3] === ',' && /\d+\.\d{3}/.test(m[1]) ? '' : '.').replace(/,/g, '.'));
    if (/[Kk]/.test(m[2])) v *= 1000;
    if (/[Mm]/.test(m[2])) v *= 1000000;
    return Math.round(v);
  };

  // JSON data embedded by IG
  const views = num((html.match(/"video_view_count":\s*"?([\d,.]+[KkMm]?)/) || [])[1]);
  let likes = num((html.match(/"like_count":\s*"?([\d,.]+[KkMm]?)/) || [])[1]);
  let comments = num((html.match(/"comment_count":\s*"?([\d,.]+[KkMm]?)/) || [])[1]);

  // visible-text fallback
  const txt = await page.evaluate(() => (document.body.textContent || '').replace(/\u00a0/g, ' '));
  const viewsTxt = num((txt.match(/([\d.,]+[KkMm]?)\s*(?:views|vistas)/i) || [])[1]);
  const likeTxt = num((txt.match(/([\d.,]+[KkMm]?)\s*(?:likes|me gusta)/i) || [])[1]);
  const hourTxt = (txt.match(/(\d+)\s*(minute|hour|day|week)s?\s*ago/i) || [])[0] || '';

  const v = views ?? viewsTxt, l = likes ?? likeTxt;
  log({ ts: new Date().toISOString(), horas_desde_publicacion: +((Date.now() - PUBLICADO_EPOCH) / 3.6e6).toFixed(1), fuente: ok ? 'json' : 'texto', vistas: v, likes: l, comentarios: comments ?? null, publicado_hace: hourTxt, error: ok || txt.length < 100 ? null : 'paginamal' });

  // VEREDICTO (Plan B trigger) al superar 48h
  const horas = (Date.now() - PUBLICADO_EPOCH) / 3.6e6;
  if (horas >= 48 && !fs.existsSync(VEREDICTO) && v !== null) {
    const eng = l !== null && v > 0 ? +(((l + (comments ?? 0)) / v) * 100).toFixed(2) : null;
    const planB = v < 1000 || (eng !== null && eng < 5);
    const contenido = `# VEREDICTO reel demo-07 (a ${horas.toFixed(0)}h de publicado)

- Vistas: ${v}
- Likes: ${l}
- Comentarios: ${comments}
- Interacción (likes+comentarios)/vistas: ${eng !== null ? eng + '%' : 's/d'} (plan B usa likes+saves+shares/vistas; saves/share requieren insights del dueño)
- Umbral plan B (PLAN.md): <1.000 vistas O <5% interacción

# VEREDICTO: ${planB ? 'PLAN B ACTIVO — armar post de imagen' : 'PLAN B NO ACTIVO — el rindió ok'}
`;
    fs.writeFileSync(VEREDICTO, contenido);
    console.log('VEREDICTO escrito planB=' + planB);
  }

  await browser.close();
}

run().catch(e => { console.error('ERR', e.message); process.exit(1); });
