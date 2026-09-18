# DODS 3000

Jeu de **dødsing** (le death diving norvégien) qui se joue dans le navigateur, mobile comme ordinateur, sans installation.

**Jouer : https://trstmnd.github.io/dods-3000/**

## Le geste

Un seul bouton : **Espace** au clavier, **tap** n'importe où sur mobile.

1. Choisir un spot dans la carte du monde (6 spots, de 10 à 34 m).
2. Le plongeur court vers le bord. **Appuyer au dernier mètre** : le décollage vaut un multiplicateur de 0,5 à 1,25.
3. En l'air il part en **død**, bras en croix. Chaque dixième de seconde passé ouvert rapporte des points de style.
4. **Refermer au dernier moment.** Trop tôt c'est un chicken, trop tard c'est un smack, et un smack termine le run.

Un run vaut 3 sauts. Le record de chaque spot est gardé dans le navigateur.

Score = (hauteur × 12 + style) × multiplicateur de timing × multiplicateur de décollage.

## Versions

Le numéro s'affiche sous le bouton de l'écran titre. Il vit dans `src/main.js` (`export const VERSION`), un contrôle de `check.sh` vérifie qu'il est bien là. À chaque livraison, bumper cette constante avant de pousser.

| Version | Ce qu'elle apporte |
|---|---|
| v1.0 | 6 spots, run de 3 sauts, records par spot, mobile et clavier |
| v1.1 | cadrage corrigé en portrait : le champ s'élargit quand l'écran est plus haut que large |

Le lien ne change jamais, quelle que soit la version : GitHub Pages sert la branche `main` à la racine. GitHub met un cache de 10 minutes sur les fichiers, donc une nouvelle version peut mettre ce temps à apparaître chez quelqu'un qui vient de jouer. Ajouter `?v=2` à l'URL force le rechargement.

## Ce qu'il faut savoir avant de toucher au code

- **La fenêtre de tuck se mesure en temps avant l'impact, jamais en mètres.** À 28 m la vitesse d'entrée dépasse 25 m/s, donc 1 m vaut 40 ms : une fenêtre exprimée en distance serait injouable en haut et triviale en bas. Elle se resserre quand même avec la hauteur (facteur `k` dans `windows()` de `src/game.js`).
- **Le navigateur cache les modules ES sans le dire.** En local, `python3 -m http.server` n'envoie pas de `Cache-Control`, donc Chrome applique son heuristique et sert l'ancien fichier : une modification semble alors sans effet et on part chercher un bug qui n'existe pas. Tester avec `http://localhost:8012/?cb=<n>` en changeant le n.
- **Une capture du Browser pane est en retard d'une action** sur l'état réel de la page. Enchaîner deux captures et lire la seconde, sinon on juge le rendu d'avant sa correction.
- **`file://` ne charge pas les modules ES.** Il faut un serveur : `python3 -m http.server 8012` puis http://localhost:8012, ou la config `dods3000` du `launch.json` du Drive.
- **Three.js arrive par importmap depuis cdnjs**, version épinglée. Aucune dépendance npm, aucun build, aucun asset : tout est généré (falaise, eau, plongeur, son).
- **L'ordre des rotations d'Euler compte pour le plongeur** : `rotation.y` est appliqué avant `rotation.x`, donc une fois le corps basculé à l'horizontale, `y` agit comme un roll autour de l'axe du corps. C'est ce qui rend la croix des bras lisible depuis une caméra latérale, sans quoi les bras pointent vers l'objectif et disparaissent.
- **La lumière d'un spot doit éclairer la face visible.** La caméra est toujours en x négatif : un soleil placé derrière la falaise rendait toutes les faces avant grises et verdâtres, teintées par la lumière hémisphérique. Chaque `sunPos` de `src/spots.js` pointe donc vers la caméra, et une lumière de remplissage sans ombre complète.
- **Le niveau de l'eau est y = 0 pour la physique**, les vagues du shader sont purement visuelles (±0,3 m) : les faire compter décalerait le timing parfait sans que le joueur puisse le prévoir.

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
| `src/diver.js` | rig du plongeur et ses poses |
| `src/spots.js` | les 6 spots : hauteur, difficulté, palette, plateforme |
| `src/fx.js` | gerbe d'eau, gouttes, anneau de surface |
| `src/audio.js` | sons synthétisés, aucun fichier chargé |
| `src/noise.js` | bruit et PRNG déterministes : la même falaise à chaque partie |
