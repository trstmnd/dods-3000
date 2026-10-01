import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Video du bloc 2 : les juges, un saut note de bout en bout.
//   node bloc2-video.mjs <sortie.mp4> <dossier-captures> [debut] [nb]
//
// 20 s a 30 i/s, 1920x1080, Lysefjord (34 m, spot 5) : titre, premier saut pilote
// avec son ralenti de fermeture, puis la carte des juges en entier (les cinq cartons
// un par un, la moyenne, les quatre criteres, le plus faible surligne), puis un
// second saut ferme tot : les cartons changent, la fermeture tombe. La cascade vit
// dans le temps de jeu : le rendu image par image la rejoue a la frame pres.
//
// Meme technique que bloc1-video.mjs sous swiftshader : le canvas sort par
// toDataURL dans la page, le HUD par capture CDP en PNG alpha, canvas masque,
// re-unies par ffmpeg. PRNG seme au chargement : rendu decoupable en troncons,
// les frames posees ne sont pas refaites. Passer debut/nb pour une plage :
//   node bloc2-video.mjs v.mp4 caps 0 150
//   node bloc2-video.mjs v.mp4 caps 150 150   (etc.)
// Quand les 600 frames existent, l'assemblage se fait seul.
// 3 captures PNG pleines tombent dans <dossier-captures> : pose etiree, fermeture
// au ralenti, carte des juges complete.

const OUT = process.argv[2] || 'bloc2.mp4';
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

// Sequence pilotee : 30 frames de titre, saut pilote (ralenti v4 sur la fermeture),
// carte en entier (90 frames : la cascade prend 53), second saut ferme tot sans
// ralenti (la carte est le sujet), puis sa carte jusqu'aux 20 s.
await page.evaluate(() => {
  const d = window.__dods;
  d.quality.on = false; d.paused = true; d.render = false; d.show('title');
  d.slowmo = true; d.autoJump = 0.7; d.autoSteer = true; d.autoTuck = 0.16;
  window.__seq = { f: 0, phase: 'titre', carteAt: null };
  window.__seqCtl = () => {
    const s = window.__seq, d2 = window.__dods;
    s.f++;
    const carte = document.querySelector('#s-jump').classList.contains('on');
    if (s.phase === 'titre' && s.f >= 30) { d2.state.spot = d2.spots[5]; d2.startRun(); s.phase = 'saut1'; }
    else if (s.phase === 'saut1' && carte && s.carteAt == null) s.carteAt = s.f;
    else if (s.phase === 'saut1' && s.carteAt != null && s.f >= s.carteAt + 90) {
      d2.slowmo = false; d2.autoTuck = 0.9; d2.advance(); s.phase = 'saut2'; s.carteAt = null;
    }
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
  // captures pleines (canvas + HUD composes par le navigateur) aux instants convenus :
  // pose etiree et fermeture au ralenti sur le premier saut, carte des juges complete
  // (cascade terminee, barres levees) sur la premiere carte.
  if (CAPDIR) {
    const cap = await page.evaluate(() => {
      const j = window.__dods.jump, s = window.__seq;
      if (!j || s.phase === 'titre') return null;
      if (j.state === 'fly' && !j.tucked && j.ttc > 1.2 && j.ttc < 2.5) return 'etire';
      // ferme : la boule refermee (blend de 0,05 s termine), pas la frame du lacher
      if (j.state === 'fly' && j.tucked && j.ttc < 0.12 && j.ttc > 0.05) return 'ferme';
      if (s.carteAt != null && s.f >= s.carteAt + 75 && document.querySelector('#jr-crits').classList.contains('on')) return 'carte-juges';
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
