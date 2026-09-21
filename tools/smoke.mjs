import { chromium } from 'playwright';

// Chromium fourni par l'environnement, ou celui du systeme via la variable CHROME.
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:8099/?cb=' + Date.now();
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
const browser = await chromium.launch({ executablePath: CHROME, proxy, args: ['--ignore-certificate-errors', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 820 }, isMobile: false });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 20000 });
const out = {};

// 1. ecran titre puis run sur le premier spot
out.version = await page.textContent('#version');
await page.evaluate(() => { window.__dods.show('run'); window.__dods.startRun(); });
await page.waitForTimeout(300);

// 2. un saut pilote : decollage a 0,7 m du bord, tuck a 0,15 s de l impact
await page.evaluate(() => { const d = window.__dods; d.paused = true; d.autoJump = 0.7; d.autoTuck = 0.15; });
out.tickWalk = await page.evaluate(() => window.__dods.tick(120));
out.tickFly = await page.evaluate(() => window.__dods.tick(200));
out.score = await page.evaluate(() => window.__dods.state.last && { grade: window.__dods.state.last.grade.key, score: window.__dods.state.last.score });

// 3. pause a la perte de focus pendant la chute
await page.evaluate(() => {
  const d = window.__dods; d.paused = false; d.autoJump = null; d.autoTuck = null;
  d.show('run'); d.startRun(); d.press();
});
await page.waitForTimeout(200);
const before = await page.evaluate(() => ({ y: window.__dods.jump.pos.y, state: window.__dods.jump.state }));
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(500);
const during = await page.evaluate(() => ({ y: window.__dods.jump.pos.y, shown: document.querySelector('#pause').classList.contains('on') }));
out.pause = { fly: before.state, gele: Math.abs(during.y - before.y) < 0.35, carton: during.shown };
await page.screenshot({ path: 'pause.png' });
await page.click('#pause-resume');
await page.waitForTimeout(400);
out.pause.reprend = await page.evaluate(() => window.__dods.jump.pos.y < 0.01 ? 'arrive' : 'en chute');
out.pause.cartonFerme = await page.evaluate(() => !document.querySelector('#pause').classList.contains('on'));

// 4. coupure du son memorisee
await page.click('#sound');
out.mute = await page.evaluate(() => ({ classe: document.querySelector('#sound').className, store: JSON.parse(localStorage.getItem('dods3000.v1')).muted }));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 20000 });
out.muteApresRechargement = await page.evaluate(() => document.querySelector('#sound').classList.contains('muted'));

// 5. mouvement reduit : la page ne casse pas et le score ne bouge pas
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.evaluate(() => { const d = window.__dods; d.show('run'); d.startRun(); d.paused = true; d.autoJump = 0.7; d.autoTuck = 0.15; });
await page.evaluate(() => window.__dods.tick(120));
await page.evaluate(() => window.__dods.tick(200));
out.scoreMouvementReduit = await page.evaluate(() => window.__dods.state.last && { grade: window.__dods.state.last.grade.key, score: window.__dods.state.last.score });
await page.screenshot({ path: 'run.png' });

out.erreurs = errs;
console.log(JSON.stringify(out, null, 2));
await browser.close();
