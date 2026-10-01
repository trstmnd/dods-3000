// Les spots. Chaque entree pilote a la fois la fiche du menu et la construction 3D.
// height = hauteur de chute en metres, elle pilote la physique ET la difficulte de la fenetre de tuck.
// platform : 'board' (plongeoir), 'bridge' (pont), 'rock' (rocher), 'terrace' (terrasse beton)
// place et note existent en francais (`place`, `note`) et en anglais (`placeEn`, `noteEn`) : ce fichier
// s'importe seul (check.sh), il ne passe donc pas par src/i18n.js, main.js les lit avec loc().
// wind : force des rafales de 0 a 1. Elles font basculer la planche, le joueur la redresse
// en glissant le doigt. Frognerbadet est a l'abri : on y apprend le geste sans vent.

export const SPOTS = [
  {
    id: 'frogner',
    name: 'Frognerbadet',
    place: 'Oslo, Norvège',
    placeEn: 'Oslo, Norway',
    height: 10,
    diff: 1,
    platform: 'board',
    wind: 0,
    note: "La piscine où le dødsing est né. Dix mètres, de l'eau chlorée et trois cents personnes qui hurlent.",
    noteEn: 'The pool where dødsing was born. Ten meters, chlorinated water and three hundred people screaming.',
    palette: {
      sky: ['#9fd8ff', '#dff2ff'], sun: '#fff4d6', sunPos: [-165, 82, 145],
      water: '#1f7fb5', deep: '#0d3f60', rock: '#8e9aa6', rock2: '#6c7883',
      fog: '#cfe8f7', fogDensity: 0.00206, ambient: 0.75, clouds: 0.32
    }
  },
  {
    id: 'ricks',
    name: "Rick's Cafe",
    place: 'Negril, Jamaïque',
    placeEn: 'Negril, Jamaica',
    height: 14,
    diff: 2,
    platform: 'terrace',
    wind: 0.3,
    note: "Falaise de calcaire, coucher de soleil et un barman qui compte les points. L'eau est chaude, la roche non.",
    noteEn: 'Limestone cliff, sunset and a bartender keeping score. The water is warm. The rock is not.',
    palette: {
      sky: ['#ff9b54', '#ffd89b'], sun: '#fff0b8', sunPos: [-120, 44, 175],
      water: '#1a6f8f', deep: '#0a2d44', rock: '#b8a288', rock2: '#8d7660',
      fog: '#ffc98f', fogDensity: 0.00335, ambient: 0.68, clouds: 0.42
    }
  },
  {
    id: 'comino',
    name: 'Blue Lagoon',
    place: 'Comino, Malte',
    placeEn: 'Comino, Malta',
    height: 18,
    diff: 2,
    platform: 'rock',
    wind: 0.4,
    note: "Dix-huit mètres au-dessus d'un bleu irréel. Le fond se voit, ce qui n'aide pas à rester calme.",
    noteEn: "Eighteen meters above an unreal blue. You can see the bottom, which doesn't help you stay calm.",
    palette: {
      sky: ['#5ec8ff', '#eafaff'], sun: '#ffffff', sunPos: [-175, 95, 130],
      water: '#2fd0d8', deep: '#0a6f88', rock: '#e2d7be', rock2: '#b7a888',
      fog: '#dff6ff', fogDensity: 0.00245, ambient: 0.85, clouds: 0.22
    }
  },
  {
    id: 'mostar',
    name: 'Stari Most',
    place: 'Mostar, Bosnie',
    placeEn: 'Mostar, Bosnia',
    height: 24,
    diff: 3,
    platform: 'bridge',
    wind: 0.55,
    note: "Le pont ottoman. Vingt-quatre mètres, la Neretva à treize degrés, et une tradition qui ne pardonne pas l'hésitation.",
    noteEn: 'The Ottoman bridge. Twenty-four meters, the Neretva at 13°C, and a tradition that forgives no hesitation.',
    palette: {
      sky: ['#6fb7e8', '#e6f3ff'], sun: '#fff6df', sunPos: [-150, 76, 150],
      water: '#1e8f7a', deep: '#083f3a', rock: '#c9bfa6', rock2: '#9b8f76',
      fog: '#d7ecff', fogDensity: 0.00219, ambient: 0.78, clouds: 0.38
    }
  },
  {
    id: 'quebrada',
    name: 'La Quebrada',
    place: 'Acapulco, Mexique',
    placeEn: 'Acapulco, Mexico',
    height: 28,
    diff: 4,
    platform: 'rock',
    wind: 0.75,
    note: "Vingt-huit mètres dans une faille de sept mètres de large. Il faut la vague, et la vague ne t'attend pas.",
    noteEn: "Twenty-eight meters into a gap seven meters wide. You need the wave, and the wave won't wait for you.",
    palette: {
      sky: ['#ff6b5e', '#ffc46b'], sun: '#ffe9a8', sunPos: [-130, 36, 180],
      water: '#125a76', deep: '#04202f', rock: '#7d6a5c', rock2: '#584a41',
      fog: '#ff9e76', fogDensity: 0.00374, ambient: 0.6, clouds: 0.46
    }
  },
  {
    id: 'lysefjord',
    name: 'Lysefjord Ledge',
    place: 'Rogaland, Norvège',
    placeEn: 'Rogaland, Norway',
    height: 34,
    diff: 5,
    platform: 'rock',
    wind: 0.95,
    note: "Trente-quatre mètres de granite au-dessus d'un fjord noir. Personne ne regarde. C'est ce qui fait peur.",
    noteEn: "Thirty-four meters of granite above a black fjord. Nobody is watching. That's what's scary.",
    palette: {
      sky: ['#3d5a7d', '#c9a97e'], sun: '#ffd9a0', sunPos: [-185, 24, 118],
      water: '#3f5d70', deep: '#12293a', rock: '#7d8388', rock2: '#53585d',
      fog: '#e3c49b', fogDensity: 0.0034, ambient: 0.62, clouds: 0.5
    }
  }
];

export const DIFF_LABEL = ['', 'FACILE', 'OK', 'DUR', 'TRÈS DUR', 'SUICIDE'];
export const DIFF_LABEL_EN = ['', 'EASY', 'OK', 'HARD', 'VERY HARD', 'SUICIDE'];

export function spotById(id) {
  return SPOTS.find(s => s.id === id) || SPOTS[0];
}
