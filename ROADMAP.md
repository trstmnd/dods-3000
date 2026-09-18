# Feuille de route

Chaque tache est calibree pour une session courte d'un petit modele : un seul
fichier ou deux, un critere d'acceptation verifiable, `./check.sh` vert.
Prendre la premiere non cochee, la livrer, bumper `VERSION`, pousser la branche.

Ordre choisi par rapport valeur sur effort, pas par ambition.

## v1.2, confort

- [ ] **Pause a la perte de focus.** `src/main.js`. Sur `visibilitychange`, si la
  page passe en arriere plan pendant un saut, figer la boucle et afficher
  "REPRENDRE". Sans ca l'onglet en arriere plan ralentit `requestAnimationFrame`
  et le joueur retrouve un smack qu'il n'a pas vu venir.
  Acceptation : passer sur un autre onglet pendant la chute, revenir, le saut
  reprend au meme etat.

- [ ] **Coupure du son memorisee.** `index.html`, `style.css`, `src/main.js`,
  `src/audio.js`. Un bouton haut droite sur l'ecran titre et dans le HUD, etat
  garde dans la sauvegarde `dods3000.v1`.
  Acceptation : couper, recharger la page, le son reste coupe.

- [ ] **Vibration mobile.** `src/main.js`. `navigator.vibrate` au decollage
  (20 ms), au tuck reussi (30 ms), au smack (deux impulsions). Silencieux si
  l'API manque, et respecte la coupure du son.
  Acceptation : aucune erreur console sur un navigateur sans l'API.

- [ ] **Respect de `prefers-reduced-motion`.** `src/main.js`, `src/game.js`.
  Secousse de camera et flash divises par quatre quand la preference est active.
  Acceptation : la partie reste jouable et lisible, le scoring ne change pas.

## v1.3, contenu

- [ ] **Un septieme spot.** `src/spots.js`. Hauteur entre 18 et 24 m pour combler
  le trou du milieu de la carte, palette coherente, `sunPos` vers la camera
  (x negatif), plateforme parmi `board`, `bridge`, `rock`, `terrace`.
  Acceptation : le controle "spots complets" de `check.sh` passe, la lumiere
  n'est pas grise a l'ecran.

- [ ] **Ralenti sur l'impact.** `src/game.js`, `src/main.js`. Sur un PERFECT
  DODS, 0,35 s a vitesse 0,35 juste avant l'entree dans l'eau, puis retour
  normal. Le temps ralenti ne doit pas entrer dans le calcul du style.
  Acceptation : `__dods.tick()` donne le meme score avec et sans ralenti.

- [ ] **Partage du score de run.** `index.html`, `src/main.js`. Sur l'ecran de
  fin, un bouton qui copie "DODS 3000, <spot>, <score> pts" plus le lien du jeu,
  via `navigator.clipboard`, avec repli sur un champ selectionnable.
  Acceptation : un clic, un toast de confirmation, rien de casse sans
  `clipboard`.

## Reserve, a cadrer avant d'attaquer

- Figures alternatives au dods (bras, saltos) : demande des poses dans
  `src/diver.js` et une deuxieme dimension de scoring. Gros morceau, a decouper.
- Mode hors ligne : impossible tel quel, Three.js vient d'un CDN. Il faudrait
  vendorer le module, ce qui va contre la regle "aucun fichier a construire".
- Classement en ligne : demande un serveur, le projet n'en a pas.
