import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 820 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods, null, { timeout: 20000 });
// trois sauts parfaits d affilee, puis un run ou le deuxieme saut est rate
const out = await page.evaluate(async () => {
  const d = window.__dods;
  const res = [];
  async function run(tucks) {
    d.show('run'); d.startRun();
    d.paused = true; d.slowmo = false; d.autoJump = 0.7;
    const suite = [];
    for (const t of tucks) {
      d.autoTuck = t;
      let f = 0;
      while (f < 3000 && !document.querySelector('#s-jump').classList.contains('on')) { d.tick(1); f++; }
      const r = d.state.last;
      suite.push({
        grade: r.grade.key, brut: r.score, serie: d.state.streak,
        hud: document.querySelector('#hud-streak').textContent,
        cumul: d.state.runScore,
        lignes: [...document.querySelectorAll('#jr-lines li')].map(li => li.textContent)
      });
      document.querySelector('#jr-next').click();
    }
    return suite;
  }
  res.push(await run([0.15, 0.15, 0.15]));
  res.push(await run([0.15, 0.9, 0.15]));
  return res;
});
console.log(JSON.stringify({ out, errs }, null, 1));
await browser.close();
