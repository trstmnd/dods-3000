---
name: gauntlet
description: Passe de verification complete de DODS 3000 avant toute livraison (preview, main, build Steam). Lance les scripts du gauntlet, lit VERDICT.md, fait juger les captures par des relecteurs en contexte frais, corrige, repasse. Trigger : "gauntlet", "verifie la version", "avant de livrer", "c'est pret pour Steam ?".
---

# Gauntlet DODS 3000

1. `./tools/gauntlet/install.sh` si `tools/gauntlet/.hearth` manque.
2. `./tools/gauntlet/run.sh` (8 a 12 min). Lire `tools/gauntlet/out/<derniere>/VERDICT.md`.
3. Tout FAIL de script se corrige AVANT de lancer un relecteur : un relecteur ne rejuge
   jamais ce qu'un script a mesure.
4. Relecteurs : `tools/gauntlet/REVIEWERS.md`. Agents Sonnet, contexte frais, 2 ou 3 a
   la fois, chacun avec SA liste d'images. Le doute vaut FAIL, un FAIL sans preuve est
   rejete.
5. Corriger les bloquants et majeurs, bumper `VERSION`, relancer depuis 2. Trois passes au
   plus : ce qui resiste remonte a Tristan en une ligne par point.
6. Consigner la passe dans `JOURNAL.md` : portes, constats, correctifs.
