import { open } from './_page.mjs';

// Le test du bloc 6 : la couche sonore et le retour haptique.   ./tools/run.sh son.mjs
//
// Verifie, sur des sauts pilotes au spot le plus haut puis un plat, sans jamais
// ecouter (le harnais lit l'etat pose par le jeu dans probe(), un contexte
// AudioContext suspendu en headless ne change rien a ces valeurs) :
// - le vent monte avec la chute : le souffle s'ouvre vers l'aigu, le sifflement
//   ne parle qu'a grande vitesse ;
// - la foule du bord : un murmure qui grossit pendant l'elan, un souffle coupe
//   en vol, une ovation apres un beau saut, un ohhh decu sur un plat ;
// - l'impact sourd : la puissance mesuree arrive au sub, l'oreille s'etouffe sous
//   l'eau une demi-seconde puis le monde rouvre ;
// - le replay rejoue le plouf mais pas la clameur ;
// - la manette : dual-rumble aux memes instants que le mobile (decollage,
//   fermeture, eau), et le bouton muet coupe aussi la vibration.

const portes = [];
const p = (nom, ok, preuve) => portes.push({ porte: nom, ok: !!ok, preuve: String(preuve) });

const { browser, page, errs } = await open({ width: 1280, height: 800 });

// Un saut pilote au dernier spot, jusqu'a la carte complete. Relève au fil des
// frames ce que la couche sonore pose, sans ecouter.
const saut = (tuck) => page.evaluate(tk => {
  const d = window.__dods;
  d.show('run'); d.state.spot = d.spots[5]; d.startRun();
  d.paused = true; d.slowmo = false; d.autoJump = 0.7; d.autoSteer = true; d.autoTuck = tk;
  const r = {
    crowdDebut: -1, crowdElan: -1, crowdVolMax: 0,
    windMin: 9, windMax: -1, hzMin: 1e9, hzMax: -1, hissMax: 0,
    splash: null, muffleImpact: 0, t0: performance.now(), cheer0: d.audio.probe().cheer ? d.audio.probe().cheer.at : 0
  };
  const carte = () => document.querySelector('#s-jump').classList.contains('on');
  let f = 0;
  while (f < 4000 && !carte()) {
    const st = d.jump.state, pr = d.audio.probe();
    if (st === 'walk') {
      if (r.crowdDebut < 0) r.crowdDebut = pr.crowd;
      r.crowdElan = pr.crowd;
    } else if (st === 'fly') {
      r.crowdVolMax = Math.max(r.crowdVolMax, pr.crowd);
      r.windMin = Math.min(r.windMin, pr.wind); r.windMax = Math.max(r.windMax, pr.wind);
      r.hzMin = Math.min(r.hzMin, pr.windHz); r.hzMax = Math.max(r.hzMax, pr.windHz);
      r.hissMax = Math.max(r.hissMax, pr.hiss);
    }
    // l'etat sonore est global : ne relever que ce que CE saut vient de poser
    if (!r.splash && pr.splash && pr.splash.at > r.t0) { r.splash = pr.splash; r.muffleImpact = pr.muffle; }
    d.tick(1); f++;
  }
  let c = 0;
  while (c < 600 && !document.querySelector('#jr-crits').classList.contains('on')) { d.tick(1); c++; }
  const last = d.state.last;
  r.cadre = last ? { grade: last.grade.key, mark: last.judged.mark, dead: !!last.dead, power: last.power } : null;
  r.apres = d.audio.probe();
  return r;
}, tuck);

// 1. un beau saut : le vent, l'elan, l'ovation, l'impact
const s1 = await saut(0.16);
p('le murmure grossit pendant l\'elan',
  s1.crowdDebut >= 0 && s1.crowdElan > s1.crowdDebut + 0.1 && s1.crowdElan <= 0.7,
  `debut ${s1.crowdDebut}, plein elan ${s1.crowdElan}`);
p('le bord retient son souffle pendant le vol',
  s1.crowdVolMax <= 0.1,
  `max en vol ${s1.crowdVolMax}`);
p('le souffle du vent s\'ouvre avec la vitesse',
  s1.windMax - s1.windMin >= 0.3 && s1.hzMax > s1.hzMin * 1.25,
  `vent ${s1.windMin} a ${s1.windMax}, frequence ${s1.hzMin} a ${s1.hzMax} Hz`);
p('le sifflement ne parle qu\'a grande vitesse',
  s1.hissMax > 0.1,
  `max ${s1.hissMax}`);
p('l\'impact passe la puissance au sub',
  !!s1.splash && !s1.splash.dead && s1.splash.power >= 0.35,
  s1.splash ? `power ${s1.splash.power}` : 'aucun splash pose');
p('l\'oreille s\'etouffe sous l\'eau',
  s1.muffleImpact <= 1000 && s1.apres.muffle <= 1000,
  `a l'impact ${s1.muffleImpact} Hz, sur la carte ${s1.apres.muffle} Hz`);
p('la foule ovationne un beau saut',
  !!s1.apres.cheer && s1.apres.cheer.at > s1.t0 && !s1.apres.cheer.dead && s1.apres.cheer.mark === s1.cadre.mark && s1.apres.cheer.mark >= 8,
  s1.apres.cheer ? `ovation a ${s1.apres.cheer.mark}` : 'aucune clameur');
p('la foule se tait sur la carte',
  s1.apres.crowd === 0,
  `murmure residuel ${s1.apres.crowd}`);

// la reouverture se lit en temps reel : une demi-seconde sous l'eau, puis le monde
await page.waitForTimeout(750);
const rouvert = await page.evaluate(() => window.__dods.audio.probe().muffle);
p('l\'oreille rouvre pendant que la gerbe retombe', rouvert === 22050, `${rouvert} Hz`);

// 2. le replay rejoue le plouf, pas la clameur
const avantReplay = { splash: s1.splash.at, cheer: s1.apres.cheer.at };
await page.evaluate(() => window.__dods.startReplay());
await page.evaluate(() => {
  const d = window.__dods;
  let f = 0;
  while (f < 2000 && d.replay) { d.tick(1); f++; }
  return f;
});
const apresReplay = await page.evaluate(() => {
  const pr = window.__dods.audio.probe();
  return { splash: pr.splash ? pr.splash.at : 0, cheer: pr.cheer ? pr.cheer.at : 0 };
});
p('le replay rejoue le plouf pour de bon',
  apresReplay.splash > avantReplay.splash,
  `splash ${avantReplay.splash} puis ${apresReplay.splash}`);
p('une foule ne s\'excite pas deux fois du meme saut',
  apresReplay.cheer === avantReplay.cheer,
  `clameur ${avantReplay.cheer}, inchangee`);

// 3. la manette : une manette factice dont l'actuateur enregistre
await page.evaluate(() => {
  const calls = [];
  const fake = {
    connected: true, index: 0, id: 'dods-test', mapping: 'standard', buttons: [], axes: [0, 0, 0, 0],
    vibrationActuator: {
      playEffect: (type, o) => { calls.push({ type, duration: o.duration, strong: o.strongMagnitude }); return Promise.resolve('ok'); }
    }
  };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [fake], configurable: true });
  window.__vib = calls;
});
const s2 = await saut(0.16);
await page.waitForTimeout(400);
const vib = await page.evaluate(() => window.__vib.slice());
p('la manette frappe au decollage, a la fermeture et a l\'eau',
  vib.length >= 3,
  JSON.stringify(vib.map(v => v.duration)));
p('tout passe par dual-rumble, l\'eau frappe le plus fort',
  vib.length >= 3 && vib.every(v => v.type === 'dual-rumble') && Math.max(...vib.map(v => v.duration)) >= 60,
  vib.length ? `plus longue frappe ${Math.max(...vib.map(v => v.duration))} ms` : 'rien');

// 4. le bouton muet coupe aussi la manette, et le plat n'a qu'un ohhh decu
await page.evaluate(() => document.querySelector('#sound').click());
const avantMuet = await page.evaluate(() => window.__vib.length);
const s3 = await saut(null);
await page.waitForTimeout(400);
const apresMuet = await page.evaluate(() => window.__vib.length);
p('le bouton muet coupe aussi la manette',
  apresMuet === avantMuet && s3.cadre.dead,
  `${avantMuet} appels avant et ${apresMuet} apres`);
p('un plat leve un ohhh decu, pas une ovation',
  !!s3.apres.cheer && s3.apres.cheer.at > s3.t0 && s3.apres.cheer.dead && s3.apres.cheer.mark === 0 && !!s3.splash && s3.splash.dead,
  s3.apres.cheer ? `clameur morte a ${s3.apres.cheer.mark}` : 'aucune clameur');
await page.evaluate(() => document.querySelector('#sound').click());

p('aucune erreur de page', errs.length === 0, errs.join(' ; ') || '0');

await browser.close();
console.log(JSON.stringify({ portes, s1: s1.cadre, s3: s3.cadre }, null, 1));
process.exit(portes.every(q => q.ok) ? 0 : 1);
