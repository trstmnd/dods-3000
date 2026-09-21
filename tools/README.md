# Harnais de test

Pilotage du jeu dans un vrai Chromium, pour vérifier une règle de jeu ou juger
une image plutôt que de faire relire le code à un modèle. C'est l'outil qui a
servi à toutes les mesures citées dans `JOURNAL.md`.

## Installer

```bash
cd tools && npm init -y && npm i playwright
```

Chromium est déjà présent dans l'environnement cloud sous
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Ailleurs, pointer la
variable `CHROME` sur un binaire Chrome ou Chromium :

```bash
CHROME=/usr/bin/chromium ./tools/run.sh timing.mjs
```

Si le CDN est bloqué (c'est le cas dans les sessions cloud), récupérer Three.js
une fois pour toutes :

```bash
cd tools && npm i three@0.170.0
mkdir -p vendor && cp node_modules/three/build/three.module.js vendor/
```

`run.sh` réécrit alors l'importmap vers cette copie. Sans ce fichier, la page
est servie telle quelle et va chercher Three.js sur jsDelivr.

## Les scénarios

| Script | Ce qu'il répond |
|---|---|
| `timing.mjs` | les quatre cas de fermeture donnent-ils le bon verdict et le bon score |
| `serie.mjs` | le multiplicateur de série compte-t-il juste sur deux runs |
| `leak.mjs` | le nombre de géométries GPU reste-t-il stable run après run |
| `vitesse.mjs` | combien de temps et de mètres prend le recroquevillement |
| `entree.mjs <ttc> <nom>` | suite d'images autour de l'entrée dans l'eau |
| `pose.mjs "shrimp:1.95,bullet:2.15"` | une pose donnée, contre la ligne d'eau |
| `vues.mjs` | les quatre cadrages de référence du jeu |
| `profil.mjs` | triangles et appels de dessin par spot |
| `smoke.mjs` | pause, coupure du son, rechargement |

Les captures sortent dans `tools/`. Elles ne sont pas versionnées.

## Pourquoi ne pas s'en passer

`requestAnimationFrame` est ralenti dès que l'onglet passe en arrière plan, donc
tout test asynchrone ment sur le timing. Les scénarios pilotent la simulation
frame par frame avec `__dods.tick()`, ce qui donne des chiffres reproductibles.
