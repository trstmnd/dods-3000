import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Video du bloc 5 : trois defis par hauteur, les spots se debloquent.
//   ./tools/run.sh bloc5-video.mjs <sortie.mp4> <dossier-captures> [debut] [nb]
//
// 20 s a 30 i/s, 1920x1080 : la liste des spots d'un nouveau joueur (cinq cartes
// fermees, leur cadenas et leurs points), la fiche de Frognerbadet et ses trois
// defis, puis le saut qui en coche deux d'un coup : fenetre parfaite, entree sans
// les mains. Le toast des defis et le callout « RICK'S CAFE DEBLOQUE » vivent
// 1,1 s en temps reel : on les repose et on les gele au bon endroit de leur
// courbe, le temps de les lire sur la carte des juges qui se leve. Les deux
// sauts restants se jouent hors champ, la liste revient : Rick's Cafe ouvert,
// trois points sur Frognerbadet. La fiche du spot neuf, son premier saut a 14 m,
// coupe en plein vol.
//
// Meme technique que les blocs 1 a 4 sous swiftshader : le canvas sort par
// toDataURL, le HUD par capture CDP en PNG alpha, re-unies par ffmpeg. PRNG seme
// au chargement : rendu decoupable en troncons, les frames posees ne sont pas
// refaites.   ./tools/run.sh bloc5-video.mjs v.mp4 caps 0 150  (puis 150 150...)
// Le dernier troncon (celui qui atteint 600) assemble la video.
// Les captures pleines tombent dans <dossier-captures> : defis-ferme,
// defis-debloque, defis-ouvert.   DRY=1 : tout jouer sans capturer.

const OUT = process.argv[2] || 'bloc5.mp4';
const CAPDIR = process.argv[3] || null;
const DEBUT = +(process.argv[4] || 0);
const NB = +(process.argv[5] || 600);
const FPS = 30, W = 1920, H = 1080, MAX = 20 * FPS;
const DRY = process.env.DRY === '1';
const BASE = path.dirname(OUT) + '/frames-' + path.basename(OUT, '.mp4');
const SEED = 20261005;
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
  Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}, SEED);
await page.goto('http://127.0.0.1:' + (process.env.PORT || '8099') + '/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 30000 });

// Le scenario vit dans la page, pilote par __step : un tick de 1/30 s par image video,
// les transitions au fil de l'eau. Les courses ne se dessinent qu'une image sur cinq,
// les vols et les gerbes en entier : la video respire aux bons moments.
await page.evaluate(() => {
  const d = window.__dods;
  d.quality.on = false; d.paused = true; d.render = false;
  window.__seq = { vf: 0, tick: 0, phase: 'titre', de: 0, carteF: 0, glided: false, pops: null, draw: true, releves: [], stats: {} };

  const depart = num => {
    d.slowmo = false; d.autoJump = 0.7; d.autoSteer = true;
    d.autoTuck = num === 1 ? null : 0.45;
    const s = window.__seq;
    s.carteF = 0; s.glided = false;
  };
  // Le doigt qui choisit l'entree sans les mains : pose puis glisse vers le haut,
  // comme dans defis.mjs. Il reste pose, l'autopilot garde la main sur le geste.
  const glisse = () => {
    const span = Math.max(60, window.innerHeight * 0.12);
    const ev = (type, y) => document.body.dispatchEvent(new PointerEvent(type, {
      pointerId: 41, clientX: 960, clientY: y, bubbles: true, cancelable: true,
      pointerType: 'touch', isPrimary: true
    }));
    ev('pointerdown', 540);
    ev('pointermove', 540 - 0.85 * span);
  };
  // Toast et callout sont des animations CSS en temps reel : a plus d'une seconde
  // par image de rendu, elles seraient finies avant la capture. On les repose et
  // on les gele au sommet de leur courbe, le texte reste celui du jeu.
  const gele = (el, at) => {
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    for (const a of document.getAnimations())
      if (a.effect && a.effect.target === el) { a.pause(); a.currentTime = at; }
  };

  window.__step = () => {
    const s = window.__seq, j = d.jump;
    d.tick(1, 1 / 30);
    s.tick++;
    const carte = document.querySelector('#s-jump').classList.contains('on');
    const fin = document.querySelector('#s-end').classList.contains('on');
    if (s.phase === 'titre') {
      s.draw = true;
      if (s.vf - s.de >= 24) { document.querySelector('#s-title .btn.big').click(); s.phase = 'spots0'; s.de = s.vf; }
    } else if (s.phase === 'spots0') {
      s.draw = true;
      if (s.vf - s.de >= 66) { document.querySelector('#spot-list .spot:not(.locked)').click(); s.phase = 'fiche1'; s.de = s.vf; }
    } else if (s.phase === 'fiche1') {
      s.draw = true;
      if (s.vf - s.de >= 39) { document.querySelector('#s-brief .btn.big').click(); depart(1); s.phase = 'saut1'; s.de = s.vf; }
    } else if (s.phase === 'saut1') {
      // l'autopilot de planche combattrait la glissade : il rend la main au doigt
      // qui choisit la forme d'entree, comme dans defis.mjs
      if (!s.glided && j && j.state === 'fly' && j.t >= 0.35) { s.glided = true; d.autoSteer = false; glisse(); d.autoTuck = 0.15; }
      if (carte) {
        s.pops = {
          toast: document.querySelector('#toast').textContent,
          callout: document.querySelector('#callout').textContent,
          color: document.querySelector('#callout').style.color
        };
        s.releves.push({ saut: 1, grade: j.grade && j.grade.key, landing: j.result && j.result.landingKey,
          toast: s.pops.toast, callout: s.pops.callout });
        s.phase = 'carte1'; s.de = s.vf; s.carteF = 0;
      }
    } else if (s.phase === 'carte1') {
      // le temps des pop-ups, puis la cascade des juges se leve toute seule
      s.draw = true;
      if (s.carteF < 36 && s.pops) {
        const tt = document.querySelector('#toast'), cc = document.querySelector('#callout');
        tt.textContent = s.pops.toast; gele(tt, 300);
        cc.textContent = s.pops.callout; cc.style.color = s.pops.color; gele(cc, 700);
      }
      // la derniere image de la carte part au meme moment que le clic : sans cela,
      // une image de HUD de course clignote entre la carte et la liste des spots
      if (s.carteF >= 84) { s.draw = false; d.advance(); depart(2); s.phase = 'reste'; }
      else ++s.carteF;
    } else if (s.phase === 'reste') {
      // les deux sauts restants ferment le run, hors champ : la video ne les paie pas
      s.draw = false;
      if (fin) { document.querySelector('#s-end .btn.ghost').click(); s.phase = 'spots1'; s.de = s.vf; }
      else if (carte) d.advance();
    } else if (s.phase === 'spots1') {
      s.draw = true;
      if (s.vf - s.de >= 84) { document.querySelector('#spot-list .spot:nth-child(2)').click(); s.phase = 'fiche2'; s.de = s.vf; }
    } else if (s.phase === 'fiche2') {
      s.draw = true;
      if (s.vf - s.de >= 48) { document.querySelector('#s-brief .btn.big').click(); depart(3); s.phase = 'saut2'; s.de = s.vf; }
    } else if (s.phase === 'carte2') {
      // la derniere image de la video : la carte des juges du spot neuf, la
      // cascade se leve et le fondu de fermeture l'emporte
      s.draw = true;
    }
    // dessiner ou non cette image : courses au cinquieme, vols et gerbes entiers
    if (s.phase === 'saut1' || s.phase === 'saut2') {
      if (carte || fin) {
        s.draw = true;
        if (s.phase === 'saut2') s.phase = 'carte2';
      } else if (!j) s.draw = false;
      else if (j.state === 'walk') s.draw = s.tick % 5 === 0;
      else if (j.state === 'fly') s.draw = true;
      else s.draw = j.impactT < 0.4;
    }
    if (s.draw) {
      s.vf++;
      const k = carte ? 'carte-' + s.phase : s.phase;
      s.stats[k] = (s.stats[k] || 0) + 1;
    }
    return s.draw;
  };

  window.__avance = n => { while (window.__seq.vf < n) window.__step(); };
  window.__etat = () => {
    const s = window.__seq;
    let save = null;
    try { save = JSON.parse(localStorage.getItem('dods3000.v1') || '{}'); } catch { }
    return {
      vf: s.vf, tick: s.tick, phase: s.phase, releves: s.releves, stats: s.stats, pops: s.pops,
      defis: save && save.defis || null,
      cartes: [...document.querySelectorAll('#spot-list .spot')].map(c => c.querySelector('.name').textContent
        + (c.classList.contains('locked') ? ' fermé' : ' ' + c.querySelectorAll('.pins i.on').length + '/3'))
    };
  };
  window.__capture = () => {
    const s = window.__seq, d2 = window.__dods;
    const f = s.vf - s.de;
    if (s.phase === 'spots0' && f >= 40 && f <= 46) return 'defis-ferme';
    if (s.phase === 'carte1' && s.carteF >= 26 && s.carteF <= 32) return 'defis-debloque';
    if (s.phase === 'spots1' && f >= 40 && f <= 46) return 'defis-ouvert';
    return null;
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
  // captures pleines (canvas + HUD composes par le navigateur) : une par etape
  if (CAPDIR && !DRY) {
    const cap = await page.evaluate(() => window.__capture());
    if (cap && !fs.existsSync(`${CAPDIR}/${cap}.png`))
      await page.screenshot({ path: `${CAPDIR}/${cap}.png`, type: 'png', timeout: 120000 });
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
