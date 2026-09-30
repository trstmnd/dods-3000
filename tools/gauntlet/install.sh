#!/bin/sh
# Installe les outils du gauntlet, une fois par machine. Rien n'entre dans le jeu livre.
#
#   1. Playwright et Three.js pour le harnais (tools/node_modules, tools/vendor)
#   2. hearth-probe v1.9.0 (github.com/echoo19/hearth, MIT) : des bots qui jouent au jeu
#      dans un vrai Chromium et signalent ecran noir, crash, blocage, jeu qui ne repond plus.
#      Binaires de la release verifies par leur empreinte SHA-256.
#   3. Electron et l'empaqueteur pour la version bureau (desktop/node_modules)
set -eu
cd "$(dirname "$0")/.."
[ -f package.json ] || npm init -y >/dev/null
npm i -s playwright three@0.170.0
mkdir -p vendor && cp node_modules/three/build/three.module.min.js vendor/

H=gauntlet/.hearth
mkdir -p "$H"
REL=https://github.com/echoo19/hearth/releases/download/v1.9.0
while read -r sum f; do
  [ -f "$H/$f" ] || curl -sfL -o "$H/$f" "$REL/$f"
  echo "$sum  $H/$f" | shasum -a 256 -c - >/dev/null || { echo "empreinte fausse : $f"; rm -f "$H/$f"; exit 1; }
done <<'EOF'
dbde70503fb9583f25bad3b1f65f41763b5752bc0b985edc8c0f4bf1ed0590a1 hearth-probe.mjs
a3c2210da372d836d1276258446432fdc7358b64c3d93b8ba9f7f10b7acb69f0 hearth-probe-mcp.mjs
fff42408019cdcc64b0bc26022883fe565c2ebb3e5935bc9ff7405d6e56db194 probe-shim.js
EOF
# hearth charge playwright-core a cote de lui, il n'est pas embarque dans le bundle
(cd "$H" && [ -f package.json ] || (cd "$H" && npm init -y >/dev/null)) && (cd "$H" && npm i -s playwright-core@1.61)

(cd ../desktop && npm i)
echo "gauntlet installe"
