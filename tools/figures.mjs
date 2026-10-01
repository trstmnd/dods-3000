import { open } from './_page.mjs';

// Le test du bloc 3 : cinq sauts differents joues par script, plus un sixieme rate.
//   ./tools/run.sh figures.mjs
//
// Verifie, sur le spot du Lysefjord pilote par __dods (page en francais : les portes
// lisent les textes affiches) :
// - le salto, la vrille et le grab partent du glisse et comptent une fois termines :
//   figures au score (figPts > 0), toast du nom, bonus de vol de 0,6 par figure tenue ;
// - une figure coupee par le lacher ne compte pas (invariant 12 : la note se prend
//   a l'instant du doigt, une figure en cours n'y est pas encore) ;
// - la direction du lacher choisit la reception : doigt glisse vers le haut = sans
//   les mains, vers le bas = boule, au centre = crevette (de vrais evenements pointeur,
//   le chemin exact du joueur) ;
// - un saut jamais ferme : le plat qui claque, le corps qui rebondit et part en
//   ragdoll, le run termine sur l'ecran de fin ;
// - deux saltos identiques leverent les memes cartons (determinisme, rafales fixees).

const { browser, page, errs } = await open({ width: 1280, height: 800, lang: 'fr' });
const out = await page.evaluate(() => {
  const d = window.__dods;
  const carte = () => document.querySelector('#s-jump').classList.contains('on');
  const NOMS = ['SALTO', 'VRILLE', 'GRAB'];

  // Renvoie le releve du saut courant une fois la carte affichee. `rel` tourne a
  // chaque image : c'est la que les grandeurs volatiles (vrille max, rebond, ragdoll,
  // dernier toast de figure) se prennent.
  function fini(rel) {
    let figToast = null;
    let f = 0;
    while (f < 5000 && !carte()) {
      d.tick(1); f++;
      const tt = document.querySelector('#toast')._t;
      if (NOMS.includes(tt)) figToast = tt;
      if (rel) rel();
    }
    const r = d.state.last;
    return {
      frames: f,
      grade: r.grade.key, score: r.score, fig: r.fig, figPts: r.figPts,
      landing: r.landing.pose, notes: r.judged.notes, moyenne: r.judged.mark,
      figToast
    };
  }

  function depart() {
    d.show('run'); d.state.spot = d.spots[5]; d.startRun();
    d.paused = true; d.slowmo = false;
    d.autoJump = 0.7; d.autoSteer = true; d.autoTuck = 0.15;
    d.autoSteerX = null; d.autoSteerRaw = 0;
  }

  // Avance jusqu'a `secs` secondes de vol (le coureur d'abord, le vol ensuite).
  function vol(secs) {
    let f = 0;
    while (f < 4000 && (d.jump.state !== 'fly' || d.jump.t < secs)) { d.tick(1); f++; }
    return f;
  }
  // Avance jusqu'a `s` secondes de l'impact.
  function volTtc(s) {
    let f = 0;
    while (f < 4000 && (d.jump.state !== 'fly' || d.jump.ttc > s)) { d.tick(1); f++; }
    return f;
  }

  // Un saut avec figure : le flick vertical passe par autoSteerRaw (le glisse du doigt
  // reel, seul chemin des figures), la vrille par autoSteerX. `coupe` lance le grab
  // assez pres de l'eau pour que le lacher le surprenne en cours.
  function sautFigure(kind, coupe = false) {
    depart();
    vol(0.3);
    if (kind === 'vrille') {
      d.autoSteerX = 0.9;
      if (coupe) volTtc(0.5); else vol(1.5);
      d.autoSteerX = 0;
    } else {
      if (coupe) volTtc(0.75);
      d.autoSteerRaw = kind === 'salto' ? 0.7 : -0.7;
      for (let i = 0; i < 10; i++) d.tick(1);
      d.autoSteerRaw = kind === 'salto' ? -0.7 : 0.7;
      for (let i = 0; i < 10; i++) d.tick(1);
      d.autoSteerRaw = 0;
    }
    let twistMax = 0;
    const r = fini(() => { twistMax = Math.max(twistMax, Math.abs(d.jump.twist)); });
    r.twistMax = +twistMax.toFixed(2);
    r.figLast = d.jump.figLast || null;
    return r;
  }

  // La reception choisie : un vrai doigt, pose en vol puis glisse et tenu, que le
  // lacher automatique surprend a 0,15 s de l'eau. dir +1 = vers le haut.
  function sautDoigt(dir) {
    depart();
    d.autoSteer = false; d.autoSteerRaw = null;
    vol(0.35);
    const span = Math.max(60, window.innerHeight * 0.12);
    const ev = (type, y) => document.body.dispatchEvent(new PointerEvent(type, {
      pointerId: 41, clientX: 640, clientY: y, bubbles: true, cancelable: true,
      pointerType: 'touch', isPrimary: true
    }));
    ev('pointerdown', 400);
    ev('pointermove', 400 - dir * 0.85 * span);
    return fini();
  }

  // Le saut rate : on ne lache jamais. On releve le rebond (le corps remonte au
  // dessus de la surface) et l'ampleur du ragdoll (l'ecart de la somme des
  // articulations entre deux images d'impact : un corps qui coule droit n'en a pas).
  function sautRatte() {
    depart();
    d.autoTuck = null;
    let rebond = 0, rag = 0, rot0 = null;
    const r = fini(() => {
      const j = d.jump;
      if (j.state === 'impact') {
        rebond = Math.max(rebond, j.pos.y);
        let m = 0;
        for (const k in j.diver.joints) m += Math.abs(j.diver.joints[k].rotation.x);
        if (rot0 !== null) rag = Math.max(rag, Math.abs(m - rot0));
        rot0 = m;
      }
    });
    r.rebond = +rebond.toFixed(3); r.ragdoll = +rag.toFixed(3);
    d.advance();
    r.ecranFin = document.querySelector('#s-end').classList.contains('on');
    return r;
  }

  // Un saut pilote sans figure : la reference du bonus de vol.
  function sautNu() { depart(); return fini(); }

  const nu = sautNu();
  const salto = sautFigure('salto');
  const salto2 = sautFigure('salto');
  const vrille = sautFigure('vrille');
  const grab = sautFigure('grab');
  const coupe = sautFigure('grab', true);
  const haut = sautDoigt(1);
  const bas = sautDoigt(-1);
  const ratte = sautRatte();
  return { nu, salto, salto2, vrille, grab, coupe, haut, bas, ratte };
});

// Les portes : chacune lit la preuve elle-meme, jamais une variable de confiance.
const portes = [];
const p = (nom, ok, preuve) => portes.push({ porte: nom, ok: !!ok, preuve: String(preuve) });

p('le salto compte une fois termine',
  out.salto.fig === 1 && out.salto.figPts > 0 && out.salto.figLast === 'salto' && out.salto.figToast === 'SALTO',
  `${out.salto.figLast} x${out.salto.fig}, +${out.salto.figPts} pts, toast "${out.salto.figToast}"`);
p('la vrille fait un tour complet et compte',
  out.vrille.fig === 1 && out.vrille.figLast === 'vrille' && out.vrille.twistMax >= 6,
  `${out.vrille.figLast} x${out.vrille.fig}, vrille max ${out.vrille.twistMax} rad`);
p('le grab compte',
  out.grab.fig === 1 && out.grab.figPts > 0 && out.grab.figLast === 'grab',
  `${out.grab.figLast} x${out.grab.fig}, +${out.grab.figPts} pts`);
p('une figure coupee au lacher ne compte pas',
  out.coupe.fig === 0 && out.coupe.figPts === 0,
  `x${out.coupe.fig}, +${out.coupe.figPts} pts`);
p('le bonus de vol est de 0,6 par figure tenue',
  out.salto.notes[1] - out.nu.notes[1] >= 0.4 && out.salto.notes[1] - out.nu.notes[1] <= 0.8,
  `vol ${out.nu.notes[1]} nu, ${out.salto.notes[1]} figure (${(out.salto.notes[1] - out.nu.notes[1]).toFixed(1)})`);
p('doigt glisse haut : sans les mains',
  out.haut.landing === 'nohands' && out.haut.grade === 'perfect',
  `${out.haut.landing}, ${out.haut.grade}`);
p('doigt glisse bas : la boule',
  out.bas.landing === 'bullet' && out.bas.grade === 'perfect',
  `${out.bas.landing}, ${out.bas.grade}`);
p('sans fermeture : plat, rebond, ragdoll, fin du run',
  out.ratte.grade === 'smack' && out.ratte.score === 0 && out.ratte.rebond > 0.05
  && out.ratte.ragdoll > 0.05 && out.ratte.ecranFin,
  `${out.ratte.grade}, rebond ${out.ratte.rebond} m, ragdoll ${out.ratte.ragdoll} rad, fin ${out.ratte.ecranFin}`);
p('determinisme : deux saltos, memes cartons',
  JSON.stringify(out.salto.notes) === JSON.stringify(out.salto2.notes) && out.salto.score === out.salto2.score,
  `${out.salto.notes.join('/')} contre ${out.salto2.notes.join('/')}`);
p('aucune erreur de page', errs.length === 0, errs.join(' ; ') || '0');

await browser.close();
console.log(JSON.stringify({ ...out, portes, errs }, null, 1));
process.exit(portes.every(q => q.ok) ? 0 : 1);
