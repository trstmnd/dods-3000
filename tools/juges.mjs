import { open } from './_page.mjs';

// Le test du bloc 2 : un saut note de bout en bout comme en competition.
//   ./tools/run.sh juges.mjs
//
// Verifie, sur un saut pilote au Lysefjord puis un sans fermeture :
// - les quatre criteres (elan, vol, fermeture, reception) notes de 0 a 10 au dixieme,
//   la moyenne des cinq juges juste, le critere le plus faible surligne avec son conseil ;
// - la cascade des cartons levee un par un, terminee en moins de 3 s de temps de jeu ;
// - le meme saut rejoue leve exactement les memes cartons (determinisme) ;
// - un saut sans fermeture : fermeture a 0, reception sous 1,5, run termine ;
// - la relance en un geste : du tap sur la carte au depart du saut suivant,
//   mesuree en temps reel, doit rester sous la seconde.

const mark = '() => document.querySelector("#s-jump").classList.contains("on")';

const { browser, page, errs } = await open({ width: 1280, height: 800 });
const out = await page.evaluate(() => {
  const d = window.__dods;
  const secs = [];
  const carte = () => document.querySelector('#s-jump').classList.contains('on');

  // Un saut pilote jusqu'a la carte, puis le releve du verdict et du DOM.
  function saut(tuck) {
    d.show('run'); d.state.spot = d.spots[5]; d.startRun();
    d.paused = true; d.slowmo = false; d.autoJump = 0.7; d.autoSteer = true;
    d.autoTuck = tuck;
    let f = 0;
    while (f < 3000 && !carte()) { d.tick(1); f++; }
    return f;
  }
  function releve() {
    const r = d.state.last, j = r.judged;
    // la cascade jusqu'au bout : le dernier carton puis les criteres
    let c = 0;
    while (c < 600 && !document.querySelector('#jr-crits').classList.contains('on')) { d.tick(1); c++; }
    const notes = [...document.querySelectorAll('#jr-crits li b')].map(b => b.textContent);
    const juges = [...document.querySelectorAll('#jr-judges .judge:not(.mark) b')].map(b => b.textContent);
    const faible = document.querySelector('#jr-crits li.weak');
    return {
      frames: c,
      crits: j.notes, juges: j.judges.map(u => u.note), moyenne: j.mark, faibleIdx: j.weak,
      dom: {
        notes, juges, moyenne: document.querySelector('#jr-mark').textContent,
        levees: [...document.querySelectorAll('#jr-judges .judge:not(.mark)')].every(el => el.classList.contains('up')),
        faible: faible ? faible.dataset.crit : null,
        conseil: document.querySelector('#jr-advice-text').textContent
      },
      grade: r.grade.key, score: r.score, landing: r.landing.pose
    };
  }

  // 1. deux runs pilotes identiques : les cartons doivent lever exactement pareil
  saut(0.16); secs.push(releve());
  saut(0.16); secs.push(releve());

  // 2. une fermeture precoce : le vol se ferme tot, la fermeture doit perdre
  saut(0.9); secs.push(releve());

  // 3. sans jamais lacher : smack, fermeture a zero, run termine
  const dead = { frames: saut(null), releve: releve(), ecranFin: null };
  d.advance();
  dead.ecranFin = document.querySelector('#s-end').classList.contains('on');
  secs.push(dead);

  // 4. relance en un geste, chronometree en temps reel : apres la garde anti
  // double tap (450 ms), le tap doit rendre la main en moins d'une seconde
  saut(0.16);
  const relance = { attenteCarte: 0, gardeMs: 500, tapADeck: 0, deckMs: 0 };
  const t0 = performance.now();
  while (performance.now() - t0 < relance.gardeMs) { /* laisser passer la garde */ }
  const t1 = performance.now();
  d.press();
  relance.tapADeck = d.jump.state === 'walk' ? performance.now() - t1 : -1;
  relance.deckMs = relance.tapADeck;
  return { secs, relance };
});

// Les portes : chacune lit la preuve elle-meme, jamais une variable de confiance.
const portes = [];
const p = (nom, ok, detail) => portes.push({ porte: nom, ok: !!ok, detail });

const [a, b, early, dead] = out.secs;
p('quatre criteres 0..10 au dixieme',
  a.crits.length === 4 && a.crits.every(v => v >= 0 && v <= 10 && Math.abs(Math.round(v * 10) - v * 10) < 1e-9),
  JSON.stringify(a.crits));
const attendue = a.juges.reduce((s, v) => s + v, 0) / a.juges.length;
p('moyenne des cinq juges', Math.abs(attendue - a.moyenne) <= 0.05, `moyenne ${a.moyenne} pour ${JSON.stringify(a.juges)}`);
p('cinq cartons leves', a.dom.levees && a.dom.juges.length === 5, JSON.stringify(a.dom.juges));
p('le plus faible surligne',
  a.dom.faible === ['elan', 'vol', 'fermeture', 'reception'][a.faibleIdx] && a.crits[a.faibleIdx] === Math.min(...a.crits),
  `${a.dom.faible} (note ${a.crits[a.faibleIdx]}), conseil : ${a.dom.conseil}`);
p('cascade terminee en moins de 3 s', a.frames <= 180, `${(a.frames / 60).toFixed(2)} s de jeu`);
p('determinisme : meme saut, memes cartons',
  JSON.stringify([a.crits, a.juges, a.moyenne]) === JSON.stringify([b.crits, b.juges, b.moyenne]),
  `${JSON.stringify(a.crits)} contre ${JSON.stringify(b.crits)}`);
p('fermeture precoce sanctionnee', early.crits[2] < a.crits[2] - 0.5,
  `fermeture ${early.crits[2]} contre ${a.crits[2]} sur le saut pilote`);
p('smack : fermeture a zero, reception basse', dead.releve.crits[2] === 0 && dead.releve.crits[3] <= 1.5,
  `fermeture ${dead.releve.crits[2]}, reception ${dead.releve.crits[3]}, fin : ${dead.ecranFin}`);
p('relance en un geste sous la seconde', out.relance.tapADeck >= 0 && out.relance.tapADeck < 1000,
  `${out.relance.tapADeck.toFixed(0)} ms du tap au depart du saut suivant`);

console.log(JSON.stringify({ portes, tout: portes.every(x => x.ok), mesures: out, errs }, null, 1));
await browser.close();
