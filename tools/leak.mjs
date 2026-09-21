import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 20000 });
const info = () => page.evaluate(() => ({ ...window.__dods.renderer.info.memory }));
const suite = [];
suite.push({ etape: 'menu', ...(await info()) });
for (let i = 1; i <= 4; i++) {
  await page.evaluate(() => { const d = window.__dods; d.show('run'); d.startRun(); });
  await page.waitForTimeout(250);
  suite.push({ etape: 'run ' + i, ...(await info()) });
}
console.log(JSON.stringify({ suite, erreurs: errs }, null, 2));
await browser.close();
