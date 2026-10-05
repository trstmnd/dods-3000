import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Video du bloc 6 : le son et la manette, rendus visibles.
//   ./tools/run.sh bloc6-video.mjs <sortie.mp4> <dossier-captures> [debut] [nb]
//
// 20 s a 30 i/s, 1920x1080. Le son ne se filme pas : un panneau « etat sonore »
// incruste dans le HUD montre en direct ce que la couche audio pose, lu dans
// audio.probe() (vent, sifflement, foule, clameur, etouffement, sub) et les
// vibrations dual-rumble de la manette simulee. Scenario : le titre, la liste
// des spots, un saut parfait force a Lysefjord 34 m (le vent s'ouvre vers
// l'aigu, le sifflement parle, la foule retient son souffle, l'impact descend
// dans le corps, l'oreille s'etouffe, l'ovation monte avec la carte des juges),
// puis un plat : la claque, le ohhh decu, la longue vibration, l'ecran de fin.
//
// Meme technique que les blocs 1 a 5 sous swiftshader : le canvas sort par
// toDataURL, le HUD par capture CDP en PNG alpha, re-unies par ffmpeg. PRNG
// seme au chargement : rendu decoupable en troncons, les frames posees ne sont
// pas refaites.   ./tools/run.sh bloc6-video.mjs v.mp4 caps 0 150  (puis 150 150...)
// Le dernier troncon (celui qui atteint 600) assemble la video.
// Les captures pleines tombent dans <dossier-captures> : vent-siffle,
// impact-etouffe, carte-ovation, plat-ohhh.   DRY=1 : tout jouer sans capturer.

const OUT = process.argv[2] || 'bloc6.mp4';
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
// PRNG seme + manette simulee + vibrate journalise, avant tout script de la page :
// la gerbe se rejoue a l'identique et chaque vibration dual-rumble laisse une trace.
await page.addInitScript(s => {
  let a = s >>> 0;
  Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__vib = [];
  navigator.vibrate = p => { window.__vib.push({ src: 'mobile', p: Array.isArray(p) ? p.join('-') : String(p) }); return true; };
  const btns = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  const gp = {
    id: 'video pad', index: 0, connected: true, mapping: 'standard', buttons: btns,
    axes: [0, 0, 0, 0], timestamp: 0,
    vibrationActuator: {
      playEffect: (type, par) => {
        window.__vib.push({ src: 'manette', p: type + ' ' + (par && par.strongMagnitude != null ? Math.round(par.strongMagnitude * 100) / 100 : '') + ' ' + (par && par.duration != null ? par.duration + 'ms' : '') });
        return Promise.resolve('ok');
      }
    }
  };
  navigator.getGamepads = () => [gp, null, null, null];
}, SEED);
await page.goto('http://127.0.0.1:' + (process.env.PORT || '8099') + '/?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__dods && window.__dods.world, null, { timeout: 30000 });

// Le scenario vit dans la page, pilote par __step : un tick de 1/30 s par image
// video. Le panneau etat sonore se met a jour a chaque image : c'est lui qui
// rend le bloc 6 visible.
await page.evaluate(() => {
  const d = window.__dods;
  d.quality.on = false; d.paused = true; d.render = false;
  window.__seq = {
    vf: 0, tick: 0, phase: 'titre', de: 0, carteF: 0, carte2On: false, draw: true, stats: {}, phaseLog: [],
    lastCheer: null, cheerStart: -999, cheerDead: false, cheerMark: 0,
    lastSplash: null, mufStart: -999, subStart: -999, subLevel: 0, splashN: 0, splashDead: false,
    vibN: 0, vibStart: -999, vibTxt: '', caption: ''
  };

  // le panneau : l'etat sonore pose par le jeu, barre par barre
  const panel = document.createElement('div');
  panel.id = 'son-panel';
  panel.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2147483000;width:392px;'
    + 'background:rgba(8,12,18,.82);border:1px solid rgba(255,255,255,.28);border-radius:12px;'
    + 'padding:12px 14px 10px;font:600 12px/1.5 system-ui,sans-serif;color:#e8eef6;'
    + 'letter-spacing:.02em;pointer-events:none';
  const rows = [
    ['vent', 'VENT', '#7fd4ff'], ['sifflet', 'SIFFLET', '#b9a2ff'], ['foule', 'FOULE', '#ffd447'],
    ['clameur', 'CLAMEUR', '#ff9d5c'], ['etouffe', 'SOUS L\'EAU', '#5c7cff'], ['sub', 'SUB', '#ff5c6e'],
    ['manette', 'MANETTE', '#9dff7f']
  ];
  let html = '<div style="font-size:13px;font-weight:800;margin-bottom:8px;color:#fff">ETAT SONORE v4.5 '
    + '<span style="font-weight:500;opacity:.65">audio.probe() + dual-rumble</span></div>';
  for (const [id, label, color] of rows) {
    html += '<div style="display:flex;align-items:center;gap:8px;margin:3px 0">'
      + '<span style="width:88px;opacity:.85;font-size:11px">' + label + '</span>'
      + '<span style="flex:1;height:10px;background:rgba(255,255,255,.13);border-radius:5px;overflow:hidden">'
      + '<i id="sb-' + id + '" style="display:block;height:100%;width:0%;background:' + color + ';border-radius:5px"></i></span>'
      + '<span id="sv-' + id + '" style="width:120px;text-align:right;font-size:11px;opacity:.85"></span></div>';
  }
  html += '<div id="son-caption" style="margin-top:8px;font-size:12px;font-weight:500;color:#cfe3ff;min-height:18px"></div>';
  panel.innerHTML = html;
  document.body.appendChild(panel);
  const bar = (id, v, txt) => {
    document.getElementById('sb-' + id).style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';
    document.getElementById('sv-' + id).textContent = txt || '';
  };

  const depart = (tuck) => {
    d.slowmo = true; d.autoJump = 0.7; d.autoSteer = true; d.autoTuck = tuck;
  };
  const go = phase => { const s = window.__seq; s.phaseLog.push({ phase: s.phase, vf: s.vf }); s.phase = phase; s.de = s.vf; };

  window.__step = () => {
    const s = window.__seq, j = d.jump;
    d.tick(1, 1 / 30);
    s.tick++;
    const carte = document.querySelector('#s-jump').classList.contains('on');
    const fin = document.querySelector('#s-end').classList.contains('on');
    if (s.phase === 'titre') {
      s.draw = true;
      if (s.vf - s.de >= 30) { document.querySelector('#s-title .btn.big').click(); go('spots0'); }
    } else if (s.phase === 'spots0') {
      s.draw = true;
      if (s.vf - s.de >= 54) {
        // le saut de demonstration est force au spot le plus haut : la chute de
        // 34 m est la seule ou le sifflement du vent parle vraiment
        d.show('run'); d.state.spot = d.spots[5]; d.startRun(); depart(0.16); go('saut1');
      }
    } else if (s.phase === 'saut1') {
      if (carte) { s.carteF = 0; go('carte1'); }
    } else if (s.phase === 'carte1') {
      s.draw = true;
      if (s.carteF >= 108) { s.draw = false; d.advance(); depart(null); go('saut2'); }
      else ++s.carteF;
    } else if (s.phase === 'saut2') {
      if (fin) go('fin');
      else if (carte) {
        // la carte du plat se lit aussi : ohhh decu, score 0, puis l'ecran de fin
        s.draw = true;
        if (!s.carte2On) { s.carte2On = true; s.carteF = 0; }
        if (s.carteF >= 48) { s.draw = false; d.advance(); go('fin'); }
        else ++s.carteF;
      }
    } else if (s.phase === 'fin') {
      s.draw = true;
      if (s.vf - s.de >= 60) { document.querySelector('#s-end .btn.ghost').click(); go('spots1'); }
    } else if (s.phase === 'spots1') {
      s.draw = true;
    }
    // dessiner ou non cette image : courses au cinquieme, vols et gerbes entiers
    if (s.phase === 'saut1' || s.phase === 'saut2') {
      if (carte || fin) {
        s.draw = true;
      } else if (!j) s.draw = false;
      else if (j.state === 'walk') s.draw = s.tick % 5 === 0;
      else if (j.state === 'fly') s.draw = true;
      else s.draw = j.impactT < 0.4;
    }

    // l'etat sonore de l'image : tout vient de ce que le jeu vient de poser
    const pr = d.audio.probe();
    if (pr.cheer && pr.cheer.at !== s.lastCheer) {
      s.lastCheer = pr.cheer.at; s.cheerStart = s.vf; s.cheerDead = pr.cheer.dead; s.cheerMark = pr.cheer.mark;
    }
    if (pr.splash && pr.splash.at !== s.lastSplash) {
      s.lastSplash = pr.splash.at; s.mufStart = s.vf; s.subStart = s.vf; s.splashN++;
      s.splashDead = pr.splash.dead; s.subLevel = Math.min(1, (pr.splash.power || 0) / 1.5);
    }
    const vib = window.__vib || [];
    if (vib.length !== s.vibN) { s.vibN = vib.length; s.vibStart = s.vf; s.vibTxt = vib[vib.length - 1].src + ' ' + vib[vib.length - 1].p; }
    const cheerAge = s.vf - s.cheerStart, mufAge = s.vf - s.mufStart, subAge = s.vf - s.subStart, vibAge = s.vf - s.vibStart;
    const clameur = cheerAge >= 0 && cheerAge < 90 ? (1 - cheerAge / 90) * (s.cheerDead ? 0.5 : Math.min(1, s.cheerMark / 10 + 0.15)) : 0;
    bar('vent', pr.wind, pr.wind.toFixed(2) + ' / ' + pr.windHz + ' Hz');
    bar('sifflet', pr.hiss, pr.hiss > 0 ? pr.hiss.toFixed(2) : '');
    bar('foule', pr.crowd, pr.crowd.toFixed(2));
    bar('clameur', clameur, cheerAge < 90 ? (s.cheerDead ? 'OHHH decu' : 'OVATION ' + s.cheerMark.toFixed(1)) : '');
    bar('etouffe', mufAge >= 0 && mufAge < 15 ? 1 : 0, mufAge >= 0 && mufAge < 15 ? '480 Hz, 0,5 s' : '');
    bar('sub', subAge >= 0 && subAge < 12 ? s.subLevel * (1 - subAge / 12) : 0, subAge < 12 && s.subLevel ? 'p ' + s.subLevel.toFixed(2) : '');
    bar('manette', vibAge >= 0 && vibAge < 12 ? 1 : 0, vibAge < 12 ? s.vibTxt : '');
    // la legende dit ce qu'on entendrait
    let cap = '';
    if (s.phase === 'saut2' && carte) cap = 'le plat : ohhh decu du bord, score 0, le run s\'arrete';
    else if (s.phase === 'titre') cap = 'v4.5 : le vent, la foule du bord, l\'impact qui descend, la manette qui vibre';
    else if (s.phase === 'spots0' || s.phase === 'spots1') cap = 'le bouton muet coupe le son et la vibration';
    else if (s.phase === 'saut1' || s.phase === 'saut2') {
      const st = j && j.state;
      if (st === 'walk') cap = 'le murmure du bord grossit avec l\'elan, la manette vibre au decollage';
      else if (st === 'fly') cap = pr.hiss > 0.05
        ? 'la foule se tait, le vent s\'ouvre vers l\'aigu, le sifflement parle'
        : 'la foule retient son souffle, le souffle du vent suit la vitesse';
      else if (mufAge >= 0 && mufAge < 40) cap = s.splashDead
        ? 'la claque a plat, le sourd qui descend, l\'oreille etouffee sous l\'eau'
        : 'l\'impact descend dans le corps, l\'oreille s\'etouffe puis le monde rouvre';
    } else if (s.phase === 'carte1') cap = s.cheerDead ? 'ohhh decu, quelques applaudissements polis' : 'l\'ovation du bord, dosee par la moyenne des juges';
    else if (s.phase === 'fin') cap = 'le plat claque : score 0, la foule partage le moment';
    document.getElementById('son-caption').textContent = cap;

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
    return {
      vf: s.vf, tick: s.tick, phase: s.phase, stats: s.stats, phaseLog: s.phaseLog,
      cheer: { mark: s.cheerMark, dead: s.cheerDead }, cheerStart: s.cheerStart,
      cheerAge: s.vf - s.cheerStart, mufStart: s.mufStart,
      splashN: s.splashN, vibN: s.vibN
    };
  };
  window.__capture = () => {
    const s = window.__seq, j = d.jump, pr = d.audio.probe();
    if (s.phase === 'saut1' && j && j.state === 'fly' && pr.hiss >= 0.35) return 'vent-siffle';
    if (s.splashN === 1 && s.vf - s.mufStart >= 3 && s.vf - s.mufStart <= 9) return 'impact-etouffe';
    if (s.phase === 'carte1' && !s.cheerDead && s.carteF >= 24 && s.carteF <= 36) return 'carte-ovation';
    if (s.splashN === 2 && s.splashDead && s.vf - s.mufStart >= 2 && s.vf - s.mufStart <= 8) return 'plat-ohhh';
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
const capsLog = [];
t0 = Date.now();
let i = DEBUT;
const STOP = +(process.env.STOP_AT || 0);
for (; i < Math.min(DEBUT + NB, MAX, STOP || MAX); i++) {
  await page.evaluate(n => window.__avance(n + 1), i);
  if (!existe(i) && !DRY) {
    const jpg = await page.evaluate(() => { const d = window.__dods; d.draw(); return d.renderer.domElement.toDataURL('image/jpeg', 0.92); });
    fs.writeFileSync(fJpg(i), Buffer.from(jpg.slice(23), 'base64'));
    await page.evaluate(() => window.__hudOnly(true));
    await page.screenshot({ path: fHud(i), type: 'png', omitBackground: true, timeout: 60000 });
    await page.evaluate(() => window.__hudOnly(false));
    rendues.push(i);
  }
  // captures pleines (canvas + HUD composes par le navigateur) : une par moment cle
  if (CAPDIR && !DRY) {
    const cap = await page.evaluate(() => window.__capture());
    if (cap && !fs.existsSync(`${CAPDIR}/${cap}.png`)) {
      // les fondus CSS des ecrans tournent au temps reel : en rejouant vite, la
      // carte serait encore a moitie transparente. La simu est figee, attendre ne
      // decale rien.
      await page.waitForTimeout(700);
      capsLog.push({ cap, vf: i, dom: await page.evaluate(() => {
        const c = document.querySelector('#s-jump');
        return { on: [...document.querySelectorAll('.screen.on')].map(s => s.id), op: getComputedStyle(c).opacity };
      }) });
      await page.screenshot({ path: `${CAPDIR}/${cap}.png`, type: 'png', timeout: 120000 });
    }
  }
}
const dt = (Date.now() - t0) / 1000;
const etat = await page.evaluate(() => window.__etat());
await browser.close();

// la suite de frames est continue par construction : le troncon qui atteint MAX assemble
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
  warmup: +warmup.toFixed(1), video, capsLog, erreurs: errs
}, null, 1));
