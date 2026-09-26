import * as THREE from 'three';
import { createDiver, applyPose, runPose, POSES, LANDINGS } from './diver.js';
import { EDGE_Z, RUN_START_Z, disposeTree } from './world.js';

export const TUNING = {
  gravity: 13.5,
  runSpeed: 4.3,
  // fenetres de decollage, en metres avant le bord
  takeoff: [
    { max: 1.15, label: 'DÉCOLLAGE PARFAIT', mult: 1.25, vy: 5.5, vz: 3.9 },
    { max: 2.6, label: 'BON DÉCOLLAGE', mult: 1.0, vy: 4.7, vz: 3.4 },
    { max: 99, label: 'TROP TÔT', mult: 0.75, vy: 3.4, vz: 4.4 }
  ],
  noJump: { label: 'PAS DE DÉCOLLAGE', mult: 0.5, vy: 0.2, vz: 1.9 },
  // fenetres de tuck, en secondes avant l'impact
  grades: [
    { key: 'perfect', label: 'PERFECT DØDS', short: 'PERFECT', mult: 3.0, color: '#ffd447' },
    { key: 'great', label: 'GREAT', short: 'GREAT', mult: 2.0, color: '#5ef0a8' },
    { key: 'good', label: 'GOOD', short: 'GOOD', mult: 1.35, color: '#4fd6ff' },
    { key: 'early', label: 'EARLY', short: 'EARLY', mult: 0.7, color: '#b9c6d4' },
    { key: 'chicken', label: 'CHICKEN', short: 'CHICKEN', mult: 0.3, color: '#b9c6d4' },
    { key: 'smack', label: 'SMACK', short: 'TROP TARD', mult: 0, color: '#ff4d5e' }
  ],
  styleRate: 46,
  baseRate: 12,
  // Serie : deux GREAT ou mieux d'affilee, puis trois. Le troisieme saut devient un choix
  // entre assurer et tenter, la ou trois sauts independants ne faisaient qu'une addition.
  streak: [
    { min: 2, mult: 1.2, label: 'SÉRIE x2' },
    { min: 3, mult: 1.5, label: 'SÉRIE x3' }
  ],
  streakFrom: 2.0
};

export const GRADE = Object.fromEntries(TUNING.grades.map(g => [g.key, g]));

// Un saut compte pour la serie quand son multiplicateur de timing vaut au moins GREAT.
export function keepsStreak(grade) { return !!grade && grade.mult >= TUNING.streakFrom; }
export function streakBonus(n) {
  let best = null;
  for (const s of TUNING.streak) if (n >= s.min) best = s;
  return best;
}

const LANDING_BY_GRADE = {
  perfect: 'shrimp', great: 'shrimp', good: 'bullet',
  early: 'ball', chicken: 'ball', smack: 'flat'
};

export function windows(height) {
  // plus le spot est haut, plus la fenetre est serree
  const k = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(height, 10, 34, 1.0, 0.72), 0.7, 1.05);
  const perfectLo = 0.085;
  const perfectHi = perfectLo + 0.20 * k;
  const greatHi = perfectHi + 0.16 * k;
  const goodHi = greatHi + 0.34 * k;
  const earlyHi = goodHi + 0.75;
  return { perfectLo, perfectHi, greatHi, goodHi, earlyHi };
}

// La note d'une fermeture a `ttc` secondes de l'eau. Une seule fonction pour le verdict
// et pour la mise affichee en direct : les deux ne peuvent pas diverger.
export function gradeAt(ttc, w) {
  if (ttc < w.perfectLo) return GRADE.smack;
  if (ttc <= w.perfectHi) return GRADE.perfect;
  if (ttc <= w.greatHi) return GRADE.great;
  if (ttc <= w.goodHi) return GRADE.good;
  if (ttc <= w.earlyHi) return GRADE.early;
  return GRADE.chicken;
}

// Temps avant la surface pour une hauteur et une vitesse verticale donnees.
function timeToWater(y, vy, g) {
  if (y <= 0) return 0;
  return (vy + Math.sqrt(vy * vy + 2 * g * y)) / g;
}

const TMPV = new THREE.Vector3();

export class Jump {
  constructor(spot, scene, camera, splash, audio) {
    this.spot = spot; this.scene = scene; this.camera = camera; this.splash = splash; this.audio = audio;
    this.diver = createDiver();
    scene.add(this.diver.root);
    scene.add(this.diver.blob);
    this.win = windows(spot.height);
    this.shake = 0;
    // Vecteurs de travail de la camera : la boucle chaude n'alloue rien, sinon le
    // ramasse-miettes passe en pleine chute et l'image saccade.
    this._tgt = new THREE.Vector3();
    this._lookTgt = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.state = 'walk';
    this.t = 0;
    this.pos = this.pos || new THREE.Vector3();
    this.pos.set(0, this.spot.height, RUN_START_Z);
    this.vel = this.vel || new THREE.Vector3();
    this.vel.set(0, 0, 0);
    this.bodyRot = 0;
    this.yaw = 0;
    this.styleTime = 0;
    this.tucked = false;
    this.held = false;
    this.flailing = false;
    this.grade = null;
    this.tuckTtc = 0;
    this.skew = 0;
    this.fovKick = 0;
    this.contact = this.contact || new THREE.Vector3(); // ou le corps touche l'eau
    this.landing = LANDINGS.flat; // sans fermeture, c'est le ventre qui prend tout
    this.result = null;
    this.impactT = 0;
    this.takeoff = null;
    this.splash.reset();
    this.diver.root.visible = true;
    this.diver.blob.visible = true;
    applyPose(this.diver.joints, POSES.stand, 1);
    this.diver.root.position.copy(this.pos);
    this.diver.root.rotation.set(0, 0, 0);
    this._snap = true; this._snapLook = true;
    this.placeCamera(1);
  }

  get ttc() { return timeToWater(this.pos.y, this.vel.y, TUNING.gravity); }

  /* ---------- le geste ---------- */
  // Un seul geste par saut : appuyer au bord decolle, tenir garde le corps ouvert en
  // dods, lacher le referme. `late` est le temps ecoule entre la derniere image simulee
  // et l'evenement : la note se calcule a l'instant du doigt, pas a l'image suivante,
  // donc elle ne depend ni du rafraichissement de l'ecran ni de la charge du telephone.
  down(late = 0) {
    if (this.state === 'walk') { this.jump(late); this.held = true; return 'takeoff'; }
    // Apres une chute sans decollage, ou au retour d'une pause : on reprend la main.
    if (this.state === 'fly' && !this.tucked && !this.held) { this.held = true; return 'grab'; }
    return null;
  }

  up(late = 0) {
    if (this.state === 'fly' && !this.tucked && this.held) {
      this.held = false;
      this.tuck(late);
      return 'tuck';
    }
    this.held = false;
    return null;
  }

  // Compatibilite v1 : un appui fait l'action suivante du saut.
  input(late = 0) {
    if (this.state === 'walk') return !!this.down(late);
    if (this.state === 'fly' && !this.tucked) { this.held = true; return !!this.up(late); }
    return false;
  }

  jump(late = 0) {
    // Le coureur a encore avance entre l'image et le doigt : on le place la ou il etait.
    const z = Math.min(this.pos.z + TUNING.runSpeed * late, EDGE_Z + 0.45);
    const dist = EDGE_Z - z;
    const t = TUNING.takeoff.find(w => dist <= w.max);
    this.pos.z = z;
    this.takeoff = t;
    this.vel.set(0, t.vy, t.vz);
    this.state = 'fly';
    this.t = 0;
    // la prochaine image ne doit simuler que le vol ecoule depuis le doigt
    this.skew = late;
    this.audio?.jump();
    return true;
  }

  fall() {
    this.takeoff = TUNING.noJump;
    this.vel.set(0, TUNING.noJump.vy, TUNING.noJump.vz);
    this.state = 'fly';
    this.t = 0;
    this.flailing = true;
    this.held = false;
    this.audio?.scream();
  }

  tuck(late = 0) {
    // L'etat a l'instant exact du lacher : la trajectoire est une parabole, on la prolonge.
    const g = TUNING.gravity;
    const y = this.pos.y + this.vel.y * late - 0.5 * g * late * late;
    const vy = this.vel.y - g * late;
    const ttc = timeToWater(y, vy, g);
    this.tucked = true;
    this.held = false;
    this.tuckTtc = ttc;
    this.styleTime = this.t + late;
    let grade = gradeAt(ttc, this.win);
    if (this.flailing && grade.key !== 'smack') grade = GRADE.early;
    this.grade = grade;
    // La forme d'entree suit la fermeture : la crevette demande de fermer tard et juste,
    // une fermeture precipitee ne laisse qu'une boule sans forme.
    this.landing = LANDINGS[LANDING_BY_GRADE[grade.key]];
    this.fovKick = 1;
    this.audio?.tuck();
    return true;
  }

  scoreFor(grade, styleTime) {
    const base = Math.round(this.spot.height * TUNING.baseRate);
    const style = Math.round(styleTime * TUNING.styleRate * Math.sqrt(this.spot.height / 12));
    const score = grade.key === 'smack' ? 0 : Math.round((base + style) * grade.mult * this.takeoff.mult);
    return { base, style, score };
  }

  // Ce que le joueur encaisserait s'il lachait maintenant. C'est la mise en jeu : elle
  // monte a chaque palier franchi, puis tombe a zero une fois l'eau trop proche.
  potential() {
    if (this.state !== 'fly' || this.tucked) return null;
    const ttc = this.ttc;
    let grade = gradeAt(ttc, this.win);
    if (this.flailing && grade.key !== 'smack') grade = GRADE.early;
    const p = this._pot || (this._pot = {});
    p.grade = grade; p.score = this.scoreFor(grade, this.t).score; p.ttc = ttc;
    return p;
  }

  update(dt, camShakeOut) {
    // un evenement a deja fait decoller le plongeur `skew` secondes plus tot dans cette image
    let step = dt;
    if (this.skew) { step = Math.max(0, dt - this.skew); this.skew = 0; }
    this.t += step;
    const d = this.diver;

    if (this.state === 'walk') {
      this.pos.z += TUNING.runSpeed * step;
      applyPose(d.joints, POSES.stand, 1, runPose(this.t));
      d.root.rotation.x = 0;
      if (this.pos.z > EDGE_Z + 0.45) this.fall();
    } else if (this.state === 'fly') {
      // Integration exacte de la parabole : le saut est le meme a 30, 60 ou 120 images
      // par seconde. Un Euler par image donnait une chute plus rapide que le calcul du ttc.
      const g = TUNING.gravity;
      this.pos.x += this.vel.x * step;
      this.pos.z += this.vel.z * step;
      this.pos.y += this.vel.y * step - 0.5 * g * step * step;
      this.vel.y -= g * step;
      if (!this.tucked) {
        this.styleTime = this.t;
        if (this.flailing) applyPose(d.joints, POSES.flail, Math.min(1, dt * 7));
        else applyPose(d.joints, POSES.dods, Math.min(1, dt * 9));
        // le corps s'ouvre a l'horizontale, ventre vers l'eau : c'est la signature du dods
        this.bodyRot += ((this.flailing ? 0.9 : 1.48) - this.bodyRot) * Math.min(1, dt * 3.2);
        this.yaw += (-1.05 - this.yaw) * Math.min(1, dt * 3);
      } else {
        // La fermeture est un coup sec, pas une transition : bouclee en 0,05 s.
        applyPose(d.joints, POSES[this.landing.pose], Math.min(1, dt * 34));
        this.bodyRot += (this.landing.pitch - this.bodyRot) * Math.min(1, dt * 17);
        this.yaw += (-0.45 - this.yaw) * Math.min(1, dt * 13);
      }
      d.root.rotation.x = this.bodyRot;
      d.root.rotation.y = this.yaw;
      if (this.pos.y <= 0) this.land();
    } else if (this.state === 'impact') {
      this.impactT += step;
      // L'eau freine, elle n'efface pas. Le corps s'enfonce d'environ deux metres, la
      // surface se referme dessus et c'est elle qui le cache.
      const brake = this.result && this.result.dead ? 9 : 14;
      this.vel.multiplyScalar(Math.max(0, 1 - step * brake));
      this.pos.y = Math.max(-4.2, this.pos.y + this.vel.y * step);
      this.pos.z += this.vel.z * step;
      // sous l'eau le corps se relache et s'ouvre
      applyPose(d.joints, POSES[this.impactT > 0.28 ? 'pike' : this.landing.pose], Math.min(1, dt * 3.5));
      this.bodyRot += (this.landing.pitch + 0.3 - this.bodyRot) * Math.min(1, dt * 2);
      d.root.rotation.x = this.bodyRot;
      if (this.impactT > 1.25 && this.onDone) { const cb = this.onDone; this.onDone = null; cb(this.result); }
    }

    d.root.position.copy(this.pos);
    this.alignContact();
    this.placeBlob();

    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.fovKick = Math.max(0, this.fovKick - dt * 5);
    this.placeCamera(Math.min(1, dt * (this.state === 'impact' ? 3.4 : 6)));
    if (camShakeOut) camShakeOut(this.shake);
    return this.state;
  }

  // La physique suit un point, mais le corps n'est pas ce point : en croix il est a plat,
  // en crevette il est plie en deux. On descend le rig de la hauteur de son point le plus
  // bas, pour qu'une main, un pied ou un genou touche l'eau a l'instant ou la physique dit
  // y = 0. Le timing ne bouge pas, c'est le corps qui se cale dessus.
  alignContact() {
    if (this.state === 'walk') return;
    const d = this.diver;
    d.root.updateMatrixWorld(true);
    let low = Infinity;
    for (const t of d.tips) {
      t.getWorldPosition(TMPV);
      if (TMPV.y < low) { low = TMPV.y; this.contact.copy(TMPV); }
    }
    const drop = low - this.pos.y;
    d.root.position.y -= drop;
    this.contact.y -= drop;
  }

  // L'ombre grandit et palit avec l'altitude, puis se resserre et se fonce a l'approche :
  // un deuxieme repere de timing, lisible du coin de l'oeil.
  placeBlob() {
    const b = this.diver.blob, m = b.userData;
    if (this.state === 'walk') {
      b.visible = true;
      b.position.set(this.pos.x, this.spot.height + 0.02, this.pos.z);
      b.scale.setScalar(1);
      m.disc.opacity = 0.28; m.halo.opacity = 0;
      return;
    }
    if (this.state !== 'fly') { b.visible = false; return; }
    const h = Math.max(0, this.pos.y);
    b.visible = true;
    b.position.set(this.pos.x, 0.07, this.pos.z);
    b.scale.setScalar(1 + h * 0.085);
    const near = THREE.MathUtils.clamp(1 - h / 42, 0.12, 1);
    m.disc.opacity = 0.34 * near;
    m.halo.opacity = 0.42 * near;
  }

  land() {
    this.pos.y = 0;
    this.state = 'impact';
    this.impactT = 0;
    this.held = false;
    this._snapLook = true;
    if (!this.tucked) { this.grade = GRADE.smack; this.tuckTtc = 0; this.styleTime = this.t; }
    const dead = this.grade.key === 'smack';
    const speed = Math.abs(this.vel.y);
    const power = THREE.MathUtils.clamp(speed / 26, 0.35, 1.25) * (dead ? 1.25 : (this.grade.mult >= 2 ? 1.15 : 0.8));
    // La gerbe part de la main ou du pied qui entre, pas de l'origine du rig. A plat c'est
    // le ventre qui frappe : la pose desordonnee met un coude en point bas, loin du buste,
    // et la gerbe partait a cote du corps.
    if (dead) {
      this.diver.joints.body.getWorldPosition(TMPV);
      this.splash.burst(TMPV.x, TMPV.z, power, dead);
    } else this.splash.burst(this.contact.x, this.contact.z, power, dead);
    this.shake = dead ? 1.25 : 0.55 + this.grade.mult * 0.12;
    this.audio?.splash(dead);

    const { base, style, score } = this.scoreFor(this.grade, this.styleTime);
    this.result = {
      dead, grade: this.grade, base, style, score,
      takeoff: this.takeoff, ttc: this.tuckTtc, air: this.styleTime,
      height: this.spot.height,
      // les bornes voyagent avec le resultat : l'ecart au parfait se lit sans recalculer
      win: this.win, tucked: this.tucked, landing: this.landing
    };
  }

  placeCamera(k) {
    const c = this.camera, p = this.pos;
    let tx, ty, tz, lx, ly, lz, fov, roll = 0;
    if (this.state === 'walk') {
      tx = -3.4; ty = this.spot.height + 2.05; tz = p.z - 6.4;
      lx = 0; ly = this.spot.height + 0.75; lz = p.z + 3.0;
      fov = 60;
    } else if (this.state === 'fly') {
      const v = Math.min(1, Math.abs(this.vel.y) / 24);
      // La derniere seconde est le sujet du jeu : la camera se rapproche et resserre le
      // champ pour qu'on voie la fermeture et la forme d'entree.
      const close = 1 - THREE.MathUtils.clamp(this.ttc / 0.9, 0, 1);
      // Au decollage le corps est encore debout : on vise sa poitrine, pas ses pieds,
      // sinon la tete sort du cadre pendant le premier tiers de seconde.
      const early = 1 - THREE.MathUtils.clamp(this.t / 0.5, 0, 1);
      tx = -6.4 - v * 1.8 + close * 3.6 - early * 0.8;
      ty = p.y + 1.35 - v * 0.9 + close * 0.35 + early * 0.9;
      tz = p.z + 2.5 + v * 1.3 - close * 1.1;
      lx = 0; ly = p.y - 0.75 - v * 1.5 + close * 0.95 + early * 1.9; lz = p.z + 0.3;
      // Le lacher donne un coup de zoom bref : le geste se sent dans l'image.
      fov = 54 + v * 24 - close * 26 - this.fovKick * 7;
      // une legere bascule avec la vitesse, rendue a zero au moment de lire l'entree
      roll = -0.05 * v * (1 - close);
    } else {
      // A l'entree, la camera descend au ras de l'eau et regarde le point d'impact.
      tx = -9.5; ty = 1.9; tz = p.z + 8.5;
      lx = 0; ly = 0.35; lz = p.z + 0.5;
      fov = 52;
    }
    if (this.reduced) roll = 0;
    // En portrait, un champ vertical constant retrecit le champ horizontal et le plongeur, qui vole
    // a plat, deborde du cadre. On elargit donc le fov quand l'ecran est plus haut que large.
    if (c.aspect < 1) fov *= 1 + (1 - c.aspect) * 0.85;
    this._tgt.set(tx, ty, tz);
    if (this._snap) { c.position.copy(this._tgt); this._snap = false; }
    else c.position.lerp(this._tgt, k);
    this._lookTgt.set(lx, ly, lz);
    this._look.lerp(this._lookTgt, this._snapLook ? 1 : Math.min(1, k * 2.6));
    this._snapLook = false;
    c.lookAt(this._look);
    if (roll) c.rotateZ(roll);
    if (Math.abs(c.fov - fov) > 0.05) { c.fov += (fov - c.fov) * k; c.updateProjectionMatrix(); }
  }

  // Etat pour le HUD. Un seul objet reutilise : la boucle chaude n'alloue pas.
  hud() {
    const h = this._hud || (this._hud = {});
    if (this.state === 'walk') {
      h.phase = 'walk';
      h.progress = (this.pos.z - RUN_START_Z) / (EDGE_Z - RUN_START_Z);
      h.alt = this.spot.height;
      return h;
    }
    if (this.state === 'fly') {
      const ttc = this.ttc, w = this.win, span = w.earlyHi + 0.6;
      h.phase = 'fly'; h.alt = Math.max(0, this.pos.y); h.ttc = ttc;
      h.tucked = this.tucked; h.held = this.held; h.flailing = this.flailing;
      h.ratio = THREE.MathUtils.clamp(1 - ttc / span, 0, 1);
      h.zoneLo = 1 - w.perfectHi / span; h.zoneHi = 1 - w.perfectLo / span;
      h.hot = ttc <= w.goodHi;
      h.pot = this.potential();
      return h;
    }
    h.phase = 'impact'; h.alt = 0;
    return h;
  }

  // Le rig sort de la scene, donc la liberation de celle-ci ne le verrait plus passer.
  dispose() {
    for (const o of [this.diver.root, this.diver.blob]) { this.scene.remove(o); disposeTree(o); }
    this.diver.skeleton?.dispose(); // la texture d'os du skinning vit sur le GPU elle aussi
  }
}
