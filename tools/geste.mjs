import { open } from './_page.mjs';

// Le geste v2 avec de vrais evenements : clavier, souris, doigts, perte de focus.
// La simulation est figee (paused), donc chaque evenement tombe a un etat connu.
const { browser, page, errs } = await open({ touch: false });
const S = () => page.evaluate(() => { const j = window.__dods.jump; return { state: j.state, held: j.held, tucked: j.tucked, grade: j.grade && j.grade.key }; });
const fresh = () => page.evaluate(() => { const d = window.__dods; d.state.spot = d.spots[1]; d.startRun(); d.paused = true; d.tick(90); });
const tick = n => page.evaluate(n => window.__dods.tick(n), n);
const ptr = (type, id, target = '#scene') => page.evaluate(([type, id, target]) => {
  const el = document.querySelector(target);
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 1, button: 0 }));
}, [type, id, target]);
const out = {};

// 1. Espace : appuyer decolle, la repetition est ignoree, lacher referme
await fresh();
await page.keyboard.down('Space');
const a1 = await S();
await page.keyboard.down('Space'); // repetition auto
await tick(20);
const a2 = await S();
await page.keyboard.up('Space');
const a3 = await S();
out.clavier = { apresAppui: a1, apresRepetition: a2, apresLacher: a3, ok: a1.state === 'fly' && a1.held && a2.held && !a2.tucked && a3.tucked };

// 2. Souris
await fresh();
await page.mouse.move(200, 400); await page.mouse.down();
const b1 = await S(); await tick(15);
await page.mouse.up();
const b2 = await S();
out.souris = { ok: b1.state === 'fly' && b1.held && b2.tucked };

// 3. Deux doigts : le second ne fait rien, le geste finit quand le dernier se leve
await fresh();
await ptr('pointerdown', 1); await ptr('pointerdown', 2);
await tick(10);
await ptr('pointerup', 1);
const c1 = await S();
await ptr('pointerup', 2);
const c2 = await S();
out.deuxDoigts = { apresPremierLeve: c1, apresSecond: c2, ok: c1.held && !c1.tucked && c2.tucked };

// 4. pointercancel vaut un lacher
await fresh();
await ptr('pointerdown', 7); await tick(10); await ptr('pointercancel', 7);
out.cancel = { ok: (await S()).tucked };

// 5. Perte de focus en plein maintien : pause, le corps reste ouvert, reprise par un nouvel appui
await fresh();
await ptr('pointerdown', 3); await tick(10);
await page.evaluate(() => { window.__dods.paused = false; window.dispatchEvent(new Event('blur')); });
const d1 = await page.evaluate(() => ({ pause: document.querySelector('#pause').classList.contains('on'), held: window.__dods.jump.held, tucked: window.__dods.jump.tucked, texte: document.querySelector('#pause-resume').textContent }));
await ptr('pointerup', 3); // le doigt parti pendant la pause ne ferme rien
const d2 = await S();
await page.evaluate(() => { window.__dods.paused = true; });
await ptr('pointerdown', 4, '#pause-resume');
const d3 = await page.evaluate(() => ({ pause: document.querySelector('#pause').classList.contains('on'), held: window.__dods.jump.held }));
await tick(5);
await ptr('pointerup', 4, '#pause-resume');
const d4 = await S();
out.perteFocus = { pendant: d1, doigtLevePendantPause: d2, reprise: d3, lacher: d4, ok: d1.pause && !d1.held && !d2.tucked && !d3.pause && d3.held && d4.tucked };

// 6. Lacher perdu (souris relachee hors fenetre) : le prochain appui le solde
await fresh();
await ptr('pointerdown', 1); await tick(10);
await ptr('pointerdown', 1);
out.lacherPerdu = { ok: (await S()).tucked };

// 7. Le bouton GO clique a la souris ne vole pas l'Espace suivant
await page.evaluate(() => { const d = window.__dods; d.openBrief(d.spots[1]); });
await page.waitForTimeout(400);
await page.click('#s-brief [data-go="run"]');
await page.evaluate(() => { const d = window.__dods; d.paused = true; d.tick(90); });
await page.keyboard.down('Space');
const g1 = await S();
await page.keyboard.up('Space');
out.focusBouton = { focus: await page.evaluate(() => document.activeElement.tagName), ok: g1.state === 'fly' };

// 8. Carte de resultat : un tap trop tot est ignore, un tap ensuite enchaine
await page.evaluate(() => { const d = window.__dods; d.paused = true; d.autoTuck = null; let f = 0; while (f++ < 3000 && !document.querySelector('#s-jump').classList.contains('on')) d.tick(1); });
const before = await page.evaluate(() => window.__dods.state.jumpIndex);
await ptr('pointerdown', 9, '#s-jump'); await ptr('pointerup', 9, '#s-jump');
const tooEarly = await page.evaluate(() => document.querySelector('#s-jump').classList.contains('on'));
await page.waitForTimeout(500);
await ptr('pointerdown', 9, '#s-jump'); await ptr('pointerup', 9, '#s-jump');
const after = await page.evaluate(() => ({ idx: window.__dods.state.jumpIndex, carte: document.querySelector('#s-jump').classList.contains('on'), state: window.__dods.jump.state }));
out.carte = { tapTropTotIgnore: tooEarly, apres: after, ok: tooEarly && after.idx === before + 1 && !after.carte && after.state === 'walk' };

// 9. Appui long : pas de menu contextuel pendant le jeu
out.menuContextuel = await page.evaluate(() => {
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  document.querySelector('#scene').dispatchEvent(ev);
  return { bloque: ev.defaultPrevented };
});

// 10. Precision : lacher `late` secondes apres l'image vaut lacher a cet instant exact
out.precision = await page.evaluate(() => {
  const d = window.__dods; d.state.spot = d.spots[4]; d.startRun(); d.paused = true; d.autoJump = 0.7;
  let n = 0; while (d.jump.state === 'walk' && n++ < 400) d.tick(1);
  d.autoJump = null;
  while (d.jump.ttc > 0.33) d.tick(1);
  const avant = d.jump.ttc;
  d.jump.up(0.012);
  return { ttcImage: +avant.toFixed(4), ttcLacher: +d.jump.tuckTtc.toFixed(4), ecart: +(avant - d.jump.tuckTtc - 0.012).toFixed(5) };
});
out.precision.ok = Math.abs(out.precision.ecart) < 1e-3;

out.erreurs = errs;
out.tousOk = Object.values(out).every(v => !v || typeof v !== 'object' || Array.isArray(v) || v.ok !== false) && errs.length === 0 && out.menuContextuel.bloque;
console.log(JSON.stringify(out, null, 2));
await browser.close();
