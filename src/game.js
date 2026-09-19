import * as THREE from 'three';
import { createDiver, applyPose, runPose, POSES } from './diver.js';
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
    { key: 'perfect', label: 'PERFECT DØDS', mult: 3.0, color: '#ffd447' },
    { key: 'great', label: 'GREAT', mult: 2.0, color: '#5ef0a8' },
    { key: 'good', label: 'GOOD', mult: 1.35, color: '#4fd6ff' },
    { key: 'early', label: 'EARLY', mult: 0.7, color: '#b9c6d4' },
    { key: 'chicken', label: 'CHICKEN', mult: 0.3, color: '#b9c6d4' },
    { key: 'smack', label: 'SMACK', mult: 0, color: '#ff4d5e' }
  ],
  styleRate: 46,
  baseRate: 12
};

function windows(height) {
  // plus le spot est haut, plus la fenetre est serree
  const k = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(height, 10, 34, 1.0, 0.72), 0.7, 1.05);
  const perfectLo = 0.085;
  const perfectHi = perfectLo + 0.20 * k;
  const greatHi = perfectHi + 0.16 * k;
  const goodHi = greatHi + 0.34 * k;
  const earlyHi = goodHi + 0.75;
  return { perfectLo, perfectHi, greatHi, goodHi, earlyHi };
}

export class Jump {
  constructor(spot, scene, camera, splash, audio) {
    this.spot = spot; this.scene = scene; this.camera = camera; this.splash = splash; this.audio = audio;
    this.diver = createDiver();
    scene.add(this.diver.root);
    this.win = windows(spot.height);
    this.shake = 0;
    this.reset();
  }

  reset() {
    this.state = 'walk';
    this.t = 0;
    this.pos = new THREE.Vector3(0, this.spot.height, RUN_START_Z);
    this.vel = new THREE.Vector3();
    this.bodyRot = 0;
    this.yaw = 0;
    this.styleTime = 0;
    this.tucked = false;
    this.result = null;
    this.impactT = 0;
    this.takeoff = null;
    this.blend = 1;
    this.splash.reset();
    this.diver.root.visible = true;
    this.diver.blob.visible = true;
    applyPose(this.diver.joints, POSES.stand, 1);
    this.diver.root.position.copy(this.pos);
    this.diver.root.rotation.set(0, 0, 0);
    this._snap = true; this._snapLook = true;
    this.placeCamera(1);
  }

  get ttc() {
    // temps avant la surface, avec la vitesse verticale courante
    const y = this.pos.y, vy = this.vel.y, g = TUNING.gravity;
    const disc = vy * vy + 2 * g * y;
    if (disc <= 0) return 0;
    return (vy + Math.sqrt(disc)) / g;
  }

  // Espace / tap
  input() {
    if (this.state === 'walk') return this.jump();
    if (this.state === 'fly' && !this.tucked) return this.tuck();
    return false;
  }

  jump() {
    const dist = EDGE_Z - this.pos.z;
    const t = TUNING.takeoff.find(w => dist <= w.max);
    this.takeoff = t;
    this.vel.set(0, t.vy, t.vz);
    this.state = 'fly';
    this.t = 0;
    this.audio?.jump();
    return true;
  }

  fall() {
    this.takeoff = TUNING.noJump;
    this.vel.set(0, TUNING.noJump.vy, TUNING.noJump.vz);
    this.state = 'fly';
    this.t = 0;
    this.flailing = true;
    this.audio?.scream();
  }

  tuck() {
    this.tucked = true;
    this.tuckTtc = this.ttc;
    this.audio?.tuck();
    const w = this.win, ttc = this.tuckTtc;
    let key;
    if (ttc < w.perfectLo) key = 'smack';
    else if (ttc <= w.perfectHi) key = 'perfect';
    else if (ttc <= w.greatHi) key = 'great';
    else if (ttc <= w.goodHi) key = 'good';
    else if (ttc <= w.earlyHi) key = 'early';
    else key = 'chicken';
    this.grade = TUNING.grades.find(g => g.key === key);
    if (this.flailing && key !== 'smack') this.grade = TUNING.grades.find(g => g.key === 'early');
    return true;
  }

  update(dt, camShakeOut) {
    this.t += dt;
    const d = this.diver;

    if (this.state === 'walk') {
      this.pos.z += TUNING.runSpeed * dt;
      applyPose(d.joints, POSES.stand, 1, runPose(this.t));
      d.root.rotation.x = 0;
      if (this.pos.z > EDGE_Z + 0.45) this.fall();
    } else if (this.state === 'fly') {
      this.vel.y -= TUNING.gravity * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (!this.tucked) {
        this.styleTime += dt;
        if (this.flailing) applyPose(d.joints, POSES.flail, Math.min(1, dt * 7));
        else applyPose(d.joints, POSES.dods, Math.min(1, dt * 9));
        // le corps s'ouvre a l'horizontale, ventre vers l'eau : c'est la signature du dods
        this.bodyRot += ((this.flailing ? 0.9 : 1.48) - this.bodyRot) * Math.min(1, dt * 3.2);
        this.yaw += (-1.05 - this.yaw) * Math.min(1, dt * 3);
      } else {
        applyPose(d.joints, this.grade.key === 'smack' ? POSES.flail : POSES.tuck, Math.min(1, dt * 15));
        this.bodyRot += (2.55 - this.bodyRot) * Math.min(1, dt * 7);
        this.yaw += (-0.45 - this.yaw) * Math.min(1, dt * 6);
      }
      d.root.rotation.x = this.bodyRot;
      d.root.rotation.y = this.yaw;
      if (this.pos.y <= 0) this.land();
    } else if (this.state === 'impact') {
      this.impactT += dt;
      this.pos.y = Math.max(-3.5, this.pos.y - 5 * dt * (1 - this.impactT));
      if (this.impactT > 0.35) d.root.visible = false;
      if (this.impactT > 1.25 && this.onDone) { const cb = this.onDone; this.onDone = null; cb(this.result); }
    }

    d.root.position.copy(this.pos);
    d.blob.visible = this.state === 'walk';
    if (this.state === 'walk') d.blob.position.set(0, -this.pos.y + this.spot.height + 0.02, 0);

    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.placeCamera(Math.min(1, dt * (this.state === 'impact' ? 3.4 : 6)));
    if (camShakeOut) camShakeOut(this.shake);
    return this.state;
  }

  land() {
    this.pos.y = 0;
    this.state = 'impact';
    this.impactT = 0;
    this._snapLook = true;
    if (!this.tucked) { this.grade = TUNING.grades.find(g => g.key === 'smack'); this.tuckTtc = 0; }
    const dead = this.grade.key === 'smack';
    const speed = Math.abs(this.vel.y);
    const power = THREE.MathUtils.clamp(speed / 26, 0.35, 1.25) * (dead ? 1.25 : (this.grade.mult >= 2 ? 1.15 : 0.8));
    this.splash.burst(this.pos.x, this.pos.z, power);
    this.shake = dead ? 1.25 : 0.55 + this.grade.mult * 0.12;
    this.audio?.splash(dead);

    const base = Math.round(this.spot.height * TUNING.baseRate);
    const style = Math.round(this.styleTime * TUNING.styleRate * Math.sqrt(this.spot.height / 12));
    const score = dead ? 0 : Math.round((base + style) * this.grade.mult * this.takeoff.mult);
    this.result = {
      dead, grade: this.grade, base, style, score,
      takeoff: this.takeoff, ttc: this.tuckTtc, air: this.styleTime,
      height: this.spot.height
    };
  }

  placeCamera(k) {
    const c = this.camera, p = this.pos;
    let tx, ty, tz, lx, ly, lz, fov;
    if (this.state === 'walk') {
      tx = -3.4; ty = this.spot.height + 2.05; tz = p.z - 6.4;
      lx = 0; ly = this.spot.height + 0.75; lz = p.z + 3.0;
      fov = 60;
    } else if (this.state === 'fly') {
      const v = Math.min(1, Math.abs(this.vel.y) / 24);
      tx = -6.4 - v * 1.8; ty = p.y + 1.35 - v * 0.9; tz = p.z + 2.5 + v * 1.3;
      lx = 0; ly = p.y - 0.75 - v * 1.5; lz = p.z + 0.3;
      fov = 54 + v * 24;
    } else {
      tx = -13; ty = 4.6; tz = p.z + 12.5;
      lx = 0; ly = 2.6; lz = p.z;
      fov = 60;
    }
    // En portrait, un champ vertical constant retrecit le champ horizontal et le plongeur, qui vole
    // a plat, deborde du cadre. On elargit donc le fov quand l'ecran est plus haut que large.
    if (c.aspect < 1) fov *= 1 + (1 - c.aspect) * 0.85;
    const target = new THREE.Vector3(tx, ty, tz);
    if (this._snap) { c.position.copy(target); this._snap = false; }
    else c.position.lerp(target, k);
    if (!this._look) this._look = new THREE.Vector3(lx, ly, lz);
    this._look.lerp(new THREE.Vector3(lx, ly, lz), this._snapLook ? 1 : Math.min(1, k * 2.6));
    this._snapLook = false;
    c.lookAt(this._look);
    if (Math.abs(c.fov - fov) > 0.05) { c.fov += (fov - c.fov) * k; c.updateProjectionMatrix(); }
  }

  // etat pour le HUD
  hud() {
    if (this.state === 'walk') {
      const total = EDGE_Z - RUN_START_Z;
      return { phase: 'walk', progress: (this.pos.z - RUN_START_Z) / total, alt: this.spot.height };
    }
    if (this.state === 'fly') {
      const ttc = this.ttc;
      const w = this.win;
      return {
        phase: 'fly', alt: Math.max(0, this.pos.y), ttc, tucked: this.tucked,
        ratio: THREE.MathUtils.clamp(1 - ttc / (w.earlyHi + 0.6), 0, 1),
        zoneLo: 1 - w.perfectHi / (w.earlyHi + 0.6), zoneHi: 1 - w.perfectLo / (w.earlyHi + 0.6),
        hot: ttc <= w.goodHi
      };
    }
    return { phase: 'impact', alt: 0 };
  }

  // Le rig sort de la scene, donc la liberation de celle-ci ne le verrait plus passer.
  dispose() { this.scene.remove(this.diver.root); disposeTree(this.diver.root); }
}
