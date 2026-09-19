import * as THREE from 'three';

// Plongeur cartoon : rig minimal (epaules, coudes, hanches, genoux) anime par interpolation de poses.
const SKIN = 0xf0b58a, SUIT = 0xff3f56, SUIT2 = 0x1b2a4a, HAIR = 0x2b1d17;

function limb(color, r, len) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.translate(0, -len / 2 - r * 0.2, 0);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02 }));
  m.castShadow = true;
  return m;
}

export function createDiver() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.32; // l'origine du root est au niveau des pieds
  root.add(body);

  const torso = limb(SUIT, 0.3, 0.75);
  torso.position.y = 0.72;
  torso.scale.set(1.15, 1, 0.8);
  body.add(torso);

  const hips = limb(SUIT2, 0.28, 0.18);
  hips.position.y = 0.06;
  body.add(hips);

  const neck = new THREE.Group();
  neck.position.y = 0.82;
  body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }));
  head.castShadow = true; head.position.y = 0.2; head.scale.set(1, 1.08, 0.95);
  neck.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 }));
  cap.position.y = 0.23; cap.scale.set(1, 1.05, 0.98); neck.add(cap);

  const joints = {};
  const mk = (name, parent, x, y, z, color, r, len) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    j.add(limb(color, r, len));
    joints[name] = j;
    return j;
  };

  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const sh = mk('sh' + tag, body, s * 0.34, 0.78, 0, SKIN, 0.098, 0.42);
    mk('el' + tag, sh, 0, -0.56, 0, SKIN, 0.088, 0.42);
    const hip = mk('hip' + tag, body, s * 0.15, 0.08, 0, SUIT2, 0.135, 0.5);
    const kn = mk('kn' + tag, hip, 0, -0.66, 0, SKIN, 0.115, 0.48);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3),
      new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }));
    foot.position.set(0, -0.68, 0.06); foot.castShadow = true; kn.add(foot);
  }
  joints.neck = neck;
  joints.body = body;

  // Ombre de contact, moins couteuse qu'une shadow map sur un si petit objet
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

  return { root, joints, blob };
}

// Une pose = rotations en radians. Les cles absentes retournent a zero.
export const POSES = {
  stand: { shL: [0, 0, 0.12], shR: [0, 0, -0.12], elL: [0, 0, 0.1], elR: [0, 0, -0.1], hipL: [0, 0, 0.04], hipR: [0, 0, -0.04], knL: [0.05, 0, 0], knR: [0.05, 0, 0], body: [0, 0, 0] },
  ready: { shL: [-0.5, 0, 0.35], shR: [-0.5, 0, -0.35], elL: [-0.7, 0, 0.1], elR: [-0.7, 0, -0.1], hipL: [0.35, 0, 0.06], hipR: [0.35, 0, -0.06], knL: [-0.6, 0, 0], knR: [-0.6, 0, 0], body: [0.22, 0, 0] },
  // le dods : bras en croix, corps cambre, jambes ecartees
  dods: { shL: [0, 0, 1.62], shR: [0, 0, -1.62], elL: [0, 0, 0.12], elR: [0, 0, -0.12], hipL: [-0.12, 0, 0.3], hipR: [-0.12, 0, -0.3], knL: [0.08, 0, 0], knR: [0.08, 0, 0], body: [-0.28, 0, 0] },
  tuck: { shL: [-2.3, 0, 0.55], shR: [-2.3, 0, -0.55], elL: [-2.1, 0, 0.2], elR: [-2.1, 0, -0.2], hipL: [2.35, 0, 0.18], hipR: [2.35, 0, -0.18], knL: [-2.5, 0, 0], knR: [-2.5, 0, 0], body: [0.55, 0, 0] },
  pike: { shL: [-2.9, 0, 0.3], shR: [-2.9, 0, -0.3], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], hipL: [1.9, 0, 0.12], hipR: [1.9, 0, -0.12], knL: [-0.15, 0, 0], knR: [-0.15, 0, 0], body: [0.3, 0, 0] },
  flail: { shL: [-1.2, 0, 2.1], shR: [-2.4, 0, -1.3], elL: [-1.6, 0, 0.4], elR: [-0.6, 0, -0.9], hipL: [-0.9, 0, 0.6], hipR: [0.7, 0, -0.35], knL: [-1.4, 0, 0], knR: [-0.4, 0, 0], body: [0.1, 0.4, 0.25] }
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
