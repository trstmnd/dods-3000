import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Video du bloc 3 : les figures, les trois réceptions et le raté.
//   node bloc3-video.mjs <sortie.mp4> <dossier-captures> [debut] [nb]
//
// 20 s a 30 i/s, 1920x1080, Lysefjord (34 m) : titre, puis quatre sauts pilotes :
// le salto avec son ralenti de fermeture et la carte des juges (la ligne Figure x1),
// la vrille sur l'axe lateral, le grab lache doigt haut (entree sans les mains), et
// le saut jamais ferme : plat qui claque, rebond, ragdoll, écran de fin. Les courses
// sont accelerees (une image sur cinq) : la chute est le sujet, pas la marche.
//
// Meme technique que bloc1 et bloc2 sous swiftshader : le canvas sort par toDataURL,
// le HUD par capture CDP en PNG alpha, re-unies par ffmpeg. PRNG seme au chargement :
// rendu decoupable en troncons, les frames posees ne sont pas refaites.
//   node bloc3-video.mjs v.mp4 caps 0 150   (puis 150 150, etc.)
// Le dernier tronçon (celui qui atteint 600) assemble la video.
// Les captures pleines tombent dans <dossier-captures> : salto, vrille, grab,
// sans-les-mains, ragdoll.

const OUT = process.argv[2] || 'bloc3.mp4';
const CAPDIR = process.argv[3] || null;
const DEBUT = +(process.argv[4] || 0);
const NB = +(process.argv[5] || 600);
const FPS = 30, W = 1920, H = 1080, MAX = 20 * FPS;
// DRY=1 : la sequence avance sans aucune capture, pour la verifier en une minute
const DRY = process.env.DRY === '1';
const BASE = path.dirname(OUT) + '/frames-' + path.basename(OUT, '.mp4');
const SEED = 20261003;
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

// Les quatre sauts : le pilote de chaque figure, le ralenti du premier seulement (la
// video doit tenir vingt secondes), la duree de carte, et pour le troisieme un vrai
// doigt glisse et tenu vers le haut : c'est lui qui choisit l'entree sans les mains.
await page.evaluate(() => {
  const d = window.__dods;
  const SAUTS = [
    { fig: 'salto', slowmo: true, carte: 25, doigt: 0 },
    { fig: 'vrille', slowmo: false, carte: 6, doigt: 0 },
    { fig: 'grab', slowmo: false, carte: 6, doigt: 1 },
    { fig: 'smack', slowmo: false, carte: 6, doigt: 0 }
  ];
  d.quality.on = false; d.paused = true; d.render = false; d.show('title');
  window.__seq = { vf: 0, tick: 0, phase: 'titre', saut: -1, carteF: 0, figT: 0, flick: 0, doigtPos: 0, draw: true, releves: [], stats: {}, endF: 0 };

  const ev = (type, y) => document.body.dispatchEvent(new PointerEvent(type, {
    pointerId: 41, clientX: 960, clientY: y, bubbles: true, cancelable: true,
    pointerType: 'touch', isPrimary: true
  }));
  const poseDoigt = dir => {
    if (window.__seq.doigtPos === dir) return;
    const span = Math.max(60, window.innerHeight * 0.12);
    if (!window.__seq.doigtPos) ev('pointerdown', 540);
    ev('pointermove', 540 - dir * 0.85 * span);
    window.__seq.doigtPos = dir;
  };
  const departSaut = i => {
    const s = SAUTS[i];
    d.slowmo = s.slowmo; d.autoJump = 0.7; d.autoSteer = true;
    d.autoTuck = s.fig === 'smack' ? null : 0.15;
    d.autoSteerX = null; d.autoSteerRaw = null;
    window.__seq.carteF = 0; window.__seq.flick = 0; window.__seq.figT = 0;
  };

  // Un coup sec en dix images, dans le sens demande : haut puis bas (salto) ou
  // bas puis haut (grab). figT compte les images du coup, pas de la sequence.
  const flick = (haut) => {
    const s = window.__seq, v = haut ? -0.7 : 0.7, inverse = haut ? 0.7 : -0.7;
    if (s.flick === 0) { d.autoSteerRaw = v; s.flick = 1; s.figT = 0; }
    else if (s.flick === 1) { if (++s.figT >= 10) { d.autoSteerRaw = inverse; s.flick = 2; s.figT = 0; } }
    else if (s.flick === 2 && ++s.figT >= 10) { d.autoSteerRaw = haut ? null : 0; s.flick = 3; }
  };

  window.__step = () => {
    const s = window.__seq, j = d.jump;
    // les entrees du joueur pour cette image, avant le pas de simulation
    if (s.phase === 'saut' && j.state === 'fly' && !j.tucked) {
      const cfg = SAUTS[s.saut];
      if (cfg.fig === 'salto' && j.t >= 0.4 && s.flick < 3) flick(false);
      else if (cfg.fig === 'vrille') d.autoSteerX = (j.t >= 0.3 && Math.abs(j.twist) < 6.5) ? 0.9 : null;
      else if (cfg.fig === 'grab') {
        // le flick d'abord, doigt encore leve : partir d'un glisse nul. Poser le doigt
        // avant ferait lire au tampon un delta de -1,5 et partir un salto parasite.
        if (j.t >= 0.5 && s.flick < 3) flick(true);
        if (j.t >= 1.4 && !s.doigtPos) { d.autoSteer = false; poseDoigt(1); }
      }
    }
    d.tick(1, 1 / 30);
    s.tick++;
    // le ralenti du premier saut s'arrete a l'entree dans l'eau : le claque revient
    // au temps reel, et la cascade des juges n'attend pas cinq secondes
    if (s.phase === 'saut' && SAUTS[s.saut].slowmo && j.state === 'impact' && d.slowmo) d.slowmo = false;
    // les transitions de phase, apres le pas
    const carte = document.querySelector('#s-jump').classList.contains('on');
    if (s.phase === 'titre') {
      if (s.tick >= 30) { d.state.spot = d.spots[5]; d.startRun(); s.saut = 0; departSaut(0); s.phase = 'saut'; }
    } else if (s.phase === 'saut' && carte) {
      if (s.carteF === 0) s.releves.push({ saut: SAUTS[s.saut].fig, fig: j.figCount, figLast: j.figLast || null, landing: j.landingKey, grade: j.grade && j.grade.key, score: j.result && j.result.score });
      if (++s.carteF >= SAUTS[s.saut].carte) {
        d.slowmo = false; d.autoSteerX = null; d.autoSteerRaw = null;
        // un run vaut trois sauts : le salto, la vrille et le grab ferment le premier,
        // le rate ouvre le second apres un écran de fin tres bref
        if (s.saut < 2) { d.advance(); s.saut++; departSaut(s.saut); }
        else if (s.saut === 2) { d.advance(); s.phase = 'endA'; s.endF = 0; }
        else { d.advance(); s.phase = 'fin'; }
      }
    } else if (s.phase === 'endA' && ++s.endF >= 15) {
      d.startRun(); s.saut = 3; departSaut(3); s.phase = 'saut';
    }
    // dessiner ou non cette image : les courses accelerees d'un cinquieme, l'entree
    // reussie coupee avant la noyade, le ragdoll du rate garde jusqu'a la fin
    const dead = j && j.result && j.result.dead;
    const fin = document.querySelector('#s-end').classList.contains('on');
    if (s.phase === 'titre' || fin || carte) s.draw = true;
    else if (!j) s.draw = false;
    else if (j.state === 'walk') s.draw = s.tick % 5 === 0;
    else if (j.state === 'fly') s.draw = (s.saut === 3 && j.ttc > 1.2) ? s.tick % 2 === 0 : true;
    else s.draw = dead ? j.impactT < 1.0 : j.impactT < 0.4;
    if (s.draw) s.vf++;
    if (s.draw) {
      const k = s.phase === 'titre' ? 'titre' : s.phase === 'fin' ? 'fin'
        : carte ? 'carte' + s.saut : j.state + s.saut;
      s.stats[k] = (s.stats[k] || 0) + 1;
    }
    return s.draw;
  };
  window.__avance = n => { while (window.__seq.vf < n) window.__step(); };
  window.__etat = () => ({ vf: window.__seq.vf, phase: window.__seq.phase, saut: window.__seq.saut, releves: window.__seq.releves, stats: window.__seq.stats });
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
      const j = window.__dods.jump, s = window.__seq;
      if (!j || s.phase === 'titre') return null;
      if (j.state === 'fly' && !j.tucked && j.fig === 'salto' && j.figT > 0.3 && j.figT < 0.65) return 'salto';
      if (j.state === 'fly' && !j.tucked && !j.fig && Math.abs(j.twist) > 2.2 && Math.abs(j.twist) < 3.6) return 'vrille';
      if (j.state === 'fly' && !j.tucked && j.fig === 'grab' && j.figT > 0.35) return 'grab';
      if (j.state === 'fly' && j.tucked && j.landingKey === 'nohands' && j.ttc < 0.3) return 'sans-mains';
      if (j.state === 'impact' && j.result && j.result.dead && j.impactT > 0.25 && j.impactT < 0.6) return 'ragdoll';
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
