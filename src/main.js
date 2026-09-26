import * as THREE from 'three';
import { SPOTS, DIFF_LABEL } from './spots.js';
import { buildWorld } from './world.js';
import { createSplash } from './fx.js';
import { createAudio } from './audio.js';
import { Jump, keepsStreak, streakBonus } from './game.js';

const $ = s => document.querySelector(s);
export const VERSION = 'v2.1';
const JUMPS_PER_RUN = 3;
// Meme cle qu'en v1 : la note et le score n'ont pas change d'echelle, les records restent.
const STORE = 'dods3000.v1';

/* ---------- DOM ---------- */
// Tout ce que la boucle touche est lu une fois ici. Un querySelector par element et par
// image, puis une ecriture meme quand rien ne change, coutait un recalcul de style a
// chaque frame sur mobile.
const E = {};
for (const id of ['hud-alt', 'hud-jump', 'hud-score', 'hud-spot', 'hud-streak', 'runbar', 'runbar-fill', 'runbar-zone',
  'tuckring', 'tr-grade', 'tr-streak', 'pot', 'prompt', 'toast', 'callout', 'vignette', 'speed', 'flash', 'fade', 'pause', 'pause-text',
  'pause-resume', 'loading', 'sound', 'version'])
  E[id] = document.getElementById(id);
const trArc = E.tuckring.querySelector('.tr-arc'), trZone = E.tuckring.querySelector('.tr-zone');

function setText(n, v) { if (n._t !== v) { n._t = v; n.textContent = v; } }
function setStyle(n, k, v) { const c = '_s' + k; if (n[c] !== v) { n[c] = v; n.style[k] = v; } }
function setClass(n, cls, on) { const c = '_c' + cls; if (n[c] !== on) { n[c] = on; n.classList.toggle(cls, on); } }
function setAttr(n, k, v) { const c = '_a' + k; if (n[c] !== v) { n[c] = v; n.setAttribute(k, v); } }

const audio = createAudio();
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// ACES desature les teintes pales : la roche beige y virait au gris. Le tone mapping neutre garde la couleur.
renderer.toneMapping = THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 1600);
let world = null, jump = null, splash = null;
let state = { spot: SPOTS[0], jumpIndex: 0, runScore: 0, last: null, streak: 0 };
const save = loadSave();

function loadSave() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { best: {} }; }
  catch { return { best: {} }; }
}
function persist() { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { } }
function totalScore() { return Object.values(save.best).reduce((a, b) => a + b, 0); }

/* ---------- resolution adaptative ---------- */
// Le telephone qui tient mal 60 images par seconde perd en finesse, pas en fluidite.
// On ne descend qu'apres une seconde de chute franche, et on verifie que ca a servi :
// un ecran bride a 30 Hz (mode economie d'energie) ne gagne rien a flouter l'image,
// alors on revient en arriere et on arrete de chercher.
// 1,5 sur telephone : 27 % de pixels en moins qu'a 1,75, invisible avec l'antialiasing.
const PR_MAX = Math.min(window.devicePixelRatio || 1, Math.min(window.innerWidth, window.innerHeight) < 700 ? 1.5 : 2);
const PR_MIN = Math.min(PR_MAX, 0.85);
const quality = { pr: PR_MAX, ema: 1 / 60, bad: 0, mode: 'watch', probeT: 0, before: 0, on: true };
function setPR(pr) { quality.pr = pr; renderer.setPixelRatio(pr); resize(); }
function adapt(real) {
  if (!quality.on || quality.mode === 'off' || real <= 0 || real > 0.2) return;
  quality.ema += (real - quality.ema) * 0.06;
  if (quality.mode === 'probe') {
    quality.probeT += real;
    if (quality.probeT > 2) {
      if (quality.ema < quality.before * 0.88) quality.mode = 'watch';
      else { setPR(quality.prev); quality.mode = 'off'; }
    }
    return;
  }
  quality.bad = quality.ema > 1 / 50 ? quality.bad + real : 0;
  if (quality.bad > 1 && quality.pr > PR_MIN) {
    quality.before = quality.ema; quality.prev = quality.pr;
    setPR(Math.max(PR_MIN, +(quality.pr * 0.8).toFixed(2)));
    quality.mode = 'probe'; quality.probeT = 0; quality.bad = 0;
  }
}

/* ---------- son ---------- */
// L'etat vit dans la meme sauvegarde que les records, donc il survit au rechargement.
function setMuted(v) {
  save.muted = !!v;
  persist();
  audio.setMuted(save.muted);
  const b = E.sound;
  b.classList.toggle('muted', save.muted);
  b.setAttribute('aria-pressed', save.muted ? 'true' : 'false');
  b.title = save.muted ? 'Rétablir le son' : 'Couper le son';
}
E.sound.addEventListener('click', () => {
  const next = !save.muted;
  setMuted(next);
  if (!next) { audio.unlock(); audio.ui(); }
});
setMuted(!!save.muted);

/* ---------- ecrans ---------- */
const screens = ['title', 'spots', 'brief', 'run', 'jump', 'end'];
const SCREEN = Object.fromEntries(screens.map(s => [s, $('#s-' + s)]));
const on = s => SCREEN[s].classList.contains('on');
let shownAt = 0;
function show(...names) {
  for (const s of screens) SCREEN[s].classList.toggle('on', names.includes(s));
  // Un bouton qui disparait garde le focus : l'Espace suivant lui revenait, pas au jeu.
  const a = document.activeElement;
  if (a && a !== document.body && a.closest && a.closest('.screen:not(.on)')) a.blur();
  shownAt = performance.now();
  // Hors du jeu : plus de tension ni de vent, et le plongeur retourne en haut de la falaise.
  if (!names.includes('run')) {
    audio.setTension(0); audio.setWind(0);
    clearHeld();
    if (jump && jump.state !== 'walk') jump.reset();
    setStyle(E.speed, 'opacity', '0');
  }
}

function buildSpotList() {
  const list = $('#spot-list');
  list.innerHTML = '';
  for (const s of SPOTS) {
    // Un vrai bouton : focus au clavier, Entree et Espace natifs, annonce par les lecteurs d'ecran.
    const el = document.createElement('button');
    el.className = 'spot';
    el.type = 'button';
    const best = save.best[s.id] || 0;
    el.setAttribute('aria-label',
      `${s.name}, ${s.place}, ${s.height} mètres, difficulté ${DIFF_LABEL[s.diff]}, record ${best}`);
    el.innerHTML = `
      <span class="sky" style="background:linear-gradient(180deg, rgba(4,14,26,0) 15%, rgba(4,14,26,.45) 55%, rgba(4,14,26,.88) 100%), linear-gradient(165deg, ${s.palette.sky[0]}, ${s.palette.sky[1]} 52%, ${s.palette.water})"></span>
      <span class="name">${s.name}</span>
      <span class="place">${s.place}</span>
      <span class="meta" aria-hidden="true">
        <span><b>${s.height} m</b></span>
        <span class="diff">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= s.diff ? 'on' : ''}"></i>`).join('')}</span>
        <span>RECORD <b>${best}</b></span>
      </span>`;
    el.onclick = () => { audio.ui(); openBrief(s); };
    list.appendChild(el);
  }
  $('#total-score').textContent = totalScore();
}

// Les fleches parcourent la grille des spots, Debut et Fin sautent aux extremites.
$('#spot-list').addEventListener('keydown', e => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
  const cards = [...document.querySelectorAll('#spot-list .spot')];
  if (!cards.length) return;
  const i = cards.indexOf(document.activeElement);
  const next = e.key === 'Home' ? 0
    : e.key === 'End' ? cards.length - 1
      : Math.min(cards.length - 1, Math.max(0, (i < 0 ? 0 : i + step)));
  e.preventDefault();
  cards[next].focus();
});

function openBrief(spot) {
  state.spot = spot;
  $('#brief-name').textContent = spot.name;
  $('#brief-place').textContent = spot.place;
  $('#brief-height').textContent = spot.height + ' m';
  $('#brief-diff').textContent = DIFF_LABEL[spot.diff];
  $('#brief-best').textContent = save.best[spot.id] || 0;
  $('#brief-note').textContent = spot.note;
  show('brief');
  // Le decor du spot choisi s'installe derriere la fiche, pendant qu'on la lit : la
  // construction et la compilation des shaders sont payees ici, pas au moment de sauter.
  // Compare a la cible du fondu en cours, pas au monde encore affiche : trois choix
  // rapides laissaient sinon le decor du deuxieme derriere la fiche du troisieme.
  const target = pendingSpot || (world && world.spot);
  if (!target || target.id !== spot.id) swapWorld(spot);
}

/* ---------- monde ---------- */
// Un monde par spot, garde tant qu'on reste sur ce spot : rejouer ne reconstruit plus
// rien. Il est libere des qu'on en change (invariant 10 de AGENTS.md).
function useWorld(spot) {
  if (world && world.spot.id === spot.id) return;
  if (jump) { jump.dispose(); jump = null; }
  if (world) { world.dispose(); world = null; splash = null; }
  world = buildWorld(spot, renderer);
  splash = createSplash(world.scene, world.waterMat);
  jump = new Jump(spot, world.scene, camera, splash, audio);
  jump.reduced = reduced();
  menuCam.snap = true;
  // compile() ne voit que ce qui est visible : la gerbe, cachee jusqu'a l'impact,
  // aurait compile ses shaders au pire moment, pendant l'entree dans l'eau.
  // compile() ne prechauffe pas la passe d'ombre : une vraie image, rendue sous le fondu,
  // compile tout, ombres comprises.
  const hidden = [];
  world.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { renderer.compile(world.scene, camera); renderer.render(world.scene, camera); } catch { }
  for (const o of hidden) o.visible = false;
  // Un nouveau decor n'a pas le meme cout : la resolution adaptative reprend sa veille.
  if (quality.mode === 'off') { quality.mode = 'watch'; quality.bad = 0; }
}

// Un fondu court masque le changement de decor et la construction qui l'accompagne.
let swapTimer = 0, pendingSpot = null;
function swapWorld(spot) {
  setClass(E.fade, 'on', true);
  clearTimeout(swapTimer);
  pendingSpot = spot;
  swapTimer = setTimeout(() => {
    pendingSpot = null;
    useWorld(spot);
    requestAnimationFrame(() => setClass(E.fade, 'on', false));
  }, 140);
}

/* ---------- run ---------- */
function startRun() {
  clearTimeout(swapTimer);
  pendingSpot = null;
  clearHeld();
  setClass(E.fade, 'on', false);
  useWorld(state.spot);
  state.jumpIndex = 0;
  state.runScore = 0;
  state.streak = 0;
  setText(E['hud-spot'], state.spot.name.toUpperCase());
  nextJump();
  show('run');
}

function nextJump() {
  setPause(false);
  // Le doigt qui vient de taper la carte est peut-etre encore pose : le saut suivant
  // commence sans geste en cours, et ce doigt-la ne compte plus.
  owner = null;
  state.jumpIndex++;
  jump.reset();
  jump.onDone = onJumpDone;
  lastLevel = -1;
  setText(E['hud-jump'], `${state.jumpIndex}/${JUMPS_PER_RUN}`);
  setText(E['hud-score'], String(state.runScore));
  showStreak();
  setClass(E.runbar, 'on', true);
  setClass(E.tuckring, 'on', false);
  // la zone de bon decollage : les 2,6 derniers metres des 9,5 de la piste
  setStyle(E['runbar-zone'], 'left', ((1 - 2.6 / 9.5) * 100).toFixed(1) + '%');
  setStyle(E['runbar-zone'], 'width', ((2.6 / 9.5) * 100).toFixed(1) + '%');
  setPrompt(save.jumps ? 'APPUIE AU BORD, ET TIENS' : 'APPUIE AU BORD… ET GARDE LE DOIGT', true);
}

/* ---------- lecture du timing ---------- */
// GOOD ou EARLY ne dit pas si on a manque de 30 ms ou de 300. L'ecart au parfait et
// la jauge situent la fermeture dans la fenetre : c'est ce qui rend le geste apprenable.
const sec = v => v.toFixed(2).replace('.', ',');

function timingText(res) {
  const w = res.win;
  if (!res.tucked) return 'jamais lâché';
  // Lacher dans la foulee du decollage : le premier reflexe de qui tape au lieu de tenir.
  if (res.air < 0.3 && !res.dead) return 'lâché tout de suite : garde le doigt pour rester en døds';
  if (res.ttc < w.perfectLo) return sec(w.perfectLo - res.ttc) + ' s trop tard';
  if (res.ttc <= w.perfectHi) return 'au cœur de la fenêtre';
  return sec(res.ttc - w.perfectHi) + ' s trop tôt';
}

// L'axe va de la fermeture la plus precoce, a gauche, a l'entree dans l'eau, a droite.
function drawGauge(res) {
  const w = res.win;
  const scale = w.goodHi;
  const x = ttc => Math.max(0, Math.min(100, (1 - ttc / scale) * 100));
  const band = (sel, lo, hi) => {
    const el = $('#jr-gauge .g-zone.' + sel);
    el.style.left = x(hi) + '%';
    el.style.width = Math.max(0, x(lo) - x(hi)) + '%';
  };
  band('good', w.greatHi, w.goodHi);
  band('great', w.perfectHi, w.greatHi);
  band('perfect', w.perfectLo, w.perfectHi);
  band('smack', 0, w.perfectLo);
  const mark = $('#jr-gauge .g-mark');
  mark.style.left = (res.tucked ? x(res.ttc) : 100) + '%';
  mark.style.background = res.grade.color;
}

// La serie se compte sur les timings GREAT ou mieux. Elle se casse au premier rate,
// et le bonus s'applique au saut qui la porte, pas retroactivement.
function showStreak() {
  const b = streakBonus(state.streak);
  const el = E['hud-streak'];
  setText(el, b ? b.label : (state.streak === 1 ? 'SÉRIE x1' : ''));
  setClass(el, 'on', !!b);
  setClass(el, 'dim', !b && state.streak === 1);
}

function onJumpDone(res) {
  state.last = res;
  save.jumps = (save.jumps || 0) + 1;
  if (res.dead) buzz([40, 60, 40]);
  const broken = state.streak >= 2 && !keepsStreak(res.grade);
  state.streak = !res.dead && keepsStreak(res.grade) ? state.streak + 1 : 0;
  const bonus = streakBonus(state.streak);
  const gained = bonus ? Math.round(res.score * bonus.mult) : res.score;
  state.runScore += gained;
  showStreak();
  if (bonus) callout(bonus.label, '#5ef0a8');
  else if (broken) toast('SÉRIE PERDUE');
  setText(E['hud-score'], String(state.runScore));
  audio.grade(res.dead ? 0 : res.grade.mult);
  $('#jr-grade').textContent = res.grade.label;
  $('#jr-grade').style.color = res.grade.color;
  $('#jr-sub').textContent = res.dead
    ? 'À plat. Le run s\'arrête là.'
    : `${res.takeoff.label} · ${res.air.toFixed(2)} s en l\'air`;
  $('#jr-timing').textContent = timingText(res);
  $('#jr-timing').style.color = res.grade.color;
  // nommer la forme d'entree : c'est le vocabulaire du dodsing, et ca s'apprend en jouant
  $('#jr-landing').innerHTML = `<b>${res.landing.label}</b> · ${res.landing.note}`;
  drawGauge(res);
  $('#jr-lines').innerHTML = res.dead ? '' : `
    <li><span>Base ${res.height} m</span><b>${res.base}</b></li>
    <li><span>Style, ${res.air.toFixed(2)} s en døds</span><b>+${res.style}</b></li>
    <li><span>Timing ${res.grade.label}</span><b>x${res.grade.mult}</b></li>
    <li><span>${res.takeoff.label}</span><b>x${res.takeoff.mult}</b></li>
    ${bonus ? `<li><span>${bonus.label}</span><b>x${bonus.mult}</b></li>` : ''}
    <li class="total"><span>Saut ${state.jumpIndex}</span><b>${gained}</b></li>`;
  const finished = res.dead || state.jumpIndex >= JUMPS_PER_RUN;
  $('#jr-next').textContent = finished ? 'BILAN' : 'SAUT SUIVANT';
  $('#jr-next').onclick = () => { audio.ui(); advance(); };
  persist();
  show('run', 'jump');
}

// Le resultat se passe d'un tap n'importe ou : la boucle d'essais doit rester courte.
function advance() {
  const res = state.last;
  const finished = !res || res.dead || state.jumpIndex >= JUMPS_PER_RUN;
  if (finished) endRun(res && res.dead);
  else { show('run'); nextJump(); }
}

function endRun(dead) {
  const best = save.best[state.spot.id] || 0;
  const record = state.runScore > best;
  if (record) { save.best[state.spot.id] = state.runScore; persist(); }
  $('#end-title').textContent = dead ? 'RUN TERMINÉ' : 'TROIS SAUTS DANS LA BOÎTE';
  $('#end-sub').textContent = state.spot.name + ' · ' + state.spot.height + ' m';
  $('#end-score').textContent = state.runScore;
  $('#end-best').textContent = record ? 'NOUVEAU RECORD SUR CE SPOT' : `Record du spot : ${best}`;
  show('run', 'end');
  buildSpotList();
}

/* ---------- HUD ---------- */
const RING_C = 2 * Math.PI * 52;
function setPrompt(text, blink) {
  setText(E.prompt, text);
  setClass(E.prompt, 'blink', !!blink);
}
function toast(text) {
  const el = E.toast;
  el.textContent = text; el._t = text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
let calloutTimer = 0;
function callout(text, color) {
  const c = E.callout;
  c.textContent = text; c.style.color = color;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  clearTimeout(calloutTimer);
  calloutTimer = setTimeout(() => c.classList.remove('pop'), 1400);
}

const GRADE_LEVEL = { chicken: 0, early: 1, good: 2, great: 3, perfect: 4, smack: 5 };
let lastLevel = -1, beatClock = 0;

function updateHud(dt) {
  const h = jump.hud();
  setText(E['hud-alt'], Math.round(h.alt) + ' m');
  if (h.phase === 'walk') {
    // transform plutot que width : la barre bouge sans recalcul de mise en page
    setStyle(E['runbar-fill'], 'transform', `scaleX(${Math.max(0, Math.min(1, h.progress)).toFixed(3)})`);
    setStyle(E.speed, 'opacity', '0');
    audio.setTension(0);
    return;
  }
  if (h.phase === 'fly') {
    setClass(E.runbar, 'on', false);
    const ring = E.tuckring;
    setClass(ring, 'on', true);
    // Une fois ferme, l'anneau a fait son travail : il s'efface pour laisser voir l'entree.
    setClass(ring, 'done', h.tucked);
    setAttr(trArc, 'stroke-dasharray', `${(h.ratio * RING_C).toFixed(1)} ${RING_C}`);
    setAttr(trZone, 'stroke-dasharray', `0 ${(h.zoneLo * RING_C).toFixed(1)} ${((h.zoneHi - h.zoneLo) * RING_C).toFixed(1)} ${RING_C}`);
    const sp = Math.min(1, Math.abs(jump.vel.y) / 24);
    if (!h.tucked && h.pot) {
      // La mise en direct : ce que le lacher rapporterait maintenant. Elle grimpe de
      // palier en palier, vire a l'or, puis tombe a zero quand l'eau est trop proche.
      const g = h.pot.grade;
      setAttr(ring, 'data-grade', g.key);
      setText(E['tr-grade'], h.held || h.flailing ? g.short : 'DØDS');
      // La mise vaut ce que le saut ajoutera au score du run, serie comprise : le chiffre
      // montre en l'air est celui qu'on retrouve sur la carte.
      const bonus = keepsStreak(g) ? streakBonus(state.streak + 1) : null;
      setText(E.pot, g.key === 'smack' ? '0' : '+' + (bonus ? Math.round(h.pot.score * bonus.mult) : h.pot.score));
      setText(E['tr-streak'], bonus ? bonus.label : '');
      const level = GRADE_LEVEL[g.key];
      if (level !== lastLevel) { if (lastLevel >= 0 && level < 5) audio.tick(level); lastLevel = level; }
      // Le texte ne donne jamais le top : l'oeil reagit trop tard, c'est l'eau qui monte,
      // l'ombre qui se resserre et le son qui grimpe qui doivent faire lacher.
      setPrompt(h.flailing && !h.held ? 'APPUIE, PUIS LÂCHE AVANT L\'EAU'
        : !h.held ? 'APPUIE ET TIENS' : 'TIENS… LÂCHE JUSTE AVANT L\'EAU', h.hot && h.held);
      // Le son monte avec le temps qui reste, le coeur accelere : on anticipe a l'oreille.
      const v = Math.max(0, Math.min(1, 1 - h.ttc / 1.9));
      audio.setTension(h.held ? v : 0);
      beatClock += dt;
      if (h.held && beatClock > 0.62 - v * 0.46) { beatClock = 0; audio.beat(v); }
    } else {
      setPrompt('', false);
      audio.setTension(0);
    }
    audio.setWind(0.15 + sp * 0.85);
    setStyle(E.vignette, 'opacity', (0.35 + sp * 0.85).toFixed(2));
    setStyle(E.speed, 'opacity', (h.tucked ? 0 : sp * sp * 0.9 * motionScale()).toFixed(2));
    return;
  }
  setClass(E.tuckring, 'on', false);
  setPrompt('', false);
  audio.setWind(0);
  audio.setTension(0);
  setStyle(E.vignette, 'opacity', '1');
  setStyle(E.speed, 'opacity', '0');
}

/* ---------- ralenti sur un perfect ---------- */
// Le geste parfait merite d'etre vu. Le ralenti commence apres la fermeture, donc apres
// que le style et la note sont figes : le score est identique avec ou sans.
const SLOW_TTC = 0.35, SLOW_RATE = 0.35;
function slowFactor() {
  if (!window.__dods.slowmo || !jump || !jump.grade || jump.grade.key !== 'perfect') return 1;
  if (jump.state === 'fly') return jump.tucked && jump.ttc <= SLOW_TTC ? SLOW_RATE : 1;
  if (jump.state === 'impact') return jump.impactT < SLOW_TTC ? SLOW_RATE : 1;
  return 1;
}

/* ---------- mouvement reduit ---------- */
// La preference est lue a chaque usage, donc un changement systeme s'applique sans rechargement.
// Elle n'agit que sur la camera et les effets : la physique et le score restent identiques.
const REDUCED = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function reduced() { return !!(REDUCED && REDUCED.matches); }
function motionScale() { return reduced() ? 0.25 : 1; }

/* ---------- retour haptique ---------- */
// navigator.vibrate manque sur desktop et sur iOS : on sort sans bruit.
// Le bouton du son commande aussi la vibration, c'est le meme reflexe de discretion.
function buzz(pattern) {
  if (save.muted || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch { }
}

/* ---------- pause ---------- */
// L'onglet en arriere plan ralentit requestAnimationFrame : sans pause, le joueur
// revient sur un smack qu'il n'a pas vu venir. On fige et on attend une action.
let autoPaused = false;

function inJump() {
  return !!jump && on('run') && !on('jump') && !on('end')
    && (jump.state === 'walk' || jump.state === 'fly');
}
function paused() { return window.__dods.paused || autoPaused; }
function setPause(v) {
  if (autoPaused === v) return;
  autoPaused = v;
  if (v) {
    audio.setWind(0); audio.setTension(0);
    // Le doigt n'est plus sur l'ecran au retour : le corps reste ouvert, et il faudra
    // reappuyer pour reprendre la main. Reprendre sur un lacher fermerait le saut.
    const holding = jump && jump.state === 'fly' && !jump.tucked;
    if (holding) jump.held = false;
    setText(E['pause-text'], holding
      ? 'Tu es en plein vol. Appuie et tiens pour reprendre, puis lâche avant l\'eau.'
      : 'L\'onglet est passé en arrière plan. Le saut reprend où il s\'est arrêté.');
    setText(E['pause-resume'], holding ? 'APPUIE ET TIENS' : 'REPRENDRE');
  }
  setClass(E.pause, 'on', v);
}

function autoPause() {
  clearHeld();
  if (inJump()) setPause(true);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
// Alt-tab sans que l'onglet soit masque : la touche relachee ailleurs ne revient jamais.
window.addEventListener('blur', autoPause);

/* ---------- entrees ---------- */
// Un seul geste pour tout le saut : appuyer, tenir, lacher. Le clavier et les doigts
// alimentent le meme ensemble de « maintiens » ; le geste commence au premier et se
// termine quand le dernier se leve. Un deuxieme doigt ne fait donc rien, et la
// repetition automatique du clavier est ignoree.
const held = new Set();
// Le maintien qui a lance le geste est le seul qui le termine. Un doigt fantome (un
// pointerup perdu, un doigt pose au bord de l'ecran) ne bloque donc plus rien : il ne
// peut ni empecher un decollage ni retenir un lacher.
let owner = null;
let frameStamp = performance.now(), frameRate = 1;
function clearHeld() { held.clear(); owner = null; }

// Temps ecoule entre la derniere image simulee et l'evenement, en temps de jeu.
function lateOf(e) {
  if (!e || paused()) return 0;
  const now = performance.now();
  let t = typeof e.timeStamp === 'number' ? e.timeStamp : now;
  if (!(t > 0) || Math.abs(t - now) > 1000) t = now;
  return Math.max(0, Math.min(0.05, (t - frameStamp) / 1000)) * frameRate;
}

function inputDown(src, e) {
  // Un maintien deja connu qui reappuie : son lacher s'est perdu (souris relachee hors de
  // la fenetre). On le solde avant de prendre le nouvel appui, sinon le jeu reste bloque.
  if (held.has(src)) inputUp(src, e);
  held.add(src);
  audio.unlock();
  // Un second doigt pendant le geste ne fait rien. Hors geste, tout nouvel appui compte.
  if (owner !== null) return;
  owner = src;
  onPress(e);
}
function inputUp(src, e) {
  if (!held.delete(src)) return;
  if (src !== owner) return;
  owner = null;
  onRelease(e);
}

function onPress(e) {
  if (autoPaused) {
    setPause(false);
    // reprendre en plein vol, c'est reprendre la main : le doigt pose tient le dods
    if (jump && jump.state === 'fly' && !jump.tucked) jump.down(0);
    return;
  }
  if (on('end')) {
    if (performance.now() - shownAt > 600) { audio.ui(); startRun(); }
    return;
  }
  if (on('jump')) {
    if (performance.now() - shownAt > 450) { audio.ui(); advance(); }
    return;
  }
  if (on('title')) { audio.ui(); buildSpotList(); show('spots'); return; }
  if (on('brief')) { audio.ui(); startRun(); return; }
  if (!jump || !on('run')) return;
  const late = lateOf(e);
  const what = jump.down(late);
  if (what === 'takeoff') {
    toast(jump.takeoff.label);
    buzz(20);
    setClass(E.runbar, 'on', false);
    beatClock = 0;
  }
}

function onRelease(e) {
  if (!jump || !on('run') || on('jump') || on('end') || autoPaused) return;
  const late = lateOf(e);
  if (jump.up(late) === 'tuck') {
    callout(jump.grade.label, jump.grade.color);
    buzz(jump.grade.key === 'smack' ? [40, 60, 40] : jump.grade.key === 'perfect' ? [15, 40, 15, 40, 30] : 30);
    audio.setTension(0);
  }
}

const isAction = e => e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === ' ';
window.addEventListener('keydown', e => {
  if (isAction(e)) {
    // Un bouton a le focus : on lui laisse son Espace et son Entree natifs.
    if (e.target && e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    if (e.repeat) return;
    inputDown('k' + e.code, e);
  }
  if (e.code === 'Escape' && on('run')) { clearHeld(); setPause(false); show('spots'); buildSpotList(); }
});
window.addEventListener('keyup', e => { if (isAction(e)) inputUp('k' + e.code, e); });

// Les doigts : partout sauf sur les boutons et les ecrans de menu. Le canvas, le HUD,
// la carte de resultat et la pause sont des surfaces de jeu.
window.addEventListener('pointerdown', e => {
  const t = e.target;
  if (t.closest && (t.closest('button, a, input') || t.closest('#s-title, #s-spots, #s-brief, #s-end .card'))) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  inputDown('p' + e.pointerId, e);
}, { passive: false });
window.addEventListener('pointerup', e => inputUp('p' + e.pointerId, e));
window.addEventListener('pointercancel', e => inputUp('p' + e.pointerId, e));
// Un appui long ne doit ouvrir ni menu contextuel ni loupe : c'est le geste du jeu.
window.addEventListener('contextmenu', e => { if (on('run')) e.preventDefault(); });

document.querySelectorAll('[data-go]').forEach(b => {
  b.addEventListener('click', () => {
    audio.unlock(); audio.ui();
    const go = b.dataset.go;
    if (go === 'spots') { buildSpotList(); show('spots'); }
    else if (go === 'title') show('title');
    else if (go === 'run') startRun();
  });
});

/* ---------- surface de test ---------- */
// Pilotage du jeu sans clavier, pour les captures et le check.
// autoJump : distance au bord (m) a laquelle appuyer. autoTuck : ttc (s) auquel lacher.
// Les deux sont evalues dans la boucle, donc a la frame pres.
window.__dods = {
  press: () => onPress(null), down: () => onPress(null), up: () => onRelease(null),
  get jump() { return jump; }, get world() { return world; }, camera, renderer,
  get state() { return state; }, show, startRun, openBrief, quality, spots: SPOTS,
  autoJump: null, autoTuck: null, paused: false, slowmo: true, render: true,
  // une seule image, a la demande : les captures n'ont pas a payer le rendu de chaque tick
  draw: () => { if (world) renderer.render(world.scene, camera); }
};

/* ---------- boucle ---------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
// redimensionner vide le canvas : en pause, il faut redessiner l'image figee
window.addEventListener('resize', () => { resize(); needsDraw = true; });
renderer.setPixelRatio(PR_MAX);
resize();

let shake = 0;
// Un seul temps de simulation pour la mer et le ciel : sous tick(), une horloge murale
// aurait fait sauter les vagues et l'onde d'impact.
let simTime = 0;
const view = { fov: 58, height: 800 };

// Travelling lent autour du spot tant qu'on est dans les menus. Il vit dans la boucle
// d'affichage : en v1 un setInterval a 30 Hz le deplacait une image sur deux.
const menuCam = { snap: true, pos: new THREE.Vector3(), look: new THREE.Vector3(), tgt: new THREE.Vector3(), lookTgt: new THREE.Vector3() };
function placeMenuCamera(dt) {
  const h = world.spot.height;
  const t = simTime;
  const brief = on('brief');
  const a = -0.45 + Math.sin(t * 0.07) * 0.5;
  if (brief) {
    // Sur la fiche, la camera vient au bord : le plongeur qui attend, et le vide devant lui.
    const b = Math.sin(t * 0.11) * 0.35;
    menuCam.tgt.set(-11 - Math.sin(b) * 3, h + 3.2 + Math.sin(t * 0.13) * 0.4, 6 + Math.cos(b) * 3);
    menuCam.lookTgt.set(0, h - 1.2, -3.5);
  } else {
    menuCam.tgt.set(-34 - Math.sin(a) * 14, h * 0.75 + Math.sin(a * 2) * 3, 40 + Math.cos(a) * 12);
    menuCam.lookTgt.set(0, h * 0.4, 0);
  }
  const k = menuCam.snap ? 1 : Math.min(1, dt * 1.6);
  menuCam.snap = false;
  camera.position.lerp(menuCam.tgt, k);
  menuCam.look.lerp(menuCam.lookTgt, k);
  camera.lookAt(menuCam.look);
  let fov = 52;
  if (camera.aspect < 1) fov *= 1 + (1 - camera.aspect) * 0.6;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
}

// Une frame de simulation. dt est fourni par la boucle, ou force par les tests.
function frame(dt) {
  if (!world) return;
  simTime += dt;
  world.setTime(simTime);
  if (jump && on('run')) {
    const k = slowFactor();
    frameRate = k;
    dt *= k;
    jump.update(dt, s => { shake = s; });
    const A = window.__dods;
    if (dt <= 0) { /* fige : pas d'entree automatique */ }
    else if (A.autoJump != null && jump.state === 'walk' && (0 - jump.pos.z) <= A.autoJump) onPress(null);
    else if (A.autoTuck != null && jump.state === 'fly' && !jump.tucked && jump.held && jump.ttc <= A.autoTuck) onRelease(null);
    updateHud(dt);
    if (shake > 0.01) {
      const amp = shake * 0.55 * motionScale();
      camera.position.x += (Math.random() - 0.5) * amp;
      camera.position.y += (Math.random() - 0.5) * amp;
    }
  } else {
    frameRate = 1;
    placeMenuCamera(dt);
  }
  view.fov = camera.fov;
  view.height = renderer.domElement.height;
  if (splash) splash.update(dt, view);
  if (window.__dods.render) renderer.render(world.scene, camera);
  hudFlash();
}

let lastStamp = performance.now();
function loop(ts) {
  requestAnimationFrame(loop);
  const now = typeof ts === 'number' ? ts : performance.now();
  const real = Math.max(0, (now - lastStamp) / 1000);
  lastStamp = now;
  frameStamp = now;
  // En pause, rien ne bouge : on ne redessine pas la meme image soixante fois par
  // seconde. Les tests avancent alors la simulation par tick(), qui dessine lui-meme.
  if (paused()) { if (needsDraw) { needsDraw = false; frame(0); } return; }
  adapt(real);
  frame(Math.min(0.05, real));
}
let needsDraw = false;

// Avance la simulation d'un nombre de pas fixes, sans dependre du rafraichissement ecran.
window.__dods.tick = (steps = 1, dt = 1 / 60) => {
  for (let i = 0; i < steps; i++) frame(dt);
  return jump ? { state: jump.state, y: +jump.pos.y.toFixed(2), z: +jump.pos.z.toFixed(2), ttc: +jump.ttc.toFixed(3), tucked: jump.tucked, held: jump.held, grade: jump.grade && jump.grade.key } : null;
};

let lastDead = false;
function hudFlash() {
  const res = state.last;
  if (res && res.dead && !lastDead) {
    lastDead = true;
    const f = E.flash;
    f.classList.add('red', 'on');
    setTimeout(() => f.classList.remove('on'), 90);
    setTimeout(() => f.classList.remove('red'), 600);
  }
  if (res && !res.dead) lastDead = false;
}

/* ---------- demarrage ---------- */
// Un decor vivant des l'ecran titre : le spot le plus contraste sert de fond. Le plongeur
// y est deja genere, donc le premier saut ne paie plus les 165 ms de son maillage.
useWorld(SPOTS[2]);
E.version.textContent = VERSION;
show('title');
requestAnimationFrame(t => { lastStamp = t; loop(t); E.loading.classList.add('off'); });
