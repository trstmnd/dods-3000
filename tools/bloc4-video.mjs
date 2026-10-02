import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Video du bloc 4 : le replay sous trois angles et le fantome du meilleur saut.
//   node bloc4-video.mjs <sortie.mp4> <dossier-captures> [debut] [nb]
//
// 20 s a 30 i/s, 1920x1080, Lysefjord (34 m) : titre, un premier saut pilote et sa
// carte, puis sa relecture : la poursuite du bord, le juge immobile, la contre-plongee
// au ras de l'eau qui voit monter la gerbe. Retour a la carte, deuxieme saut ferme trop
// tot : le fantome du record court et vole a cote, superpose pendant la course puis
// livr a lui-meme quand le vrai ferme avant lui. Le troisieme saut ouvre la fin.
//
// Meme technique que les blocs 1 a 3 sous swiftshader : le canvas sort par toDataURL,
// le HUD par capture CDP en PNG alpha, re-unies par ffmpeg. PRNG seme au chargement :
// rendu decoupable en troncons, les frames posees ne sont pas refaites.
//   node bloc4-video.mjs v.mp4 caps 0 150   (puis 150 150, etc.)
// Le dernier tronçon (celui qui atteint 600) assemble la video.
// Les captures pleines tombent dans <dossier-captures> : replay-suivi, replay-bord,
// replay-eau, fantome-course, fantome-vol.

const OUT = process.argv[2] || 'bloc4.mp4';
const CAPDIR = process.argv[3] || null;
const DEBUT = +(process.argv[4] || 0);
const NB = +(process.argv[5] || 600);
const FPS = 30, W = 1920, H = 1080, MAX = 20 * FPS;
// DRY=1 : la sequence avance sans aucune capture, pour la verifier en une minute
const DRY = process.env.DRY === '1';
const BASE = path.dirname(OUT) + '/frames-' + path.basename(OUT, '.mp4');
const SEED = 20261004;
fs.mkdirSync(BASE, { recursive: true });
if (CAPDIR) fs.mkdirSync(CAPDIR, { recursive: true });
const fJpg = i => `${BASE}/f${String(i).padStart(5, '0')}.jpg`;
const fHud = i => `${BASE}/h${String(i).padStart(5, '0')}.png`;
const existe = i => fs.existsSync(fJpg(i)) && fs.existsSync(fHud(i));

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--ignore-certificate-errors', ...GL] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'fr' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
// PRNG seme avant tout script de la page : la gerbe et le decor se rejouent a l'identique.
await page.addInitScript(s => {
  let a = s >>> 0;
  Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294977296; };
}, SEED);
await page.goto('http://127.0.0.1:' + (process.env.PORT || '8099') + '/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 30000 });

// Le scenario vit dans la page, pilote par __step : un tick de 1/30 s par image video,
// les transitions au fil de l'eau. Le saut 1 se ferme a 0,15 s de l'impact (le record
// que le fantome rejouera), le saut 2 a 0,5 s : trop tot, le fantome s'en detache.
await page.evaluate(() => {
  const d = window.__dods;
  d.quality.on = false; d.paused = true; d.render = false; d.show('title');
  window.__seq = { vf: 0, tick: 0, phase: 'titre', num: 0, carteF: 0, angled: 0, gerbeF: 0, fantome: {}, draw: true, releves: [], stats: {} };

  const depart = num => {
    d.slowmo = false; d.autoJump = 0.7; d.autoSteer = true;
    d.autoTuck = num === 2 ? 0.5 : 0.15;
    d.autoSteerX = null; d.autoSteerRaw = null;
    const s = window.__seq;
    s.num = num; s.carteF = 0; s.angled = 0; s.gerbeF = 0;
  };
  const finDeCarte = () => {
    const s = window.__seq;
    if (s.num === 1 && !s.rejoue) { s.rejoue = 1; d.startReplay(); s.phase = 'replay'; }
    else if (s.num === 1) { d.advance(); depart(2); s.phase = 'saut'; }
    else if (s.num === 2) { d.advance(); depart(3); s.phase = 'saut'; }
    else { d.advance(); s.phase = 'fin'; }
  };

  window.__step = () => {
    const s = window.__seq, j = d.jump;
    d.tick(1, 1 / 30);
    s.tick++;
    const carte = document.querySelector('#s-jump').classList.contains('on');
    if (s.phase === 'titre') {
      if (s.tick >= 30) { d.state.spot = d.spots[5]; d.startRun(); depart(1); s.phase = 'saut'; }
    } else if (s.phase === 'replay') {
      const r = d.replay, t = r ? r.t : 0;
      if (s.angled < 1 && t >= 3.5) { s.angled = 1; d.setReplayAngle(1); }
      if (s.angled < 2 && t >= 4.2) { s.angled = 2; d.setReplayAngle(2); }
      if (r && r.fired && !s.gerbeF) s.gerbeF = s.tick;
      // la gerbe retombee sous la contre-plongee : un geste rend la main
      if (s.gerbeF && s.tick - s.gerbeF >= 30) { d.press(); s.phase = 'carteR'; s.carteF = 0; }
      else if (!r) { s.phase = 'carteR'; s.carteF = 0; }
    } else if ((s.phase === 'saut' || s.phase === 'carte' || s.phase === 'carteR') && carte) {
      if (s.phase === 'saut' && s.carteF === 0)
        s.releves.push({ saut: s.num, grade: j.grade && j.grade.key, score: j.result && j.result.score });
      if (++s.carteF >= (s.phase === 'carteR' ? 12 : s.num === 1 && !s.rejoue ? 28 : 24)) finDeCarte();
    } else if (s.phase === 'saut' && s.num === 2 && d.ghostEcho) {
      // le fantome du record doit rejouer la course du saut 2, puis voler a cote
      const v = d.ghostEcho.diver.root.visible;
      if (j.state === 'walk' && s.fantome.course === undefined) s.fantome.course = v;
      if (j.state === 'fly' && s.fantome.vol === undefined) s.fantome.vol = v;
    }
    // dessiner ou non cette image : courses au cinquieme, vols et gerbes entiers
    const r = d.replay;
    const fin = document.querySelector('#s-end').classList.contains('on');
    if (s.phase === 'titre' || s.phase === 'fin' || fin || carte) s.draw = true;
    else if (r) {
      const ev = d.rec.ev;
      s.draw = r.t < ev.takeoffT ? s.tick % 5 === 0 : true;
    } else if (!j) s.draw = false;
    else if (j.state === 'walk') s.draw = s.tick % 5 === 0;
    else if (j.state === 'fly') s.draw = true;
    else s.draw = j.impactT < 0.4;
    if (s.draw) {
      s.vf++;
      const k = s.phase === 'titre' ? 'titre' : s.phase === 'fin' || fin ? 'fin'
        : carte ? 'carte' + s.num
        : r ? (r.fired ? 'gerbe' : 'replay' + r.angle) : j.state + s.num;
      s.stats[k] = (s.stats[k] || 0) + 1;
    }
    return s.draw;
  };
  window.__avance = n => { while (window.__seq.vf < n) window.__step(); };
  window.__etat = () => {
    const s = window.__seq;
    return {
      vf: s.vf, phase: s.phase, num: s.num, releves: s.releves, fantome: s.fantome || null, stats: s.stats,
      ghost: d.ghosts.lysefjord ? d.ghosts.lysefjord.score : null,
      ghostVisible: !!(d.ghostEcho && d.ghostEcho.diver.root.visible)
    };
  };
  window.__hudOnly = v => {
    document.getElementById('scene').style.visibility = v ? 'hidden' : '';
    document.documentElement.style.background = v ? 'transparent' : '';
    document.body.style.background = v ? 'transparent' : '';
  };
});

// la premiere lecture du canvas sous swiftshader compile un chemin lent : l'amortir ici
let t0 = Date.now();
await page.evaluate(() => { const d = window.__dods; d.draw(); return d.renderer.domElement.toDataURL('image/jpeg', 0.5).length; });
const warmup = (Date.now() - t0) / 1000;

// rejoindre la frame de debut sans rien dessiner
await page.evaluate(n => window.__avance(n), DEBUT);

const rendues = [];
t0 = Date.now();
let i = DEBUT;
for (; i < Math.min(DEBUT + NB, MAX); i++) {
  await page.evaluate(n => window.__avance(n + 1), i);
  if (!existe(i) && !DRY) {
    const jpg = await page.evaluate(() => { const d = window.__dods; d.draw(); return d.renderer.domElement.toDataURL('image/jpeg', 0.92); });
    fs.writeFileSync(fJpg(i), Buffer.from(jpg.slice(23), 'base64'));
    await page.evaluate(() => window.__hudOnly(true));
    await page.screenshot({ path: fHud(i), type: 'png', omitBackground: true, timeout: 60000 });
    await page.evaluate(() => window.__hudOnly(false));
    rendues.push(i);
  }
  // captures pleines (canvas + HUD composes par le navigateur) : une par sujet
  if (CAPDIR && !DRY) {
    const cap = await page.evaluate(() => {
      const d = window.__dods, s = window.__seq, j = d.jump, r = d.replay;
      if (r) {
        if (r.angle === 0 && r.t > 3.0 && r.t < 3.6) return 'replay-suivi';
        if (r.angle === 1 && r.t >= 3.4 && r.t < 4.0) return 'replay-bord';
        if (r.angle === 2 && r.fired && r.t < 5.4) return 'replay-eau';
      }
      if (!r && j && s.num === 2 && d.ghostEcho && d.ghostEcho.diver.root.visible) {
        if (j.state === 'walk') return 'fantome-course';
        if (j.state === 'fly' && j.ttc < 1.5) return 'fantome-vol';
      }
      return null;
    });
    if (cap && !fs.existsSync(`${CAPDIR}/${cap}.png`)) {
      await page.screenshot({ path: `${CAPDIR}/${cap}.png`, type: 'png', timeout: 120000 });
    }
  }
}
const dt = (Date.now() - t0) / 1000;
const etat = await page.evaluate(() => window.__etat());
await browser.close();

// la suite de frames est continue par construction : le tronçon qui atteint MAX assemble
const posees = (() => { let n = 0; while (fs.existsSync(fJpg(n)) && fs.existsSync(fHud(n))) n++; return n; })();
let video = null;
if (DEBUT + NB >= MAX && posees >= MAX) {
  const duree = posees / FPS;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y',
    '-framerate', String(FPS), '-i', `${BASE}/f%05d.jpg`,
    '-framerate', String(FPS), '-i', `${BASE}/h%05d.png`,
    '-filter_complex', `[0:v][1:v]overlay=0:0,scale=${W}:${H}:out_color_matrix=bt709:out_range=tv,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0.1, duree - 0.6).toFixed(2)}:d=0.6`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', OUT]);
  video = OUT;
}
console.log(JSON.stringify({
  troncon: [DEBUT, i], rendues: rendues.length, posees, etat,
  sParFrame: rendues.length ? +(dt / rendues.length).toFixed(2) : 0,
  warmup: +warmup.toFixed(1), video, erreurs: errs
}));
