# Succès Steam

À déclarer dans Steamworks, Stats et succès, avec l'identifiant EXACT de la première colonne :
c'est celui que le jeu envoie (`src/platform.js`). Icônes 256x256 JPG, obtenue et non obtenue, rendues par `tools/gauntlet/store.mjs` (dossier `achievements/`).

| Identifiant | Nom EN | Description EN | Nom FR | Description FR |
|---|---|---|---|---|
| FIRST_JUMP | First Drop | Finish your first jump. | Premier saut | Termine ton premier saut. |
| FIRST_PERFECT | Perfect Døds | Land a PERFECT DØDS. | Døds parfait | Réussis un PERFECT DØDS. |
| PLANK_PERFECT | Stiff as a Plank | Hold a perfect plank for a whole fall. | Raide comme une planche | Tiens une planche parfaite pendant toute une chute. |
| BELLY_FLOP | Belly First | Hit the water flat. It happens. | Ventre d'abord | Touche l'eau à plat. Ça arrive. |
| STREAK_3 | Triple | Chain three GREAT or better in one run. | Triplé | Enchaîne trois GREAT ou mieux dans un run. |
| HIGH_PERFECT | Fjord Master | Land a PERFECT DØDS from 34 m. | Maître du fjord | Réussis un PERFECT DØDS depuis 34 m. |
| ALL_SPOTS | World Tour | Jump from all six spots. | Tour du monde | Saute depuis les six spots. |
| RUN_8000 | Eight Grand | Score 8,000 points in a single run. | Huit mille | Marque 8 000 points en un seul run. |
| TOTAL_30000 | Legend | Reach 30,000 points across your spot records. | Légende | Atteins 30 000 points en cumulant tes records. |

Les seuils sont calés sur le joueur simulé (`tools/gauntlet/bot.mjs`, v3.2) : 8 000 en un run, c'est 70 % des runs d'un expert à Lysefjord et 8 % de ceux d'un joueur régulier ; 30 000 en cumulé demande des records d'expert sur plusieurs spots.
