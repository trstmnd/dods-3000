import { SPOTS } from './spots.js';
import { TUNING, windows } from './game.js';
import { LANDINGS } from './diver.js';
import { t } from './i18n.js';

// Les defis (v4.4) : trois par hauteur, la boucle qui fait revenir. Le spot suivant
// s'ouvre a deux defis du precedent, le troisieme reste une raison d'y retourner.
// Un defi ne lit que des grandeurs deja mesurees par le saut (grade, forme d'entree,
// force de la gerbe : meme regle que src/judging.js, « aucune grandeur nouvelle ») :
// le meme saut coche toujours les memes cases, et les seuils se calibrent sur les
// vraies fenetres de fermeture (windows()), pas sur des metres au bord.
//
// Le brief proposait « ferme sous 1 m » : mesure sur les vraies fenetres, fermer a
// 1 m de l'eau vaut ttc 0,065 s a 10 m et 0,033 s a 34 m, sous perfectLo (0,085 s)
// a toutes les hauteurs : un smack garanti. Le deffi de fermeture demande donc la
// fenetre parfaite, la fermeture la plus tardive qui reste jouable.

// Deux defis ouvrent le spot suivant.
export const UNLOCK_NEED = 2;

// La hauteur caracteristique de la gerbe, en metres : la goutte la plus haute du
// centre de l'impact (facteur parapluie 1 dans fill() de src/fx.js), en chute libre
// sous la gravite des gouttes. Deterministe : elle ne depend que de power, et c'est
// ce power que le saut mesure deja (res.power).
export function splashHeight(power) {
  const v = (0.62 + 1.05) * (4.5 + 7 * power);
  return v * v / (2 * 17);
}

// La force de gerbe d'une fermeture serree (multiplicateur 1,15, GREAT et mieux)
// partiee du meilleur appel : la meme loi que land() de game.js, au poil de pas
// d'integration pres (land() mesure |vel.y| une frame apres y = 0, soit moins de
// 1 % d'ecart). La marge du seuil couvre ce poil : un appel GOOD passe, un appel
// TROP TOT rate de peu, la puissance d'entree fait partie du defi.
function gerbeSerree(height) {
  const vy0 = TUNING.takeoff[0].vy;
  const v = Math.sqrt(vy0 * vy0 + 2 * TUNING.gravity * height);
  return Math.min(1.25, Math.max(0.35, v / 26)) * 1.15;
}

// La forme d'entree demandee tourne d'un spot au suivant : chacun fait rencontrer
// deux des trois entrees du dodsing, pas toujours celle qui vient toute seule.
const LANDING_CYCLE = ['nohands', 'shrimp', 'bullet'];

// Les trois defis d'un spot. Les cles sont stables : elles vivent dans la sauvegarde.
export function defisFor(spot) {
  const i = Math.max(0, SPOTS.findIndex(s => s.id === spot.id));
  const min = gerbeSerree(spot.height) - 0.02;
  return [
    { key: 'fermeture', type: 'perfect', win: windows(spot.height) },
    { key: 'entree', type: 'landing', landing: LANDING_CYCLE[i % 3] },
    // le seuil affiche en metres est arrondi en dessous : ce qui compte est power
    { key: 'gerbe', type: 'splash', min, metres: Math.floor(splashHeight(min)) }
  ];
}

// Le saut a-t-il reussi ce defi. Un plat ne coche rien : la boucle de progression
// ne recompense pas l'ecrasement.
export function defiDone(defi, res) {
  if (!res || res.dead) return false;
  if (defi.type === 'perfect') return res.grade.key === 'perfect';
  if (defi.type === 'landing') return res.landingKey === defi.landing;
  if (defi.type === 'splash') return res.power >= defi.min;
  return false;
}

// Le libelle du defi, traduit (les formes d'entree le sont deja dans diver.js).
export function defiLabel(defi) {
  if (defi.type === 'perfect') return t('defi.perfect');
  if (defi.type === 'landing') return t('defi.landing', { label: LANDINGS[defi.landing].label.toLowerCase() });
  return t('defi.splash', { n: defi.metres });
}
