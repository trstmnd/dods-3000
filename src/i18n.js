// Anglais et francais. Aucun texte visible par le joueur n'est ecrit ailleurs que dans
// DICT, sauf le nom, le lieu et la note d'un spot (src/spots.js, qui reste importable seul
// par check.sh : champs `place`/`note` en francais, `placeEn`/`noteEn` en anglais, lus par loc()).
//
// Langue : ?lang=en|fr dans l'URL, puis localStorage `dods3000.lang`, puis navigator.language
// (« fr... » donne fr, tout le reste donne en). Changer de langue recharge la page : LANG ne
// change donc jamais en cours de partie, et les modules qui posent un libelle a l'import
// (TUNING dans game.js, LANDINGS dans diver.js) peuvent l'appeler tout de suite.
//
// Appareil : une cle qui existe en `cle.touch` et `cle.desk` se resout toute seule selon que le
// pointeur principal est tactile ou non. `t('title.hint')` rend donc la formulation doigt sur
// un telephone et « Espace, clic ou bouton A » sur un PC. Une cle explicite (`steer.up.desk`)
// reste utilisable quand main.js doit forcer un cote.
//
// Ce que les tests comparent en interne (`key` des notes, `id` des spots, noms de fonctions)
// n'est jamais traduit : seules les etiquettes le sont.

const KEY = 'dods3000.lang';

function detect() {
  try {
    const q = (new URLSearchParams(location.search).get('lang') || '').toLowerCase();
    if (q === 'en' || q === 'fr') return q;
  } catch { }
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'en' || s === 'fr') return s;
  } catch { }
  try { return /^fr/i.test(navigator.language || '') ? 'fr' : 'en'; } catch { return 'en'; }
}

export let LANG = detect();

// Pointeur principal tactile : garde la formulation « doigt ». Sinon PC : clavier, souris, manette.
export const TOUCH = (() => {
  try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch { return false; }
})();

export const DICT = {
  fr: {
    // ecran titre
    'loading': 'chargement…',
    'title.tag': 'Championnat de dødsing',
    'title.play': 'JOUER',
    'title.quit': 'Quitter',
    'title.hint.touch': 'Un seul doigt : appuie, tiens la planche, lâche',
    'title.hint.desk': 'Espace, clic ou bouton A : appuie, tiens la planche, lâche',
    'lang.switch': 'EN',
    'lang.aria': 'English',
    'sound.label': 'Son',
    'sound.mute': 'Couper le son',
    'sound.unmute': 'Rétablir le son',

    // choix du spot
    'nav.title': 'Retour au titre',
    'spots.heading': 'CHOISIS TON SPOT',
    'spots.total': 'TOTAL',
    'spots.best': 'RECORD',
    'spot.aria': '{name}, {place}, {height} mètres, difficulté {diff}, record {best}',

    // fiche du spot
    'brief.height': 'hauteur',
    'brief.diff': 'difficulté',
    'brief.best': 'record',
    'brief.gesture': 'Le geste',
    'brief.press': 'APPUIE',
    'brief.press.sub': 'au bord',
    'brief.hold': 'TIENS',
    'brief.hold.sub': 'à plat, en døds',
    'brief.release': 'LÂCHE',
    'brief.release.sub': "juste avant l'eau",
    'brief.back': 'Retour',
    'brief.go': '3 SAUTS, GO',
    'steer.tip.touch': 'glisse pour rester à plat',
    'steer.tip.desk': 'flèches haut/bas ou stick pour rester à plat',
    'wind.none': "à l'abri du vent",
    'wind.light': 'vent léger : {tip}',
    'wind.mid': 'vent : {tip}',
    'wind.strong': 'vent fort : {tip}',

    // HUD
    'hud.jump': 'SAUT',
    'hud.alt': 'ALTITUDE',
    'level.plank': 'PLANCHE',
    'prompt.edge': 'APPUIE AU BORD, ET TIENS',
    'prompt.edge.first.touch': 'APPUIE AU BORD… ET GARDE LE DOIGT',
    'prompt.edge.first.desk': 'APPUIE AU BORD… ET GARDE APPUYÉ',
    'prompt.press': 'APPUIE ET TIENS',
    'prompt.hold': "TIENS… LÂCHE JUSTE AVANT L'EAU",
    'prompt.flail': "APPUIE, PUIS LÂCHE AVANT L'EAU",
    'steer.up.touch': 'GLISSE ↑ POUR REDRESSER',
    'steer.up.desk': 'FLÈCHE ↑ OU STICK ↑ POUR REDRESSER',
    'steer.down.touch': 'GLISSE ↓ POUR REDRESSER',
    'steer.down.desk': 'FLÈCHE ↓ OU STICK ↓ POUR REDRESSER',
    'steer.learn.touch': 'GLISSE ↑ ↓ POUR RESTER À PLAT',
    'steer.learn.desk': 'FLÈCHES ↑ ↓ OU STICK POUR RESTER À PLAT',
    'toast.gust': 'RAFALE',
    'toast.streakLost': 'SÉRIE PERDUE',
    'streak.x1': 'SÉRIE x1',
    'streak.x2': 'SÉRIE x2',
    'streak.x3': 'SÉRIE x3',
    'pause.title': 'EN PAUSE',
    'pause.idle': "L'onglet est passé en arrière plan. Le saut reprend où il s'est arrêté.",
    'pause.flying': "Tu es en plein vol. Appuie et tiens pour reprendre, puis lâche avant l'eau.",
    'pause.resume': 'REPRENDRE',

    // decollage, planche, grades, formes d'entree (game.js, diver.js)
    'takeoff.perfect': 'DÉCOLLAGE PARFAIT',
    'takeoff.good': 'BON DÉCOLLAGE',
    'takeoff.early': 'TROP TÔT',
    'takeoff.none': 'PAS DE DÉCOLLAGE',
    'grade.smack.short': 'TROP TARD',
    'planche.perfect': 'PLANCHE PARFAITE',
    'planche.steady': 'PLANCHE TENUE',
    'planche.wobbly': 'PLANCHE BANCALE',
    'planche.none': 'SANS PLANCHE',
    'planche.short.perfect': 'À PLAT',
    'planche.short.steady': 'TENUE',
    'planche.short.wobbly': 'BANCALE',
    'landing.shrimp.label': 'CREVETTE',
    'landing.shrimp.note': 'mains et pieds ensemble',
    'landing.bullet.label': 'BALLE',
    'landing.bullet.note': 'genoux et coudes ensemble',
    'landing.nohands.label': 'SANS LES MAINS',
    'landing.nohands.note': 'genoux et tête ensemble',
    'landing.ball.label': 'BOULE',
    'landing.ball.note': 'refermé trop tôt, aucune forme',
    'landing.flat.label': 'À PLAT',
    'landing.flat.note': 'le ventre a tout pris',

    // resultat du saut
    'gauge.early': 'trop tôt',
    'gauge.water': 'eau',
    'result.flat': "À plat. Le run s'arrête là.",
    'result.air': "{label} · {air} s en l'air",
    'timing.never': 'jamais lâché',
    'timing.tooSoon.touch': 'lâché tout de suite : garde le doigt pour rester en døds',
    'timing.tooSoon.desk': 'lâché tout de suite : reste appuyé pour rester en døds',
    'timing.late': '{s} s trop tard',
    'timing.center': 'au cœur de la fenêtre',
    'timing.early': '{s} s trop tôt',
    'line.base': 'Base {h} m',
    'line.style': 'Style, {air} s en døds',
    'line.timing': 'Timing {grade}',
    'line.plank': "{label}, {deg}° d'écart",
    'line.jump': 'Saut {n}',
    'result.next': 'SUITE',
    'result.next.jump': 'SAUT SUIVANT',
    'result.next.end': 'BILAN',
    'result.tap.touch': "ou tape n'importe où",
    'result.tap.desk': 'ou appuie sur Espace',
    'result.tap.pad': 'ou appuie sur A',
    'input.space': 'ESPACE',
    'input.click': 'CLIC',
    'hud.ifRelease': 'SI TU LÂCHES',
    'hud.takeoff': 'APPEL',
    'spots.hint.desk': 'Flèches ou croix pour choisir · Espace ou A pour ouvrir · Échap ou B pour revenir',

    // fin du run
    'end.over': 'RUN TERMINÉ',
    'end.done': 'TROIS SAUTS DANS LA BOÎTE',
    'end.record': 'NOUVEAU RECORD SUR CE SPOT',
    'end.best': 'Record du spot : {best}',
    'end.spots': 'Spots',
    'end.again': 'REJOUER'
  },

  en: {
    // title screen
    'loading': 'loading…',
    'title.tag': 'Dødsing championship',
    'title.play': 'PLAY',
    'title.quit': 'Quit',
    'title.hint.touch': 'One finger: press, hold the plank, release',
    'title.hint.desk': 'Space, click or A button: press, hold the plank, release',
    'lang.switch': 'FR',
    'lang.aria': 'Français',
    'sound.label': 'Sound',
    'sound.mute': 'Mute',
    'sound.unmute': 'Unmute',

    // spot select
    'nav.title': 'Back to title',
    'spots.heading': 'PICK YOUR SPOT',
    'spots.total': 'TOTAL',
    'spots.best': 'BEST',
    'spot.aria': '{name}, {place}, {height} meters, difficulty {diff}, best {best}',

    // spot brief
    'brief.height': 'height',
    'brief.diff': 'difficulty',
    'brief.best': 'best',
    'brief.gesture': 'The move',
    'brief.press': 'PRESS',
    'brief.press.sub': 'at the edge',
    'brief.hold': 'HOLD',
    'brief.hold.sub': 'flat, in døds',
    'brief.release': 'RELEASE',
    'brief.release.sub': 'just before the water',
    'brief.back': 'Back',
    'brief.go': '3 JUMPS, GO',
    'steer.tip.touch': 'drag to stay flat',
    'steer.tip.desk': 'arrows up/down or stick to stay flat',
    'wind.none': 'sheltered from the wind',
    'wind.light': 'light wind: {tip}',
    'wind.mid': 'wind: {tip}',
    'wind.strong': 'strong wind: {tip}',

    // HUD
    'hud.jump': 'JUMP',
    'hud.alt': 'ALTITUDE',
    'level.plank': 'PLANK',
    'prompt.edge': 'PRESS AT THE EDGE, AND HOLD',
    'prompt.edge.first.touch': 'PRESS AT THE EDGE… AND KEEP YOUR FINGER DOWN',
    'prompt.edge.first.desk': 'PRESS AT THE EDGE… AND KEEP HOLDING',
    'prompt.press': 'PRESS AND HOLD',
    'prompt.hold': 'HOLD… RELEASE JUST BEFORE THE WATER',
    'prompt.flail': 'PRESS, THEN RELEASE BEFORE THE WATER',
    'steer.up.touch': 'DRAG ↑ TO LEVEL OUT',
    'steer.up.desk': 'ARROW ↑ OR STICK ↑ TO LEVEL OUT',
    'steer.down.touch': 'DRAG ↓ TO LEVEL OUT',
    'steer.down.desk': 'ARROW ↓ OR STICK ↓ TO LEVEL OUT',
    'steer.learn.touch': 'DRAG ↑ ↓ TO STAY FLAT',
    'steer.learn.desk': 'ARROWS ↑ ↓ OR STICK TO STAY FLAT',
    'toast.gust': 'GUST',
    'toast.streakLost': 'STREAK LOST',
    'streak.x1': 'STREAK x1',
    'streak.x2': 'STREAK x2',
    'streak.x3': 'STREAK x3',
    'pause.title': 'PAUSED',
    'pause.idle': 'The game went to the background. The jump resumes where it stopped.',
    'pause.flying': 'You are mid-flight. Press and hold to take over, then release before the water.',
    'pause.resume': 'RESUME',

    // takeoff, plank, grades, entry shapes (game.js, diver.js)
    'takeoff.perfect': 'PERFECT TAKEOFF',
    'takeoff.good': 'GOOD TAKEOFF',
    'takeoff.early': 'EARLY TAKEOFF',
    'takeoff.none': 'NO TAKEOFF',
    'grade.smack.short': 'TOO LATE',
    'planche.perfect': 'PERFECT PLANK',
    'planche.steady': 'STEADY PLANK',
    'planche.wobbly': 'WOBBLY PLANK',
    'planche.none': 'NO PLANK',
    'planche.short.perfect': 'FLAT',
    'planche.short.steady': 'STEADY',
    'planche.short.wobbly': 'WOBBLY',
    'landing.shrimp.label': 'SHRIMP',
    'landing.shrimp.note': 'hands and feet together',
    'landing.bullet.label': 'BULLET',
    'landing.bullet.note': 'knees and elbows together',
    'landing.nohands.label': 'NO HANDS',
    'landing.nohands.note': 'knees and head together',
    'landing.ball.label': 'BALL',
    'landing.ball.note': 'closed too early, no shape',
    'landing.flat.label': 'BELLY FLOP',
    'landing.flat.note': 'the belly took it all',

    // jump result
    'gauge.early': 'too early',
    'gauge.water': 'water',
    'result.flat': 'Belly flop. The run ends here.',
    'result.air': '{label} · {air} s in the air',
    'timing.never': 'never released',
    'timing.tooSoon.touch': 'released right away: keep your finger down to stay in døds',
    'timing.tooSoon.desk': 'released right away: keep holding to stay in døds',
    'timing.late': '{s} s too late',
    'timing.center': 'right in the sweet spot',
    'timing.early': '{s} s too early',
    'line.base': 'Base {h} m',
    'line.style': 'Style, {air} s in døds',
    'line.timing': 'Timing {grade}',
    'line.plank': '{label}, {deg}° off',
    'line.jump': 'Jump {n}',
    'result.next': 'NEXT',
    'result.next.jump': 'NEXT JUMP',
    'result.next.end': 'RESULTS',
    'result.tap.touch': 'or tap anywhere',
    'result.tap.desk': 'or press Space',
    'result.tap.pad': 'or press A',
    'input.space': 'SPACE',
    'input.click': 'CLICK',
    'hud.ifRelease': 'IF YOU LET GO',
    'hud.takeoff': 'TAKEOFF',
    'spots.hint.desk': 'Arrows or D-pad to choose · Space or A to open · Esc or B to go back',

    // end of run
    'end.over': 'RUN OVER',
    'end.done': 'THREE JUMPS IN THE BAG',
    'end.record': 'NEW RECORD ON THIS SPOT',
    'end.best': 'Spot best: {best}',
    'end.spots': 'Spots',
    'end.again': 'PLAY AGAIN'
  }
};

// Une cle se resout une fois (cle.touch ou cle.desk, puis cle, puis le francais, puis la cle
// elle-meme, visible a l'ecran) : la boucle chaude appelle t() a chaque image sans allouer.
const memo = new Map();
export function t(key, vars) {
  let s = memo.get(key);
  if (s === undefined) {
    const d = DICT[LANG] || DICT.fr, fr = DICT.fr, dev = TOUCH ? '.touch' : '.desk';
    s = d[key + dev] ?? d[key] ?? fr[key + dev] ?? fr[key] ?? key;
    memo.set(key, s);
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

// Un champ localise d'un objet de donnees : `place` en francais, `placeEn` en anglais.
export function loc(o, k) { return (LANG === 'en' && o[k + 'En']) || o[k]; }

// Remplit ce que index.html porte en francais par defaut. Idempotent.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
    el._t = undefined; // le cache de setText() (main.js) ne doit pas croire l'ancien texte encore en place
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  document.documentElement.lang = LANG;
}

// Le choix survit au rechargement par localStorage. Quand le stockage est bloque, ou quand
// l'URL porte deja ?lang=, le parametre de l'URL prend le relais : sans lui, la langue
// d'avant reviendrait au rechargement et le bouton semblerait ne rien faire.
export function setLang(l) {
  if (l !== 'en' && l !== 'fr') return;
  let stored = false;
  try { localStorage.setItem(KEY, l); stored = localStorage.getItem(KEY) === l; } catch { }
  try {
    const u = new URL(location.href);
    if (!stored || u.searchParams.has('lang')) {
      u.searchParams.set('lang', l);
      history.replaceState(null, '', u);
    }
  } catch { }
  location.reload();
}

// Traduit des le chargement du module, avant que Three.js n'arrive : sans cela le texte
// « chargement… » resterait en francais pour tout le monde pendant le telechargement.
if (typeof document !== 'undefined') {
  document.documentElement.lang = LANG;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyStatic());
  else applyStatic();
}
