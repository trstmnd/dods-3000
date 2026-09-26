import * as THREE from 'three';

// La gerbe d'entree. Trois ingredients, chacun dessine par son propre shader :
//  - des gouttes de tailles variees, qui retrecissent en fin de vie : la silhouette,
//  - une bruine large et tres douce : le volume,
//  - une couronne a doigts et une colonne dechiquetee : la forme d'une vraie entree.
// L'ecume qui reste a la surface vit dans le shader de la mer (world.js), pas ici.
//
// v1 dessinait des sprites ronds tous de la meme taille et un cone lisse : de pres, ca
// ressemblait a du popcorn pose dans un abat-jour en plastique.

const DROPS = 720, MIST = 200;

function particleMaterial(soft, blending) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 500 },
      uColor: { value: new THREE.Color(0xf2fbff) },
      uAlpha: { value: 1 },
      uMaxPx: { value: 40 }
    },
    transparent: true, depthWrite: false, blending,
    vertexShader: `
      attribute float aSize; attribute float aLife;
      uniform float uScale, uMaxPx;
      varying float vLife;
      void main(){
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // taille en metres, convertie en pixels par la vraie projection de la camera
        // plafonnee : une goutte qui passe devant l'objectif ne doit pas devenir une bulle
        gl_PointSize = aLife <= 0.0 ? 0.0 : min(uMaxPx, aSize * uScale / max(0.2, -mv.z) * (0.35 + 0.65 * aLife));
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uAlpha; varying float vLife;
      void main(){
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float a = smoothstep(1.0, ${soft.toFixed(2)}, r) * min(1.0, vLife * 3.0) * uAlpha;
        gl_FragColor = vec4(uColor * (0.88 + 0.22 * (1.0 - r)), a);
      }`
  });
}

function cloud(scene, count, soft, blending, alpha) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const life = new Float32Array(count);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  const mat = particleMaterial(soft, blending);
  mat.uniforms.uAlpha.value = alpha;
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 3;
  scene.add(points);
  return { points, mat, geo, pos, size, life, vel: new Float32Array(count * 3), span: new Float32Array(count), rest: new Float32Array(count), max: count, active: 0, alpha };
}

// Doigts de la couronne : un bruit 1D periodique autour de la jupe, meme graine pour la
// forme (vertex) et pour la decoupe (fragment).
const RING_NOISE = `
  float h1(float x){ return fract(sin(x * 127.1 + uSeed) * 43758.5453); }
  float fingers(float u, float n){
    float x = u * n; float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(h1(mod(i, n)), h1(mod(i + 1.0, n)), f);
  }
`;

function sheetMaterial(nFingers, base) {
  const N = nFingers.toFixed(1), B = base.toFixed(2);
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uSeed: { value: 0 }, uGrow: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uSeed, uGrow;
      varying vec2 vUv; varying float vFace;
      void main(){
        vUv = uv;
        vec3 p = position;
        // la jupe s'evase en montant, d'autant plus qu'elle a eu le temps de s'ouvrir
        p.xz *= 1.0 + uv.y * uv.y * (0.35 + 0.6 * uGrow);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 nrm = normalize(normalMatrix * normalize(vec3(p.x, 0.3, p.z)));
        vFace = abs(dot(nrm, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity, uSeed;
      varying vec2 vUv; varying float vFace;
      ${RING_NOISE}
      void main(){
        // Des doigts arrondis de hauteurs inegales : chaque jet est une goutte etiree, pas
        // une pointe. Des pointes nettes donnaient des eclats de verre.
        float u = vUv.x * ${N};
        float fi = floor(u), fu = fract(u);
        float tall = 0.35 + 0.65 * h1(mod(fi, ${N}));
        float lobe = sqrt(max(0.0, 1.0 - pow((fu - 0.5) * 2.0, 2.0)));
        float edge = ${B} + (1.0 - ${B}) * tall * lobe;
        float body = smoothstep(edge, edge - 0.08, vUv.y);
        if (body <= 0.0) discard;
        // des stries verticales : de l'eau qui file, pas une surface lisse
        float streak = 0.7 + 0.3 * sin(vUv.x * 230.0 + h1(fi + 3.0) * 6.28) * sin(vUv.x * 71.0);
        float a = uOpacity * body * streak * (1.0 - vUv.y * 0.45) * (0.4 + 0.6 * (1.0 - vFace));
        gl_FragColor = vec4(vec3(0.95, 0.985, 1.0), a);
      }`
  });
}

export function createSplash(scene, waterMat = null) {
  const drops = cloud(scene, DROPS, 0.55, THREE.NormalBlending, 1.0);
  const mist = cloud(scene, MIST, 0.0, THREE.NormalBlending, 0.28);
  mist.mat.uniforms.uMaxPx.value = 160;
  drops.mat.uniforms.uMaxPx.value = 22;
  mist.mat.uniforms.uColor.value.setRGB(0.93, 0.97, 1.0);

  // la couronne : une jupe evasee qui s'ouvre a la surface, bord en doigts
  const crownMat = sheetMaterial(26, 0.3);
  const crownGeo = new THREE.CylinderGeometry(1.0, 0.42, 1.0, 72, 6, true);
  crownGeo.translate(0, 0.5, 0);
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.visible = false; crown.renderOrder = 2;
  scene.add(crown);

  // la colonne : un jet qui monte dans l'axe de l'entree, dechiquete lui aussi
  const colMat = sheetMaterial(11, 0.62);
  const colGeo = new THREE.CylinderGeometry(0.34, 0.62, 1.0, 40, 6, true);
  colGeo.translate(0, 0.5, 0);
  const column = new THREE.Mesh(colGeo, colMat);
  column.visible = false; column.renderOrder = 2;
  scene.add(column);

  let plumeT = 0, power = 1, plumeOn = false, dead = false;

  function fill(c, x, z, pow, o) {
    c.active = Math.min(c.max, Math.round(o.count * (0.5 + 0.5 * Math.min(1.2, pow))));
    for (let i = 0; i < c.max; i++) {
      if (i >= c.active) { c.life[i] = 0; c.rest[i] = 0; continue; }
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() ** o.bias;
      // les gouttes du centre montent, celles du bord partent a plat : le parapluie
      const up = (o.up[0] + Math.random() * o.up[1]) * (1 - r * o.flat) * (4.5 + 7 * pow);
      const out = (o.out[0] + r * o.out[1]) * (1 + 1.1 * pow) * (0.7 + Math.random() * 0.6);
      c.pos[i * 3] = x + Math.cos(a) * r * o.r0;
      c.pos[i * 3 + 1] = 0.05 + Math.random() * 0.35;
      c.pos[i * 3 + 2] = z + Math.sin(a) * r * o.r0;
      c.vel[i * 3] = Math.cos(a) * out;
      c.vel[i * 3 + 1] = up;
      c.vel[i * 3 + 2] = Math.sin(a) * out;
      // peu de grosses gouttes, beaucoup de fines : une loi de puissance, pas une moyenne
      c.size[i] = o.size[0] + (Math.random() ** 3) * o.size[1];
      c.span[i] = o.life[0] + Math.random() * o.life[1];
      // un depart echelonne : la gerbe se deroule au lieu d'apparaitre d'un bloc
      // tant qu'elle attend son depart, la goutte est eteinte (aLife = 0)
      c.rest[i] = Math.random() * o.delay;
      c.life[i] = c.rest[i] > 0 ? 0 : 1;
    }
    c.geo.attributes.aSize.needsUpdate = true;
    c.points.visible = true;
  }

  function step(c, dt, drag, grav) {
    if (!c.points.visible) return;
    let alive = 0;
    const damp = Math.max(0, 1 - drag * dt);
    for (let i = 0; i < c.active; i++) {
      if (c.rest[i] > 0) { c.rest[i] -= dt; if (c.rest[i] <= 0) c.life[i] = 1; alive++; continue; }
      if (c.life[i] <= 0) continue;
      c.life[i] -= dt / c.span[i];
      c.vel[i * 3 + 1] -= grav * dt;
      c.vel[i * 3] *= damp;
      c.vel[i * 3 + 2] *= damp;
      c.pos[i * 3] += c.vel[i * 3] * dt;
      c.pos[i * 3 + 1] += c.vel[i * 3 + 1] * dt;
      c.pos[i * 3 + 2] += c.vel[i * 3 + 2] * dt;
      // une goutte qui retombe dans la mer y disparait
      if (c.pos[i * 3 + 1] < -0.1 || c.life[i] <= 0) c.life[i] = 0;
      else alive++;
    }
    c.geo.attributes.position.needsUpdate = true;
    c.geo.attributes.aLife.needsUpdate = true;
    if (!alive) c.points.visible = false;
  }

  return {
    burst(x, z, pow = 1, isDead = false) {
      power = pow; dead = isDead;
      // Un plat eclate large et bas, une entree fermee perce et monte : la gerbe dit la note.
      const flat = dead ? 0.85 : 0.5;
      fill(drops, x, z, pow, { count: DROPS, bias: 0.7, up: [0.55, 0.95], out: [0.35, dead ? 2.4 : 1.4], flat, r0: 0.6, size: [0.022, 0.11], life: [0.55, 0.6], delay: 0.12 });
      fill(mist, x, z, pow, { count: MIST, bias: 0.4, up: [0.25, 0.6], out: [0.4, dead ? 2.6 : 1.7], flat: 0.7, r0: 0.9, size: [0.7, 1.4], life: [0.8, 0.9], delay: 0.2 });
      plumeT = 0; plumeOn = true;
      column.position.set(x, 0, z); crown.position.set(x, 0, z);
      column.visible = crown.visible = true;
      const seed = Math.random() * 100;
      crownMat.uniforms.uSeed.value = seed;
      colMat.uniforms.uSeed.value = seed + 31;
      // l'onde et l'ecume a la surface partent du point d'entree, le shader de la mer s'en charge
      if (waterMat && waterMat.uniforms.uImpact) {
        waterMat.uniforms.uImpact.value.set(x, z, waterMat.uniforms.uTime.value);
        if (waterMat.uniforms.uImpactPow) waterMat.uniforms.uImpactPow.value = pow;
      }
    },

    // `view` donne l'echelle pixels par metre : hauteur du tampon et champ de la camera
    update(dt, view) {
      if (view) {
        const s = view.height / (2 * Math.tan(THREE.MathUtils.degToRad(view.fov) / 2));
        drops.mat.uniforms.uScale.value = s;
        mist.mat.uniforms.uScale.value = s;
      }
      if (plumeOn) {
        plumeT += dt;
        // la colonne jaillit puis s'affaisse, la couronne s'ouvre et retombe
        const k = Math.min(1, plumeT / 0.9);
        const rise = Math.sin(Math.min(1, plumeT / 0.28) * Math.PI * 0.5);
        const fallK = Math.max(0, (plumeT - 0.28) / 0.62);
        const hMax = (dead ? 1.2 : 2.2 + power * 1.1);
        const h = hMax * rise * (1 - fallK * fallK * 0.85);
        const w = (dead ? 1.9 : 1.15) * (0.8 + power * 0.3) * (1 + plumeT * 0.7);
        column.scale.set(w, Math.max(0.01, h), w);
        colMat.uniforms.uOpacity.value = (dead ? 0.4 : 0.75) * Math.pow(Math.max(0, 1 - plumeT / 0.7), 1.2);
        colMat.uniforms.uGrow.value = 0.4 + plumeT;
        const ck = Math.min(1, plumeT / 0.5);
        const spread = (0.55 + ck * 1.7) * (0.65 + power * 0.5) * (dead ? 1.5 : 1);
        const ch = (0.5 + Math.sin(Math.min(1, plumeT / 0.22) * Math.PI * 0.5) * 1.1) * (0.7 + power * 0.4) * (1 - fallK * 0.7);
        crown.scale.set(spread, Math.max(0.01, ch), spread);
        crownMat.uniforms.uOpacity.value = 0.7 * Math.pow(1 - ck, 1.2) + 0.25 * (1 - k);
        crownMat.uniforms.uGrow.value = ck;
        if (k >= 1) { plumeOn = false; column.visible = crown.visible = false; }
      }
      step(drops, dt, 0.7, 17);
      step(mist, dt, 2.4, 5);
    },

    reset() {
      for (const c of [drops, mist]) {
        c.points.visible = false; c.active = 0; c.life.fill(0);
        c.geo.attributes.aLife.needsUpdate = true;
      }
      column.visible = false; crown.visible = false; plumeOn = false;
    }
  };
}
