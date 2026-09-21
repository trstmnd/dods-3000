import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 820 } })).newPage();
await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods, null, { timeout: 20000 });

async function pose(spotId, phase, fichier) {
  await page.evaluate(async ([spotId, phase]) => {
    const d = window.__dods;
    const spots = (await import('/src/spots.js')).SPOTS;
    d.state.spot = spots.find(s => s.id === spotId);
    d.show('run'); d.startRun();
    d.paused = true; d.slowmo = false; d.autoJump = 0.7; d.autoTuck = 0.15;
    if (phase === 'course') { d.tick(40); return; }
    while (d.jump.state !== 'fly') d.tick(1);          // decollage
    if (phase === 'vol') { d.tick(28); return; }        // en pleine croix
    while (d.jump.state !== 'impact') d.tick(1);        // entree dans l'eau
    d.tick(phase === 'gerbe' ? 12 : 40);
  }, [spotId, phase]);
  await page.waitForTimeout(120);
  await page.screenshot({ path: fichier });
}
await pose('lysefjord', 'vol', 'vue-vol.png');
await pose('lysefjord', 'gerbe', 'vue-gerbe.png');
await pose('frogner', 'course', 'vue-course.png');
await pose('quebrada', 'vol', 'vue-quebrada.png');
await browser.close();
