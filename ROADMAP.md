# Feuille de route

Chaque tache est calibree pour une session courte d'un petit modele : un seul
fichier ou deux, un critere d'acceptation verifiable, `./check.sh` vert.
Prendre la premiere non cochee, la livrer, bumper `VERSION`, pousser la branche.

Ordre choisi par rapport valeur sur effort, pas par ambition.

## v1.2, confort (livre)

- [x] **Pause a la perte de focus.** `src/main.js`. Sur `visibilitychange`, si la
  page passe en arriere plan pendant un saut, figer la boucle et afficher
  "REPRENDRE". Sans ca l'onglet en arriere plan ralentit `requestAnimationFrame`
  et le joueur retrouve un smack qu'il n'a pas vu venir.
  Acceptation : passer sur un autre onglet pendant la chute, revenir, le saut
  reprend au meme etat.

- [x] **Coupure du son memorisee.** `index.html`, `style.css`, `src/main.js`,
  `src/audio.js`. Un bouton haut droite sur l'ecran titre et dans le HUD, etat
  garde dans la sauvegarde `dods3000.v1`.
  Acceptation : couper, recharger la page, le son reste coupe.

- [x] **Vibration mobile.** `src/main.js`. `navigator.vibrate` au decollage
  (20 ms), au tuck reussi (30 ms), au smack (deux impulsions). Silencieux si
  l'API manque, et respecte la coupure du son.
  Acceptation : aucune erreur console sur un navigateur sans l'API.

- [x] **Respect de `prefers-reduced-motion`.** `src/main.js`, `src/game.js`.
  Secousse de camera et flash divises par quatre quand la preference est active.
  Acceptation : la partie reste jouable et lisible, le scoring ne change pas.

## v1.3, lecture du geste (livre)

- [x] **Ecart au parfait et jauge de fenetre.** Hors feuille de route initiale :
  l'etiquette seule ne disait pas de combien on avait rate.
- [x] **Ralenti sur l'impact.** Etendu a la gerbe, et `__dods.slowmo` coupe
  l'effet pour un test deterministe.
- [x] **Dette : les mondes sont liberes entre deux runs.** 27 geometries
  fuyaient par run.
- [x] **Dette : la liste des spots est accessible au clavier.**

## v1.4, la claque visuelle (livre)

- [x] **La gerbe d'entree refaite.** Colonne non eclairee, couronne evasee, deux
  nuages de gouttes, anneaux fins.
- [x] **La mer vivante.** Lobe large du soleil, reflet du ciel a angle rasant,
  ecume adoucie, onde circulaire lancee par l'entree du plongeur.
- [x] **L'ombre du plongeur sur l'eau**, qui sert aussi de repere de hauteur.
- [x] **Strates et ligne d'eau sur la falaise.**

## v1.5, serie et personnage (livre)

- [x] **Multiplicateur de serie sur le run.** Deux GREAT ou mieux d'affilee
  valent x1,2, trois valent x1,5, visible dans le HUD et detaille au bilan.
- [x] **Un vrai plongeur en 3D.** Peau d'un seul tenant generee depuis un champ
  de distance, squelette a dix os, skinning GPU. Toujours zero fichier charge.

## v1.6, l'entree dans l'eau (livre)

- [x] **Les trois formes d'entree du dodsing**, en donnees, nommees au bilan.
- [x] **Le corps cale sur son point de contact**, gerbe comprise.
- [x] **L'eau freine au lieu d'effacer** : le corps s'enfonce et la surface se
  referme dessus.
- [x] **Camera et HUD qui laissent voir l'entree** : approche dans la derniere
  seconde, anneau de tuck efface une fois ferme.

## v1.7, le geste juste (livre)

- [x] **Le vol se tend et l'entree se recroqueville.** Les poses d'entree etaient
  des plis aux membres pendants, pas des boules : un dods part bras et jambes
  tendus et se ferme recroqueville au dernier moment.

## v1.8, vers le freestyle

Le sujet du jeu est le geste, pas le catalogue de spots. La suite va donc vers
les figures, toujours avec une entree propre a la fin.

- [ ] **Choisir sa forme d'entree.** `src/game.js`, `src/main.js`, `index.html`.
  La forme suit aujourd'hui la qualite de la fermeture. Au joueur de la choisir
  en vol, et au scoring de valoriser la difficulte : balle, puis crevette, puis
  sans les mains.
  Acceptation : la forme choisie se voit avant l'entree, et le bilan la note.

- [ ] **Une figure en vol.** `src/diver.js`, `src/game.js`. Une rotation tenue
  pendant la chute, qui doit se finir dans l'axe pour que l'entree compte.
  Acceptation : la figure se lit depuis la camera laterale, et une figure ratee
  coute le multiplicateur de forme.

- [ ] **Les trois notes du jury.** `src/main.js`. Anlop, vol, entree, affichees
  separement au bilan plutot qu'un score unique.
  Acceptation : les trois notes redonnent le score actuel, sans changer
  d'echelle ni casser les records.

- [ ] **Partage du score de run.** `index.html`, `src/main.js`. Sur l'ecran de
  fin, un bouton qui copie "DODS 3000, <spot>, <score> pts" plus le lien du jeu,
  via `navigator.clipboard`, avec repli sur un champ selectionnable.
  Acceptation : un clic, un toast de confirmation, rien de casse sans
  `clipboard`.

## Reserve, a cadrer avant d'attaquer

- Un septieme spot : ecarte volontairement. Le jeu se joue sur le geste, pas sur
  le nombre de lieux ; six spots suffisent a couvrir la plage de hauteurs.
- Mode hors ligne : impossible tel quel, Three.js vient d'un CDN. Il faudrait
  vendorer le module, ce qui va contre la regle "aucun fichier a construire".
- Classement en ligne : demande un serveur, le projet n'en a pas.
