import { t } from './i18n.js';

// La grille officielle du dodsing (Dods Diving League) : quatre criteres notes de 0
// a 10 au dixieme par trois a cinq juges, moyenne au dixieme. Le jeu n'en notait que
// la fermeture : le joueur ne savait pas ce qui lui avait coute des points. Chaque
// critere relit ce que le saut a deja mesure (appel, temps de vol, planche, fenetre
// de fermeture, forme d'entree, force de la gerbe) : aucune grandeur nouvelle, donc
// le meme saut leve toujours les memes cartons et les notes restent comparables.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * clamp(k, 0, 1);
const r1 = v => Math.round(v * 10) / 10;

// Les quatre criteres, dans l'ordre de la grille. `key` reste en francais : les tests
// et le CSS (data-crit) le lisent, seuls les libelles se traduisent.
export const CRITS = ['elan', 'vol', 'fermeture', 'reception'];

// Cinq juges, cinq temperaments fixes : Astrid pese la fermeture, Bjorn le vol,
// Ingrid la puissance de l'appel et de l'entree, Lars reste severe, Synne aime le
// style. Poids et biais sont des constantes, jamais tires au hasard : un saut rejoue
// a l'identique leve les memes cartons (meme regle que les rafales de la planche).
export const JUDGES = [
  { name: t('judge.1'), w: [1.1, 0.9, 1.2, 0.8], bias: 0.1 },
  { name: t('judge.2'), w: [0.8, 1.2, 0.9, 1.1], bias: 0.0 },
  { name: t('judge.3'), w: [1.2, 0.8, 0.8, 1.2], bias: 0.1 },
  { name: t('judge.4'), w: [1.0, 1.0, 1.0, 1.0], bias: -0.2 },
  { name: t('judge.5'), w: [0.9, 1.1, 1.1, 0.9], bias: 0.2 }
];

// L'elan : vitesse et puissance au depart. Le meilleur appel part le plus pres du
// bord, la note continue suit la distance restante dans la fenetre de decollage.
function elanAt(j) {
  const d = j.takeoffDist;
  switch (j.takeoff.key) {
    case 'perfect': return lerp(10, 8.6, (d + 0.45) / 1.6);
    case 'good': return lerp(8.5, 6.9, (d - 1.15) / 1.45);
    case 'early': return lerp(6.8, 4.2, (d - 2.6) / 6.9);
    default: return 1.5; // la chute sans appel
  }
}

// Le vol : harmonie et controle. Tenir le dods ouvert jusqu'a la fermeture, et
// tenir la planche malgre le vent : deux competences distinctes, l'une se joue par
// le courage, l'autre par la main.
function volAt(j, planche) {
  if (j.flailing) return 1.5;
  const tenue = clamp(j.styleTime / Math.max(0.1, j.airTotal), 0, 1);
  const tenuePlanche = clamp((planche.mult - 0.6) / 0.55, 0, 1);
  // La difficulte est recompensee, mais seulement par-dessus : un vol sans figure leve
  // exactement le meme carton qu'avant les figures (les notes restent comparables),
  // et trois figures terminees au plus comptent (TUNING.figures.volMax).
  const figs = Math.min(3, j.figCountRes || 0);
  return 10 * (0.55 * tenue + 0.45 * tenuePlanche) + figs * 0.6;
}

// La fermeture : le plus tard possible, sans le cramer. Note continue a travers les
// fenetres : au plus tard de PERFECT elle vaut 10, elle descend de palier en palier
// jusqu'au chicken, et un lacher trop tard garde ce qui reste du saut.
function fermetureAt(j) {
  if (!j.tucked) return 0;
  const w = j.win, t = j.tuckTtc;
  if (t < w.perfectLo) return lerp(2.8, 0.2, 1 - t / w.perfectLo);
  if (t <= w.perfectHi) return lerp(10, 9.2, (t - w.perfectLo) / (w.perfectHi - w.perfectLo));
  if (t <= w.greatHi) return lerp(9.1, 8.2, (t - w.perfectHi) / (w.greatHi - w.perfectHi));
  if (t <= w.goodHi) return lerp(8.1, 7.0, (t - w.greatHi) / (w.goodHi - w.greatHi));
  if (t <= w.earlyHi) return lerp(6.9, 4.4, (t - w.goodHi) / (w.earlyHi - w.goodHi));
  return lerp(4.3, 2.0, (t - w.earlyHi) / 1.2);
}

// La reception : clarte de la forme et grosseur de la gerbe. La crevette vaut mieux
// que la balle, la hauteur et la vitesse d'entree gonflent la note, et le plat reste
// un plat, meme de haut.
const FORM_MARK = { shrimp: 8.4, nohands: 8.0, bullet: 7.4, ball: 5.2, flat: 1.0 };
function receptionAt(j, power) {
  if (j.landingKey === 'flat')
    return 1.0 + clamp(j.spot.height - 10, 0, 24) / 24 * 0.5;
  return (FORM_MARK[j.landingKey] || 5)
    + clamp(j.spot.height - 10, 0, 24) / 24 * 1.4
    + (power - 0.75) * 1.2;
}

// Le verdict complet d'un saut : quatre notes, cinq cartons, la moyenne, et le
// critere le plus faible, celui que le conseil de la carte dira de travailler.
// Appelle une fois, a l'entree dans l'eau : les criteres sont figes depuis le
// lacher et la gerbe vient d'etre mesuree.
export function judgeJump(j, planche, power) {
  const notes = [
    clamp(elanAt(j), 0, 10),
    clamp(volAt(j, planche), 0, 10),
    clamp(fermetureAt(j), 0, 10),
    clamp(receptionAt(j, power), 0, 10)
  ].map(r1);
  const judges = JUDGES.map(u => {
    let s = 0, sum = 0;
    for (let i = 0; i < 4; i++) { s += u.w[i] * notes[i]; sum += u.w[i]; }
    return { name: u.name, note: r1(clamp(s / sum + u.bias, 0, 10)) };
  });
  let mark = 0;
  for (const u of judges) mark += u.note;
  let weak = 0;
  for (let i = 1; i < notes.length; i++) if (notes[i] < notes[weak]) weak = i;
  return { notes, judges, mark: r1(mark / judges.length), weak };
}
