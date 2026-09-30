# Kit Steam de DODS 3000

Tout ce qu'il faut pour ouvrir la page Steam et pousser le jeu, sauf ce qui ne peut se
faire que depuis le compte Steamworks de Tristan.

## Ce qui se régénère d'une commande

| Pièce | Commande | Sortie |
|---|---|---|
| Capsules, héros, logo, fond, icône | `./tools/run.sh gauntlet/store.mjs <dossier>` | 9 PNG aux dimensions exactes de Steamworks |
| Captures d'écran | `./tools/run.sh gauntlet/shots.mjs <dossier> steam en` | 10 PNG 1920x1080, en jeu, interface en anglais |
| Bande-annonce | `./tools/run.sh gauntlet/trailer.mjs <fichier.mp4> en` | 28 s, H.264 1080p 30 i/s, sans son |
| Builds | `cd desktop && node build.mjs pack` | `desktop/dist/` : Windows x64, macOS universel, Linux x64 |
| Icônes de l'application | `cd desktop && ./icons.sh` | `desktop/icons/` : icns, ico, png |

Rien de tout ça n'est versionné : le dépôt ne porte aucun binaire.

| Visuel Steamworks | Taille | Fichier |
|---|---|---|
| Header capsule | 920x430 | header_capsule.png |
| Small capsule | 462x174 | small_capsule.png |
| Main capsule | 1232x706 | main_capsule.png |
| Vertical capsule | 748x896 | vertical_capsule.png |
| Library capsule | 600x900 | library_capsule.png |
| Library hero (sans texte) | 3840x1240 | library_hero.png |
| Library logo (transparent) | 1280x720 | library_logo.png |
| Page background | 1438x810 | page_background.png |
| Icône | 1024 source, 184 et 32 à dériver | icon_1024.png |

## Textes

`description.md` : description courte et longue en anglais et en français, tags,
configuration requise. `achievements.md` : les 9 succès, identifiants à reprendre tels quels.

## Ce qui reste à faire dans Steamworks (Tristan)

1. Ouvrir le compte Steamworks et payer Steam Direct (100 USD par jeu, récupérés après 1 000 USD de ventes).
2. Créer l'app : noter l'AppID et les 3 DepotID (Windows, macOS, Linux).
3. Poser l'AppID dans `desktop/steam.json` (`"appId"`), relancer `node build.mjs pack`.
4. Remplir la page avec `description.md`, téléverser les visuels, les captures et la bande-annonce.
5. Déclarer les succès de `achievements.md`, prix, questionnaire de contenu, date « Coming Soon ».
6. `store/steampipe/upload.sh` avec son identifiant (il tape lui-même mot de passe et Steam Guard), puis passer le build en ligne sur la branche par défaut.
7. Envoyer la page puis le build en revue Valve (quelques jours chacun). La page doit rester en « Coming Soon » au moins 2 semaines avant la sortie.

## Limites connues

- **Aucun build n'a encore tourné sous le client Steam** : l'AppID n'existe pas. Le pont
  (`desktop/main.cjs`) initialise steamworks.js seulement si un AppID est posé, et le jeu
  tourne pareil sans lui.
- **Windows et Linux ne sont pas lancés** : ils sont construits sur un Mac. Premier test à
  faire sur un PC ou un Steam Deck.
- **macOS non signé, non notarié** : Steam ne pose pas de quarantaine sur ce qu'il
  télécharge, mais un .app transmis à la main sera bloqué par Gatekeeper. La notarisation
  demande un compte Apple Developer (99 USD par an).
- **La bande-annonce est muette** : le son du jeu est synthétisé en direct et ne passe pas
  par la capture.
