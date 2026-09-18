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

const MAX = 620;

export function createSplash(scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.42, map: dropTexture(), transparent: true, depthWrite: false,
    opacity: 0.95, sizeAttenuation: true, blending: THREE.NormalBlending
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);

  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  let active = 0;

  // anneau de vague a la surface
  const ringGeo = new THREE.RingGeometry(0.78, 0.92, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.visible = false;
  scene.add(ring);
  let ringT = 0;

  // plume : la colonne d'eau qui jaillit juste apres l'entree
  const plumeMat = new THREE.MeshStandardMaterial({ color: 0xf2fbff, roughness: 0.35, transparent: true, opacity: 0.9, flatShading: true });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(1, 3.2, 9), plumeMat);
  plume.geometry.translate(0, 1.6, 0);
  plume.visible = false;
  scene.add(plume);
  let plumeT = 0, plumePow = 1;

  return {
    burst(x, z, power = 1) {
      active = Math.min(MAX, Math.round(220 + 380 * power));
      for (let i = 0; i < active; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() ** 0.6;
        const up = (0.45 + Math.random() * 1.05) * (9 + 11 * power);
        pos[i * 3] = x + Math.cos(a) * r * 0.6;
        pos[i * 3 + 1] = 0.1 + Math.random() * 0.3;
        pos[i * 3 + 2] = z + Math.sin(a) * r * 0.6;
        vel[i * 3] = Math.cos(a) * r * (1.6 + 4.5 * power);
        vel[i * 3 + 1] = up;
        vel[i * 3 + 2] = Math.sin(a) * r * (1.6 + 4.5 * power);
        life[i] = 0.9 + Math.random() * 0.9;
      }
      points.visible = true;
      plume.visible = true; plumeT = 0; plumePow = power;
      plume.position.set(x, 0, z);
      ring.position.set(x, 0.06, z);
      ring.scale.setScalar(1);
      ring.visible = true;
      ringT = 0;
      ringMat.opacity = 0.55;
    },
    update(dt) {
      if (plume.visible) {
        plumeT += dt;
        const k = Math.min(1, plumeT / 0.42);
        const grow = Math.sin(k * Math.PI * 0.85);
        plume.scale.set(0.4 + plumePow * 0.35, (0.4 + grow * 3.6) * plumePow, 0.4 + plumePow * 0.35);
        plumeMat.opacity = 0.7 * (1 - k * k);
        if (k >= 1) plume.visible = false;
      }
      if (ring.visible) {
        ringT += dt;
        ring.scale.setScalar(1 + ringT * 11);
        ringMat.opacity = Math.max(0, 0.55 - ringT * 0.75);
        if (ringMat.opacity <= 0) ring.visible = false;
      }
      if (!points.visible) return;
      let alive = 0;
      for (let i = 0; i < active; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        vel[i * 3 + 1] -= 17 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0) { life[i] = 0; pos[i * 3 + 1] = -99; }
        else alive++;
      }
      geo.attributes.position.needsUpdate = true;
      if (!alive) points.visible = false;
    },
    reset() { points.visible = false; ring.visible = false; plume.visible = false; active = 0; }
  };
}
