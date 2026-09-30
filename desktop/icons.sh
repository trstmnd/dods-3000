#!/bin/sh
# Icones de l'application, rendues par le jeu (tools/gauntlet/store.mjs) puis converties :
# icns pour macOS (iconutil), ico pour Windows et png pour Linux (ffmpeg, sips). Jamais
# versionnees : le depot ne porte aucun binaire, on les regenere.
set -eu
cd "$(dirname "$0")"
T=$(mktemp -d)
(cd .. && ./tools/run.sh gauntlet/store.mjs "$T/store" >/dev/null)
S="$T/store/icon_1024.png"
mkdir -p icons "$T/i.iconset"
for sz in 16 32 128 256 512; do
  sips -z $sz $sz "$S" --out "$T/i.iconset/icon_${sz}x${sz}.png" >/dev/null
  d=$((sz * 2)); sips -z $d $d "$S" --out "$T/i.iconset/icon_${sz}x${sz}@2x.png" >/dev/null
done
iconutil -c icns "$T/i.iconset" -o icons/icon.icns
sips -z 512 512 "$S" --out icons/icon.png >/dev/null
ffmpeg -loglevel error -y -i "$S" -vf scale=256:256 icons/icon.ico
rm -rf "$T"
echo "icones : $(ls icons | tr '\n' ' ')"
