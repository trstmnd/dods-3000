import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 820 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:8099/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods, null, { timeout: 20000 });

async function saut(tuck, slowmo) {
  return await page.evaluate(([tuck, slowmo]) => {
    const d = window.__dods;
    d.slowmo = slowmo;
    d.show('run'); d.startRun();
    d.paused = true; d.autoJump = 0.7; d.autoTuck = tuck;
    let frames = 0;
    while (frames < 3000 && !document.querySelector('#s-jump').classList.contains('on')) { d.tick(1); frames++; }
    const r = d.state.last;
    return {
      frames,
      grade: r.grade.key, score: r.score, ttc: +r.ttc.toFixed(3),
      texte: document.querySelector('#jr-timing').textContent,
      repere: document.querySelector('#jr-gauge .g-mark').style.left,
      perfect: document.querySelector('#jr-gauge .g-zone.perfect').style.left
    };
  }, [tuck, slowmo]);
}
const out = {};
out.perfectSansRalenti = await saut(0.15, false);
out.perfectAvecRalenti = await saut(0.15, true);
out.tropTot = await saut(0.55, true);
out.tropTard = await saut(0.03, true);
out.jamaisReferme = await saut(null, true);
await page.screenshot({ path: 'resultat.png' });
out.erreurs = errs;
console.log(JSON.stringify(out, null, 2));
await browser.close();
