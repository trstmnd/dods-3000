#!/bin/sh
# Pousse les 3 builds sur Steam (SteamPipe). A lancer par Tristan, qui tape lui-meme son
# identifiant Steamworks et son code Steam Guard : aucun script ne les stocke.
#
#   APPID=... DEPOT_WIN=... DEPOT_MAC=... DEPOT_LINUX=... STEAM_USER=... ./upload.sh [--preview]
#
# Prerequis : steamcmd (brew install --cask steamcmd, ou le SDK Steamworks), les builds
# faits par `cd desktop && node build.mjs pack`. --preview simule l'envoi sans rien pousser.
set -eu
cd "$(dirname "$0")"
: "${APPID:?AppID Steamworks}" "${DEPOT_WIN:?}" "${DEPOT_MAC:?}" "${DEPOT_LINUX:?}" "${STEAM_USER:?}"
DIST=$(cd ../../desktop/dist && pwd)
for d in "DODS 3000-win32-x64" "DODS 3000-darwin-universal" "DODS 3000-linux-x64"; do
  [ -d "$DIST/$d" ] || { echo "build absent : $DIST/$d (cd desktop && node build.mjs pack)"; exit 1; }
done
VERSION=$(node -p "require('../../desktop/package.json').version")
PREVIEW=0; [ "${1:-}" = "--preview" ] && PREVIEW=1
mkdir -p out
sed -e "s|@APPID@|$APPID|" -e "s|@VERSION@|v$VERSION|" -e "s|@OUT@|$(pwd)/out/|" -e "s|@DIST@|$DIST/|" \
    -e "s|@PREVIEW@|$PREVIEW|" -e "s|@DEPOT_WIN@|$DEPOT_WIN|" -e "s|@DEPOT_MAC@|$DEPOT_MAC|" \
    -e "s|@DEPOT_LINUX@|$DEPOT_LINUX|" app_build.vdf.in > out/app_build.vdf
# Le build part sans etre mis en ligne (SetLive vide) : on le passe sur la branche
# publique a la main dans Steamworks, apres l'avoir teste sur la branche par defaut.
steamcmd +login "$STEAM_USER" +run_app_build "$(pwd)/out/app_build.vdf" +quit
