import * as THREE from 'three';
import { SPOTS, DIFF_LABEL, spotById } from './spots.js';
import { buildWorld } from './world.js';
import { createSplash } from './fx.js';
import { createAudio } from './audio.js';
import { Jump } from './game.js';

const $ = s => document.querySelector(s);
export const VERSION = 'v1.2';
const JUMPS_PER_RUN = 3;
const STORE = 'dods3000.v1';

const audio = createAudio();
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// ACES desature les teintes pales : la roche beige y virait au gris. Le tone mapping neutre garde la couleur.
renderer.toneMapping = THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 1600);
let world = null, jump = null, splash = null;
let state = { spot: SPOTS[0], jumpIndex: 0, runScore: 0, last: null };
const save = loadSave();

function loadSave() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { best: {} }; }
  catch { return { best: {} }; }
}
function persist() { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { } }
function totalScore() { return Object.values(save.best).reduce((a, b) => a + b, 0); }

/* ---------- son ---------- */
// L'etat vit dans la meme sauvegarde que les records, donc il survit au rechargement.
function setMuted(v) {
  save.muted = !!v;
  persist();
  audio.setMuted(save.muted);
  const b = $('#sound');
  b.classList.toggle('muted', save.muted);
  b.setAttribute('aria-pressed', save.muted ? 'true' : 'false');
  b.title = save.muted ? 'Rétablir le son' : 'Couper le son';
}
$('#sound').addEventListener('click', () => {
  const next = !save.muted;
  setMuted(next);
  if (!next) { audio.unlock(); audio.ui(); }
});
setMuted(!!save.muted);

/* ---------- ecrans ---------- */
const screens = ['title', 'spots', 'brief', 'run', 'jump', 'end'];
function show(...names) {
  for (const s of screens) $('#s-' + s).classList.toggle('on', names.includes(s));
}

function buildSpotList() {
  const list = $('#spot-list');
  list.innerHTML = '';
  for (const s of SPOTS) {
    const el = document.createElement('div');
    el.className = 'spot';
    const best = save.best[s.id] || 0;
    el.innerHTML = `
      <div class="sky" style="background:linear-gradient(180deg, rgba(4,14,26,0) 15%, rgba(4,14,26,.45) 55%, rgba(4,14,26,.88) 100%), linear-gradient(165deg, ${s.palette.sky[0]}, ${s.palette.sky[1]} 52%, ${s.palette.water})"></div>
      <h3>${s.name}</h3>
      <p>${s.place}</p>
      <div class="meta">
        <span><b>${s.height} m</b></span>
        <span class="diff">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= s.diff ? 'on' : ''}"></i>`).join('')}</span>
        <span>RECORD <b>${best}</b></span>
      </div>`;
    el.onclick = () => { audio.ui(); openBrief(s); };
    list.appendChild(el);
  }
  $('#total-score').textContent = totalScore();
}

function openBrief(spot) {
  state.spot = spot;
  $('#brief-name').textContent = spot.name;
  $('#brief-place').textContent = spot.place;
  $('#brief-height').textContent = spot.height + ' m';
  $('#brief-diff').textContent = DIFF_LABEL[spot.diff];
  $('#brief-best').textContent = save.best[spot.id] || 0;
  $('#brief-note').textContent = spot.note;
  show('brief');
}

/* ---------- run ---------- */
function startRun() {
  if (jump) { jump.dispose(); jump = null; }
  const spot = state.spot;
  world = buildWorld(spot, renderer);
  splash = createSplash(world.scene);
  jump = new Jump(spot, world.scene, camera, splash, audio);
  state.jumpIndex = 0;
  state.runScore = 0;
  $('#hud-spot').textContent = spot.name.toUpperCase();
  nextJump();
  show('run');
}

function nextJump() {
  setPause(false);
  state.jumpIndex++;
  jump.reset();
  $('#hud-jump').textContent = `${state.jumpIndex}/${JUMPS_PER_RUN}`;
  $('#hud-score').textContent = state.runScore;
  $('#runbar').classList.add('on');
  $('#tuckring').classList.remove('on');
  setPrompt('ESPACE AU BORD', true);
  jump.onDone = onJumpDone;
}

function onJumpDone(res) {
  state.last = res;
  if (res.dead) buzz([40, 60, 40]);
  state.runScore += res.score;
  $('#hud-score').textContent = state.runScore;
  audio.grade(res.dead ? 0 : res.grade.mult);
  $('#jr-grade').textContent = res.grade.label;
  $('#jr-grade').style.color = res.grade.color;
  $('#jr-sub').textContent = res.dead
    ? 'À plat. Le run s\'arrête là.'
    : `${res.takeoff.label} · ${res.air.toFixed(2)} s en l\'air`;
  $('#jr-lines').innerHTML = res.dead ? '' : `
    <li><span>Base ${res.height} m</span><b>${res.base}</b></li>
    <li><span>Style, ${res.air.toFixed(2)} s en døds</span><b>+${res.style}</b></li>
    <li><span>Timing ${res.grade.label}</span><b>x${res.grade.mult}</b></li>
    <li><span>${res.takeoff.label}</span><b>x${res.takeoff.mult}</b></li>
    <li class="total"><span>Saut ${state.jumpIndex}</span><b>${res.score}</b></li>`;
  const finished = res.dead || state.jumpIndex >= JUMPS_PER_RUN;
  $('#jr-next').textContent = finished ? 'BILAN' : 'SAUT SUIVANT';
  $('#jr-next').onclick = () => { audio.ui(); finished ? endRun(res.dead) : (show('run'), nextJump()); };
  show('run', 'jump');
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
  const p = $('#prompt');
  p.textContent = text;
  p.classList.toggle('blink', !!blink);
}
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
function callout(text, color) {
  const c = $('#callout');
  c.textContent = text; c.style.color = color;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  setTimeout(() => c.classList.remove('pop'), 1400);
}

function updateHud() {
  if (!jump) return;
  const h = jump.hud();
  $('#hud-alt').textContent = Math.round(h.alt) + ' m';
  if (h.phase === 'walk') {
    $('#runbar-fill').style.width = (h.progress * 100).toFixed(1) + '%';
    const lo = 1 - 2.6 / 9.5, hi = 1 - 0.0 / 9.5;
    const zone = $('#runbar-zone');
    zone.style.left = (lo * 100) + '%';
    zone.style.width = ((hi - lo) * 100) + '%';
  } else if (h.phase === 'fly') {
    $('#runbar').classList.remove('on');
    const ring = $('#tuckring');
    ring.classList.add('on');
    ring.classList.toggle('hot', h.hot && !h.tucked);
    ring.querySelector('.tr-arc').style.strokeDasharray = `${(h.ratio * RING_C).toFixed(1)} ${RING_C}`;
    ring.querySelector('.tr-zone').style.strokeDasharray =
      `0 ${(h.zoneLo * RING_C).toFixed(1)} ${((h.zoneHi - h.zoneLo) * RING_C).toFixed(1)} ${RING_C}`;
    $('#tuckring-label').textContent = h.tucked ? 'TUCK' : (h.hot ? 'MAINTENANT' : 'DØDS');
    if (!h.tucked) setPrompt('ESPACE POUR REFERMER', h.hot);
    else setPrompt('', false);
    const sp = Math.min(1, Math.abs(jump.vel.y) / 24);
    audio.setWind(0.15 + sp * 0.85);
    $('#vignette').style.opacity = (0.35 + sp * 0.85).toFixed(2);
  } else {
    $('#tuckring').classList.remove('on');
    setPrompt('', false);
    audio.setWind(0);
    $('#vignette').style.opacity = '1';
  }
}

/* ---------- mouvement reduit ---------- */
// La preference est lue a chaque usage, donc un changement systeme s'applique sans rechargement.
// Elle n'agit que sur la camera et le flash : la physique et le score restent identiques.
const REDUCED = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function motionScale() { return REDUCED && REDUCED.matches ? 0.25 : 1; }

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
  return !!jump && $('#s-run').classList.contains('on')
    && !$('#s-jump').classList.contains('on') && !$('#s-end').classList.contains('on')
    && (jump.state === 'walk' || jump.state === 'fly');
}
function paused() { return window.__dods.paused || autoPaused; }
function setPause(v) {
  if (autoPaused === v) return;
  autoPaused = v;
  $('#pause').classList.toggle('on', v);
  if (v) audio.setWind(0);
  else clock.getDelta(); // vide le delta accumule pendant la pause
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && inJump()) setPause(true);
});
$('#pause-resume').addEventListener('click', () => { audio.unlock(); audio.ui(); setPause(false); });

/* ---------- entrees ---------- */
function press() {
  audio.unlock();
  if (autoPaused) { setPause(false); return; }
  if ($('#s-jump').classList.contains('on') || $('#s-end').classList.contains('on')) return;
  if ($('#s-title').classList.contains('on')) { audio.ui(); show('spots'); buildSpotList(); return; }
  if ($('#s-brief').classList.contains('on')) { audio.ui(); startRun(); return; }
  if (!jump || !$('#s-run').classList.contains('on')) return;
  const before = jump.state;
  jump.input();
  if (before === 'walk' && jump.state === 'fly') {
    toast(jump.takeoff.label);
    buzz(20);
    $('#runbar').classList.remove('on');
  } else if (jump.tucked && jump.grade) {
    callout(jump.grade.label, jump.grade.color);
    buzz(jump.grade.key === 'smack' ? [40, 60, 40] : 30);
  }
}

window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ') { e.preventDefault(); press(); }
  if (e.code === 'Escape' && $('#s-run').classList.contains('on')) { setPause(false); show('spots'); }
});
canvas.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
document.querySelectorAll('[data-go]').forEach(b => {
  b.addEventListener('click', () => {
    audio.unlock(); audio.ui();
    const go = b.dataset.go;
    if (go === 'spots') { buildSpotList(); show('spots'); }
    else if (go === 'title') show('title');
    else if (go === 'run') startRun();
  });
});

// Surface de test : pilotage du jeu sans clavier, pour les captures et le check.
// autoJump : distance au bord (m) a laquelle sauter. autoTuck : ttc (s) auquel se refermer.
// Les deux sont evalues dans la boucle, donc a la frame pres, ce que du JS asynchrone ne sait pas faire.
window.__dods = { press, get jump() { return jump; }, get world() { return world; }, camera, renderer, get state() { return state; }, show, startRun, autoJump: null, autoTuck: null, paused: false };

/* ---------- boucle ---------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let shake = 0;

// Une frame de simulation. dt est fourni par la boucle, ou force par les tests.
function frame(dt, t) {
  if (!world) return;
  world.waterMat.uniforms.uTime.value = t;
  if (jump && $('#s-run').classList.contains('on')) {
    jump.update(dt, s => { shake = s; });
    const A = window.__dods;
    if (dt <= 0) { /* fige : pas d'entree automatique */ }
    else if (A.autoJump != null && jump.state === 'walk' && (0 - jump.pos.z) <= A.autoJump) press();
    else if (A.autoTuck != null && jump.state === 'fly' && !jump.tucked && jump.ttc <= A.autoTuck) press();
    if (splash) splash.update(dt);
    updateHud();
    if (shake > 0.01) {
      const amp = shake * 0.55 * motionScale();
      camera.position.x += (Math.random() - 0.5) * amp;
      camera.position.y += (Math.random() - 0.5) * amp;
    }
  } else if (splash) splash.update(dt);
  renderer.render(world.scene, camera);
  hudFlash();
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  frame(paused() ? 0 : dt, clock.elapsedTime);
}

// Avance la simulation d'un nombre de pas fixes, sans dependre du rafraichissement ecran.
window.__dods.tick = (steps = 1, dt = 1 / 60) => {
  for (let i = 0; i < steps; i++) frame(dt, performance.now() / 1000);
  return jump ? { state: jump.state, y: +jump.pos.y.toFixed(2), z: +jump.pos.z.toFixed(2), ttc: +jump.ttc.toFixed(3), tucked: jump.tucked, grade: jump.grade && jump.grade.key } : null;
};

let lastDead = false;
function hudFlash() {
  const res = state.last;
  if (res && res.dead && !lastDead) {
    lastDead = true;
    const f = $('#flash');
    f.classList.add('red', 'on');
    setTimeout(() => f.classList.remove('on'), 90);
    setTimeout(() => f.classList.remove('red'), 600);
  }
  if (res && !res.dead) lastDead = false;
}

/* ---------- demarrage ---------- */
// Un decor vivant des l'ecran titre : le spot le plus contraste sert de fond.
const MENU_SPOT = SPOTS[2];
world = buildWorld(MENU_SPOT, renderer);
splash = createSplash(world.scene);
$('#version').textContent = VERSION;
$('#loading').classList.add('off');
show('title');
loop();

// Travelling lent tant qu'on est dans les menus.
setInterval(() => {
  if (!['title', 'spots', 'brief'].some(n => $('#s-' + n).classList.contains('on'))) return;
  const h = MENU_SPOT.height;
  const a = -0.45 + Math.sin(performance.now() * 0.00007) * 0.5;
  camera.position.set(-34 - Math.sin(a) * 14, h * 0.75 + Math.sin(a * 2) * 3, 40 + Math.cos(a) * 12);
  camera.lookAt(0, h * 0.4, 0);
  if (Math.abs(camera.fov - 52) > 0.2) { camera.fov += (52 - camera.fov) * 0.1; camera.updateProjectionMatrix(); }
}, 33);
