import { chromium } from 'playwright';

// Ouverture commune a tous les scenarios. Rendu logiciel (swiftshader) : aucun GPU dans
// un conteneur. Par defaut la page ne dessine pas a chaque tick, sinon chaque image
// coute une demi-seconde de CPU et un scenario de logique prend des minutes.
export const CHROME = process.env.CHROME || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome');
// Sur un Mac, le Chrome sans tete rend par le vrai GPU (ANGLE Metal) : swiftshader y
// bloque le chargement. Ailleurs (conteneur sans GPU), rendu logiciel. GPU=0 ou 1 force.
const USE_GPU = process.env.GPU ? process.env.GPU === '1' : process.platform === 'darwin';
const GL_ARGS = USE_GPU ? ['--ignore-gpu-blocklist', '--enable-gpu']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export async function open({ width = 420, height = 820, render = false, touch = false, lang = '', scale = 1, save = null } = {}) {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
  const browser = await chromium.launch({
    executablePath: CHROME, proxy,
    args: ['--ignore-certificate-errors', ...GL_ARGS]
  });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: scale, ...(lang ? { locale: lang } : {}) });
  // une sauvegarde posee avant le chargement : records, sauts, langue (captures de vitrine)
  if (save) await ctx.addInitScript(v => { try { localStorage.setItem('dods3000.v1', v); } catch { } }, JSON.stringify(save));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:' + (process.env.PORT || '8099') + '/?cb=' + Date.now(), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 30000 });
  await page.evaluate(r => { window.__dods.render = r; window.__dods.quality.on = false; }, render);
  return { browser, page, errs };
}

// Avance jusqu'a ce que la carte de resultat s'affiche, et rend le resultat.
export const untilResult = `(() => {
  const d = window.__dods; let f = 0;
  while (f < 4000 && !document.querySelector('#s-jump').classList.contains('on')) { d.tick(1); f++; }
  return f;
})()`;
