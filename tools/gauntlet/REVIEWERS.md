# Relecteurs du gauntlet

Les scripts (`run.sh`) mesurent ce qui se mesure. Les relecteurs jugent le reste : ce
qu'un joueur voit, comprend et ressent. Chacun est un agent en **contexte frais**, qui
n'a pas écrit le code, avec un **mandat de réfutation** : le doute vaut FAIL.

## Règles communes

- Modèle : Sonnet. Deux ou trois relecteurs à la fois, jamais plus (trois Opus en
  parallèle ont épuisé une limite de session en 5 minutes le 26/09/2026).
- Chaque relecteur reçoit : le chemin de la passe (`tools/gauntlet/out/<passe>/`), son
  `VERDICT.md`, et SA liste d'images ou de fichiers. Il lit les images une par une.
- Il ne rejoue jamais ce qu'un script a mesuré : si `VERDICT.md` dit PASS sur le timing,
  il n'en discute pas.
- Sortie imposée, un tableau : `point | PASS/FAIL | preuve (fichier + ce qu'on y voit) |
  gravité (bloquant, majeur, mineur) | correctif proposé en une ligne`.
- Un FAIL sans preuve lisible dans un fichier est rejeté par l'orchestrateur.
- La boucle s'arrête quand une passe n'a plus aucun FAIL bloquant ni majeur, ou après 3
  passes (au-delà, on remonte à Tristan ce qui résiste).

## 1. Le joueur Steam

Images : `5-shots/en/steam-*.png` dans l'ordre, puis `5-shots/en/deck-*.png`.

> Tu découvres DODS 3000 sur Steam, sur un écran 1080p à 2 m, ou sur un Steam Deck.
> Pour chaque écran : sais-tu en 5 secondes quoi faire et avec quelle touche ? Chaque
> texte est-il lisible à cette distance ? Reste-t-il du français dans la version
> anglaise ? Un élément est-il coupé, chevauché, hors de l'écran ? La hiérarchie
> visuelle guide-t-elle vers la bonne action ? L'ensemble donne-t-il envie d'acheter ?

## 2. Le QA visuel

Images : tout `5-shots/` (anglais et français, 1080p, Deck, téléphone).

> Cherche les défauts, pas les goûts : texte tronqué, chevauchement, élément hors
> cadre, image noire ou vide, incohérence entre l'état affiché et l'écran (un HUD de
> saut sur un menu), faute de frappe, accent manquant, mise en page cassée sur un
> format. Compare le même écran entre les formats.

## 3. Le game designer

Fichiers : `3-bot.txt`, `3-bot.json`, les images `*-06-vol`, `*-07-avant-eau`,
`*-09-resultat`. Référence : `reference/game-juice/SKILL.md` et `data/recipes.md`,
`reference/ccgs/balance-check.md`.

> Les profils du bot sont des hypothèses (écrites en tête de `bot.mjs`). Avec ces
> chiffres : la courbe de difficulté monte-t-elle d'un spot à l'autre ? Un débutant
> réussit-il son premier saut ? Un expert a-t-il encore quelque chose à apprendre ? Le
> retour visuel dit-il au joueur ce qu'il a raté ? Propose au plus 3 réglages chiffrés
> (constante, fichier, valeur actuelle, valeur proposée) et la mesure du bot qui doit
> bouger après.

## 4. Le release manager Steam

Dossier : `store/` à la racine du dépôt, et `desktop/`. Référence :
`reference/ccgs/release-checklist.md` (régime `steam`) et `launch-checklist.md`.

> Vérifie chaque exigence Steam avec le fichier qui la prouve : dimensions exactes de
> chaque capsule, 5 captures 1920x1080 minimum sans texte marketing, bande-annonce,
> description courte et longue en anglais, configuration requise, déclaration manette,
> scripts de dépôt SteamPipe, builds Windows, macOS et Linux présents et lancés au
> moins une fois. Sépare ce qui est prêt de ce qui ne peut se faire que depuis le
> compte Steamworks (AppID, paiement, questionnaire de contenu, revue Valve).
