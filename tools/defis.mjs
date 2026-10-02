import { open } from './_page.mjs';

// Le test du bloc 5 : la boucle de progression, trois defis par hauteur et hauteurs
// qui se debloquent.   ./tools/run.sh defis.mjs
//
// Verifie, joue par le vrai chemin (clic sur les cartes, vrais evenements pointeur
// pour la reception, page en francais) :
// - un nouveau joueur n'ouvre que Frognerbadet : les autres cartes sont fermées, le
//   cadenas dit combien de defis ouvrent la suite ;
// - un PERFECT coche le defi de fermeture, le lacher haut cocher l'entree sans les
//   mains : deux defis d'un seul saut ouvrent Rick's Cafe, le callout le dit ;
// - une fermeture GREAT coche le defi de gerbe (le seuil suit la force de gerbe
//   reellement mesuree a cette hauteur) ;
// - un plat ne coche rien : la progression ne recompense pas l'ecrasement ;
// - le spot d'apres reste ferme tant que ses defis ne sont pas faits, les points de
//   defis se lisent sur les cartes, la fiche liste les trois defis avec leur etat ;
// - les defis survivent au rechargement, et un record pose avant la v4.4 debloque
//   son spot (les joueurs de la v3 gardent leurs hauteurs) ;
// - les fleches parcourent la liste en sautant les cartes fermees.

const { browser, page, errs } = await open({ width: 1280, height: 800, lang: 'fr' });

/* ---------- releves ---------- */
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('dods3000.v1') || '{}'));
const cartes = () => page.evaluate(() => [...document.querySelectorAll('#spot-list .spot')].map(c => ({
  name: c.querySelector('.name').textContent,
  locked: c.classList.contains('locked'),
  disabled: c.disabled,
  pins: c.querySelectorAll('.pins i.on').length
})));

/* ---------- le vrai chemin jusqu'a la piste ---------- */
await page.click('#s-title .btn.big');
await page.waitForSelector('#s-spots.on');

// Un saut joue par __dods : autoJump au bord, autoSteer tient la planche, autoTuck
// lache a `ttc` secondes de l'eau. `doigt` pose un vrai doigt et le glisse (`dir`
// +1 haut, -1 bas) pour choisir la forme d'entree au lacher.
async function saut(ttc, doigt = 0) {
  await page.evaluate(t => {
    const d = window.__dods;
    d.paused = true; d.slowmo = false;
    d.autoJump = 0.7; d.autoSteer = true; d.autoTuck = t;
  }, ttc);
  if (doigt) {
    await page.evaluate(dir => {
      const d = window.__dods;
      let f = 0;
      while (f < 4000 && (d.jump.state !== 'fly' || d.jump.t < 0.35)) { d.tick(1); f++; }
      d.autoSteer = false; d.autoTuck = 0.15;
      const span = Math.max(60, window.innerHeight * 0.12);
      const ev = (type, y) => document.body.dispatchEvent(new PointerEvent(type, {
        pointerId: 41, clientX: 640, clientY: y, bubbles: true, cancelable: true,
        pointerType: 'touch', isPrimary: true
      }));
      ev('pointerdown', 400);
      ev('pointermove', 400 - dir * 0.85 * span);
    }, doigt);
  }
  const out = await page.evaluate(() => {
    const d = window.__dods;
    let toast = null, callout = null, f = 0;
    while (f < 6000 && !document.querySelector('#s-jump').classList.contains('on')) {
      d.tick(1); f++;
      const tt = document.querySelector('#toast')._t;
      if (tt) toast = tt;
      if (document.querySelector('#callout').classList.contains('pop'))
        callout = document.querySelector('#callout').textContent;
    }
    const r = d.state.last;
    return { grade: r.grade.key, landing: r.landingKey, power: +r.power.toFixed(3), toast, callout };
  });
  await page.evaluate(() => window.__dods.advance());
  return out;
}

/* ---------- portes ---------- */
const portes = [];
const p = (nom, ok, preuve) => portes.push({ porte: nom, ok: !!ok, preuve: String(preuve) });

const c0 = await cartes();
p('un nouveau joueur n\'ouvre que Frognerbadet',
  c0.filter(c => !c.locked).length === 1 && !c0[0].locked && c0[1].locked && c0[1].disabled,
  c0.map(c => `${c.name}${c.locked ? ' (fermé)' : ''}`).join(', '));
p('la carte fermée dit combien de defis ouvrent la suite',
  (await page.evaluate(() => document.querySelector('#spot-list .spot.locked .lock small').textContent))
    .includes('2 défis à Frognerbadet'),
  await page.evaluate(() => document.querySelector('#spot-list .spot.locked .lock small').textContent));

// Le run de Frognerbadet : trois sauts, trois defis, un raté.
await page.click('#spot-list .spot:not(.locked)');
await page.waitForSelector('#s-brief.on');
const fiche0 = await page.evaluate(() => ({
  defis: [...document.querySelectorAll('#brief-defis li')].map(li => li.textContent.trim()),
  done: document.querySelectorAll('#brief-defis li.done').length,
  open: document.querySelector('#brief-defis-open').textContent
}));
p('la fiche liste les trois defis et ce qu\'ils ouvrent',
  fiche0.defis.length === 3 && fiche0.done === 0
    && fiche0.open.includes("2 défis ici ouvrent Rick's Cafe"),
  `${fiche0.defis.length} défis (${fiche0.done} coché(s)), ligne "${fiche0.open}"`);
await page.click('#s-brief .btn.big');
await page.waitForSelector('#s-run.on');

const s1 = await saut(0.15, 1);
p('un seul saut coche fermeture parfaite et entree sans les mains',
  s1.grade === 'perfect' && s1.landing === 'nohands' && s1.toast.includes('fenêtre parfaite')
    && s1.toast.includes('sans les mains'),
  `${s1.grade}, ${s1.landing}, toast "${s1.toast}"`);
p('deux defis d\'un coup ouvrent le spot suivant, le callout le dit',
  s1.callout.includes("Rick's Cafe") && s1.callout.includes('DÉBLOQUÉ'),
  `callout "${s1.callout}"`);
const s2 = await saut(0.45);
const sv = await save();
// le seuil se lit dans la page, depuis le module des defis : la porte ne croit pas
// une constante recopiee
const seuil = await page.evaluate(async () =>
  (await import('/src/defis.js')).defisFor(window.__dods.spots[0]).find(d => d.key === 'gerbe').min);
p('une fermeture GREAT passe le seuil de gerbe et coche le defi',
  s2.grade === 'great' && s2.power >= seuil && sv.defis.frogner.gerbe === 1,
  `${s2.grade}, power ${s2.power} >= ${seuil.toFixed(4)}, gerbe cochée`);
p('trois defis sur trois, le spot d\'apres reste a ouvrir par ses propres defis',
  Object.values(sv.defis.frogner).filter(Boolean).length === 3,
  JSON.stringify(sv.defis.frogner));
const s3 = await saut(null);
p('un plat ne coche aucun defi et termine le run',
  s3.grade === 'smack' && Object.values((await save()).defis.frogner).filter(Boolean).length === 3
    && (await page.evaluate(() => document.querySelector('#s-end').classList.contains('on'))),
  `${s3.grade}, écran de fin affiché, defis inchangés`);

// Retour a la liste : Rick's ouvert, les points se lisent, Blue Lagoon toujours fermée.
await page.click('#s-end .btn.ghost');
await page.waitForSelector('#s-spots.on');
const c1 = await cartes();
p('Rick\'s Cafe est ouvert, Blue Lagoon attend ses defis',
  !c1[1].locked && c1[1].pins === 0 && c1[2].locked && c1[2].disabled,
  c1.map(c => `${c.name}${c.locked ? ' (fermé)' : ` ${c.pins}/3`}`).join(', '));
p('Frognerbadet porte ses trois points de defis', c1[0].pins === 3, `${c1[0].pins}/3`);

// La fiche du spot ouvert montre les defis coches.
await page.click('#spot-list .spot:not(.locked):nth-child(2)');
await page.waitForSelector('#s-brief.on');
const done2 = await page.evaluate(() => document.querySelectorAll('#brief-defis li.done').length);
p('la fiche d\'un spot neuf n\'a aucun defi coché', done2 === 0, `${done2} coché(s)`);

// Les fleches sautent les cartes fermees (de retour sur la liste).
await page.click('#s-brief .btn.ghost');
await page.waitForSelector('#s-spots.on');
const nav = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#spot-list .spot:not(.locked)')];
  cards[0].focus();
  const kd = key => document.activeElement.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  kd('ArrowRight');
  const a = document.activeElement.textContent.trim().slice(0, 12);
  kd('ArrowRight');
  const b = document.activeElement.textContent.trim().slice(0, 12);
  kd('Home');
  const h = document.activeElement.textContent.trim().slice(0, 12);
  return { a, b, h };
});
p('les fleches sautent les cartes fermees',
  nav.a.includes("Rick's") && nav.b.includes("Rick's") && nav.h.includes('Frogner'),
  JSON.stringify(nav));

// Tout cela survit au rechargement.
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 30000 });
await page.click('#s-title .btn.big');
await page.waitForSelector('#s-spots.on');
const c2 = await cartes();
p('les defis et le deblocage survivent au rechargement',
  c2[0].pins === 3 && !c2[1].locked && c2[2].locked,
  c2.map(c => `${c.name}${c.locked ? ' (fermé)' : ` ${c.pins}/3`}`).join(', '));

await browser.close();

// Un record pose avant la v4.4 vaut deblocage : les joueurs de la v3 gardent leurs spots.
{
  const { browser: b2, page: pg, errs: e2 } = await open({ width: 1280, height: 800, lang: 'fr',
    save: { best: { comino: 4125 }, jumps: 12 } });
  await pg.click('#s-title .btn.big');
  await pg.waitForSelector('#s-spots.on');
  const c3 = await pg.evaluate(() => [...document.querySelectorAll('#spot-list .spot')].map(c => ({
    name: c.querySelector('.name').textContent, locked: c.classList.contains('locked')
  })));
  p('un record d\'avant la v4.4 debloque son spot, les defis restent a cocher',
    !c3[2].locked && c3[1].locked && c3[2].name === 'Blue Lagoon',
    c3.map(c => `${c.name}${c.locked ? ' (fermé)' : ''}`).join(', '));
  p('aucune erreur de page (record pose)', e2.length === 0, e2.join(' ; ') || '0');
  await b2.close();
}

p('aucune erreur de page', errs.length === 0, errs.join(' ; ') || '0');

console.log(JSON.stringify({ portes, s1, s2, s3 }, null, 1));
process.exit(portes.every(q => q.ok) ? 0 : 1);
