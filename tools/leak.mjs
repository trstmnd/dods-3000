import { open } from './_page.mjs';

// Memoire GPU run apres run, en changeant de spot : chaque monde remplace doit etre
// libere (invariant 10), et rejouer le meme spot ne doit rien reconstruire.
const { browser, page, errs } = await open();
const info = () => page.evaluate(() => ({ ...window.__dods.renderer.info.memory, programmes: window.__dods.renderer.info.programs.length }));
const suite = [];
suite.push({ etape: 'menu', ...(await info()) });
const plan = [0, 0, 3, 5, 3, 0, 1, 1];
for (let i = 0; i < plan.length; i++) {
  await page.evaluate(k => {
    const d = window.__dods;
    d.state.spot = d.spots[k]; d.startRun(); d.paused = true; d.autoJump = 0.7; d.autoTuck = 0.15;
    let f = 0; while (f++ < 3000 && !document.querySelector('#s-jump').classList.contains('on')) d.tick(1);
    d.draw();
  }, plan[i]);
  suite.push({ etape: `run ${i + 1} spot ${plan[i]}`, ...(await info()) });
}
console.log(JSON.stringify({ suite, erreurs: errs }, null, 2));
await browser.close();
