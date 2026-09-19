import * as THREE from 'three';

function dropTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(226,247,255,0.85)');
  grad.addColorStop(1, 'rgba(190,235,255,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Deux nuages de tailles differentes valent mieux qu'un seul : les grosses gouttes donnent
// la silhouette, la bruine donne le volume. Un seul nuage uniforme ressemble a du popcorn.
const DROPS = 420, MIST = 300;

function cloud(scene, count, size, map, blending, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size, map, transparent: true, depthWrite: false,
    opacity, sizeAttenuation: true, blending
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  return { points, mat, pos, geo, vel: new Float32Array(count * 3), life: new Float32Array(count), max: count, active: 0, base: opacity };
}

export function createSplash(scene, waterMat = null) {
  const map = dropTexture();
  const drops = cloud(scene, DROPS, 0.38, map, THREE.NormalBlending, 0.95);
  const mist = cloud(scene, MIST, 0.2, map, THREE.AdditiveBlending, 0.45);

  // L'eau projetee est blanche quelle que soit la lumiere du spot. Un materiau eclaire
  // la rendait grise dans un fjord a l'ombre, ou elle ressemblait a un poteau de beton.
  const white = () => new THREE.MeshBasicMaterial({
    color: 0xf4fbff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false
  });

  // la colonne qui monte, et la couronne evasee qui s'ouvre a sa base
  const colMat = white();
  // Un tronc de cone, large en bas et ouvert en haut : une pointe de cone donnait un
  // poteau plante dans l'eau, ce que la gerbe d'un plongeon n'est jamais.
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.0, 3.2, 16, 1, true), colMat);
  column.geometry.translate(0, 1.6, 0);
  column.visible = false;
  scene.add(column);

  const crownMat = white();
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1, 1.9, 18, 1, true), crownMat);
  // pointe en bas, a la surface, et large vers le haut : la jupe qui s'ouvre a l'entree
  crown.geometry.rotateZ(Math.PI);
  crown.geometry.translate(0, 0.95, 0);
  crown.visible = false;
  scene.add(crown);

  // deux anneaux de surface, le second en retard, pour une onde qui se propage
  const rings = [0, 0.16].map(delay => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    // anneau fin : l'epaisseur grandit avec l'echelle, un anneau large finit en disque gris
    const geo = new THREE.RingGeometry(0.94, 1.0, 64);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, delay, t: 0 };
  });

  let plumeT = 0, power = 1, plumeOn = false;

  function fill(c, x, z, power, opts) {
    c.active = Math.min(c.max, Math.round(opts.count * (0.55 + 0.45 * power)));
    for (let i = 0; i < c.active; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() ** opts.bias;
      // les gouttes du bord partent a plat, celles du centre montent : c'est ce qui fait le parapluie
      const up = (opts.up[0] + Math.random() * opts.up[1]) * (1 - r * opts.flat) * (5 + 7 * power);
      const out = (opts.out[0] + r * opts.out[1]) * (1 + 1.1 * power);
      c.pos[i * 3] = x + Math.cos(a) * r * 0.7;
      c.pos[i * 3 + 1] = 0.05 + Math.random() * 0.4;
      c.pos[i * 3 + 2] = z + Math.sin(a) * r * 0.7;
      c.vel[i * 3] = Math.cos(a) * out;
      c.vel[i * 3 + 1] = up;
      c.vel[i * 3 + 2] = Math.sin(a) * out;
      c.life[i] = opts.life[0] + Math.random() * opts.life[1];
    }
    c.points.visible = true;
    c.mat.opacity = c.base;
    c.t = 0;
  }

  function step(c, dt, drag) {
    if (!c.points.visible) return;
    c.t += dt;
    let alive = 0;
    for (let i = 0; i < c.active; i++) {
      if (c.life[i] <= 0) continue;
      c.life[i] -= dt;
      c.vel[i * 3 + 1] -= 20 * dt;
      c.vel[i * 3] *= 1 - drag * dt;
      c.vel[i * 3 + 2] *= 1 - drag * dt;
      c.pos[i * 3] += c.vel[i * 3] * dt;
      c.pos[i * 3 + 1] += c.vel[i * 3 + 1] * dt;
      c.pos[i * 3 + 2] += c.vel[i * 3 + 2] * dt;
      if (c.pos[i * 3 + 1] < 0 || c.life[i] <= 0) { c.life[i] = 0; c.pos[i * 3 + 1] = -99; }
      else alive++;
    }
    c.geo.attributes.position.needsUpdate = true;
    c.mat.opacity = c.base * Math.max(0, 1 - c.t * 1.05);
    if (!alive || c.mat.opacity <= 0.01) c.points.visible = false;
  }

  return {
    burst(x, z, pow = 1) {
      power = pow;
      fill(drops, x, z, pow, { count: DROPS, bias: 0.6, up: [0.55, 0.95], out: [0.4, 1.5], flat: 0.55, life: [0.45, 0.5] });
      fill(mist, x, z, pow, { count: MIST, bias: 0.35, up: [0.3, 0.7], out: [0.5, 1.9], flat: 0.75, life: [0.6, 0.6] });
      plumeT = 0; plumeOn = true;
      column.position.set(x, 0, z); crown.position.set(x, 0, z);
      column.visible = crown.visible = true;
      for (const r of rings) {
        r.t = -r.delay;
        r.mesh.position.set(x, 0.07, z);
        r.mesh.scale.setScalar(1);
        r.mesh.visible = true;
        r.mat.opacity = 0;
      }
      // l'onde a la surface part du point d'entree, le shader de l'eau s'occupe du reste
      if (waterMat && waterMat.uniforms.uImpact) {
        waterMat.uniforms.uImpact.value.set(x, z, waterMat.uniforms.uTime.value);
      }
    },

    update(dt) {
      if (plumeOn) {
        plumeT += dt;
        const k = Math.min(1, plumeT / 0.55);
        // montee franche puis retombee : la colonne s'etire en s'affinant
        const rise = Math.sin(Math.min(1, k * 1.5) * Math.PI * 0.5);
        // la colonne monte a 6 m au plus : au dela elle sort du cadre et redevient un poteau
        const h = (0.3 + rise * 0.62) * (0.75 + power * 0.45);
        const w = (1.6 - k * 0.5) * (0.7 + power * 0.35);
        column.scale.set(w, h, w);
        // la colonne ne doit se voir que le temps que la bruine la recouvre
        colMat.opacity = 0.45 * Math.pow(Math.max(0, 1 - plumeT / 0.34), 1.4);
        const ck = Math.min(1, plumeT / 0.36);
        const spread = 0.5 + ck * 2.3 * (0.6 + power * 0.6);
        crown.scale.set(spread, 0.5 + ck * 1.1, spread);
        crownMat.opacity = 0.75 * (1 - ck) * (1 - ck);
        if (k >= 1) { plumeOn = false; column.visible = crown.visible = false; }
      }
      for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.t += dt;
        if (r.t < 0) continue;
        r.mesh.scale.setScalar(1 + r.t * 7.5);
        r.mat.opacity = Math.max(0, 0.5 - r.t * 0.8);
        if (r.mat.opacity <= 0) r.mesh.visible = false;
      }
      step(drops, dt, 1.1);
      step(mist, dt, 2.2);
    },

    reset() {
      drops.points.visible = false; mist.points.visible = false;
      drops.active = 0; mist.active = 0;
      column.visible = false; crown.visible = false; plumeOn = false;
      for (const r of rings) r.mesh.visible = false;
    }
  };
}
