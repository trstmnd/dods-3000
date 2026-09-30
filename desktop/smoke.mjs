// Lance la vraie fenetre Electron, sans reseau, et verifie que le jeu demarre : monde
// construit, aucune erreur, Three.js servi en local. Capture dans dist/smoke.png.
//   node build.mjs stage && node smoke.mjs [executable]
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
const exe = process.argv[2];
const app = await electron.launch(exe ? { executablePath: exe, args: [], env: { ...process.env, DODS_NO_STEAM: '1', DODS_WINDOWED: '1' } } : { args: ['.'], cwd: new URL('.', import.meta.url).pathname, env: { ...process.env, DODS_NO_STEAM: '1', DODS_WINDOWED: '1' } });
const page = await app.firstWindow();
const errs = [], net = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('request', r => { if (!r.url().startsWith('app://') && !r.url().startsWith('data:')) net.push(r.url()); });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 30000 });
const info = await page.evaluate(async () => ({
  desktop: !!window.dodsDesktop,
  steam: window.dodsDesktop ? await window.dodsDesktop.steam() : null,
  three: [...document.scripts].some(s => s.type === 'importmap' && s.textContent.includes('./vendor/')),
  taille: [innerWidth, innerHeight]
}));
await page.waitForTimeout(800);
fs.mkdirSync('dist', { recursive: true });
await page.screenshot({ path: 'dist/smoke.png' });
await app.close();
const ok = info.desktop && info.three && !errs.length && !net.length;
console.log(JSON.stringify({ ok, ...info, erreurs: errs, reseau: net }, null, 1));
process.exitCode = ok ? 0 : 1;
