# Succès Steam

À déclarer dans Steamworks, Stats et succès, avec l'identifiant EXACT de la première colonne :
c'est celui que le jeu envoie (`src/platform.js`). Icône 64x64 JPG par succès, obtenu et non obtenu.

| Identifiant | Nom EN | Description EN | Nom FR | Description FR |
|---|---|---|---|---|
| FIRST_JUMP | First Drop | Finish your first jump. | Premier saut | Termine ton premier saut. |
| FIRST_PERFECT | Perfect Døds | Land a PERFECT DØDS. | Døds parfait | Réussis un PERFECT DØDS. |
| PLANK_PERFECT | Stiff as a Plank | Hold a perfect plank for a whole fall. | Raide comme une planche | Tiens une planche parfaite pendant toute une chute. |
| BELLY_FLOP | Belly First | Hit the water flat. It happens. | Ventre d'abord | Touche l'eau à plat. Ça arrive. |
| STREAK_3 | Triple | Chain three GREAT or better in one run. | Triplé | Enchaîne trois GREAT ou mieux dans un run. |
| HIGH_PERFECT | Fjord Master | Land a PERFECT DØDS from 34 m. | Maître du fjord | Réussis un PERFECT DØDS depuis 34 m. |
| ALL_SPOTS | World Tour | Jump from all six spots. | Tour du monde | Saute depuis les six spots. |
| RUN_5000 | Five Grand | Score 5,000 points in a single run. | Cinq mille | Marque 5 000 points en un seul run. |
| TOTAL_20000 | Legend | Reach 20,000 points across your spot records. | Légende | Atteins 20 000 points en cumulant tes records. |

Les seuils 5 000 et 20 000 sont calés sur le joueur simulé (`tools/gauntlet/bot.mjs`) : un joueur régulier dépasse 5 000 sur les spots hauts, 20 000 demande des records partout.
