import * as THREE from 'three';

// Le plongeur est un vrai personnage : une peau continue et lissee, deformee par un
// squelette, et non plus un assemblage de capsules qui se croisent aux articulations.
//
// Il reste entierement genere en code, comme la falaise et la mer. Le corps est decrit
// par un champ de distance (des capsules coniques fondues les unes dans les autres),
// transforme en maillage par surface nets, puis attache aux os par des poids calcules
// a partir de la distance a chaque segment. Aucun fichier a charger, aucun outil externe.
//
// Le cout est paye une fois au chargement : la geometrie est mise en cache et clonee
// pour chaque run, ce qui laisse disposeTree() liberer le clone sans vider le cache.

const SKIN = 0xf0b58a, SUIT = 0xff3f56, SUIT2 = 0x1b2a4a, HAIR = 0x2b1d17;

// Squelette au repos, dans le repere du root : les pieds sont a y = 0.
// Les positions locales reprennent celles de l'ancien rig, donc les poses ne bougent pas.
const BONES = [
  { name: 'body', parent: null, pos: [0, 1.32, 0] },
  { name: 'neck', parent: 'body', pos: [0, 0.82, 0] },
  { name: 'shL', parent: 'body', pos: [-0.34, 0.78, 0] },
  { name: 'elL', parent: 'shL', pos: [0, -0.56, 0] },
  { name: 'shR', parent: 'body', pos: [0.34, 0.78, 0] },
  { name: 'elR', parent: 'shR', pos: [0, -0.56, 0] },
  { name: 'hipL', parent: 'body', pos: [-0.15, 0.08, 0] },
  { name: 'knL', parent: 'hipL', pos: [0, -0.66, 0] },
  { name: 'hipR', parent: 'body', pos: [0.15, 0.08, 0] },
  { name: 'knR', parent: 'hipR', pos: [0, -0.66, 0] }
];

// Le corps : des troncs de cone fondus. `bone` dit qui commande ce morceau, ce qui sert
// a la fois aux poids du skinning et a la couleur.
function parts() {
  const p = [
    { a: [0, 1.42, 0], b: [0, 1.93, 0], ra: 0.228, rb: 0.268, bone: 'body' },
    { a: [-0.30, 2.04, 0], b: [0.30, 2.04, 0], ra: 0.152, rb: 0.152, bone: 'body' },
    { a: [0, 2.02, 0], b: [0, 2.26, 0], ra: 0.090, rb: 0.080, bone: 'neck' },
    { a: [0, 2.38, 0.012], b: [0, 2.50, 0], ra: 0.200, rb: 0.184, bone: 'neck' }
  ];
  for (const s of [-1, 1]) {
    const t = s < 0 ? 'L' : 'R';
    p.push(
      // Les bras sont ecartes du torse : colles a lui, la peau se soude et tend une palme
      // entre le buste et le bras des que la croix s'ouvre. L'os reste a sa place, un peu
      // en dedans du deltoide, comme une vraie articulation d'epaule.
      { a: [s * 0.40, 2.08, 0], b: [s * 0.41, 1.54, 0], ra: 0.098, rb: 0.085, bone: 'sh' + t },
      { a: [s * 0.41, 1.54, 0], b: [s * 0.42, 1.06, 0], ra: 0.085, rb: 0.062, bone: 'el' + t },
      { a: [s * 0.42, 1.05, 0], b: [s * 0.42, 0.93, 0.02], ra: 0.072, rb: 0.052, bone: 'el' + t },
      { a: [s * 0.15, 1.40, 0], b: [s * 0.16, 0.76, 0], ra: 0.145, rb: 0.112, bone: 'hip' + t },
      { a: [s * 0.16, 0.76, 0], b: [s * 0.15, 0.12, 0], ra: 0.112, rb: 0.062, bone: 'kn' + t },
      { a: [s * 0.15, 0.075, 0], b: [s * 0.15, 0.05, 0.20], ra: 0.066, rb: 0.046, bone: 'kn' + t }
    );
  }
  return p;
}

const PARTS = parts();
const BOUNDS = { lo: [-0.58, -0.06, -0.44], hi: [0.58, 2.80, 0.44] };
const STEP = 0.034;
const BLEND = 0.042; // fusion des morceaux : trop haute, les membres se soudent au buste

// Distance a un tronc de cone. Ce n'est pas la distance exacte, mais la surface de niveau
// zero est juste, ce qui suffit pour en tirer un maillage.
function coneDist(x, y, z, p) {
  const ax = p.a[0], ay = p.a[1], az = p.a[2];
  const bx = p.b[0] - ax, by = p.b[1] - ay, bz = p.b[2] - az;
  const px = x - ax, py = y - ay, pz = z - az;
  const bb = bx * bx + by * by + bz * bz;
  let h = bb > 0 ? (px * bx + py * by + pz * bz) / bb : 0;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = px - bx * h, dy = py - by * h, dz = pz - bz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.ra + (p.rb - p.ra) * h);
}

function smin(a, b, k) {
  const h = Math.max(0, k - Math.abs(a - b)) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function field(x, y, z) {
  let d = 1e9;
  for (const p of PARTS) d = smin(d, coneDist(x, y, z, p), BLEND);
  return d;
}

// Les 8 coins d'une cellule, indices par bits : 1 = x, 2 = y, 4 = z.
const CORNERS = [];
for (let c = 0; c < 8; c++) CORNERS.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
const EDGES = [];
for (let c = 0; c < 8; c++) for (const bit of [1, 2, 4]) if (!(c & bit)) EDGES.push([c, c | bit]);

// Surface nets : un sommet par cellule traversee, place au barycentre des passages a zero,
// puis un quad par arete qui change de signe. Pas de table de 256 cas a trainer.
function surfaceNets() {
  const { lo, hi } = BOUNDS;
  const nx = Math.ceil((hi[0] - lo[0]) / STEP), ny = Math.ceil((hi[1] - lo[1]) / STEP), nz = Math.ceil((hi[2] - lo[2]) / STEP);
  const dx = nx + 1, dy = ny + 1, dz = nz + 1;
  const val = new Float32Array(dx * dy * dz);
  const at = (i, j, k) => (k * dy + j) * dx + i;
  for (let k = 0; k < dz; k++) {
    for (let j = 0; j < dy; j++) {
      for (let i = 0; i < dx; i++) {
        val[at(i, j, k)] = field(lo[0] + i * STEP, lo[1] + j * STEP, lo[2] + k * STEP);
      }
    }
  }

  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const ci = (i, j, k) => (k * ny + j) * nx + i;
  const pos = [];
  const v = new Float32Array(8);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const o = CORNERS[c];
          v[c] = val[at(i + o[0], j + o[1], k + o[2])];
          if (v[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          if ((v[a] < 0) === (v[b] < 0)) continue;
          const t = v[a] / (v[a] - v[b]);
          const A = CORNERS[a], B = CORNERS[b];
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          n++;
        }
        cell[ci(i, j, k)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / n) * STEP, lo[1] + (j + sy / n) * STEP, lo[2] + (k + sz / n) * STEP);
      }
    }
  }

  const idx = [];
  const q = [0, 0, 0];
  for (let k = 0; k < dz; k++) {
    for (let j = 0; j < dy; j++) {
      for (let i = 0; i < dx; i++) {
        const v0 = val[at(i, j, k)];
        for (let a = 0; a < 3; a++) {
          const i1 = i + (a === 0 ? 1 : 0), j1 = j + (a === 1 ? 1 : 0), k1 = k + (a === 2 ? 1 : 0);
          if (i1 >= dx || j1 >= dy || k1 >= dz) continue;
          const v1 = val[at(i1, j1, k1)];
          if ((v0 < 0) === (v1 < 0)) continue;
          const b = (a + 1) % 3, c = (a + 2) % 3;
          const quad = [];
          let ok = true;
          for (const [db, dc] of [[0, 0], [-1, 0], [-1, -1], [0, -1]]) {
            q[0] = i; q[1] = j; q[2] = k;
            q[b] += db; q[c] += dc;
            if (q[0] < 0 || q[1] < 0 || q[2] < 0 || q[0] >= nx || q[1] >= ny || q[2] >= nz) { ok = false; break; }
            const w = cell[ci(q[0], q[1], q[2])];
            if (w < 0) { ok = false; break; }
            quad.push(w);
          }
          if (!ok) continue;
          // l'ordre depend du sens de la traversee, sinon la moitie des faces regarde dedans
          if (v0 < 0) idx.push(quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]);
          else idx.push(quad[0], quad[2], quad[1], quad[0], quad[3], quad[2]);
        }
      }
    }
  }
  return { pos: new Float32Array(pos), idx };
}

function nearest(x, y, z) {
  let best = null, bd = 1e9;
  for (const p of PARTS) {
    const d = coneDist(x, y, z, p);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function colorFor(x, y, z, bone) {
  if (bone === 'neck') {
    // calotte de cheveux : le haut du crane et la nuque
    if (y > 2.49 || (y > 2.38 && z < -0.05)) return HAIR;
    return SKIN;
  }
  if (bone === 'body') return y > 1.56 ? SUIT : SUIT2;
  if (bone === 'hipL' || bone === 'hipR') return y > 1.06 ? SUIT2 : SKIN;
  return SKIN;
}

// Poids de peau : l'inverse du cube de la distance aux segments, les quatre plus proches.
// Une articulation prend donc ses deux os a parts presque egales, et la peau s'y plie.
function skinAt(x, y, z, order) {
  const d = [];
  for (const p of PARTS) {
    const k = order.indexOf(p.bone);
    if (k < 0) continue;
    // distance a la surface du morceau, pas a son axe : un sommet au creux de l'aisselle
    // est a la meme distance des deux axes, ce qui lui donnait un demi-poids de bras.
    const dist = coneDist(x, y, z, p);
    if (dist > 0.14) continue;
    const e = Math.max(0.02, dist + 0.02);
    const w = 1 / (e * e * e * e);
    d[k] = Math.max(d[k] || 0, w);
  }
  const top = [];
  for (let i = 0; i < d.length; i++) if (d[i]) top.push([i, d[i]]);
  top.sort((a, b) => b[1] - a[1]);
  const keep = top.slice(0, 4);
  const sum = keep.reduce((s, e) => s + e[1], 0) || 1;
  const bi = [0, 0, 0, 0], bw = [0, 0, 0, 0];
  keep.forEach((e, i) => { bi[i] = e[0]; bw[i] = e[1] / sum; });
  return { bi, bw };
}

let CACHE = null;
function bodyGeometry(order) {
  if (CACHE) return CACHE.clone();
  const { pos, idx } = surfaceNets();
  const count = pos.length / 3;
  const nor = new Float32Array(pos.length);
  const col = new Float32Array(pos.length);
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  const c = new THREE.Color();
  const e = STEP * 0.5;
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    // normale prise sur le gradient du champ : plus douce que la moyenne des faces
    let nx = field(x + e, y, z) - field(x - e, y, z);
    let ny = field(x, y + e, z) - field(x, y - e, z);
    let nz = field(x, y, z + e) - field(x, y, z - e);
    const len = Math.hypot(nx, ny, nz) || 1;
    nor[i * 3] = nx / len; nor[i * 3 + 1] = ny / len; nor[i * 3 + 2] = nz / len;
    const part = nearest(x, y, z);
    c.setHex(colorFor(x, y, z, part.bone));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    const s = skinAt(x, y, z, order);
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = s.bi[k]; sw[i * 4 + k] = s.bw[k]; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  CACHE = geo;
  return geo.clone();
}

export function createDiver() {
  const root = new THREE.Group();
  const joints = {}, bones = [], order = BONES.map(b => b.name);
  for (const def of BONES) {
    const bone = new THREE.Bone();
    bone.position.set(...def.pos);
    (def.parent ? joints[def.parent] : root).add(bone);
    joints[def.name] = bone;
    bones.push(bone);
  }

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.35 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeMat);
    // le regard vit sur l'os du cou, donc il suit la tete dans toutes les poses
    eye.position.set(s * 0.076, 0.30, 0.172);
    joints.neck.add(eye);
  }

  // Marqueurs de contact. La physique suit un point, mais c'est une main, un pied ou un
  // genou qui touche l'eau : ces reperes disent ou est le bas du corps dans chaque pose.
  const tips = [];
  const tip = (bone, x, y, z) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    joints[bone].add(o);
    tips.push(o);
    return o;
  };
  tip('elL', 0, -0.54, 0); tip('elR', 0, -0.54, 0);
  tip('knL', 0, -0.70, 0.06); tip('knR', 0, -0.70, 0.06);
  tip('body', 0, 0.50, 0.20); tip('neck', 0, 0.30, 0);

  root.updateMatrixWorld(true); // pose de repos : c'est elle qui sert de reference au skinning
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(bodyGeometry(order), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.64, metalness: 0.02
  }));
  mesh.castShadow = true;
  root.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());

  // L'ombre au sol sert aussi de repere de hauteur pendant la chute. Elle vit hors du rig :
  // enfant du corps, elle basculerait avec lui une fois le plongeur a l'horizontale.
  // Un disque sombre disparait sur l'eau d'un fjord, un anneau clair disparait en plein
  // soleil : les deux ensemble se lisent partout.
  const blob = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x00131f, transparent: true, opacity: 0.28, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 36),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2;
  blob.add(disc, halo);
  blob.userData = { disc: disc.material, halo: halo.material };

  return { root, joints, blob, skeleton, tips };
}

// Une pose = rotations en radians. Les cles absentes retournent a zero.
export const POSES = {
  stand: { shL: [0, 0, 0.12], shR: [0, 0, -0.12], elL: [0, 0, 0.1], elR: [0, 0, -0.1], hipL: [0, 0, 0.04], hipR: [0, 0, -0.04], knL: [0.05, 0, 0], knR: [0.05, 0, 0], body: [0, 0, 0] },
  ready: { shL: [-0.5, 0, 0.35], shR: [-0.5, 0, -0.35], elL: [-0.7, 0, 0.1], elR: [-0.7, 0, -0.1], hipL: [0.35, 0, 0.06], hipR: [0.35, 0, -0.06], knL: [-0.6, 0, 0], knR: [-0.6, 0, 0], body: [0.22, 0, 0] },
  // Le vol : bras en croix, corps etire et cambre, jambes serrees et tendues. Le jury
  // demande un vol horizontal et un etirement net, pas un grand ecart.
  dods: { shL: [0, 0, 1.66], shR: [0, 0, -1.66], elL: [0, 0, 0.1], elR: [0, 0, -0.1], hipL: [-0.14, 0, 0.1], hipR: [-0.14, 0, -0.1], knL: [0.05, 0, 0], knR: [0.05, 0, 0], neck: [-0.25, 0, 0], body: [-0.3, 0, 0] },
  // La crevette : la tete rentre dans les epaules, les bras poussent vers l'avant et les
  // jambes montent chercher les mains. Mains et pieds touchent l'eau ensemble.
  shrimp: { shL: [-2.05, 0, 0.2], shR: [-2.05, 0, -0.2], elL: [-0.25, 0, 0.05], elR: [-0.25, 0, -0.05], hipL: [-2.22, 0, 0.1], hipR: [-2.22, 0, -0.1], knL: [-0.2, 0, 0], knR: [-0.2, 0, 0], neck: [0.5, 0, 0], body: [0.35, 0, 0] },
  // La balle : genoux et coudes ensemble, le corps enroule le plus serre possible.
  bullet: { shL: [-2.0, 0, 0.5], shR: [-2.0, 0, -0.5], elL: [-2.2, 0, 0.2], elR: [-2.2, 0, -0.2], hipL: [-2.4, 0, 0.16], hipR: [-2.4, 0, -0.16], knL: [2.3, 0, 0], knR: [2.3, 0, 0], neck: [0.4, 0, 0], body: [0.5, 0, 0] },
  // Sans les mains : genoux et tete ensemble, les bras restent ecartes sur les cotes.
  nohands: { shL: [-0.4, 0, 1.25], shR: [-0.4, 0, -1.25], elL: [-0.4, 0, 0.3], elR: [-0.4, 0, -0.3], hipL: [-2.35, 0, 0.14], hipR: [-2.35, 0, -0.14], knL: [2.1, 0, 0], knR: [2.1, 0, 0], neck: [0.8, 0, 0], body: [0.45, 0, 0] },
  // Ferme trop tot : le corps se met en boule et tombe sans forme, sans puissance.
  ball: { shL: [-2.2, 0, 0.7], shR: [-2.2, 0, -0.7], elL: [-2.4, 0, 0.25], elR: [-2.4, 0, -0.25], hipL: [-2.6, 0, 0.22], hipR: [-2.6, 0, -0.22], knL: [2.6, 0, 0], knR: [2.6, 0, 0], neck: [0.5, 0, 0], body: [0.6, 0, 0] },
  pike: { shL: [-2.9, 0, 0.3], shR: [-2.9, 0, -0.3], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], hipL: [1.9, 0, 0.12], hipR: [1.9, 0, -0.12], knL: [-0.15, 0, 0], knR: [-0.15, 0, 0], body: [0.3, 0, 0] },
  flail: { shL: [-1.2, 0, 2.1], shR: [-2.4, 0, -1.3], elL: [-1.6, 0, 0.4], elR: [-0.6, 0, -0.9], hipL: [-0.9, 0, 0.6], hipR: [0.7, 0, -0.35], knL: [-1.4, 0, 0], knR: [-0.4, 0, 0], body: [0.1, 0.4, 0.25] }
};

// Les trois entrees valides du dodsing, plus les deux ratees. `pitch` est l'inclinaison
// du corps a l'entree : c'est elle qui decide de ce qui touche l'eau en premier.
// Source : criteres de jugement de la Dods Diving League.
export const LANDINGS = {
  shrimp: { pose: 'shrimp', pitch: 2.05, label: 'CREVETTE', note: 'mains et pieds ensemble' },
  bullet: { pose: 'bullet', pitch: 2.25, label: 'BALLE', note: 'genoux et coudes ensemble' },
  nohands: { pose: 'nohands', pitch: 2.2, label: 'SANS LES MAINS', note: 'genoux et tête ensemble' },
  ball: { pose: 'ball', pitch: 2.5, label: 'BOULE', note: 'refermé trop tôt, aucune forme' },
  flat: { pose: 'flail', pitch: 1.52, label: 'À PLAT', note: 'le ventre a tout pris' }
};

const TMP = new THREE.Euler();
export function applyPose(joints, pose, blend = 1, extra = null) {
  for (const key of Object.keys(joints)) {
    const target = (extra && extra[key]) || pose[key] || [0, 0, 0];
    const j = joints[key];
    TMP.set(target[0], target[1], target[2]);
    j.rotation.x += (TMP.x - j.rotation.x) * blend;
    j.rotation.y += (TMP.y - j.rotation.y) * blend;
    j.rotation.z += (TMP.z - j.rotation.z) * blend;
  }
}

// Cycle de course : on surcharge les membres par-dessus la pose 'stand'.
export function runPose(t, speed = 1) {
  const p = t * 9 * speed;
  const s = Math.sin(p), c = Math.sin(p + Math.PI);
  return {
    shL: [c * 0.9, 0, 0.18], shR: [s * 0.9, 0, -0.18],
    elL: [-0.9 - Math.max(0, c) * 0.5, 0, 0.1], elR: [-0.9 - Math.max(0, s) * 0.5, 0, -0.1],
    hipL: [s * 0.95, 0, 0.05], hipR: [c * 0.95, 0, -0.05],
    knL: [-0.35 - Math.max(0, -s) * 1.4, 0, 0], knR: [-0.35 - Math.max(0, -c) * 1.4, 0, 0],
    body: [0.14 + Math.abs(s) * 0.05, 0, 0]
  };
}
