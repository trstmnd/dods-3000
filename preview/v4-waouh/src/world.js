import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { mulberry32, seedFromString, fbm } from './noise.js';

// Repere du jeu : la falaise occupe z < 0, l'eau est en z > 0 (a droite de l'ecran).
// Le plongeur court de z = -9 vers le bord z = 0, a x = 0. Le niveau de l'eau est y = 0.
// La surface est un miroir (Water.js) : ses vagues ne sont que des normales, le plan reste
// a y = 0 et la physique du saut ne lit jamais la mer (invariant 2 de AGENTS.md).

export const EDGE_Z = 0;
export const RUN_START_Z = -9.5;

// Une texture de bruit periodique, calculee une fois en JS : la mer et le ciel la lisent
// en une ou deux lectures par pixel. Le meme bruit calcule dans le shader coutait huit
// appels par pixel de ciel et six par pixel de mer, soit 40 % de temps d'image en plus.
// Canaux : R hauteur, G et B pente en x et en z (pour le clapot), A second bruit (ecume).
const NOISE_N = 256, NOISE_P = 16;
let NOISE_DATA = null;
function noiseData() {
  if (NOISE_DATA) return NOISE_DATA;
  const N = NOISE_N;
  const hash = (x, y, s) => {
    let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ s;
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const wrap = (v, p) => ((v % p) + p) % p;
  // bruit de valeur periodique : la texture se repete sans couture
  const vn = (x, y, p, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = wrap(xi, p), x1 = wrap(xi + 1, p), y0 = wrap(yi, p), y1 = wrap(yi + 1, p);
    const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (i, j, oct, seed) => {
    let sum = 0, amp = 0.5, per = NOISE_P;
    for (let o = 0; o < oct; o++) { sum += amp * vn(i / N * per, j / N * per, per, seed + o * 31); amp *= 0.5; per *= 2; }
    return sum;
  };
  const h = new Float32Array(N * N), f = new Float32Array(N * N);
  let hMin = 1e9, hMax = -1e9, fMin = 1e9, fMax = -1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = fbm(i, j, 5, 7), b = fbm(i, j, 4, 911);
    h[j * N + i] = a; f[j * N + i] = b;
    hMin = Math.min(hMin, a); hMax = Math.max(hMax, a); fMin = Math.min(fMin, b); fMax = Math.max(fMax, b);
  }
  const data = new Uint8Array(N * N * 4);
  const H = (i, j) => (h[wrap(j, N) * N + wrap(i, N)] - hMin) / (hMax - hMin);
  let gMax = 1e-6;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) gMax = Math.max(gMax, Math.abs(H(i + 1, j) - H(i - 1, j)), Math.abs(H(i, j + 1) - H(i, j - 1)));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 4;
    data[k] = Math.round(H(i, j) * 255);
    data[k + 1] = Math.round((0.5 + 0.5 * (H(i + 1, j) - H(i - 1, j)) / gMax) * 255);
    data[k + 2] = Math.round((0.5 + 0.5 * (H(i, j + 1) - H(i, j - 1)) / gMax) * 255);
    data[k + 3] = Math.round((f[j * N + i] - fMin) / (fMax - fMin) * 255);
  }
  NOISE_DATA = data;
  return data;
}
// Une texture par monde, depuis les memes octets : elle part avec le monde a sa liberation.
function noiseTexture() {
  const t = new THREE.DataTexture(noiseData(), NOISE_N, NOISE_N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// L'onde circulaire et l'ecume laissee par l'entree du plongeur. Elles vivent dans le
// shader de l'eau (Water.js, patche plus bas) : un disque pose au-dessus de l'eau passerait
// sous les reflets. Purement visuelles, la physique du saut ne lit jamais la mer.
// `time` est l'horloge du materiau de Water, uImpact.xyz = (x, z, date d'entree).
const RIPPLE = `
  float rippleAge(){ return time - uImpact.z; }
  float rippleBand(vec2 xz){
    float age = rippleAge();
    if (age <= 0.0 || age > 2.6) return 0.0;
    float d = distance(xz, uImpact.xy);
    float k = 1.0 - clamp(abs(d - age * 7.0) / 2.2, 0.0, 1.0);
    return k * k * (1.0 - age / 2.6) * smoothstep(26.0, 2.0, d);
  }
`;
const IMPACT_FOAM = `
  float impactFoam(vec2 xz){
    float age = time - uImpact.z;
    if (age < 0.0 || age > 6.0) return 0.0;
    float d = distance(xz, uImpact.xy);
    // hors du disque d'ecume, on sort avant le bruit : c'est presque toute la mer
    if (d > 8.5) return 0.0;
    float R = (1.3 + 3.4 * (1.0 - exp(-age * 1.3))) * (0.7 + 0.45 * uImpactPow);
    float body = 1.0 - smoothstep(R * 0.45, R, d);
    float n = texture2D(uNoise, (xz * 1.7 + vec2(age * 0.35, -age * 0.22) + uImpact.xy * 0.37) / 16.0).a;
    float lace = smoothstep(0.46, 0.66, n + body * 0.3 - age * 0.03);
    return lace * body * (1.0 - smoothstep(1.4, 6.0, age));
  }
`;

// La texture de normales que Water.js attend, calculee depuis le meme bruit periodique
// que le ciel : aucune image a charger, et la texture se repete sans couture, ce que les
// quatre echelles sommees par son shader exigent. Water lit les canaux en (x, z, y).
let NORMALS = null;
function waterNormals() {
  if (NORMALS) return NORMALS;
  const data = noiseData(), N = NOISE_N;
  const H = (i, j) => data[(j * N + i) * 4] / 255;
  const out = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 4;
    const dx = (H(i + 1, j) - H(i - 1, j)) * 1.6;
    const dz = (H(i, j + 1) - H(i, j - 1)) * 1.6;
    const len = Math.hypot(dx, 1, dz);
    out[k] = Math.round((0.5 + dx / len * 0.5) * 255);
    out[k + 1] = Math.round((0.5 + dz / len * 0.5) * 255);
    out[k + 2] = Math.round((1 / len) * 255);
    out[k + 3] = 255;
  }
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  NORMALS = t;
  return t;
}

// La mer : le composant Water des exemples three (MIT), qui reflecit vraiment le ciel, la
// falaise et le soleil. On y recoud l'ecume du pied de falaise et l'onde d'entree : elles
// etaient dans l'ancien shader maison et c'est la signature du jeu.
function buildWater(pal, sunDir, noise) {
  const water = new Water(new THREE.PlaneGeometry(1200, 1200), {
    textureWidth: 512, textureHeight: 512,
    waterNormals: waterNormals(),
    sunDirection: sunDir.clone().normalize(),
    sunColor: new THREE.Color(pal.sun),
    waterColor: new THREE.Color(pal.deep),
    distortionScale: 1.8,
    fog: true
  });
  water.rotation.x = -Math.PI / 2;
  const mat = water.material;
  mat.uniforms.uTime = mat.uniforms.time; // la meme seconde, le meme objet : fx.js ecrit uImpact a l'heure juste
  mat.uniforms.uImpact = { value: new THREE.Vector3(0, 0, -99) };
  mat.uniforms.uImpactPow = { value: 1 };
  mat.uniforms.uNoise = { value: noise };
  mat.fragmentShader = mat.fragmentShader
    .replace('uniform vec3 waterColor;', `uniform vec3 waterColor;
      uniform vec3 uImpact; uniform float uImpactPow; uniform sampler2D uNoise;`)
    .replace('void main() {', `${RIPPLE}\n${IMPACT_FOAM}\nvoid main() {`)
    .replace('vec3 outgoingLight = albedo;', `vec3 outgoingLight = albedo;
      {
        // l'or du couchant couche au loin : a cette heure la mer distante est un
        // miroir du ciel meme vue de haut, ce que le seul Fresnel ne donne pas.
        float glow = smoothstep(60.0, 320.0, distance);
        outgoingLight = mix(outgoingLight, sunColor * 1.05, glow * 0.5);
        float foam = (1.0 - smoothstep(0.0, 7.0, worldPosition.z)) * (1.0 - smoothstep(15.0, 27.0, abs(worldPosition.x)));
        foam *= (0.5 + 0.5 * sin(worldPosition.x * 1.7 + time * 2.3)) * (0.55 + 0.45 * sin(worldPosition.x * 0.61 - time * 1.4));
        foam = max(foam, rippleBand(worldPosition.xz) * 0.85);
        outgoingLight = mix(outgoingLight, vec3(0.93, 0.98, 1.0), clamp(foam, 0.0, 1.0) * 0.48);
        float imp = impactFoam(worldPosition.xz);
        outgoingLight = mix(outgoingLight, vec3(0.95, 0.99, 1.0), imp * 0.92);
      }`);
  return water;
}

function skyDome(pal, noise) {
  const geo = new THREE.SphereGeometry(900, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(pal.sky[0]) },
      uBottom: { value: new THREE.Color(pal.sky[1]) },
      uSun: { value: new THREE.Color(pal.sun) },
      uSunDir: { value: new THREE.Vector3(...pal.sunPos).normalize() },
      uCover: { value: pal.clouds ?? 0.35 },
      uTime: { value: 0 },
      uNoise: { value: noise }
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop, uBottom, uSun, uSunDir; uniform float uCover, uTime; uniform sampler2D uNoise; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 1.25 + 0.16, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(h, 0.75));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        // Des nuages projetes sur un plafond : ils s'ecrasent vers l'horizon comme de vrais
        // nuages, et donnent a la chute une echelle que le ciel uni n'avait pas.
        if (d.y > 0.0 && uCover > 0.0) {
          vec2 uv = d.xz / (d.y + 0.09) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
          float n = texture2D(uNoise, uv * 0.078).r * 0.9 + (texture2D(uNoise, uv * 0.19 + 0.37).a - 0.5) * 0.35;
          float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.32, n);
          c *= smoothstep(0.0, 0.14, d.y);
          vec3 lit = mix(vec3(1.0), uSun, 0.35) * (0.92 + 0.35 * pow(sd, 4.0));
          vec3 shade = mix(uBottom, uTop, 0.35) * 0.95;
          vec3 cloud = mix(shade, lit, smoothstep(0.35, 0.95, n));
          col = mix(col, cloud, c * 0.88);
        }
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
  // La roche mouillee, juste au dessus de l'eau : plus sombre et tiree vers le fond.
  const wet = new THREE.Color(spot.palette.deep).lerp(colB, 0.35).multiplyScalar(0.62);
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
        const my = (tri[0].y + tri[1].y + tri[2].y) / 3;
        const mx = (tri[0].x + tri[1].x + tri[2].x) / 3;
        // Le bruit par face donne le grain, les strates donnent l'echelle : sans elles la
        // paroi est un bloc uniforme et la hauteur ne se lit pas.
        const shade = 0.82 + 0.18 * rnd();
        const band = 0.88 + 0.12 * Math.sin(my * 1.05 + mx * 0.06) + 0.06 * Math.sin(my * 2.6 + 1.3);
        const cc = colA.clone().lerp(colB, Math.min(1, Math.max(0, (H - my) / (H + 6)))).multiplyScalar(shade * band);
        const soak = 1 - Math.min(1, Math.max(0, (my - 0.2) / 2.6));
        if (soak > 0) cc.lerp(wet, soak * 0.75);
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
    // Des ilots bas et larges, teintes de roche : plus hauts et delaves par la brume, ils se
    // lisaient comme des pyramides blanches posees sur la mer (relecture Steam du 30/09).
    const h = 9 + rnd() * 24;
    const m = new THREE.Mesh(new THREE.ConeGeometry(34 + rnd() * 48, h, 9 + ((rnd() * 4) | 0)),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.rock2).lerp(new THREE.Color(pal.fog), 0.5), flatShading: true, roughness: 1 }));
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
  // Aucun arbre dans le couloir de la camera de course : en portrait, un pin plante a
  // deux metres de la piste bouchait tout l'ecran pendant l'elan.
  if (kind) for (let i = 0; i < 9; i++) {
    const x = (rnd() - 0.5) * 40, z = -6 - rnd() * 30;
    if (Math.abs(x) < 7 && z > -24) continue;
    tree(x, z, kind);
  }
}

// Three.js ne libere rien tout seul. Sans ce passage, chaque run laissait sa falaise,
// sa mer, son decor et sa shadow map sur le GPU : framerate en baisse puis contexte
// WebGL perdu au bout de quelques runs sur mobile.
function disposeMaterial(mat) {
  for (const v of Object.values(mat)) if (v && v.isTexture) v.dispose();
  if (mat.uniforms) for (const u of Object.values(mat.uniforms)) {
    if (u && u.value && u.value.isTexture) u.value.dispose();
  }
  mat.dispose();
}

export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach(disposeMaterial);
    else if (m) disposeMaterial(m);
    if (o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
  });
  root.clear();
}

export function buildWorld(spot, renderer) {
  const pal = spot.palette;
  const rnd = mulberry32(seedFromString(spot.id) ^ 0x9e37);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color(pal.fog), pal.fogDensity);

  const noise = noiseTexture();
  scene.add(skyDome(pal, noise));

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

  const water = buildWater(pal, sunDir, noise);
  const waterMat = water.material;
  water.position.z = 60;
  // le shader de Water lit le masque d'ombre : le plongeur en vol se projette sur la mer
  water.receiveShadow = true;
  water.renderOrder = -1;
  scene.add(water);

  const cliffGroup = new THREE.Group();
  cliffGroup.add(buildCliff(spot, rnd));
  buildPlatform(spot, cliffGroup);
  decor(spot, cliffGroup, rnd);
  scene.add(cliffGroup);

  const sky = scene.children.find(o => o.isMesh && o.material.uniforms && o.material.uniforms.uCover);
  return {
    scene, water, waterMat, sun, sunDir, spot,
    // un seul temps de simulation pour la mer et le ciel
    setTime(t) { waterMat.uniforms.uTime.value = t; if (sky) sky.material.uniforms.uTime.value = t; },
    dispose() { disposeTree(scene); }
  };
}
