import { open } from './_page.mjs';
import fs from 'node:fs';

// Le test du bloc 4 : le replay sous trois angles et le fantome du meilleur saut.
//   ./tools/run.sh replay.mjs [dossier de captures]
//
// Verifie, sur le Lysefjord pilote par __dods (trois sauts joues par script) :
// - la trace enregistree est le saut joue : le plongeur releve pendant la chute est
//   dans la trace interpolee au meme instant (limite serree en course, demi-metre en
//   chute libre ou une image vaut 40 cm) ;
// - les reperes sont ceux du saut : decollage et impact au bon temps de jeu, force
//   de gerbe conservee ;
// - la relecture pose l'echo exactement sur la trace, interpolee ici independamment ;
// - les trois angles donnent trois cameras distinctes (fov et position), et chacune
//   est capturee si un dossier est passe en argument ;
// - la gerbe du replay part a l'instant d'impact enregistre, a la frame pres ;
// - la relecture rend la main seule, et un seul geste la coupe et relance la boucle ;
// - le fantome du record rejoue au saut suivant : superpose au coureur pendant la
//   course (meme physique, donc meme chemin), translucide et sans ombre. Il est
//   encode a l'impact plus 0,8 s, donc plus court que la trace du saut (qui garde
//   la noyade) ;
// - il survit au rechargement, et un saut moins bon ne le remplace pas ;
// - les fleches tournent l'angle pendant la relecture, l'appui repete ne compte pas.

const CAPDIR = process.argv[2] || null;
if (CAPDIR) fs.mkdirSync(CAPDIR, { recursive: true });

const { browser, page, errs } = await open({ width: 1280, height: 800, lang: 'fr' });
const shot = async n => {
  await page.evaluate(() => window.__dods.draw());
  await page.screenshot({ path: `${CAPDIR}/${n}.png`, timeout: 120000 });
};

/* ---------- saut 1 : la trace, relevee pendant la chute ---------- */
const saut1 = await page.evaluate(() => {
  const d = window.__dods;
  const carte = () => document.querySelector('#s-jump').classList.contains('on');
  // interp de la trace recalculee ici : les portes ne croient pas le module sur parole
  const S = 43, DT = 1 / 60;
  const posAt = (buf, n, t) => {
    const last = n - 1;
    const ti = Math.max(0, Math.min(t, last * DT));
    const i0 = Math.min(last, Math.floor(ti / DT));
    const i1 = Math.min(last, i0 + 1);
    const k = i1 > i0 ? (ti - i0 * DT) / DT : 0;
    return [0, 1, 2].map(c => buf[i0 * S + c] + (buf[i1 * S + c] - buf[i0 * S + c]) * k);
  };
  d.state.spot = d.spots[5]; d.startRun();
  d.paused = true; d.slowmo = false;
  d.autoJump = 0.7; d.autoSteer = true; d.autoTuck = 0.15;
  const releves = [];
  let f = 0;
  while (f < 3000 && !carte()) {
    d.tick(1); f++;
    if (f % 15 === 0) releves.push({ t: d.rec.t, p: d.jump.diver.root.position.toArray() });
  }
  const ev = { ...d.rec.ev };
  let pire = 0, pireLim = 0, tous = true;
  for (const r of releves) {
    const q = posAt(d.rec.buf, d.rec.n, r.t);
    const e = Math.hypot(q[0] - r.p[0], q[1] - r.p[1], q[2] - r.p[2]);
    const lim = r.t < ev.takeoffT ? 0.15 : r.t <= ev.impactT ? 0.5 : 0.2;
    if (e > pire) { pire = e; pireLim = lim; }
    if (e > lim) tous = false;
  }
  return {
    frames: f, n: d.rec.n, dur: +d.rec.duration.toFixed(2), ev,
    fidelite: { releves: releves.length, pire: +pire.toFixed(3), pireLim, tous },
    score: d.state.last.score, grade: d.state.last.grade.key,
    vol: +(ev.impactT - ev.takeoffT).toFixed(2),
    ghostScore: d.ghosts.lysefjord ? d.ghosts.lysefjord.score : null,
    ghostN: d.ghosts.lysefjord ? d.ghosts.lysefjord.n : 0,
    stocke: (localStorage.getItem('dods3000.ghost.v1') || '').length
  };
});

/* ---------- la relecture, les fleches, puis le milieu du vol ---------- */
const rep = await page.evaluate(() => {
  const d = window.__dods;
  const r = {};
  d.startReplay();
  r.lance = !!d.replay;
  r.barre = document.querySelector('#replaybar').classList.contains('on');
  r.echoVisible = !!(d.echo && d.echo.diver.root.visible);
  r.plongeurCache = !d.jump.diver.root.visible;
  d.tick(20);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', cancelable: true }));
  r.flecheDroite = d.replay.angle === 1;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', repeat: true, cancelable: true }));
  r.flecheRepeat = d.replay.angle === 1;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', cancelable: true }));
  r.flecheGauche = d.replay.angle === 0;
  // jusqu'en plein vol : chaque angle sera stable 50 images plus loin
  const cible = (d.rec.ev.takeoffT + d.rec.ev.impactT) / 2 - 0.9;
  let f = 0;
  while (d.replay && d.replay.t < cible && f < 600) { d.tick(1); f++; }
  r.t = d.replay ? +d.replay.t.toFixed(2) : null;
  return r;
});

/* ---------- les trois angles, stabilises puis captures un par un ---------- */
const angles = [];
for (let i = 0; i < 3; i++) {
  const a = await page.evaluate(idx => {
    const d = window.__dods;
    d.setReplayAngle(idx);
    let tFire = null;
    for (let f = 0; f < 50; f++) {
      d.tick(1);
      if (d.replay && d.replay.fired && tFire === null) tFire = +d.replay.t.toFixed(3);
    }
    return {
      nom: ['suivi', 'bord', 'eau'][idx], angle: d.replay.angle,
      t: +d.replay.t.toFixed(2), tFire,
      fov: +d.camera.fov.toFixed(1), pos: d.camera.position.toArray().map(v => +v.toFixed(1))
    };
  }, i);
  angles.push(a);
  if (CAPDIR) await shot('angle-' + a.nom);
}

/* ---------- l'echo sur la trace, puis la fin de la relecture ---------- */
const echo = await page.evaluate(() => {
  const d = window.__dods;
  const S = 43, DT = 1 / 60;
  const posAt = (buf, n, t) => {
    const last = n - 1;
    const ti = Math.max(0, Math.min(t, last * DT));
    const i0 = Math.min(last, Math.floor(ti / DT));
    const i1 = Math.min(last, i0 + 1);
    const k = i1 > i0 ? (ti - i0 * DT) / DT : 0;
    return [0, 1, 2].map(c => buf[i0 * S + c] + (buf[i1 * S + c] - buf[i0 * S + c]) * k);
  };
  const t = d.replay ? d.replay.t : 0;
  const attendu = posAt(d.rec.buf, d.rec.n, t);
  const p = d.echo.diver.root.position.toArray();
  return { t: +t.toFixed(2), ecart: +Math.hypot(p[0] - attendu[0], p[1] - attendu[1], p[2] - attendu[2]).toFixed(4) };
});

const fin = await page.evaluate(() => {
  const d = window.__dods;
  const carte = () => document.querySelector('#s-jump').classList.contains('on');
  const r = {};
  let f = 0;
  while (d.replay && f < 400) { d.tick(1); f++; }
  r.arret = f;
  r.autoRetour = carte() && !d.replay;
  r.echoCache = !!(d.echo && !d.echo.diver.root.visible);
  r.plongeurRevu = !!d.jump.diver.root.visible;
  r.barreOff = !document.querySelector('#replaybar').classList.contains('on');
  // la carte a une garde anti double tap en temps reel : on la laisse passer
  const t0 = performance.now();
  while (performance.now() - t0 < 500) { }
  d.press();
  r.relanceMs = Math.round(performance.now() - t0);
  d.tick(1);
  r.relance = d.jump.state === 'walk';
  // le fantome du record : visible, superpose au coureur, translucide, sans ombre
  r.ghost = !!(d.ghostEcho && d.ghostEcho.diver.root.visible);
  let ecart = 99, ops = [], ombres = [];
  if (d.ghostEcho) {
    const g = d.ghostEcho.diver.root.position.toArray(), p = d.jump.diver.root.position.toArray();
    ecart = Math.hypot(g[0] - p[0], g[1] - p[1], g[2] - p[2]);
    d.ghostEcho.diver.root.traverse(o => {
      if (!o.isMesh) return;
      ops.push(o.material.opacity); ombres.push(o.castShadow);
    });
  }
  r.ghostEcart0 = +ecart.toFixed(3);
  r.ghostOpMax = ops.length ? Math.max(...ops) : 1;
  r.ghostOmbre = ombres.some(v => v);
  d.tick(60);
  const g2 = d.ghostEcho.diver.root.position.toArray(), p2 = d.jump.diver.root.position.toArray();
  r.ghostEcart1s = +Math.hypot(g2[0] - p2[0], g2[1] - p2[1], g2[2] - p2[2]).toFixed(3);
  r.ghostVisible1s = !!(d.ghostEcho && d.ghostEcho.diver.root.visible);
  return r;
});
if (CAPDIR) await shot('fantome-course');

/* ---------- rechargement : le fantome survit, le record tient ---------- */
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__dods, null, { timeout: 30000 });
await page.evaluate(() => { window.__dods.paused = true; window.__dods.render = false; });
await page.waitForFunction(() => window.__dods.world, null, { timeout: 30000 });
const apres = await page.evaluate(score1 => {
  const d = window.__dods;
  const carte = () => document.querySelector('#s-jump').classList.contains('on');
  const r = {};
  r.survit = !!(d.ghosts.lysefjord && d.ghosts.lysefjord.score === score1);
  // deuxieme visite du spot : le fantome doit revenir des la premiere image de course
  d.state.spot = d.spots[5]; d.startRun();
  d.paused = true; d.slowmo = false;
  d.autoJump = 0.7; d.autoSteer = true; d.autoTuck = 0.9; // fermeture trop tot : moins bon
  d.tick(1);
  r.recharge = !!(d.ghostEcho && d.ghostEcho.diver.root.visible);
  let f = 0;
  while (f < 3000 && !carte()) { d.tick(1); f++; }
  r.score2 = d.state.last.score;
  r.grade2 = d.state.last.grade.key;
  r.conserve = !!(d.ghosts.lysefjord && d.ghosts.lysefjord.score === score1);
  return r;
}, saut1.score);

/* ---------- les portes ---------- */
const portes = [];
const p = (nom, ok, detail) => portes.push({ nom, ok: !!ok, ...(detail ? { detail } : {}) });

p('la trace couvre le saut : course, vol, impact',
  saut1.n > 150 && saut1.vol > 1 && saut1.ev.power > 0.8 && !saut1.ev.dead,
  `${saut1.n} echantillons ${saut1.dur} s, vol ${saut1.vol} s, gerbe x${saut1.ev.power.toFixed(2)}`);
p('la trace est le saut joue : le plongeur releve est dedans',
  saut1.fidelite.tous,
  `${saut1.fidelite.releves} releves, pire ecart ${saut1.fidelite.pire} m (limite ${saut1.fidelite.pireLim})`);
p('les reperes sont ceux du saut',
  saut1.ev.takeoffT > 0.5 && saut1.ev.impactT > saut1.ev.takeoffT + 1,
  `decolle a ${saut1.ev.takeoffT.toFixed(2)} s, touche a ${saut1.ev.impactT.toFixed(2)} s`);
p('le record devient fantome des la carte',
  saut1.ghostScore === saut1.score
  && Math.abs(saut1.ghostN - Math.ceil((saut1.ev.impactT + 0.8) * 60)) <= 3
  && saut1.stocke > 1000,
  `fantome ${saut1.ghostScore} pts (${saut1.grade}) sur ${saut1.ghostN} images, ${saut1.stocke} octets en localStorage`);
p('la relecture demarre et cache le plongeur reel',
  rep.lance && rep.barre && rep.echoVisible && rep.plongeurCache, `a t=${rep.t} s`);
p('les fleches tournent l angle, l appui repete ne compte pas',
  rep.flecheDroite && rep.flecheRepeat && rep.flecheGauche, 'droite, repeat, gauche');
const fovOk = angles.every((a, i) => angles.slice(0, i).every(b => Math.abs(a.fov - b.fov) > 4));
const posOk = angles.every((a, i) => angles.slice(0, i).every(b =>
  Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) > 2));
p('trois angles, trois cameras distinctes',
  fovOk && posOk && angles.every(a => a.angle === angles.indexOf(a)),
  angles.map(a => `${a.nom} fov ${a.fov} a (${a.pos.join(', ')})`).join(' ; '));
p('l echo suit la trace interpolee ici',
  echo.ecart < 0.002, `ecart ${echo.ecart} m a t=${echo.t} s`);
const tFire = angles.map(a => a.tFire).find(v => v !== null) || null;
p('la gerbe du replay part a l impact enregistre',
  tFire !== null && Math.abs(tFire - saut1.ev.impactT) <= 0.03,
  tFire === null ? 'jamais vue' : `a ${tFire} s contre ${saut1.ev.impactT.toFixed(3)} s`);
p('la relecture rend la main seule',
  fin.autoRetour && fin.echoCache && fin.plongeurRevu && fin.barreOff,
  `apres ${fin.arret} images de plus`);
p('un seul geste relance le saut suivant',
  fin.relance && fin.relanceMs < 1000, `${fin.relanceMs} ms reel`);
p('le fantome rejoue la course : superpose, translucide, sans ombre',
  fin.ghost && fin.ghostEcart0 < 0.35 && fin.ghostEcart1s < 0.5 && fin.ghostVisible1s
  && fin.ghostOpMax <= 0.5 && !fin.ghostOmbre,
  `ecart ${fin.ghostEcart0} m au depart, ${fin.ghostEcart1s} m a 1 s, opacite max ${fin.ghostOpMax}`);
p('le fantome survit au rechargement',
  apres.survit && apres.recharge, `score ${saut1.score} retrouve, fantome des la 1re image`);
p('un saut moins bon ne remplace pas le record',
  apres.conserve && apres.score2 < saut1.score,
  `${apres.grade2} a ${apres.score2} pts contre le record ${saut1.score}`);
p('aucune erreur de page', errs.length === 0, errs.join(' ; ') || '0');

await browser.close();
console.log(JSON.stringify({ saut1, rep, angles, echo, tFire, fin, apres, portes, errs }, null, 1));
process.exit(portes.every(q => q.ok) ? 0 : 1);
