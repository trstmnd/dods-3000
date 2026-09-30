import { open } from '../_page.mjs';

// Joueur simule : des milliers de sauts joues comme un humain, avec un temps de
// reaction, un retard de lecture de la planche et du bruit. On ne mesure pas si le jeu
// est juste (timing.mjs le fait), on mesure s'il est JOUABLE : combien de smacks pour
// un debutant, combien de PERFECT pour un joueur regulier, et si la difficulte monte
// bien d'un spot a l'autre.
//
//   ./tools/run.sh gauntlet/bot.mjs [runsParSpot=30] [sortie.json]
//
// Les profils sont des HYPOTHESES, pas des mesures de joueurs reels : ils servent a
// comparer deux versions entre elles et a reperer une marche de difficulte absurde.

const RUNS = +(process.argv[2] || 30);
const OUT = process.argv[3] || '';

// vise : ou le joueur essaie d'appuyer (m avant le bord) et de lacher (s avant l'eau).
// sd : ecart type humain. lag : retard de lecture de la planche. gain : force de la
// correction. noise : tremblement du doigt. steerP : part des sauts ou il pilote.
const PROFILES = {
  debutant: { jumpAim: 1.6, jumpSd: 0.40, tuckAim: 0.30, tuckSd: 0.090, lag: 0.25, gain: 0.5, noise: 0.25, steerP: 0.5 },
  regulier: { jumpAim: 1.1, jumpSd: 0.24, tuckAim: 0.22, tuckSd: 0.055, lag: 0.17, gain: 0.8, noise: 0.15, steerP: 0.9 },
  expert:   { jumpAim: 0.8, jumpSd: 0.13, tuckAim: 0.17, tuckSd: 0.030, lag: 0.11, gain: 1.0, noise: 0.08, steerP: 1.0 },
  // Le joueur qui attend que l'anneau affiche PERFECT pour lacher : il lache un temps de
  // reaction humain APRES le label (0,22 s en moyenne). Profil ajoute par le relecteur game
  // designer du 30/09 : c'est le piege du premier saut, que les profils a visee fixe ratent.
  reactif:  { jumpAim: 1.1, jumpSd: 0.24, react: 0.22, reactSd: 0.06, lag: 0.17, gain: 0.8, noise: 0.15, steerP: 0.9 }
};

const { browser, page, errs } = await open();

const res = await page.evaluate(([RUNS, PROFILES]) => {
  const d = window.__dods;
  d.slowmo = false; d.render = false;
  // PRNG deterministe : deux passes du gauntlet sur la meme version donnent les memes chiffres.
  let s = 20260930;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const one = (spot, P, n) => {
    d.state.spot = spot; d.startRun(); d.paused = true;
    const j = d.jump;
    j.reset(n);
    let steer = 0;
    Object.defineProperty(j, 'steer', { get: () => steer, set() {}, configurable: true });
    d.autoJump = Math.max(0.05, P.jumpAim + gauss() * P.jumpSd);
    d.autoTuck = P.react != null
      ? Math.max(0, j.win.perfectHi - (P.react + gauss() * P.reactSd))
      : Math.max(0.0, P.tuckAim + gauss() * P.tuckSd);
    const pilots = rnd() < P.steerP;
    const dt = 1 / 60, lagN = Math.round(P.lag / dt), hist = [];
    let f = 0, maxTilt = 0;
    while (f++ < 3000 && !j.result) {
      if (j.state === 'fly' && !j.tucked) {
        hist.push([j.tilt, j.tiltV]);
        const seen = hist.length > lagN ? hist[hist.length - 1 - lagN] : [0, 0];
        const want = pilots ? P.gain * (seen[0] * 2.4 + seen[1] * 0.5) + gauss() * P.noise : 0;
        // un doigt ne se deplace pas instantanement : 6 unites de manche par seconde
        steer += clamp(clamp(want, -1, 1) - steer, -6 * dt, 6 * dt);
        maxTilt = Math.max(maxTilt, Math.abs(j.tilt));
      }
      d.tick(1, dt);
    }
    delete j.steer; j.steer = 0;
    d.autoJump = null; d.autoTuck = null;
    const r = j.result || {};
    return {
      grade: j.grade ? j.grade.key : 'none',
      takeoff: j.takeoff ? j.takeoff.label : 'none',
      fell: !!j.flailing,
      planche: j.plancheRes ? j.plancheRes.key : 'aucune',
      score: r.score || 0,
      maxDeg: Math.round(maxTilt * 57.3)
    };
  };

  const out = {};
  for (const [name, P] of Object.entries(PROFILES)) {
    out[name] = {};
    for (const spot of d.spots) {
      const tally = { n: 0, grades: {}, takeoffs: {}, planche: {}, falls: 0, score: 0, maxDeg: 0 };
      let runSum = 0, run8k = 0;
      for (let r = 0; r < RUNS; r++) {
        // un run comme dans le jeu : serie x1,2 a deux GREAT ou mieux, x1,5 a trois, un
        // plat arrete tout
        let run = 0, streak = 0;
        for (let n = 1; n <= 3; n++) {
        const x = one(spot, P, n);
        const dead = x.grade === 'smack' || x.grade === 'none';
        streak = !dead && ['perfect', 'great'].includes(x.grade) ? streak + 1 : 0;
        run += Math.round(x.score * (streak >= 3 ? 1.5 : streak >= 2 ? 1.2 : 1));
        tally.n++;
        tally.grades[x.grade] = (tally.grades[x.grade] || 0) + 1;
        tally.takeoffs[x.takeoff] = (tally.takeoffs[x.takeoff] || 0) + 1;
        tally.planche[x.planche] = (tally.planche[x.planche] || 0) + 1;
        tally.falls += x.fell ? 1 : 0;
        tally.score += x.score;
        tally.maxDeg += x.maxDeg;
        if (dead) break;
        }
        runSum += run; if (run >= 8000) run8k++;
      }
      const pct = k => Math.round(100 * (tally.grades[k] || 0) / tally.n);
      out[name][spot.id] = {
        hauteur: spot.height, diff: spot.diff, vent: spot.wind || 0, sauts: tally.n,
        perfect: pct('perfect'), great: pct('great'), good: pct('good'),
        early: pct('early'), chicken: pct('chicken'), smack: pct('smack'),
        chute: Math.round(100 * tally.falls / tally.n),
        scoreMoyen: Math.round(tally.score / tally.n),
        plancheParfaite: Math.round(100 * (tally.planche.parfaite || 0) / tally.n),
        plancheBancale: Math.round(100 * (tally.planche.bancale || 0) / tally.n),
        inclinaisonMaxMoy: Math.round(tally.maxDeg / tally.n),
        runMoyen: Math.round(runSum / RUNS), run8000: Math.round(100 * run8k / RUNS)
      };
    }
  }
  return out;
}, [RUNS, PROFILES]);

const report = { runsParSpot: RUNS, profils: PROFILES, resultats: res, erreurs: errs };
const json = JSON.stringify(report, null, 1);
if (OUT) { const fs = await import('node:fs'); fs.writeFileSync(OUT, json); }
// Tableau lisible : une ligne par profil et par spot.
for (const [p, spots] of Object.entries(res)) {
  console.log(`\n${p}`);
  console.log('spot'.padEnd(12) + 'h   perf great good  early smack chute  score  pl.parf pl.banc    run  >=8k');
  for (const [id, r] of Object.entries(spots)) {
    console.log(id.padEnd(12) + String(r.hauteur).padEnd(4) + [r.perfect, r.great, r.good, r.early, r.smack, r.chute].map(v => String(v + '%').padStart(5)).join(' ')
      + String(r.scoreMoyen).padStart(7) + String(r.plancheParfaite + '%').padStart(8) + String(r.plancheBancale + '%').padStart(8)
      + String(r.runMoyen).padStart(7) + String(r.run8000 + '%').padStart(6));
  }
}
if (errs.length) console.log('\nERREURS', errs);
await browser.close();
