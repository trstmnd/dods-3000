import * as THREE from 'three';
import { mulberry32, seedFromString, fbm } from './noise.js';

// Repere du jeu : la falaise occupe z < 0, l'eau est en z > 0 (a droite de l'ecran).
// Le plongeur court de z = -9 vers le bord z = 0, a x = 0. Le niveau de l'eau est y = 0.

export const EDGE_Z = 0;
export const RUN_START_Z = -9.5;

const WAVES = [
  { ax: 0.31, az: 0.11, k: 0.30, spd: 1.15, amp: 0.26 },
  { ax: -0.18, az: 0.42, k: 0.47, spd: 0.85, amp: 0.17 },
  { ax: 0.55, az: -0.30, k: 0.93, spd: 1.9, amp: 0.065 }
];

export function waveHeight(x, z, t) {
  let h = 0;
  for (const w of WAVES) h += Math.sin((x * w.ax + z * w.az) * w.k + t * w.spd) * w.amp;
  return h;
}

function waterMaterial(pal, sunDir) {
  const consts = WAVES.map((w, i) =>
    `const vec4 W${i} = vec4(${w.ax.toFixed(3)}, ${w.az.toFixed(3)}, ${w.k.toFixed(3)}, ${w.spd.toFixed(3)});
     const float A${i} = ${w.amp.toFixed(4)};`).join('\n');

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(pal.water) },
      uDeep: { value: new THREE.Color(pal.deep) },
      uSun: { value: new THREE.Color(pal.sun) },
      uSunDir: { value: sunDir.clone().normalize() },
      uFog: { value: new THREE.Color(pal.fog) },
      uFogDensity: { value: pal.fogDensity }
    },
    vertexShader: `
      ${consts}
      uniform float uTime;
      varying vec3 vWorld; varying float vWave; varying vec3 vNormalW; varying float vDepth;
      float phase(vec4 w, vec2 p){ return (p.x*w.x + p.y*w.y)*w.z + uTime*w.w; }
      void main(){
        vec3 p = position;
        vec2 xz = p.xz;
        float h = 0.0, dx = 0.0, dz = 0.0;
        ${WAVES.map((w, i) => `{
          float ph = phase(W${i}, xz);
          h += sin(ph)*A${i};
          dx += cos(ph)*A${i}*W${i}.x*W${i}.z;
          dz += cos(ph)*A${i}*W${i}.y*W${i}.z;
        }`).join('\n')}
        p.y += h; vWave = h;
        vNormalW = normalize(vec3(-dx, 1.0, -dz));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uShallow, uDeep, uSun, uSunDir, uFog;
      uniform float uFogDensity, uTime;
      varying vec3 vWorld; varying float vWave; varying vec3 vNormalW; varying float vDepth;
      void main(){
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.5);
        float d = length(vWorld.xz - vec2(0.0, 6.0));
        vec3 col = mix(uShallow, uDeep, smoothstep(14.0, 130.0, d));
        col = mix(col, uShallow * 1.35, smoothstep(0.0, 0.32, vWave) * 0.4);
        vec3 H = normalize(uSunDir + V);
        col += uSun * pow(max(dot(N, H), 0.0), 110.0) * 1.6;
        col = mix(col, uSun * 0.9, fres * 0.5);
        float foam = (1.0 - smoothstep(0.0, 6.0, vWorld.z)) * step(-24.0, vWorld.x) * step(vWorld.x, 24.0);
        foam *= 0.55 + 0.45 * sin(vWorld.x * 1.7 + uTime * 2.3);
        col = mix(col, vec3(0.93, 0.98, 1.0), clamp(foam, 0.0, 1.0) * 0.5);
        float f = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        gl_FragColor = vec4(mix(col, uFog, clamp(f, 0.0, 1.0)), 1.0);
      }`
  });
}

function skyDome(pal) {
  const geo = new THREE.SphereGeometry(900, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(pal.sky[0]) },
      uBottom: { value: new THREE.Color(pal.sky[1]) },
      uSun: { value: new THREE.Color(pal.sun) },
      uSunDir: { value: new THREE.Vector3(...pal.sunPos).normalize() }
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop, uBottom, uSun, uSunDir; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y * 1.25 + 0.16, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(h, 0.75));
        float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += uSun * pow(sd, 260.0) * 2.2;
        col += uSun * pow(sd, 9.0) * 0.28;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  return new THREE.Mesh(geo, mat);
}

// Falaise : profil lateral extrude le long de X, bruite, flat shading.
function buildCliff(spot, rnd) {
  const H = spot.height;
  const seed = seedFromString(spot.id);
  const profile = [
    [-46, H + 6], [-30, H + 1.4], [-18, H + 0.35], [-11, H], [-4, H], [0, H],
    [0.9, H - 2.2], [1.6, H - H * 0.28], [2.4, H - H * 0.55], [2.0, H - H * 0.78],
    [2.8, H - H * 0.94], [3.4, 0.4], [5.0, -4.0], [9.0, -12.0]
  ];
  const COLS = 34, W = 54;
  const pos = [], colA = new THREE.Color(spot.palette.rock), colB = new THREE.Color(spot.palette.rock2), cols = [];
  const grid = [];
  for (let i = 0; i < COLS; i++) {
    const x = -W / 2 + (W * i) / (COLS - 1);
    const row = [];
    for (let j = 0; j < profile.length; j++) {
      let [z, y] = profile[j];
      const nearTop = j <= 5;
      // amplitude du relief : nulle sur la piste de course, forte sur la paroi et les flancs
      const lateral = Math.min(1, Math.abs(x) / 9);
      const runway = nearTop ? lateral : 1;
      const n1 = fbm(x * 0.09, y * 0.11, z * 0.09, seed, 4);
      const n2 = fbm(x * 0.28, y * 0.3, z * 0.25, seed + 99, 3);
      const amp = (nearTop ? 1.6 : 3.4) * runway;
      y += n1 * amp + n2 * amp * 0.35;
      z += (nearTop ? n2 * 0.8 * runway : n1 * 2.2);
      if (Math.abs(x) > W / 2 - 8) y -= (Math.abs(x) - (W / 2 - 8)) * 0.55; // les flancs plongent
      row.push(new THREE.Vector3(x, y, z));
    }
    grid.push(row);
  }
  for (let i = 0; i < COLS - 1; i++) {
    for (let j = 0; j < profile.length - 1; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      // L'enroulement compte : dans l'autre sens les normales pointent vers le sol et la falaise
      // n'est plus eclairee que par la composante basse de la lumiere hemispherique, donc grise.
      for (const tri of [[a, c, b], [a, d, c]]) {
        const shade = 0.72 + 0.28 * rnd();
        const cc = colA.clone().lerp(colB, Math.min(1, Math.max(0, (H - tri[0].y) / (H + 6)))).multiplyScalar(shade);
        for (const v of tri) { pos.push(v.x, v.y, v.z); cols.push(cc.r, cc.g, cc.b); }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function slab(w, h, d, color, rough = 0.85) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true }));
}

// Structure posee sur le sommet. Le couloir de course va de z = -9.5 a z = 0, a x = 0.
function buildPlatform(spot, group) {
  const H = spot.height;
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };

  if (spot.platform === 'board') {
    const steel = 0x9fb0bd;
    add(slab(1.9, 0.22, 10.4, 0xf7fafc, 0.45), 0, H - 0.11, -4.6);            // la planche, bord a z = 0.6
    for (const s of [-1, 1]) {
      add(slab(0.09, 0.95, 6.4, steel, 0.3), s * 1.05, H + 0.55, -6.6);       // mains courantes
      add(slab(0.09, 0.09, 6.4, steel, 0.3), s * 1.05, H + 1.0, -6.6);
    }
    add(slab(4.6, 0.5, 3.2, 0xe4eaef, 0.7), 0, H - 0.35, -11.0);              // socle arriere
    add(slab(0.55, 3.4, 0.55, steel, 0.35), -1.3, H - 2.0, -8.2);
    add(slab(0.55, 3.4, 0.55, steel, 0.35), 1.3, H - 2.0, -8.2);
  } else if (spot.platform === 'terrace') {
    add(slab(13, 0.55, 11, 0xd8cdb6, 0.92), 0, H - 0.28, -5.0);               // dalle beton
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) add(slab(0.18, 0.95, 0.18, 0x8b7f6b, 0.85), s * 5.2, H + 0.47, -1.5 - i * 2.2);
      add(slab(0.2, 0.14, 10, 0x8b7f6b, 0.85), s * 5.2, H + 0.95, -6.0);
    }
    const pole = add(slab(0.14, 3.0, 0.14, 0x6b5a45), -4.4, H + 1.4, -9.5);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.95, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8604f, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }));
    add(top, -4.4, H + 3.1, -9.5);
    pole.castShadow = true;
  } else if (spot.platform === 'bridge') {
    const stone = 0xd8cdb4;
    add(slab(21, 0.9, 11, stone, 0.95), 0, H - 0.45, -5.2);                   // tablier, bord a z = 0.3
    add(slab(21, 1.15, 0.5, 0xc3b79c, 0.95), 0, H + 0.5, -10.4);              // muret arriere seulement
    const R = 10.5;                                                              // arche sous le tablier
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * (i / 20);
      const b = slab(2.4, 1.5, 9.5, i % 2 ? stone : 0xcabfa6, 0.95);
      b.position.set(Math.cos(a) * R, H - 1.4 - R + Math.sin(a) * R, -5.2);
      b.rotation.z = a - Math.PI / 2;
      b.castShadow = true; b.receiveShadow = true;
      group.add(b);
    }
  } else {
    // rocher nu : une corniche pour marquer la piste
    add(slab(5.5, 0.35, 9, new THREE.Color(spot.palette.rock).offsetHSL(0, 0, 0.06).getHex(), 0.96), 0, H - 0.17, -5.0);
  }
}

function decor(spot, group, rnd) {
  const pal = spot.palette;
  // ilots lointains
  for (let i = 0; i < 7; i++) {
    const far = 220 + rnd() * 320;
    const ang = (-0.15 + rnd() * 1.5) * Math.PI;
    const h = 14 + rnd() * 46;
    const m = new THREE.Mesh(new THREE.ConeGeometry(28 + rnd() * 44, h, 6 + ((rnd() * 3) | 0)),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.rock2).lerp(new THREE.Color(pal.fog), 0.72), flatShading: true, roughness: 1 }));
    m.position.set(Math.cos(ang) * far, h / 2 - 2, Math.sin(ang) * far + 40);
    m.rotation.y = rnd() * 6;
    group.add(m);
  }
  // vegetation du haut
  const tree = (x, z, kind) => {
    const g = new THREE.Group();
    const trunkH = kind === 'palm' ? 4.5 + rnd() * 2 : 2.4 + rnd() * 1.6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, trunkH, 6),
      new THREE.MeshStandardMaterial({ color: kind === 'palm' ? 0x9c7f5c : 0x6b4f3a, flatShading: true, roughness: 1 }));
    trunk.position.y = trunkH / 2; trunk.castShadow = true; g.add(trunk);
    if (kind === 'palm') {
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.4, 4),
          new THREE.MeshStandardMaterial({ color: 0x3f8f4d, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
        leaf.position.set(Math.cos(i) * 1.2, trunkH + 0.4, Math.sin(i) * 1.2);
        leaf.rotation.set(Math.PI / 2.4, i * 1.05, 0); leaf.castShadow = true; g.add(leaf);
      }
    } else {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5 + rnd(), 4 + rnd() * 2.5, 7),
        new THREE.MeshStandardMaterial({ color: kind === 'pine' ? 0x2c5c3f : 0x4e8b46, flatShading: true, roughness: 1 }));
      crown.position.y = trunkH + 1.8; crown.castShadow = true; g.add(crown);
    }
    g.position.set(x, spot.height - 0.2, z);
    group.add(g);
  };
  const kind = ['ricks', 'comino'].includes(spot.id) ? 'palm' : (spot.id === 'lysefjord' ? 'pine' : null);
  if (kind) for (let i = 0; i < 9; i++) tree((rnd() - 0.5) * 40, -6 - rnd() * 30, kind);
}

export function buildWorld(spot, renderer) {
  const pal = spot.palette;
  const rnd = mulberry32(seedFromString(spot.id) ^ 0x9e37);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(pal.fog), pal.fogDensity);

  scene.add(skyDome(pal));

  const sunDir = new THREE.Vector3(...pal.sunPos);
  const sun = new THREE.DirectionalLight(new THREE.Color(pal.sun), 3.3);
  sun.position.copy(sunDir).setLength(180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const S = Math.max(40, spot.height * 1.8);
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 40, far: 420 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  // Ces lumieres d'appoint restent basses : montees plus haut, leur teinte froide lave les roches claires.
  const ground = new THREE.Color(pal.water).lerp(new THREE.Color(0xcdd3d8), 0.7);
  scene.add(new THREE.HemisphereLight(new THREE.Color(pal.sky[0]), ground, pal.ambient * 1.0));
  const fill = new THREE.DirectionalLight(new THREE.Color(pal.sky[0]).lerp(new THREE.Color(0xfff6e8), 0.7), 0.55);
  fill.position.set(-120, 45, -60);
  scene.add(fill);

  const waterGeo = new THREE.PlaneGeometry(1200, 1200, 128, 128);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = waterMaterial(pal, sunDir);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.z = 60;
  water.renderOrder = -1;
  scene.add(water);

  const cliffGroup = new THREE.Group();
  cliffGroup.add(buildCliff(spot, rnd));
  buildPlatform(spot, cliffGroup);
  decor(spot, cliffGroup, rnd);
  scene.add(cliffGroup);

  return { scene, water, waterMat, sun, sunDir };
}
