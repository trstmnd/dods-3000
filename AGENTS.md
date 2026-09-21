# AGENTS.md

Contexte compact de DODS 3000 pour un agent de code. Lire ce fichier suffit pour
commencer : il evite d'ouvrir les 8 modules pour comprendre le projet.

## Ce que c'est

Jeu de dodsing 3D, navigateur, zero build, zero dependance npm. Three.js arrive
par importmap depuis jsDelivr, version epinglee et verifiee par `integrity` dans
`index.html`. Tout est genere en code : falaise, eau, plongeur, son. Aucun asset binaire.

Publie sur https://trstmnd.github.io/dods-3000/ par le workflow
`.github/workflows/pages.yml` : `main` va a la racine, toute autre branche va
dans `preview/<branche>` sur `gh-pages`.

## Carte des fichiers

| Fichier | Role | Toucher quand |
|---|---|---|
| `index.html` | ecrans (title, spots, brief, run, jump, end), importmap | on ajoute un ecran ou un element de HUD |
| `style.css` | tout le style, y compris le HUD et le responsive | rendu 2D |
| `src/main.js` | machine d'etats des ecrans, boucle rAF, HUD, sauvegarde, `VERSION` | flux de jeu, affichage, stockage |
| `src/game.js` | physique du saut, fenetres de timing, scoring, cameras | equilibrage, sensations |
| `src/world.js` | ciel, eau (shader), falaise procedurale, plateformes, decor | environnement |
| `src/diver.js` | corps genere, squelette, poses | animation ou silhouette du personnage |
| `src/spots.js` | les 6 spots : hauteur, difficulte, palette, plateforme | ajout ou reglage d'un spot |
| `src/fx.js` | gerbe, gouttes, anneau de surface | impact |
| `src/audio.js` | sons synthetises | son |
| `src/noise.js` | bruit et PRNG deterministes | ne pas toucher sans raison : la falaise doit rester identique d'une partie a l'autre |

Constantes de reglage : `TUNING` et `windows()` dans `src/game.js`,
`SPOTS` dans `src/spots.js`, `VERSION` et `JUMPS_PER_RUN` dans `src/main.js`.

## Invariants a ne pas casser

1. **La fenetre de tuck se mesure en secondes avant l'impact, jamais en metres.**
   A 28 m la vitesse d'entree depasse 25 m/s : 1 m vaut 40 ms. Une fenetre en
   distance serait injouable en haut et triviale en bas.
2. **Le niveau de l'eau est y = 0 pour la physique.** Les vagues du shader sont
   visuelles (plus ou moins 0,3 m). Les faire compter decalerait le timing
   parfait sans que le joueur puisse le prevoir.
3. **Ordre des rotations d'Euler du plongeur** : `rotation.y` s'applique avant
   `rotation.x`. Corps a l'horizontale, `y` agit comme un roll autour de l'axe du
   corps : c'est ce qui rend la croix des bras lisible de profil.
4. **Le soleil de chaque spot eclaire la face visible.** La camera est toujours en
   x negatif, donc chaque `sunPos` de `src/spots.js` pointe vers la camera, plus
   une lumiere de remplissage sans ombre.
5. **Aucun tiret cadratin** dans `index.html`, `style.css`, `src/`, `README.md`,
   `AGENTS.md`, `ROADMAP.md`. `check.sh` echoue sinon.
6. **`VERSION` dans `src/main.js` se bumpe a chaque livraison**, et la ligne du
   tableau des versions du README se remplit.
7. **Pas de dependance npm, pas d'etape de build, pas de fichier binaire.**
8. **Le plongeur se genere.** `src/diver.js` construit son corps depuis un champ
   de distance, une fois, puis clone la geometrie du cache a chaque run. Les bras
   sont ecartes du buste au repos pour que la peau ne se soude pas : les
   rapprocher ramene la palme sombre sous l'aisselle des que la croix s'ouvre.
9. **Les formes d'entree sont des donnees.** `LANDINGS` dans `src/diver.js` tient
   les trois entrees valides du dodsing plus les deux ratees, avec leur pose et
   leur inclinaison. Les figures a venir s'y branchent. Et `alignContact()` cale
   le corps sur son point de contact : corriger un decalage visuel en touchant
   aux fenetres de timing casserait l'equilibrage.
10. **Une scene se libere.** `buildWorld()` alloue sur le GPU et Three.js ne rend
   rien tout seul : tout monde remplace passe par `world.dispose()`, et ce qui
   sort de la scene avant elle se libere lui-meme (`disposeTree`).

## Ou regarder avant de commencer

- `JOURNAL.md` : ce qui a ete livre et pourquoi, mes erreurs passees, ce qui est
  mesure et ce qui ne l'est pas, et la table des constantes de reglage.
- `ROADMAP.md` : la suite, une tache a la fois.
- `tools/` : le harnais Chromium qui verifie une regle de jeu ou juge une image.

## Boucle de travail

```bash
./check.sh                  # 29 controles deterministes, ni reseau ni navigateur
python3 -m http.server 8012 # puis http://localhost:8012/?cb=<n>
./tools/run.sh timing.mjs   # les quatre cas de fermeture, dans un vrai navigateur
```

Le `?cb=<n>` n'est pas decoratif : le serveur local n'envoie pas de
`Cache-Control`, Chrome sert alors l'ancien module ES et la modification semble
sans effet.

Pour tester le timing, la page expose `window.__dods` :

```js
__dods.paused = true;   // fige la boucle rAF
__dods.autoJump = 0.7;  // decolle a 0,7 m du bord
__dods.autoTuck = 0.15; // se referme a 0,15 s de l'impact
__dods.tick(60);        // avance 60 frames de 1/60 s et rend l'etat
```

C'est la seule mesure fiable : `requestAnimationFrame` est ralenti des que
l'onglet passe en arriere plan.

## Regles de commit

- Une tache de `ROADMAP.md` par commit, message en francais, imperatif court.
- `./check.sh` vert avant chaque commit.
- Jamais de push direct sur `main` : pousser une branche, la preview sort sur
  `https://trstmnd.github.io/dods-3000/preview/<branche>/`.

## Economie de tokens

Ce projet se developpe volontairement avec un petit modele. Les habitudes qui
changent la facture :

- Ce fichier remplace l'exploration du depot. Ne relire un module entier que
  s'il est celui qu'on modifie.
- Cibler la lecture : `grep -n` sur un symbole plutot que `cat` sur `world.js`
  (13 ko) ou `main.js` (12 ko).
- Une tache de la feuille de route a la fois, dans une session neuve. Les
  longues sessions repayent tout le contexte a chaque tour.
- `./check.sh` en premier reflexe plutot que de faire relire le code au modele.
- Le pilotage par `window.__dods` verifie une regle de jeu en une ligne, la ou
  faire relire la boucle au modele coute cent fois plus. Les scenarios de
  `tools/` sont deja ecrits : les relancer coute quelques centaines de tokens,
  les reecrire en coute des milliers.
- Rien a coller dans le prompt : les invariants sont ici, pas dans la conversation.
