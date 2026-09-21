import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 820 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods, null, { timeout: 25000 });
const tuck = +process.argv[2], nom = process.argv[3];
// on arrive juste avant l entree, puis une image toutes les 4 frames
await page.evaluate(async ([tuck]) => {
  const d = window.__dods;
  const spots = (await import('/src/spots.js')).SPOTS;
  d.state.spot = spots.find(s => s.id === 'lysefjord');
  d.show('run'); d.startRun();
  d.paused = true; d.slowmo = true; d.autoJump = 0.7; d.autoTuck = tuck;
  while (d.jump.state === 'walk' || (d.jump.state === 'fly' && d.jump.ttc > 0.55)) d.tick(1);
}, [tuck]);
for (let i = 0; i < 9; i++) {
  await page.evaluate(() => window.__dods.tick(3));
  await page.waitForTimeout(70);
  await page.screenshot({ path: `entree-${nom}-${i}.png` });
}
const fin = await page.evaluate(() => {
  const d = window.__dods;
  let f = 0;
  while (f < 400 && !document.querySelector('#s-jump').classList.contains('on')) { d.tick(1); f++; }
  return { grade: d.state.last.grade.key, forme: document.querySelector('#jr-landing').textContent };
});
console.log(nom, JSON.stringify(fin), 'erreurs', JSON.stringify(errs));
await browser.close();
