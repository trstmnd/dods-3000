# Gauntlet DODS 3000

La boucle qui vérifie une version avant de la livrer : des scripts qui jouent au jeu et
mesurent, puis des relecteurs IA en contexte frais qui jugent ce que les scripts ne savent
pas juger. On corrige, on repasse, jusqu'à zéro défaut bloquant ou majeur (3 passes au plus).

## Installer (une fois par machine)

```bash
./tools/gauntlet/install.sh
```

## Lancer une passe

```bash
./tools/gauntlet/run.sh
```

8 à 12 minutes sur un Mac M1. Tout sort dans `tools/gauntlet/out/<horodatage>/`, avec
`VERDICT.md` en tête : chaque porte en PASS, FAIL ou WARN, puis la liste des images.

| Étage | Ce qui tourne | Ce qu'il prouve |
|---|---|---|
| 1 | `check.sh` | fichiers, syntaxe, spots, traductions EN et FR complètes |
| 2 | les scénarios de `tools/` + `manette.mjs` | règles de jeu à la frame près, geste, série, fuites GPU, planche, tout le jeu au clavier seul puis à la manette seule |
| 3 | `bot.mjs` | 1 620 sauts joués par 3 profils humains simulés : accessibilité, marge de maîtrise, courbe de difficulté |
| 4 | hearth-probe | des bots qui martèlent, attendent et visent l'eau dans un vrai Chromium : écran noir, crash, jeu figé, contrôle sans effet |
| 5 | `shots.mjs` | chaque écran et chaque instant du saut en 1920x1080, 1280x800 (Steam Deck) et téléphone, en anglais et en français |
| 6 | `desktop/smoke.mjs` | la vraie fenêtre Electron, hors ligne, sans erreur |
| 7 | relecteurs (`REVIEWERS.md`) | joueur Steam, QA visuel, game designer, release manager |

## Les outils retenus, et pourquoi

Recherche GitHub du 30/09/2026, 10 dépôts clonés et lus.

| Outil | Rôle ici | Pourquoi lui |
|---|---|---|
| [hearth-probe](https://github.com/echoo19/hearth) v1.9.0 (MIT) | étage 4 | seul outil trouvé qui **joue** à un jeu web sans rien lui demander, avec des détecteurs éprouvés (286 fichiers de test). Branché par `probe-config.js`, injecté dans une copie servie à part : le jeu livré n'en porte rien. |
| [Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) (25 500 étoiles, MIT) | checklists des relecteurs | la référence du process de studio par agents. Pris en partie seulement (`reference/ccgs/`) : ses 49 agents visent Godot, Unity et Unreal et demandent une validation humaine à chaque étape, l'inverse d'une boucle autonome. |
| [game-juice](https://github.com/jayesh-bansal/game-juice) | grille du game designer | 10 règles de ressenti chiffrées, sans moteur. |
| [steamworks.js](https://github.com/ceifa/steamworks.js) 0.4.0 (MIT) | succès Steam dans `desktop/` | binaires précompilés et SDK Valve inclus : marche sans compte Steamworks. Alternative maintenue, [steamworks-ffi-node](https://github.com/ArtyProf/steamworks-ffi-node), qui exige le SDK téléchargé depuis le compte partenaire : à reprendre une fois le compte ouvert. |

Écartés : wai-play et Game-qa-Agent (aucune licence, LLM payants DeepSeek ou OpenAI, pilotage par sélecteurs DOM), ai-playtest (jeux au tour par tour, OpenRouter payant), OpenCodeGameStudios (OpenCode, pas Claude Code), AlterLab GameForge (redite de CCGS, moins mûr).

## Ce que le bot ne dit pas

Les profils de `bot.mjs` sont des hypothèses sur le temps de réaction humain, pas des
mesures de vrais joueurs. Ils servent à comparer deux versions et à voir une marche de
difficulté absurde. Un vrai test manette en main reste irremplaçable.
