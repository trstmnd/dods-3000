import { chromium } from 'playwright';

// Ouverture commune a tous les scenarios. Rendu logiciel (swiftshader) : aucun GPU dans
// un conteneur. Par defaut la page ne dessine pas a chaque tick, sinon chaque image
// coute une demi-seconde de CPU et un scenario de logique prend des minutes.
export const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function open({ width = 420, height = 820, render = false, touch = false } = {}) {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
  const browser = await chromium.launch({
    executablePath: CHROME, proxy,
    args: ['--ignore-certificate-errors', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
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
