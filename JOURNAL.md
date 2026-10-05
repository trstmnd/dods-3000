# Journal de développement

Ce que `ROADMAP.md` ne dit pas : ce qui a été fait, pourquoi, ce qui est vérifié
et ce qui ne l'est pas. À lire avant de reprendre.

État au 26 septembre 2026 : **v1.8 en ligne** sur https://trstmnd.github.io/dods-3000/, **v3.1 prête** sur la branche `v3` (preview : https://trstmnd.github.io/dods-3000/preview/v3/).

---

## Ce qui a été livré

| Version | Contenu | Pourquoi |
|---|---|---|
| v1.2 | pause à la perte de focus, son coupé mémorisé, vibration, `prefers-reduced-motion` | `requestAnimationFrame` ralentit en arrière plan : le joueur revenait sur un smack qu'il n'avait pas vu venir |
| v1.3 | écart au parfait et jauge de fenêtre, ralenti sur un PERFECT, liste des spots au clavier, mondes libérés | GOOD ne disait pas si on avait manqué de 30 ms ou de 300, donc rien à corriger d'un saut sur l'autre |
| v1.4 | gerbe refaite, mer vivante, ombre du plongeur sur l'eau, strates de falaise | l'entrée dans l'eau est la récompense de chaque saut et c'était le plus laid du jeu |
| v1.5 | plongeur 3D d'un seul tenant, multiplicateur de série | trois sauts additionnés n'ont aucune tension ; le plongeur était un tas de capsules |
| v1.6 | entrée dans l'eau refaite sur la vraie mécanique du døds | le jeu inventait son atterrissage au lieu de suivre la discipline |
| v1.7 | vol bras et jambes tendus, entrée recroquevillée | correction : j'avais lu la crevette comme un pli aux membres pendants, c'est faux |
| v1.8 | fermeture à 0,05 s au lieu de 0,15 s | sur une fermeture tardive, le corps entrait dans l'eau à moitié ouvert |
| v2.0 | un seul geste (appuyer, tenir, lâcher), mise en direct, son de tension et cœur, note à l'instant du doigt, parabole exacte, gerbe refaite, écume dans la mer, nuages, clapot, décor derrière la fiche, fluidité | demande : « ultra fluide, beau, gameplay novateur ». Le vol était une attente passive entre deux taps |
| v2.1 | 7 défauts du gauntlet corrigés (2 bloquants, 5 majeurs) | voir « Le gauntlet de la v2 » plus bas |
| v3.0 | la planche : on redresse le corps en glissant le doigt, vent par spot, rafales fixes par saut | le gauntlet a noté que tenir restait passif : un minuteur, pas un geste |
| v3.1 | niveau à bulle vertical, consigne du geste plus tôt, 3 mineurs de robustesse | gauntlet de la v3 |

Avant tout ça : le cadrage OpenCode (`AGENTS.md`, `ROADMAP.md`, `opencode.json`)
pour que le projet se continue avec un petit modèle.

---

## Les décisions qui engagent la suite

**Le plongeur est généré en code, pas modélisé.** Demande initiale : « un vrai
bonhomme 3D, utilise Blender ». Blender n'est pas installé dans l'environnement
cloud, et le dépôt s'interdit les fichiers binaires. Un `.glb` aurait voulu dire
un asset commité, un `GLTFLoader` de plus, et rien de vérifiable sur place. Le
corps sort donc d'un champ de distance maillé par surface nets, avec un
squelette à dix os et du skinning GPU. Si un jour le choix bascule vers Blender,
il faut assumer le binaire dans le dépôt et le chargeur : ce n'est pas un détail
d'implémentation, c'est un changement de contrat du projet.

**La forme d'entrée suit la qualité de la fermeture.** Crevette pour un PERFECT
ou un GREAT, balle pour un GOOD, boule informe si on ferme trop tôt. Ce n'est
pas la réalité de la discipline, où le plongeur choisit sa forme. C'est un choix
pédagogique temporaire, qui tient parce qu'une crevette demande justement de
fermer tard et juste. La v1.9 doit rendre ce choix au joueur.

**Le corps se cale sur son point de contact, jamais l'inverse.** La physique
suit un point ; le corps n'est pas ce point. `alignContact()` descend le rig de
la hauteur de son point le plus bas. La tentation de corriger un décalage visuel
en touchant aux fenêtres de timing casserait l'équilibrage et tous les records.

**Le scoring vit dans le cumul du run, pas dans le saut.** Le multiplicateur de
série s'applique au cumul, le score brut du saut reste sur la même échelle qu'en
v1.1. C'est ce qui permet de comparer les records d'une version à l'autre.

---

## La v2 : le vol devient le jeu

**Le geste.** Appuyer au bord décolle, garder appuyé tient le døds, lâcher referme. Le
vol n'est plus un temps mort entre deux taps : c'est le doigt qui tient la planche. Le
premier réflexe d'un joueur qui tape au lieu de tenir donne un CHICKEN, et la carte le
dit en toutes lettres (« lâché tout de suite : garde le doigt pour rester en døds »).

**La mise.** Sous l'anneau, ce que le lâcher rapporterait maintenant, série comprise.
Elle grimpe de palier en palier puis tombe à zéro : c'est une tension de « cash out »,
mais déterministe, donc apprenable. Le texte ne donne jamais le top : l'œil réagit trop
tard pour viser la fenêtre dorée (0,15 à 0,20 s), c'est l'eau, l'ombre et le son qui
doivent faire lâcher.

**La précision.** La note se calcule à l'instant de l'événement (`lateOf()`), et la
parabole est intégrée exactement. Mesuré : même lâcher à 30, 60 et 144 Hz, même note,
même score. L'ancien Euler par image faisait tomber le plongeur plus vite que le `ttc`
calculé, d'environ 8 ms sur une chute de 1,5 s.

**Les scores restent comparables.** Même formule, mêmes fenêtres : le saut de référence
passe de 690 à 694 points à Frognerbadet (+0,6 %, l'air time exact au lieu de l'Euler).
La sauvegarde garde sa clé `dods3000.v1`.

**Ce que la fluidité a demandé.**
- Un monde par spot, construit et compilé à l'ouverture de la fiche, sous un fondu :
  REJOUER ne reconstruit plus rien.
- Le bruit du ciel, du clapot et de l'écume dans une texture de 256 × 256 calculée une
  fois : calculé dans le shader, il coûtait 40 % de temps d'image en plus.
- Plus de `backdrop-filter` (le flou se recalculait à chaque image au-dessus du canvas).
- Aucune allocation par image dans la caméra, la course, les poses et le HUD ; le DOM
  n'est écrit que quand une valeur change.
- La pause ne redessine plus la même image soixante fois par seconde.
- Three.js minifié : 171 ko compressés au lieu de 263.

## Le gauntlet de la v2

Trois vérificateurs adversariaux en contexte frais (prise en main, robustesse, beauté et
fluidité), le doute valant FAIL. Ce qu'ils ont trouvé, et que mes propres tests ne
voyaient pas :

| Défaut | Gravité | Correction |
|---|---|---|
| la mise affichée ignorait le bonus de série : +1223 affiché, 1835 encaissé au 3e PERFECT | bloquant | la mise applique `streakBonus(streak + 1)` et affiche le badge sous l'anneau |
| un doigt jamais levé (pointerup perdu) bloquait tous les décollages suivants | bloquant | le maintien qui lance le geste est seul à le terminer (`owner`), purge à chaque saut |
| trois choix de spot rapides laissaient le décor du deuxième derrière la fiche du troisième | majeur | la comparaison se fait contre la cible du fondu en cours |
| `applyPose()` allouait un tableau par image | majeur | liste des articulations calculée une fois |
| la résolution adaptative se coupait pour toute la session après un essai raté | majeur | elle reprend sa veille à chaque changement de spot |
| la gerbe d'un plat partait d'un coude, à côté du corps | majeur | à plat, la gerbe part du buste |
| `renderer.compile()` ne compile pas la passe d'ombre | majeur | une vraie image est rendue sous le fondu, tout visible |

Leçon : **un test écrit par l'auteur vérifie ce que l'auteur a pensé**. Les trois
bloquants et majeurs de gameplay sont sortis de scénarios que je n'avais pas écrits :
série sur trois sauts, doigt fantôme, clics rapides.

## La v3 : tenir devient un geste

Le vérificateur de gameplay du round 1 l'a dit en une ligne : tenir est un minuteur
passif. La v3 donne au doigt qui tient quelque chose à faire, sans ajouter de bouton.

**La planche.** L'inclinaison du corps par rapport à l'horizontale idéale. Trois forces
la font bouger : le couple de départ (un décollage parfait part presque droit, un
décollage trop tôt pique du nez), les rafales du spot, et le doigt, qui commande une
inclinaison que le corps rejoint avec un léger retard. Glisser vers le haut relève la
tête. Le système est stable : on compense le vent, on ne jongle pas avec un pendule.

**Le score.** Écart moyen tenu pendant le vol : 4° ou moins, PLANCHE PARFAITE x1,15 ;
jusqu'à 12°, TENUE de x1,15 à x1 ; au-delà, BANCALE jusqu'à x0,6. Le multiplicateur
entre dans la mise en direct, donc tenir la planche fait monter le chiffre sous l'anneau.

**Mesuré sans pilote puis avec un pilote parfait** (`tools/planche.mjs`, PERFECT à
0,15 s) :

| Spot | Vent | Sans pilote | Pilote parfait |
|---|---|---|---|
| Frognerbadet | 0 | x1,13, 5° | x1,15, 2° |
| Rick's Cafe | 0,3 | x1,01, 11° | x1,15, 4° |
| Stari Most | 0,55 | x0,94, 18° | x1,12, 6° |
| Lysefjord | 0,95 | x0,91, 20° (40° au pire) | x1,08, 8° |

Frognerbadet reste le spot où l'on apprend le geste : sans vent, la planche se tient
presque seule. Au Lysefjord, même un pilote sans retard n'atteint pas la planche
parfaite : c'est le plafond de compétence.

**Les records ne sont plus strictement comparables** avec la v2 : la planche module le
score de x0,6 à x1,15. Décision : garder la sauvegarde. Un ancien record se bat plus
facilement avec une bonne planche, ce qui ne lèse personne.

**À plat en fréquence d'image** : intégrée à pas fixe (1/240 s), la planche sans pilote
est identique au bit près à 30, 60 et 144 Hz (vérifié par le gauntlet, lecture directe de
l'inclinaison à 1 s simulée). Le score de `tools/planche.mjs` bouge encore de 0,2 % d'une
fréquence à l'autre : c'est le lâcher automatique du test, déclenché à l'image, pas la
planche ni le jeu.

**Le gauntlet de la v3** (2 vérificateurs) : 0 bloquant, 0 majeur, 5 mineurs corrigés en
v3.1. Le plus utile : le niveau à bulle était horizontal pour un geste vertical, il est
passé à la verticale à droite de l'anneau ; et le sens à donner au doigt n'apparaissait
qu'après 14° de dérapage, il sort désormais dès 9°, et dès le début du vol pendant les
8 premiers sauts sur un spot venteux. Mesuré par un joueur simulé avec 217 ms de retard :
bien glisser rapporte de +2 à +11 %, glisser à contresens coûte de 6 à 25 %, et ne rien
faire à Frognerbadet garde 98 % du score maximal.

## La v3.2 : la version Steam, et un gauntlet outillé (30/09/2026)

Objectif : un rendu proposable sur Steam, obtenu par une boucle de vérification qui joue
au jeu plutôt que de relire son code. Recherche GitHub de 10 dépôts, retenus :
hearth-probe (bots qui jouent à un jeu web), des checklists de Claude-Code-Game-Studios,
game-juice, steamworks.js. Détail et écartés : `tools/gauntlet/README.md`.

Ce qui a été construit :

- `tools/gauntlet/` : une commande, 7 étages (contrôles, règles, manette, 1 620 sauts de
  joueurs simulés, bots hearth, 40 captures en 3 formats et 2 langues, fenêtre Electron),
  un `VERDICT.md` PASS, FAIL ou WARN, puis 4 relecteurs en contexte frais.
- Le jeu en anglais et en français, jouable entier au clavier seul et à la manette seule
  (20 étapes vérifiées par `manette.mjs`), interface à l'échelle des grands écrans.
- `desktop/` : Electron hors ligne (Three.js local, hash vérifié), Windows x64, macOS
  universel, Linux x64 ; 9 succès Steam branchés, sans effet hors Steam.
- `store/` : textes, succès, script SteamPipe ; capsules, captures et bande-annonce
  rendues par le moteur du jeu (`store.mjs`, `shots.mjs`, `trailer.mjs`).

Ce que la passe 1 a trouvé, et que les tests existants ne voyaient pas :

| Défaut | Trouvé par | Gravité | Correction |
|---|---|---|---|
| au clavier, l'écran des spots était un cul-de-sac : Espace n'y faisait rien | bots hearth (bloqués 180 pas sur le même écran) | bloquant pour Steam | un spot choisi d'office à l'arrivée, Espace et A l'ouvrent |
| HUD de 9 à 12 px sur un écran 1080p ou un Deck | relecteurs joueur Steam et QA | majeur | toute l'interface grandit d'un bloc (`--ui`, 1,9 en 1080p), 12 px au plus petit |
| la touche du geste n'était jamais nommée en jeu | joueur Steam | majeur | la consigne porte une touche : ESPACE, CLIC ou A selon le dernier périphérique |
| consigne illisible sur la dalle claire du plongeoir | QA visuel | majeur | pastille sombre sous la consigne |
| un joueur qui attend le label PERFECT pour lâcher s'écrasait 74 % du temps au premier spot | game designer (profil « réactif » ajouté au bot) | majeur | fenêtre PERFECT de 0,30 s à 10 m |
| l'expert faisait 98 % de PERFECT à 34 m : plus rien à apprendre | bot, porte WARN | majeur | fenêtre de 0,096 s à 34 m (avant 0,144 s) |
| « PERFECT » au niveau à bulle et « CHICKEN » dans l'anneau au même instant | joueur Steam, game designer | mineur | la planche parfaite s'affiche À PLAT / FLAT, l'anneau dit « SI TU LÂCHES » |
| îlots du décor lus comme des pyramides blanches | joueur Steam | mineur | plus bas, plus larges, teinte de roche |
| écran titre en 16/9 : le logo couvrait l'île et le plongeur | joueur Steam, QA | mineur | île décalée à droite par la caméra, logo à gauche |

La passe 2 a trouvé un dernier défaut par les bots hearth : un Espace commencé sur un
bouton et relâché après un clic ailleurs n'activait rien (le natif n'active qu'au relâcher,
sur le même élément). Les boutons s'activent désormais à l'appui. Une partie restait
« bloquée » ensuite sur la graine 3 : le journal des touches montre 43 événements en 300
pas et aucun Espace dans les 180 derniers, un hasard du bot et pas du jeu. La porte passe
en WARN pour une partie bloquée, FAIL à partir de deux.

Mes erreurs cette fois : la première porte hearth de `verdict.mjs` lisait un champ absent
et rendait **PASS sur un rapport qui signalait un bloquant**. Une porte verte par défaut
est pire qu'une porte absente : elle lit désormais `report.json` et exige que le bot
atteigne l'eau depuis le titre.

## La v4.0 : la maquette waouh (01/10/2026)

Objectif du bloc 1 du brief v4 : rendre le SAUT waouh, jugé en vidéo, avant de toucher
au reste du jeu. Ce qui a été livré, dans l'ordre des commits :

- l'eau passe au shader `Water.js` de Three.js (MIT, miroir local dans `tools/vendor/`) :
  reflets du ciel, écume au rivage, houle vivante ; la physique reste y = 0 (invariant 2) ;
- le plongeur généré gagne des chevilles articulées et une silhouette d'athlète, les
  membres vivent pendant le vol (commit « chevilles articulées ») ;
- la caméra de poursuite plonge avec lui, et TOUTE fermeture tenue passe en ralenti x0,25
  (avant : PERFECT seulement) ;
- bloom en demi-flottant, seuls les halos des hautes lumières, tone mapping en fin de
  chaîne ;
- la gerbe monte plus haut, dure plus longtemps pour tenir dans le ralenti.

Mesuré et vérifié :

- `tools/bloc1-video.mjs` : rend le même saut pilote (Lysefjord, 34 m) image par image à
  la frame près, en v4 ET en v3.2, pour comparer. Sous swiftshader une capture CDP coûte
  plus de 45 s par image : le canvas sort par `toDataURL` dans la page (3,2 s en v4,
  1,3 s en v3.2) et le HUD par capture alpha masquée, réunies par ffmpeg. `Math.random`
  est remplacé par un PRNG semé au chargement : le rendu est découpable en tronçons de
  10 minutes et reprend sans qu'une image change.
- revue image par image des 2 vidéos 20 s : plongeur articulé lisible en vol, entrée dans
  l'eau sans clipping cassé, gerbe lisible, carte de note propre, aucun écran noir.
- logique : 0,095 ms par image rendu coupé (23 000 à 44 000 triangles, 18 à 22 draws).
  Le nombre d'images par seconde se mesure sur le Mac : le VPS n'a pas de GPU.
- `check.sh` 43 OK.

Arbitrages du bloc : le plongeur généré articulé tient lieu « d'humain Quaternius » (le
brief autorisait les assets CC0 ; aucun n'a été nécessaire, le dépôt reste sans fichier
binaire) ; le son de vent et d'impact existait déjà (`setWind`, `splash`), sa refonte est
au bloc 6.

## La v4.1 : les juges (01/10/2026)

Objectif du bloc 2 du brief v4 : le saut noté comme en compétition, lu en moins de
3 s. Ce qui a été livré, dans l'ordre des commits :

- `src/judging.js` : la grille officielle du dodsing, quatre critères sur 10 au
  dixième (élan, vol, fermeture, réception) et cinq juges nommés, chacun avec ses
  affinités et son biais (Lars sévère, Synne généreuse). La note est une lecture
  de ce que la physique mesure déjà : distance de décollage, temps tenu à plat,
  multiplicateur de planche, ttc au lâcher, forme d'entrée, puissance de la
  gerbe. Le score aux points et les records ne bougent pas ;
- la carte de résultat gagne la lecture compétition : cinq cartons qui se lèvent
  un par un (0,32 s d'intervalle), la moyenne, puis les quatre critères avec leur
  barre et le plus faible en rouge suivi de son conseil. La cascade vit dans le
  temps de jeu (avancée dans `frame()`), pas dans un délai CSS : le rendu image
  par image la rejoue à la frame près, et `prefers-reduced-motion` la rend
  instantanée. En paysage la carte se coupe en deux colonnes pour tenir un écran
  de PC sans défiler ;
- `tools/juges.mjs` : le test du bloc, neuf portes.

Mesuré et vérifié :

- `tools/juges.mjs` : 9 portes PASS sur un saut pilote au Lysefjord. Critères
  [9,0 / 9,1 / 9,4 / 10,0], moyenne 9,4, le plus faible (élan) surligné avec son
  conseil, cascade complète en 1,77 s de jeu, le saut rejoué lève exactement les
  mêmes cartons, une fermeture précoce tombe à 5,1 en fermeture, le smack reste à
  0 et termine le run, la relance en un geste prend 3 ms ;
- captures 1080p et 390x844 de la carte complète, relues : rien de coupé, les six
  cartons lisibles, le critère le plus faible en rouge ;
- `tools/bloc2-video.mjs` : 20 s à 30 i/s en 1080p, rendues image par image
  (titre, saut piloté et son ralenti, cascade, second saut fermé tôt et sa
  carte). Relue à 1 img/s : plongeur lisible en vol et en boule, cartons levés
  un par un, seconde carte différente (fermeture 7,2 contre 9,4), aucun écran
  noir. Trois captures 1920x1080 : pose étirée, boule près de l'eau, carte
  complète ;
- `check.sh` 44 OK.

Arbitrages du bloc : les noms des juges ne sont pas traduits (ce sont des noms
propres norvégiens, comme les noms de spots) ; la moyenne des cinq juges est
arrondie au dixième comme chaque note ; le conseil ne s'affiche qu'après la
cascade, pour ne pas spoiler le verdict avant le dernier carton.

## La v4.2 : les figures (01/10/2026)

Objectif du bloc 3 du brief v4 : le vol devient du freestyle, et un raté se
paie. Ce qui a été livré :

- `src/game.js` : trois figures au glisse, sans nouveau bouton. Un coup sec
  vertical (1,3 unité de glisse en 0,2 s) lance le salto (vers le bas) ou le
  grab (vers le haut), l'axe horizontal fait la vrille (6,4 rad/s, un tour
  compte). Une figure terminée avant le lâcher rapporte
  `figs * 45 * sqrt(h/12)` points et un bonus de vol de 0,6 par figure (au
  plus 3) ; une figure coupée par le lâcher ne compte pas. Le seuil du coup
  sec est au-dessus de ce que le doigt du bot du gauntlet sait faire (1,2
  par fenêtre) : les notes des 1 620 sauts des passes restent comparables ;
- la direction du lâcher choisit la réception : doigt glissé vers le haut =
  sans les mains, vers le bas = balle, relâché au centre = crevette. Aux
  juges : crevette 8,4, sans les mains 8,0, balle 7,4, boule 5,2 ;
- le saut jamais fermé : plat qui claque, rebond du corps à 11 % de la
  vitesse d'impact, gravité réduite sous l'eau, ragdoll déterministe
  (oscillations amorties à phases fixées), score 0 et fin du run ;
- HUD : toast au nom de la figure, ligne `Figure x{n}` sur la carte des
  juges, une ligne de consigne sur la fiche du spot (`brief.figs`), i18n
  fr/en complet ;
- `tools/figures.mjs` : le test du bloc, dix portes ;
- `tools/bloc3-video.mjs` : la vidéo du bloc, 20 s à 30 i/s rendues image
  par image.

Mesuré et vérifié :

- `tools/figures.mjs` : 10 portes PASS sur le Lysefjord piloté. Salto +76
  points avec toast, vrille 7,01 rad, grab +76, figure coupée refusée,
  bonus de vol exactement 0,6, réceptions sans les mains et balle obtenues
  par de vrais événements pointeur, raté : smack à 0, rebond 0,167 m,
  ragdoll 0,907 rad, écran de fin, déterminisme (deux saltos, mêmes
  cartons) ;
- `check.sh` 44 OK ;
- gauntlet : 16 portes, 2 FAIL (manette, hearth), échecs identiques sur la
  v3.2 de référence, déjà documentés comme limites du VPS aux blocs 1 et 2 ;
- CPU : 0,105 ms de logique par image rendu coupé, 1 158 octets alloués
  par image, au plus 44 294 triangles (gerbe) : la boucle chaude n'alloue
  toujours pas ;
- vidéo 20 s relue image par image (1 img/s, planche contact 5x4, deux
  impacts analysés plein écran) : plongeur visible en vol et dans la gerbe,
  cartes lisibles, aucun écran noir, pas de clipping.

Arbitrages du bloc : la vrille passe par l'axe horizontal du glisse (le
`rotation.y` d'Euler de l'invariant 3, un roll d'axe corps), pas par un
second geste ; une figure non terminée au lâcher vaut zéro, parce que la
note se prend à l'instant du doigt (invariant 12) ; le ragdoll ne tire rien
au hasard à l'image, pour que le même raté se rejoue à l'identique ; la
consigne des figures tient en une ligne sur la fiche du spot, le geste de
base reste le seul à apprendre pour jouer.

## La v4.3 : le replay et le fantôme (03/10/2026)

Objectif du bloc 4 du brief v4 : revoir son saut, et se courir après. Ce qui
a été livré :

- `src/replay.js` : la trace du saut, un échantillonnage du rig rendu (pas
  une re-simulation) dans un `Float32Array` préalloué : 43 nombres par image
  de jeu à 60 Hz, position racine et 12 articulations en Euler, ralenti des
  derniers mètres compris. Les repères (décollage, impact, force de gerbe)
  voyagent avec. Le même module porte le clone de relecture (`DiverEcho`,
  opaque pour le replay, teinté et translucide pour le fantôme, sans ombre),
  les trois cameras et la sauvegarde des fantômes en base64 dans
  localStorage ;
- `src/main.js` : la carte des juges offre la relecture ; trois angles
  (poursuite recalculée depuis la trace, juge immobile au bord fov 30,
  contre-plongée au ras de l'eau fov 46), tournés au doigt, aux flèches et
  au stick. La gerbe du replay part a l'instant d'impact enregistré, et la
  relecture rend la main seule une fois la gerbe retombée. Le meilleur saut
  individuel d'un spot devient fantôme : il rejoue la course du saut
  suivant superposé au coureur, et s'en détache quand les gestes divergent ;
  le HUD d'altitude suit l'écho pendant la relecture ;
- le fantôme s'arrête à l'impact plus 0,8 s : le geste et une courte queue
  sous la gerbe, pas la noyade (76 587 octets en localStorage contre 82 551
  pour la trace complète) ;
- `tools/replay.mjs` : le test du bloc, 15 portes ;
- `tools/bloc4-video.mjs` : la vidéo du bloc, 20 s à 30 i/s rendues image
  par image ; `tools/perf-replay.mjs` : le surcoût de trace, fantôme et
  relecture.

Mesuré et vérifié :

- `tools/replay.mjs` : 15 portes PASS sur le Lysefjord piloté. Trace de 360
  échantillons (6,0 s de jeu), vol 2,68 s, gerbe x1,37 ; le plongeur relevé
  pendant la chute est dans la trace interpolée ici indépendamment (24
  relevés, pire écart 0,465 m pour 0,5 de limite en chute libre, où une
  image vaut 40 cm) ; trois angles, trois cameras distinctes (suivi fov
  64,4 ; bord fov 30,2 ; eau fov 45,8) ; l'écho colle à la trace à 0 m ;
  gerbe du replay à 4,75 s contre 4,750 s enregistrés ; retour seul a la
  carte après 108 images, relance au geste en 508 ms ; fantôme superposé
  (0 m au départ comme à 1 s), translucide (opacité max 0,34), sans ombre ;
  il survit au rechargement et un saut moins bon (517 pts) ne le remplace
  pas ;
- `check.sh` 45 OK ;
- gauntlet : 16 portes, 2 FAIL (manette, hearth). Les deux sont les limites
  VPS documentées depuis les blocs 1 et 2 : le focus auto des boutons ne
  se pose pas en headless (même symptôme focus absent sur le verdict de la
  v4.2 de référence), et le sweep hearth dépasse le temps disponible sous
  swiftshader ;
- CPU (rendu coupé, VPS 2 cœurs, i/s à mesurer sur le Mac) : 0,082 ms de
  logique par image, 0,078 ms avec trace et fantôme actifs (indiscernable
  dans le bruit), 0,014 ms par image de relecture. `rec.sample` et
  `ghostEcho.pose` isolées allouent 0 octet par image ; la mesure
  d'octets de `perf.mjs` n'est pas exploitable sur le VPS (trois runs :
  +5 471, -6 090, -6 066 : elle ne mesure que le rythme du ramasse-miettes),
  à re-mesurer sur le Mac ;
- vidéo 20 s relue image par image (1 img/s, mosaïque des quatre moments
  clés) : plongeur visible aux trois angles, gerbe entière sous la
  contre-plongée, fantôme superposé puis détaché, cartes lisibles, aucun
  écran noir.

Arbitrages du bloc : le replay échantillonne le rig rendu plutôt que de
re-simuler, parce que ce qui doit se rejouer est ce qui a été vecu, ralenti
des derniers mètres compris, et qu'une seconde physique ferait deux
vérités ; le fantôme est le meilleur saut individuel, pas le meilleur run :
c'est un geste a comparer, la série n'y est pour rien ; il se coupe sous la
gerbe, la noyade n'apprend rien au joueur qui vient de la voir ; la
relecture rend la main seule et se coupe au même geste qui la relance, la
boucle d'essais reste courte (même règle que la carte) ; les flèches
tournent l'angle en relecture et ne pilotent plus la planche, un écran, un
sens.

## La v4.4 : les défis et la progression (03/10/2026)

Objectif du bloc 5 du brief v4 : une raison de revenir, hauteur après
hauteur. Ce qui a été livré :

- `src/defis.js` : les défis sont des données, calibrées par spot. Trois par
  hauteur : fermer dans la fenêtre parfaite, réussir une forme d'entrée, une
  gerbe au seuil de la force réellement mesurée à cette hauteur. Ils ne
  lisent que des grandeurs déjà mesurées par le saut (grade, forme d'entrée,
  power de la gerbe), même règle que la grille des juges : la progression ne
  juge rien que le jeu ne mesure déjà ;
- deux défis ouvrent le spot suivant (le troisième est de la maîtrise, pas
  de l'accès). Les cartes fermées portent cadenas, condition d'ouverture et
  les points du spot qui les ouvre ; la fiche liste les trois défis cochés
  ou à faire ; les flèches sautent les cartes fermées. Un record posé avant
  la v4.4 vaut déblocage : les joueurs de la v3 gardent leurs hauteurs ;
- un plat ne coche rien : la progression ne récompense pas l'écrasement ;
- `main.js` : `checkDefis()` coche les cases à la carte des juges, toast des
  libellés et callout de déblocage. Le toast et le callout passent en
  `position:fixed` au-dessus des cartes (z-index du HUD) : ils tombent
  pendant que la carte s'affiche et restent lisibles, la pastille descend
  sous un callout levé pour ne pas s'écrire sur lui ;
- `tools/defis.mjs` : le test du bloc, 16 portes ; `tools/bloc5-video.mjs` :
  la vidéo du bloc.

Mesuré et vérifié :

- `tools/defis.mjs` : 16 portes PASS, jouées par le vrai chemin (clics sur
  les cartes, vrais événements pointeur pour la réception). Le saut
  d'ouverture coche fermeture parfaite et entrée sans les mains d'un coup
  (toast des libellés, callout « Rick's Cafe DÉBLOQUÉ »), une fermeture
  GREAT passe le seuil de gerbe lu dans la page depuis le module (power
  0,772 >= seuil), un plat ne coche rien, la fiche et les points survivent au
  rechargement, un record d'avant la v4.4 débloque son spot, les flèches
  sautent les fermées ;
- `check.sh` 46 OK ;
- gauntlet : 16 portes, 2 FAIL (manette, hearth), les limites VPS
  documentées depuis les blocs 1 et 2 ;
- CPU (rendu coupé, VPS 2 cœurs, i/s à mesurer sur le Mac) : 0,077 ms de
  logique par image (0,082 au bloc 4 : les défis ne coûtent rien dans la
  boucle, ils ne courent qu'à la carte) ;
- vidéo 20 s relue image par image (1 img/s sur planches contact) :
  liste fermée, fiche et ses trois défis, saut piloté, carte avec toast et
  callout de déblocage, liste à 3/3 et spot ouvert, saut du spot neuf,
  aucun écran noir, pas de clipping à l'eau.

Arbitrages du bloc : les seuils se calibrent sur les vraies fenêtres
(`windows()`), « ferme sous 1 m » du brief vaut ttc 0,065 s à 10 m, sous
`perfectLo`, un smack garanti à toutes les hauteurs : la fenêtre en distance
aurait reproduit l'invariant 1 ; deux défis ouvrent, pas trois, pour que le
troisième reste un choix ; le déblocage d'un record d'avant la v4.4 évite de
reprendre à un joueur ce qu'il avait déjà.

## La v4.5 : la version sonore (05/10/2026)

Objectif du bloc 6 du brief v4 : un son qui monte avec la chute, une foule
au bord, un impact qui descend dans le corps, une manette qui vibre. Ce qui
a été livré :

- `src/audio.js` : le vent suit la vitesse de chute, le souffle s'ouvre vers
  l'aigu (300 à 1200 Hz) et un sifflement s'y ajoute au-delà des deux tiers
  de la vitesse ; la foule du bord grossit son murmure pendant l'élan, retient
  son souffle en vol, puis ovationne ou lâche un ohhh déçu une demi-seconde
  après la gerbe, dosés par la moyenne des juges (`cheer(mark, dead)`) ;
  l'impact : un sub dosé par la puissance mesurée, une claque sèche à plat,
  un clapot qui retombe, un écho court de falaise, et l'oreille étouffée sous
  l'eau une demi-seconde avant que le monde rouvre (lowpass maître
  `muffle()`) ;
- le replay rejoue le plouf mais pas la clameur : une foule ne s'excite pas
  deux fois du même saut ;
- la manette : vibration dual-rumble au décollage, à la fermeture et à l'eau
  dosée par la puissance, plus longue et plus forte à plat (`rumblePad`) ; le
  bouton muet coupe aussi la vibration, même réflexe de discrétion que le son ;
- `probe()` expose l'état posé : le harnais vérifie les règles sonores sans
  rien écouter, un contexte suspendu en headless ne change rien aux valeurs ;
- finitions : le toast des défis tick, le callout de déblocage vibre dans la
  main ;
- `tools/son.mjs` : le test du bloc, 16 portes ; `tools/bloc6-video.mjs` : la
  vidéo du bloc, qui rend visible l'invisible : un panneau « état sonore »
  incrusté dans le HUD lit `probe()` et les vibrations dual-rumble d'une
  manette simulée, barre par barre, image par image.

Mesuré et vérifié :

- `tools/son.mjs` : 16 portes PASS, jouées sans jamais écouter (murmure de
  l'élan, souffle coupé en vol, vent qui s'ouvre et siffle, sub dosé par la
  puissance, étouffement sous l'eau puis réouverture, ovation à 9,4, ohhh
  déçu sur un plat, replay sans clameur, dual-rumble aux trois moments,
  bouton muet qui coupe la manette) ;
- `check.sh` 46 OK ;
- gauntlet : 16 portes, 14 PASS, les 2 FAIL connus du VPS (manette : le
  harnais plante sous rendu lent, échec identique sur des runs antérieurs au
  bloc 6 ; hearth : aucun report.json sous swiftshader) ;
- CPU (rendu coupé) : 0,039 ms de logique par image (bloc 5 : 0,077) ;
- vidéo 20 s 1080p 30 i/s relue image par image, 4 captures : vent 1,14 à
  1330 Hz et sifflet 0,76 lus en chute, ovation 9,4 et oreille étouffée à
  l'impact, ohhh déçu et sub 0,99 au plat, aucun écran noir.

Arbitrages du bloc : la clameur part à l'instant de l'impact (la foule réagit
au saut, pas aux cartons) et l'ovation dure environ 2,7 s, elle s'éteint donc
avant la fin de la cascade des juges : le panneau de la vidéo montre cette
queue décroissante telle quelle plutôt que de tricher ; le saut de
démonstration est forcé au spot le plus haut, le seul où le sifflement parle ;
le panneau état sonore est un outil de vidéo, le jeu livré ne le porte pas.

## Mes erreurs, pour ne pas les refaire

**La crevette n'est pas un pli, c'est une boule.** J'ai lu « hands and feet meet
the water together » comme un couteau ouvert avec les membres pendants. Faux :
un døds part bras et jambes tendus et se **recroqueville** au dernier moment,
genoux dans la poitrine, talons aux fesses. Corrigé en v1.7 après retour.

**J'ai annoncé absente une écume qui existait déjà.** Avant la v1.4 j'ai dit que
la mer n'avait ni écume ni traînée de soleil. Les deux étaient dans le shader,
simplement sous dosées et coupées au `step`. Lire le code avant de décrire ce
qui manque.

**Le trou dans la carte des spots est entre 18 et 24 m**, pas entre 14 et 28 :
Blue Lagoon est déjà à 18 m. Sans objet désormais, les spots supplémentaires
sont écartés.

**Un pas de grille trop fin ne sauve pas une pose fausse.** J'ai passé du temps
sur la qualité du maillage du plongeur avant de m'apercevoir que le problème
venait des rotations. L'aperçu de poses (`tools/pose.mjs`) contre la ligne d'eau
répond en une capture.

---

## Ce qui est vérifié, et par quoi

Tout a été mesuré dans Chromium via le harnais `tools/`, jamais à l'œil seul.

- **Scoring stable depuis la v1.3** : saut piloté `autoJump 0.7 / autoTuck 0.15`
  à Lysefjord donne **690 points, PERFECT**, avec et sans ralenti.
- **Les quatre cas de timing** : 0,25 s trop tôt sur un GOOD, 0,07 s trop tard
  sur un smack, au cœur de la fenêtre sur un PERFECT, jamais refermé sans tuck.
- **La série** : trois PERFECT donnent 690, 1518, 2553 au cumul. Un run cassé au
  deuxième donne 690, 825, 1515.
- **Aucune fuite GPU** : 17 géométries stables d'un run à l'autre. Avant le
  correctif de la v1.3, c'était 67 puis 94, 121, 148, 175.
- **La fermeture** : 90 % de la pose atteints en 3 frames, soit 0,05 s et 1,3 m
  de chute.
- **Le budget par image** : environ 47 500 triangles, 16 appels de dessin.
- **Le plongeur** : 165 ms de génération une seule fois au chargement, 12 200
  triangles, géométrie mise en cache et clonée par run.

- **La v2** : `geste.mjs` (12 cas d'entrée réels, dont doigt fantôme et perte de focus
  en plein maintien), `timing.mjs` (mise = score encaissé, série comprise), `serie.mjs`,
  `leak.mjs` (géométries stables en changeant de spot), `smoke.mjs`, 37 contrôles.

## Ce qui n'est PAS vérifié

- **Personne n'a joué sur un vrai téléphone depuis la v1.4.** Tout le rendu a
  été jugé en rendu logiciel dans un conteneur. Les 165 ms de génération et les
  47 500 triangles par image sont des chiffres, pas une expérience.
- **Le rythme** du recroquevillement et du ralenti n'a jamais été jugé manette
  en main, seulement image par image.
- **Le son** n'a jamais été entendu : pas de sortie audio dans l'environnement.
- **La v2 n'a jamais tourné sur un GPU.** Les mesures de coût viennent de swiftshader,
  où une lecture de texture est chère et le calcul bon marché, l'inverse d'un téléphone.
  Seul le rapport entre versions a un sens, et il est bruité par les autres processus
  de la machine (dispersion x3 mesurée).
- **Le son de tension et le cœur** n'ont jamais été entendus non plus.

---

## Les réglages à portée de main

| Ce qu'on veut changer | Où | Valeur actuelle |
|---|---|---|
| vitesse de la fermeture | `src/game.js`, blend de `applyPose` dans la branche fermée | 34 (0,05 s). 24 pour 0,07 s, 20 pour 0,09 s |
| fenêtres de timing | `windows()` dans `src/game.js` | `perfectLo` 0,085 s, span 0,20 s |
| durée et force du ralenti | `SLOW_TTC`, `SLOW_RATE` dans `src/main.js` | 0,35 s à 35 % |
| formes d'entrée et inclinaisons | `LANDINGS` dans `src/diver.js` | crevette 1,95, balle 2,15, sans les mains 2,05 |
| silhouette du plongeur | `parts()` dans `src/diver.js` | pas de grille `STEP` 0,034, fusion `BLEND` 0,042 |
| multiplicateurs de série | `TUNING.streak` dans `src/game.js` | x1,2 à deux, x1,5 à trois |
| figures : coup sec, vrille, points | `TUNING.figures` dans `src/game.js` | `flickDelta` 1,3 en 0,2 s ; `twistRate` 6,4 rad/s ; 45 pts x sqrt(h/12), bonus vol 0,6 (max 3) |
| cadrage de l'entrée | branche `impact` de `placeCamera()` | caméra à 1,9 m, champ 52 |

---

## La suite

`ROADMAP.md` tient la v1.9 : choisir sa forme d'entrée en vol avec un scoring
par difficulté, une figure tenue pendant la chute qui doit se finir dans l'axe,
les trois notes du jury (anløp, vol, entrée), et le partage du score.

Le cap est le freestyle. Les spots supplémentaires sont écartés volontairement :
le sujet du jeu est le geste.

Restent en réserve, et bloqués pour des raisons structurelles : le mode hors
ligne (Three.js vient d'un CDN) et le classement en ligne (pas de serveur).
