import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 820 } })).newPage();
await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods, null, { timeout: 25000 });
const out = await page.evaluate(async () => {
  const spots = (await import('/src/spots.js')).SPOTS;
  const mesure = (slowmo) => {
    const d = window.__dods;
    d.state.spot = spots.find(s => s.id === 'lysefjord');
    d.show('run'); d.startRun();
    d.paused = true; d.slowmo = slowmo; d.autoJump = 0.7; d.autoTuck = null;
    while (d.jump.state === 'walk') d.tick(1);
    // on ferme a 0,4 s de l'eau, puis on suit la hanche jusqu'a 90 % de la cible
    while (d.jump.ttc > 0.4) d.tick(1);
    d.press();
    const cible = -2.45;
    let f = 0, alt0 = d.jump.pos.y;
    while (f < 200 && Math.abs(d.jump.diver.joints.hipL.rotation.x - cible) > Math.abs(cible) * 0.1) { d.tick(1); f++; }
    return { frames: f, secondesEcran: +(f / 60).toFixed(3), metresParcourus: +(alt0 - d.jump.pos.y).toFixed(2), altitudeRestante: +d.jump.pos.y.toFixed(2) };
  };
  return { sansRalenti: mesure(false), avecRalenti: mesure(true) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
