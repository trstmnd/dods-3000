import { chromium } from 'playwright';
import { CHROME } from './_page.mjs';

// Cout d'une image, par phase de jeu. Rendu logiciel : les millisecondes ne disent rien
// d'un telephone, mais le RAPPORT entre deux versions mesurees ici, oui (meme machine,
// meme resolution, meme scene). Usage : node perf.mjs [port] [largeur] [hauteur]
//   PORT 8099 = version en cours, un autre port = une autre version servie a cote.
const [port = '8099', W = '390', H = '844'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/?cb=${Date.now()}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 30000 });
await page.evaluate(() => {
  const d = window.__dods;
  if (d.quality) d.quality.on = false;
  d.renderer.setPixelRatio(1);
  window.__cost = (n = 8) => {
    const gl = d.renderer.getContext();
    const w = d.world;
    // gl.finish() ne bloque pas sous swiftshader : relire un pixel force la fin du rendu
    const px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    d.renderer.render(w.scene, d.camera); sync();
    const t = performance.now();
    for (let i = 0; i < n; i++) { d.renderer.render(w.scene, d.camera); sync(); }
    const info = d.renderer.info.render;
    return { ms: +((performance.now() - t) / n).toFixed(1), tri: info.triangles, draws: info.calls };
  };
});
const out = { version: await page.textContent('#version') };
out.menu = await page.evaluate(() => window.__cost());
// la meme scene pour les deux versions : le spot par defaut, Frognerbadet
await page.evaluate(() => {
  const d = window.__dods;
  if (d.render !== undefined) d.render = false;
  d.startRun(); d.paused = true; d.autoJump = 0.7; d.autoTuck = 0.15;
  d.tick(40);
});
out.elan = await page.evaluate(() => window.__cost());
await page.evaluate(() => { const d = window.__dods; let n = 0; while (d.jump.state === 'walk' && n++ < 300) d.tick(1); d.tick(40); });
out.chute = await page.evaluate(() => window.__cost());
await page.evaluate(() => { const d = window.__dods; let n = 0; while (d.jump.state === 'fly' && n++ < 400) d.tick(1); d.tick(8); });
out.gerbe = await page.evaluate(() => window.__cost());

// cout CPU de la logique seule, et memoire allouee par image
out.logique = await page.evaluate(() => {
  const d = window.__dods;
  if (d.render === undefined) return 'non mesurable (rendu a chaque tick)';
  d.render = false; d.startRun(); d.paused = true; d.autoJump = 0.7; d.autoTuck = 0.15;
  window.gc && window.gc();
  const m0 = performance.memory.usedJSHeapSize, t0 = performance.now();
  let frames = 0;
  while (frames < 240) { d.tick(1); frames++; }
  const dt = performance.now() - t0, dm = performance.memory.usedJSHeapSize - m0;
  return { msParImage: +(dt / frames).toFixed(3), octetsParImage: Math.round(dm / frames) };
});
out.erreurs = errs;
console.log(JSON.stringify(out, null, 2));
await browser.close();
