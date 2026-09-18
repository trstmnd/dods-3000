// Les spots. Chaque entree pilote a la fois la fiche du menu et la construction 3D.
// height = hauteur de chute en metres, elle pilote la physique ET la difficulte de la fenetre de tuck.
// platform : 'board' (plongeoir), 'bridge' (pont), 'rock' (rocher), 'terrace' (terrasse beton)

export const SPOTS = [
  {
    id: 'frogner',
    name: 'Frognerbadet',
    place: 'Oslo, Norvège',
    height: 10,
    diff: 1,
    platform: 'board',
    note: "La piscine où le dødsing est né. Dix mètres, de l'eau chlorée et trois cents personnes qui hurlent.",
    palette: {
      sky: ['#9fd8ff', '#dff2ff'], sun: '#fff4d6', sunPos: [-165, 82, 145],
      water: '#1f7fb5', deep: '#0d3f60', rock: '#8e9aa6', rock2: '#6c7883',
      fog: '#cfe8f7', fogDensity: 0.00206, ambient: 0.75
    }
  },
  {
    id: 'ricks',
    name: "Rick's Cafe",
    place: 'Negril, Jamaïque',
    height: 14,
    diff: 2,
    platform: 'terrace',
    note: "Falaise de calcaire, coucher de soleil et un barman qui compte les points. L'eau est chaude, la roche non.",
    palette: {
      sky: ['#ff9b54', '#ffd89b'], sun: '#fff0b8', sunPos: [-120, 44, 175],
      water: '#1a6f8f', deep: '#0a2d44', rock: '#b8a288', rock2: '#8d7660',
      fog: '#ffc98f', fogDensity: 0.00335, ambient: 0.68
    }
  },
  {
    id: 'comino',
    name: 'Blue Lagoon',
    place: 'Comino, Malte',
    height: 18,
    diff: 2,
    platform: 'rock',
    note: "Dix-huit mètres au-dessus d'un bleu irréel. Le fond se voit, ce qui n'aide pas à rester calme.",
    palette: {
      sky: ['#5ec8ff', '#eafaff'], sun: '#ffffff', sunPos: [-175, 95, 130],
      water: '#2fd0d8', deep: '#0a6f88', rock: '#e2d7be', rock2: '#b7a888',
      fog: '#dff6ff', fogDensity: 0.00245, ambient: 0.85
    }
  },
  {
    id: 'mostar',
    name: 'Stari Most',
    place: 'Mostar, Bosnie',
    height: 24,
    diff: 3,
    platform: 'bridge',
    note: "Le pont ottoman. Vingt-quatre mètres, la Neretva à treize degrés, et une tradition qui ne pardonne pas l'hésitation.",
    palette: {
      sky: ['#6fb7e8', '#e6f3ff'], sun: '#fff6df', sunPos: [-150, 76, 150],
      water: '#1e8f7a', deep: '#083f3a', rock: '#c9bfa6', rock2: '#9b8f76',
      fog: '#d7ecff', fogDensity: 0.00219, ambient: 0.78
    }
  },
  {
    id: 'quebrada',
    name: 'La Quebrada',
    place: 'Acapulco, Mexique',
    height: 28,
    diff: 4,
    platform: 'rock',
    note: "Vingt-huit mètres dans une faille de sept mètres de large. Il faut la vague, et la vague ne t'attend pas.",
    palette: {
      sky: ['#ff6b5e', '#ffc46b'], sun: '#ffe9a8', sunPos: [-130, 36, 180],
      water: '#125a76', deep: '#04202f', rock: '#7d6a5c', rock2: '#584a41',
      fog: '#ff9e76', fogDensity: 0.00374, ambient: 0.6
    }
  },
  {
    id: 'lysefjord',
    name: 'Lysefjord Ledge',
    place: 'Rogaland, Norvège',
    height: 34,
    diff: 5,
    platform: 'rock',
    note: "Trente-quatre mètres de granite au-dessus d'un fjord noir. Personne ne regarde. C'est ce qui fait peur.",
    palette: {
      sky: ['#48617f', '#b9cfe0'], sun: '#e8f0ff', sunPos: [-180, 58, 120],
      water: '#12384f', deep: '#03121c', rock: '#5f6a72', rock2: '#3e474e',
      fog: '#9fb7c9', fogDensity: 0.00484, ambient: 0.55
    }
  }
];

export const DIFF_LABEL = ['', 'FACILE', 'OK', 'DUR', 'TRÈS DUR', 'SUICIDE'];

export function spotById(id) {
  return SPOTS.find(s => s.id === id) || SPOTS[0];
}
