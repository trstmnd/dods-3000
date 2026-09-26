import { open } from './_page.mjs';

// Les quatre cas de fermeture, et la mise en direct contre le score encaisse.
const { browser, page, errs } = await open();

async function saut(tuck, slowmo, spot = 0) {
  return await page.evaluate(([tuck, slowmo, spot]) => {
    const d = window.__dods;
    d.slowmo = slowmo;
    d.state.spot = d.spots[spot];
    d.startRun();
    d.paused = true; d.autoJump = 0.7; d.autoTuck = tuck;
    let frames = 0;
    while (frames < 3000 && !document.querySelector('#s-jump').classList.contains('on')) { d.tick(1); frames++; }
    const r = d.state.last;
    d.autoJump = null; d.autoTuck = null;
    return {
      frames,
      grade: r.grade.key, score: r.score, ttc: +r.ttc.toFixed(3), air: +r.air.toFixed(3),
      texte: document.querySelector('#jr-timing').textContent,
      repere: document.querySelector('#jr-gauge .g-mark').style.left
    };
  }, [tuck, slowmo, spot]);
}
const out = {};
out.perfectSansRalenti = await saut(0.15, false);
out.perfectAvecRalenti = await saut(0.15, true);
out.tropTot = await saut(0.55, true);
out.tropTard = await saut(0.03, true);
out.jamaisLache = await saut(null, true);
out.lysefjordPerfect = await saut(0.15, true, 5);

// La mise affichee pendant la chute vaut exactement ce que le lacher encaisse.
out.mise = await page.evaluate(() => {
  const d = window.__dods; d.state.spot = d.spots[3]; d.startRun(); d.paused = true; d.autoJump = 0.7; d.autoTuck = null;
  let n = 0; while (d.jump.state === 'walk' && n++ < 400) d.tick(1);
  d.autoJump = null;
  const suite = [];
  for (const target of [1.2, 0.5, 0.3, 0.2]) {
    while (d.jump.ttc > target && n++ < 3000) d.tick(1);
    const p = d.jump.potential();
    suite.push({ ttc: +p.ttc.toFixed(3), note: p.grade.key, mise: p.score, affiche: document.querySelector('#pot').textContent });
  }
  const mise = d.jump.potential().score;
  d.up();
  let m = 0; while (!document.querySelector('#s-jump').classList.contains('on') && m++ < 3000) d.tick(1);
  return { suite, miseAuLacher: mise, encaisse: d.state.last.score, egal: mise === d.state.last.score };
});
out.erreurs = errs;
console.log(JSON.stringify(out, null, 2));
await browser.close();
