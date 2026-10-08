// Le replay et le fantome (v4.3) : un saut s'enregistre, se relit sous trois angles,
// et le meilleur saut d'un spot reviendra en transparence au saut suivant.
//
// La trace est un echantillonnage du rig lui-meme, pas une re-simulation : ce que le
// replay montre est exactement ce qui a ete rendu, ralenti compris. Elle vit en temps
// de jeu (celui qui ralentit dans les derniers metres) : le replay la relit au temps
// reel et rend donc la duree vecue, ralenti inclus.
//
// Memoire : un Float32Array prealloue, remis a zero a chaque saut, jamais d'allocation
// dans la boucle chaude (invariant 15). La sauvegarde du fantome encode le meme tampon
// en base64 : la trace d'un saut fait une soixantaine de ko.

import * as THREE from 'three';
import { createDiver } from './diver.js';
import { disposeTree, EDGE_Z } from './world.js';

// assez fin pour rejouer la course et les figures, assez court pour la sauvegarde
export const REC_DT = 1 / 60;
export const REC_MAX = 10; // secondes de jeu gardees : course, vol, impact, noyade

// Ordre fixe des articulations dans la trace. Le temps est implicite : i * REC_DT.
export const JOINTS = ['body', 'neck', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'ankL', 'hipR', 'knR', 'ankR'];
// t, position racine, rotation racine, puis les 12 articulations en Euler
export const STRIDE = 7 + JOINTS.length * 3;
const TAU = Math.PI * 2;

/* ---------- la trace ---------- */

export class Recorder {
  constructor() {
    this.buf = new Float32Array(Math.ceil(REC_MAX / REC_DT) * STRIDE);
    this.n = 0;
    this.ev = { takeoffT: -1, impactT: -1, impactX: 0, impactZ: 0, power: 1, dead: false };
  }
  start() {
    this.n = 0;
    this.t = 0;
    this.ev.takeoffT = -1; this.ev.impactT = -1;
    this.ev.impactX = 0; this.ev.impactZ = 0; this.ev.power = 1; this.ev.dead = false;
  }
  get duration() { return this.n * REC_DT; }
  get full() { return this.n >= this.buf.length / STRIDE; }

  // Ecrit tous les creneaux jusqu'a t, en rattrapant les images lentes d'un coup : la
  // boucle chaude n'ecrit que des nombres, jamais d'objet. Le rig est lu APRES update,
  // donc dans l'etat exact qui a ete rendu (alignContact compris).
  sample(diver, t) {
    this.t = t;
    const max = Math.min(this.buf.length / STRIDE, Math.floor(t / REC_DT) + 1);
    if (max <= this.n) return;
    const r = diver.root, j = diver.joints, b = this.buf;
    for (let i = this.n; i < max; i++) {
      const o = i * STRIDE;
      b[o] = r.position.x; b[o + 1] = r.position.y; b[o + 2] = r.position.z;
      b[o + 3] = r.rotation.x; b[o + 4] = r.rotation.y; b[o + 5] = r.rotation.z;
      for (let k = 0; k < JOINTS.length; k++) {
        const rot = j[JOINTS[k]].rotation, q = o + 6 + k * 3;
        b[q] = rot.x; b[q + 1] = rot.y; b[q + 2] = rot.z;
      }
    }
    this.n = max;
  }
}

// Interpole la trace a l'instant t dans `out` (STRIDE nombres). Le salto et la vrille
// traversent +/- pi : on deverrouille l'angle pour ne jamais rebrousser chemin d'un tour.
const A = new Float32Array(STRIDE), B = new Float32Array(STRIDE);
function sampleTrace(buf, n, t, out) {
  const last = n - 1;
  const ti = Math.max(0, Math.min(t, last * REC_DT));
  const i0 = Math.min(last, Math.floor(ti / REC_DT));
  const i1 = Math.min(last, i0 + 1);
  const k = i1 > i0 ? (ti - i0 * REC_DT) / REC_DT : 0;
  const o0 = i0 * STRIDE, o1 = i1 * STRIDE;
  for (let c = 0; c < STRIDE; c++) {
    const a = buf[o0 + c];
    let d = buf[o1 + c] - a;
    if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
    out[c] = a + d * k;
  }
  return out;
}

// Le temps de jeu restant avant que le corps ne touche, deduit de la trace : la
// camera de poursuite en a besoin, comme la vraie.
function traceTtc(P, V) {
  const y = Math.max(0, P[1]), vy = Math.min(0, V[1]);
  if (y <= 0) return 0;
  return (vy + Math.sqrt(vy * vy + 2 * 13.5 * y)) / 13.5;
}

/* ---------- le plongeur de relecture ---------- */

// Un clone du plongeur qui ne vit que par les traces : opaque pour revoir son saut,
// teinte et translucide pour le fantome du record. Pas d'ombre : le vrai corps garde
// la sienne, et le fantome n'a pas a tacher la falaise.
export class DiverEcho {
  constructor(scene, ghost) {
    this.scene = scene;
    this.diver = createDiver();
    this.diver.root.visible = false;
    scene.add(this.diver.root);
    this.diver.root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false; o.receiveShadow = false;
      const m = o.material;
      if (ghost && m) {
        m.transparent = true; m.depthWrite = false; m.opacity = 0.34;
        if (m.color) m.color.set(0x9fd4ff);
      }
    });
  }
  // Pose le clone a l'instant t de la trace. Rend false quand la trace est epuisee
  // (le clone reste alors sur sa derniere pose, visible : a l'appelant de cacher).
  pose(buf, n, t) {
    if (n < 2 || t < 0) return false;
    sampleTrace(buf, n, t, A);
    const r = this.diver.root, j = this.diver.joints;
    r.position.set(A[0], A[1], A[2]);
    r.rotation.set(A[3], A[4], A[5]);
    for (let k = 0; k < JOINTS.length; k++) {
      const rot = j[JOINTS[k]].rotation, q = 6 + k * 3;
      rot.set(A[q], A[q + 1], A[q + 2]);
    }
    return t < (n - 1) * REC_DT;
  }
  hide() { this.diver.root.visible = false; }
  show() { this.diver.root.visible = true; }
  dispose() {
    this.scene.remove(this.diver.root);
    disposeTree(this.diver.root);
    this.diver.skeleton?.dispose();
  }
}

/* ---------- les trois angles ---------- */

export const CAM_ANGLES = ['suivi', 'bord', 'eau'];

export function createReplayCam() {
  return { pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true };
}

const V = new Float32Array(STRIDE);
// Place la camera du replay. `st` porte le lissage d'un angle a l'autre : suivi recoit
// la camera de poursuite du jeu, recalculee depuis la trace (vitesse par differences
// finies, ttc deduit) ; au bord, un juge immobile ; au ras de l'eau, la contre-plongee
// qui voit monter la gerbe.
export function placeReplayCam(cam, st, buf, n, ev, t, angle, spot, dt) {
  sampleTrace(buf, n, Math.max(0, t - REC_DT), B);
  sampleTrace(buf, n, t, A);
  for (let c = 0; c < 6; c++) V[c] = (A[c] - B[c]) / REC_DT;
  const px = A[0], py = A[1], pz = A[2];
  let tx, ty, tz, lx, ly, lz, fov;
  const k = Math.min(1, dt * (t >= ev.impactT ? 3.4 : 6));

  if (angle === 'suivi') {
    if (t < ev.takeoffT) {
      tx = -3.4; ty = spot.height + 2.05; tz = pz - 6.4;
      lx = 0; ly = spot.height + 0.75; lz = pz + 3.0;
      fov = 60;
    } else if (t < ev.impactT) {
      const v = Math.min(1, Math.abs(V[1]) / 24);
      const ttc = traceTtc(A, V);
      const close = 1 - THREE.MathUtils.clamp(ttc / 1.1, 0, 1);
      const tf = t - ev.takeoffT;
      const early = 1 - THREE.MathUtils.clamp(tf / 0.5, 0, 1);
      tx = -6.4 - v * 1.8 + close * 4.4 - early * 0.8;
      ty = py + 1.35 - v * 0.9 - close * 0.35 + early * 0.9;
      tz = pz + 2.5 + v * 1.3 - close * 1.4;
      lx = 0; ly = py - 0.75 - v * 1.5 + close * 0.95 + early * 1.9; lz = pz + 0.3;
      fov = 54 + v * 24 - close * 30;
    } else {
      tx = -9.5; ty = 1.9; tz = pz + 8.5;
      lx = 0; ly = 0.35; lz = pz + 0.5;
      fov = 52;
    }
  } else if (angle === 'bord') {
    // le juge : immobile au bord de la falaise, il suit le plongeur des yeux
    tx = -6.5; ty = spot.height + 0.6; tz = EDGE_Z + 2.8;
    lx = px; ly = py; lz = pz;
    fov = 30;
  } else {
    // au ras de l'eau, pres du point d'impact : le corps grossit, puis la gerbe
    tx = ev.impactX - 4.0; ty = 0.85; tz = ev.impactZ + 3.0;
    lx = px; ly = Math.max(py, 0.1); lz = pz;
    fov = 46;
  }
  if (cam.aspect < 1) fov *= 1 + (1 - cam.aspect) * 0.85;

  if (st.snap) { st.pos.set(tx, ty, tz); st.look.set(lx, ly, lz); st.snap = false; }
  else {
    st.pos.lerp(_v.set(tx, ty, tz), k);
    st.look.lerp(_v.set(lx, ly, lz), Math.min(1, k * 2.6));
  }
  cam.position.copy(st.pos);
  cam.lookAt(st.look);
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * k; cam.updateProjectionMatrix(); }
}
const _v = new THREE.Vector3();

/* ---------- le fantome du meilleur saut ---------- */

// La sauvegarde garde l'objet encode (b64 en tete) et le tampon ne se decode qu'au
// moment de rejouer : ouvrir le jeu ne paie la conversion d'aucun spot.
const GHOST_KEY = 'dods3000.ghost.v1';

export function loadGhosts() {
  const out = {};
  try {
    const raw = JSON.parse(localStorage.getItem(GHOST_KEY) || '{}');
    for (const id in raw) {
      const o = raw[id];
      if (o && o.b64 && o.n && o.ev) out[id] = o;
    }
  } catch { }
  return out;
}

// Le tampon de la trace, decode une fois puis cache dans l'objet.
export function ghostBuf(g) {
  if (g.buf) return g.buf;
  try {
    const bin = atob(g.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const buf = new Float32Array(bytes.buffer);
    if (g.n * STRIDE > buf.length) return null;
    g.buf = buf;
  } catch { }
  return g.buf || null;
}

export function encodeTrace(rec, score, mark, upto) {
  // upto coupe la noyade : le fantome garde le geste et une courte queue sous la
  // gerbe, pas les 1,3 s de noyade que la trace du saut continue d'ecrire.
  const n = Math.max(2, Math.min(upto != null ? upto : rec.n, rec.n));
  const bytes = new Uint8Array(rec.buf.buffer, 0, n * STRIDE * 4);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  // ev copie : l'objet du recorder vit encore, le saut suivant le reecrit
  return { score, mark: mark || 0, n, ev: { ...rec.ev }, b64: btoa(bin) };
}

export function saveGhosts(ghosts) {
  try {
    const raw = {};
    for (const id in ghosts) {
      const g = ghosts[id];
      raw[id] = { score: g.score, mark: g.mark, n: g.n, ev: g.ev, b64: g.b64 };
    }
    localStorage.setItem(GHOST_KEY, JSON.stringify(raw));
  } catch { /* quota : le fantome ne survivra pas au rechargement, le jeu continue */ }
}
