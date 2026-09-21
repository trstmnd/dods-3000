# DODS 3000

Jeu de **dødsing** (le death diving norvégien) qui se joue dans le navigateur, mobile comme ordinateur, sans installation.

**Jouer : https://trstmnd.github.io/dods-3000/**

## Le geste

Un seul bouton : **Espace** au clavier, **tap** n'importe où sur mobile.

1. Choisir un spot dans la carte du monde (6 spots, de 10 à 34 m).
2. Le plongeur court vers le bord. **Appuyer au dernier mètre** : le décollage vaut un multiplicateur de 0,5 à 1,25.
3. En l'air il part en **død**, bras en croix. Chaque dixième de seconde passé ouvert rapporte des points de style.
4. **Refermer au dernier moment.** Trop tôt c'est un chicken, trop tard c'est un smack, et un smack termine le run.

Deux timings GREAT ou mieux d'affilée valent x1,2, trois valent x1,5 : la série s'affiche dans le HUD et le bonus s'applique au saut qui la porte.

Un run vaut 3 sauts. Le record de chaque spot est gardé dans le navigateur.

Le bouton en bas à gauche coupe le son, et la coupure est gardée d'une partie à l'autre. Si l'onglet passe en arrière plan pendant un saut, le jeu se met en pause et attend une action pour repartir au même endroit.

Score = (hauteur × 12 + style) × multiplicateur de timing × multiplicateur de décollage.

## Versions

Le numéro s'affiche sous le bouton de l'écran titre. Il vit dans `src/main.js` (`export const VERSION`), un contrôle de `check.sh` vérifie qu'il est bien là. À chaque livraison, bumper cette constante avant de pousser.

| Version | Ce qu'elle apporte |
|---|---|
| v1.0 | 6 spots, run de 3 sauts, records par spot, mobile et clavier |
| v1.1 | cadrage corrigé en portrait : le champ s'élargit quand l'écran est plus haut que large |
| v1.2 | pause quand l'onglet passe en arrière plan, coupure du son mémorisée, vibration mobile, respect de `prefers-reduced-motion` |
| v1.3 | écart au parfait affiché avec une jauge de fenêtre, ralenti sur un PERFECT DØDS, liste des spots au clavier, mondes libérés entre deux runs |
| v1.4 | gerbe d'entrée refaite, mer vivante avec onde d'impact, ombre du plongeur sur l'eau, strates et ligne d'eau sur la falaise |
| v1.5 | plongeur en 3D d'un seul tenant, peau lissée et squelette, multiplicateur de série sur le run |
| v1.6 | entrée dans l'eau refaite sur la vraie mécanique : trois formes d'entrée, corps calé sur son point de contact, caméra et HUD qui laissent voir le geste |
| v1.7 | le geste juste : vol bras et jambes tendus, entrée recroquevillée au dernier moment |
| v1.8 | la fermeture devient un coup sec : 0,05 s au lieu de 0,15 s |

Le lien ne change jamais, quelle que soit la version : GitHub Pages sert la branche `main` à la racine. GitHub met un cache de 10 minutes sur les fichiers, donc une nouvelle version peut mettre ce temps à apparaître chez quelqu'un qui vient de jouer. Ajouter `?v=2` à l'URL force le rechargement.

## La mécanique du døds

Le jeu suit les critères de jugement de la discipline, pas une idée de plongeon.

1. **L'anløp.** Sortir de la plateforme avec de la vitesse et de la puissance. C'est le multiplicateur de décollage.
2. **Le vol.** Corps **horizontal, bras et jambes tendus**, l'étoile. Plus c'est étiré et tenu longtemps, mieux c'est. Chaque dixième de seconde ouvert rapporte du style.
3. **La fermeture.** **Le plus tard possible**, et délibérée : le corps se **recroqueville d'un coup**, genoux dans la poitrine, talons aux fesses, menton rentré. C'est toute la tension du jeu, et c'est ce contraste entre l'étoile tenue et la boule soudaine qui fait le døds.
4. **L'entrée.** Elle doit être contrôlée dans une des trois formes valides :

| Forme | Ce qui touche l'eau en premier | Dans le jeu |
|---|---|---|
| **Crevette** | les mains et les pieds, ensemble | fermeture PERFECT ou GREAT |
| **Balle** | les genoux et les coudes | fermeture GOOD |
| **Sans les mains** | les genoux et la tête | pas encore attribuée, elle attend le freestyle |

Fermer trop tôt ne donne aucune forme, juste une **boule** sans puissance. Ne pas fermer du tout, c'est **à plat**, et le ventre prend tout.

Contrairement au plongeon classique, **la puissance de l'entrée est récompensée**, pas la gerbe minimale : une grosse gerbe sur une forme propre est un bon døds.

La forme suit aujourd'hui la qualité de la fermeture, parce qu'une crevette demande de fermer tard et juste. Quand le jeu ira vers le freestyle, c'est le joueur qui la choisira.

Source : critères de jugement de la [Døds Diving League](https://dodsdivingleague.com/pages/judging-criteria-and-scoring) et [Døds diving sur Wikipedia](https://en.wikipedia.org/wiki/D%C3%B8ds_diving).

## Ce qu'il faut savoir avant de toucher au code

- **La fenêtre de tuck se mesure en temps avant l'impact, jamais en mètres.** À 28 m la vitesse d'entrée dépasse 25 m/s, donc 1 m vaut 40 ms : une fenêtre exprimée en distance serait injouable en haut et triviale en bas. Elle se resserre quand même avec la hauteur (facteur `k` dans `windows()` de `src/game.js`).
- **Le navigateur cache les modules ES sans le dire.** En local, `python3 -m http.server` n'envoie pas de `Cache-Control`, donc Chrome applique son heuristique et sert l'ancien fichier : une modification semble alors sans effet et on part chercher un bug qui n'existe pas. Tester avec `http://localhost:8012/?cb=<n>` en changeant le n.
- **Une capture du Browser pane est en retard d'une action** sur l'état réel de la page. Enchaîner deux captures et lire la seconde, sinon on juge le rendu d'avant sa correction.
- **`file://` ne charge pas les modules ES.** Il faut un serveur : `python3 -m http.server 8012` puis http://localhost:8012, ou la config `dods3000` du `launch.json` du Drive.
- **Three.js arrive par importmap depuis cdnjs**, version épinglée. Aucune dépendance npm, aucun build, aucun asset : tout est généré (falaise, eau, plongeur, son).
- **L'ordre des rotations d'Euler compte pour le plongeur** : `rotation.y` est appliqué avant `rotation.x`, donc une fois le corps basculé à l'horizontale, `y` agit comme un roll autour de l'axe du corps. C'est ce qui rend la croix des bras lisible depuis une caméra latérale, sans quoi les bras pointent vers l'objectif et disparaissent.
- **La lumière d'un spot doit éclairer la face visible.** La caméra est toujours en x négatif : un soleil placé derrière la falaise rendait toutes les faces avant grises et verdâtres, teintées par la lumière hémisphérique. Chaque `sunPos` de `src/spots.js` pointe donc vers la caméra, et une lumière de remplissage sans ombre complète.
- **Le corps se cale sur son point de contact, pas l'inverse.** La physique suit un point, mais le corps n'est pas ce point : en croix il est à plat, en crevette il est plié en deux. `alignContact()` descend le rig de la hauteur de son point le plus bas, pour qu'une main, un pied ou un genou touche l'eau à l'instant où la physique dit `y = 0`. Toucher au timing pour corriger un décalage visuel casserait l'équilibrage ; c'est le corps qui se cale, jamais la fenêtre.
- **Le plongeur est généré, pas chargé.** Son corps sort d'un champ de distance maillé par surface nets, avec skinning sur dix os. La géométrie coûte environ 165 ms une fois au chargement, puis elle est mise en cache et clonée par run : `disposeTree()` libère le clone sans vider le cache. Écarter les bras du buste dans la pose de repos n'est pas cosmétique, c'est ce qui empêche la peau de se souder et de tendre une palme quand la croix du døds s'ouvre.
- **Three.js ne libère rien tout seul.** `buildWorld()` crée une scène complète à chaque run. Sans `world.dispose()`, les géométries, matériaux, textures et shadow maps restent sur le GPU : c'était 27 géométries de plus par run, jusqu'à la perte du contexte WebGL sur mobile. `disposeTree()` de `src/world.js` fait le ménage, et tout ce qui sort de la scène avant elle, comme le rig du plongeur, doit se libérer lui-même.
- **Le niveau de l'eau est y = 0 pour la physique**, les vagues du shader et l'onde laissée par l'entrée du plongeur sont purement visuelles (±0,3 m) : les faire compter décalerait le timing parfait sans que le joueur puisse le prévoir.
- **L'eau projetée n'est pas éclairée.** La gerbe, la couronne et les anneaux sont en matériau non éclairé : un matériau standard les rendait grises dans un fjord à l'ombre, où la colonne ressemblait à un poteau de béton.

## Tester

```bash
./check.sh
```

28 contrôles déterministes : présence des fichiers, syntaxe de chaque module, intégrité des 6 spots, bornes des fenêtres de tuck, câblage de `index.html`, cadrage pour les agents de code, absence de tiret cadratin.

Pour le jeu lui-même, la page expose `window.__dods` :

```js
__dods.paused = true;        // fige la boucle rAF, la simulation n'avance plus que par tick()
__dods.autoJump = 0.7;       // saute automatiquement a 0,7 m du bord
__dods.autoTuck = 0.15;      // se referme automatiquement a 0,15 s de l'impact
__dods.tick(60);             // avance 60 frames a 1/60 s et rend l'etat
```

C'est la seule façon de tester le timing : du JS asynchrone dépend de `requestAnimationFrame`, qui est ralenti dès que l'onglet n'est pas au premier plan, et les valeurs lues ne correspondent alors plus à l'image affichée.

## Développer avec OpenCode

Le projet est cadré pour être continué par un agent de code bon marché plutôt
qu'à la main ou avec un gros modèle.

| Fichier | Rôle |
|---|---|
| `AGENTS.md` | tout ce qu'un agent doit savoir avant d'écrire une ligne : carte des modules, invariants, boucle de travail. Chargé automatiquement par OpenCode au démarrage, ce qui évite de lui faire explorer le dépôt. |
| `ROADMAP.md` | les tâches suivantes, déjà découpées, avec leur critère d'acceptation. Une tâche par session. |
| `opencode.json` | le modèle par défaut du projet. |

```bash
npm i -g opencode-ai     # ou : brew install sst/tap/opencode
opencode auth login      # choisir le fournisseur, un abonnement Claude évite la facturation au token
cd dods-3000 && opencode
```

Puis, dans la session : `Prends la première tâche non cochée de ROADMAP.md.`

Ce qui fait vraiment baisser la facture, dans l'ordre :

1. Une tâche par session neuve. Une session qui dure repaye tout son contexte à
   chaque tour, c'est le poste de dépense principal.
2. Un petit modèle par défaut. `opencode.json` met Haiku 4.5 ; `/models` bascule
   vers un modèle plus fort le temps d'un passage difficile, puis on redescend.
3. `AGENTS.md` plutôt que le prompt. Les invariants sont dans le dépôt, rien à
   recoller à chaque fois, et ils profitent aussi aux autres agents qui lisent
   ce fichier.
4. `./check.sh` avant de demander une relecture au modèle : 28 contrôles pour
   zéro token.

Le reste du cadre ne change pas : brancher, pousser, la preview sort sur
`https://trstmnd.github.io/dods-3000/preview/<branche>/`, et `main` publie à la
racine.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/main.js` | machine d'états des écrans, boucle, HUD, sauvegarde |
| `src/game.js` | physique du saut, fenêtres de timing, scoring, caméras |
| `src/world.js` | ciel, eau (shader), falaise procédurale, plateformes, décor |
| `src/diver.js` | le plongeur : corps généré depuis un champ de distance, squelette, poses |
| `src/spots.js` | les 6 spots : hauteur, difficulté, palette, plateforme |
| `src/fx.js` | gerbe d'eau, gouttes, anneau de surface |
| `src/audio.js` | sons synthétisés, aucun fichier chargé |
| `src/noise.js` | bruit et PRNG déterministes : la même falaise à chaque partie |
