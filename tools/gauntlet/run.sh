#!/bin/sh
# Gauntlet DODS 3000 : tous les etages deterministes, en une commande.
#
#   ./tools/gauntlet/run.sh            passe complete (8 a 12 min sur un Mac M1)
#   ./tools/gauntlet/run.sh rapide     sans les captures mobile ni la version bureau
#
# Sortie : tools/gauntlet/out/<horodatage>/, avec VERDICT.md qui liste chaque porte en
# PASS ou FAIL et les images a donner aux relecteurs. Les relecteurs (des agents en
# contexte frais, voir REVIEWERS.md) passent APRES : ils jugent ce que les scripts ne
# savent pas juger, et ne rejouent jamais ce que les scripts ont deja mesure.
set -u
cd "$(dirname "$0")/../.."
MODE=${1:-complet}
OUT=tools/gauntlet/out/$(date +%Y%m%d-%H%M%S)
mkdir -p "$OUT"
H=tools/gauntlet/.hearth
[ -f "$H/hearth-probe.mjs" ] || { echo "outils absents : ./tools/gauntlet/install.sh"; exit 2; }
echo "gauntlet -> $OUT"

# 1. controles statiques
./check.sh > "$OUT/1-check.txt" 2>&1; echo "1 check : $(tail -1 "$OUT/1-check.txt")"

# 2. regles de jeu, pilotees a la frame pres
for s in smoke timing geste serie leak planche; do
  ./tools/run.sh "$s.mjs" > "$OUT/2-$s.json" 2>&1
  echo "2 $s : fait"
done

# 3. joueur simule : 3 profils x 6 spots x 30 runs x 3 sauts
./tools/run.sh gauntlet/bot.mjs 30 "../$OUT/3-bot.json" > "$OUT/3-bot.txt" 2>&1
echo "3 bot : fait"

# 4. bots hearth sur une copie instrumentee, servie a part sur le port 8098
P=tools/.site-probe
rm -rf "$P" && cp -R tools/.site "$P"
cp "$H/probe-shim.js" tools/gauntlet/probe-config.js "$P/"
python3 - "$P/index.html" <<'EOF'
import sys
p = sys.argv[1]; s = open(p).read()
tag = '<script src="probe-shim.js"></script>\n<script src="probe-config.js"></script>\n<script type="module"'
s = s.replace('<script type="module"', tag, 1)
open(p, 'w').write(s)
EOF
curl -s -o /dev/null http://127.0.0.1:8098/ 2>/dev/null || (cd "$P" && nohup python3 -m http.server 8098 >/dev/null 2>&1 & sleep 1)
CHROMIUM_PATH=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"} \
  node "$H/hearth-probe.mjs" sweep --url http://127.0.0.1:8098/ --policies mash,idle,seek --seeds 3 --max-steps 300 --step-ms 60 --out "$OUT/4-hearth" --json > "$OUT/4-hearth.json" 2>&1
echo "4 hearth : fait"

# 5. captures a juger : Steam 1080p et Steam Deck en anglais, telephone et 1080p en francais
./tools/run.sh gauntlet/shots.mjs "../$OUT/5-shots/en" steam,deck en > "$OUT/5-shots-en.txt" 2>&1
if [ "$MODE" != rapide ]; then
  ./tools/run.sh gauntlet/shots.mjs "../$OUT/5-shots/fr" steam,mobile fr > "$OUT/5-shots-fr.txt" 2>&1
fi
echo "5 captures : fait"

# 6. version bureau : la vraie fenetre Electron, hors ligne
if [ "$MODE" != rapide ] && [ -d desktop/node_modules ]; then
  (cd desktop && node build.mjs stage && node smoke.mjs) > "$OUT/6-desktop.json" 2>&1
  echo "6 bureau : fait"
fi

node tools/gauntlet/verdict.mjs "$OUT"
