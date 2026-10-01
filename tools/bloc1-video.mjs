import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Video du bloc 1 : le meme saut image par image, pour v4 et v3.2.
//   node bloc1-video.mjs <sortie.mp4> <dossier-captures> [debut] [nb]
//
// 20 s a 30 i/s, 1920x1080, saut pilote a Lysefjord (34 m, spot 5) : elan, vol
// etire, fermeture au ralenti, gerbe, carte de note, puis un second saut tenu
// jusqu'a sa gerbe. La carte est attendue par evenement, pas par une duree fixe.
//
// Sous swiftshader une capture CDP plein ecran coute plus de 45 s (le pire est
// la composition du canvas WebGL). Chaque image sort donc en deux couches :
//   - le canvas par renderer.domElement.toDataURL() dans la page (2 s),
//   - le HUD par capture CDP en PNG alpha, canvas masque (0,3 s),
// re-unies par ffmpeg a l'assemblage. Math.random est remplace par un PRNG seme
// au chargement : la gerbe de fx.js et tout le reste reproduisent la meme image
// d'une invocation a l'autre, ce qui permet de rendre par troncons de quelques
// minutes et de reprendre ou un troncon s'est arrete (les frames deja posees
// ne sont pas refaites). Passer debut/nb pour rendre une plage, par exemple :
//   node bloc1-video.mjs v.mp4 caps 0 140   (troncon 1)
//   node bloc1-video.mjs v.mp4 caps 140 140 (troncon 2...)
// Quand les 600 frames existent, l'assemblage se fait seul.
// 3 captures PNG pleines (pose etiree, fermeture au ralenti, gerbe) tombent dans
// <dossier-captures> aux instants convenus.

const OUT = process.argv[2] || 'bloc1.mp4';
const CAPDIR = process.argv[3] || null;
const DEBUT = +(process.argv[4] || 0);
const NB = +(process.argv[5] || 600);
const FPS = 30, W = 1920, H = 1080, MAX = 20 * FPS;
const BASE = path.dirname(OUT) + '/frames-' + path.basename(OUT, '.mp4');
const SEED = 20261001;
fs.mkdirSync(BASE, { recursive: true });
if (CAPDIR) fs.mkdirSync(CAPDIR, { recursive: true });
const fJpg = i => `${BASE}/f${String(i).padStart(5, '0')}.jpg`;
const fHud = i => `${BASE}/h${String(i).padStart(5, '0')}.png`;
const existe = i => fs.existsSync(fJpg(i)) && fs.existsSync(fHud(i));
const manquantes = () => { let m = 0; for (let i = 0; i < MAX; i++) if (!existe(i)) m++; return m; };

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

// Sequence pilotee : 45 frames de titre, premier saut jusqu'a la carte, 1,6 s de
// carte, second saut jusqu'au bout des 20 s (la gerbe du second reste a l'ecran).
await page.evaluate(() => {
  const d = window.__dods;
  d.quality.on = false; d.paused = true; d.render = false; d.show('title');
  d.slowmo = true; d.autoJump = 0.7; d.autoTuck = 0.16; d.autoSteer = true;
  window.__seq = { f: 0, phase: 'titre', carteAt: null };
  window.__seqCtl = () => {
    const s = window.__seq, d2 = window.__dods;
    s.f++;
    const carte = document.querySelector('#s-jump').classList.contains('on');
    if (s.phase === 'titre' && s.f >= 45) { d2.state.spot = d2.spots[5]; d2.startRun(); s.phase = 'saut1'; }
    else if (s.phase === 'saut1' && carte && s.carteAt == null) s.carteAt = s.f;
    else if (s.phase === 'saut1' && s.carteAt != null && s.f >= s.carteAt + 48) { d2.advance(); s.phase = 'saut2'; }
  };
  window.__seqTick = n => { for (let k = 0; k < n; k++) { d.tick(1, 1 / 30); window.__seqCtl(); } };
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
await page.evaluate(n => window.__seqTick(n), DEBUT);

const rendues = [];
t0 = Date.now();
for (let i = DEBUT; i < Math.min(DEBUT + NB, MAX); i++) {
  await page.evaluate(() => window.__seqTick(1));
  if (!existe(i)) {
    const jpg = await page.evaluate(() => { const d = window.__dods; d.draw(); return d.renderer.domElement.toDataURL('image/jpeg', 0.92); });
    fs.writeFileSync(fJpg(i), Buffer.from(jpg.slice(23), 'base64'));
    await page.evaluate(() => window.__hudOnly(true));
    await page.screenshot({ path: fHud(i), type: 'png', omitBackground: true, timeout: 60000 });
    await page.evaluate(() => window.__hudOnly(false));
    rendues.push(i);
  }
  // captures pleines (canvas + HUD composes par le navigateur) aux instants convenus
  if (CAPDIR && i < 400) {
    const cap = await page.evaluate(() => {
      const j = window.__dods.jump, s = window.__seq;
      if (!j || s.phase === 'titre') return null;
      if (j.state === 'fly' && !j.tucked && j.ttc > 1.2 && j.ttc < 2.5) return 'etire';
      if (j.state === 'fly' && j.tucked && j.ttc < 0.35 && j.ttc > 0.1) return 'ferme';
      if (j.state === 'impact' && j.impactT > 0.15 && j.impactT < 0.5) return 'gerbe';
      return null;
    });
    if (cap && !fs.existsSync(`${CAPDIR}/${cap}.png`)) {
      await page.screenshot({ path: `${CAPDIR}/${cap}.png`, type: 'png', timeout: 120000 });
    }
  }
}
const dt = (Date.now() - t0) / 1000;
await browser.close();

const restent = manquantes();
let video = null;
if (restent === 0) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y',
    '-framerate', String(FPS), '-i', `${BASE}/f%05d.jpg`,
    '-framerate', String(FPS), '-i', `${BASE}/h%05d.png`,
    '-filter_complex', `[0:v][1:v]overlay=0:0,scale=${W}:${H}:out_color_matrix=bt709:out_range=tv,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=${(MAX / FPS - 0.6).toFixed(2)}:d=0.6`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', OUT]);
  video = OUT;
}
console.log(JSON.stringify({
  troncon: [DEBUT, Math.min(DEBUT + NB, MAX)], rendues: rendues.length, sParFrame: rendues.length ? +(dt / rendues.length).toFixed(2) : 0,
  warmup: +warmup.toFixed(1), restent, video, erreurs: errs
}));
