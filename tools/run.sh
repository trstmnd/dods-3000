#!/bin/sh
# Lance un scenario du harnais contre une copie servie en local.
#
#   ./tools/run.sh timing.mjs
#   ./tools/run.sh entree.mjs 0.15 crevette
#
# Le jeu est servi sur le port 8099 depuis tools/.site, une copie du depot. Si
# tools/vendor/three.module.js existe, l'importmap est reecrit vers cette copie
# locale : c'est indispensable dans un environnement ou le CDN est bloque, et
# sans effet ailleurs. Voir tools/README.md.
set -e
cd "$(dirname "$0")/.."
SITE=tools/.site
mkdir -p "$SITE"
cp index.html style.css "$SITE/"
mkdir -p "$SITE/src" && cp src/*.js "$SITE/src/"
if [ -f tools/vendor/three.module.js ]; then
  mkdir -p "$SITE/vendor" && cp tools/vendor/three.module.js "$SITE/vendor/"
  python3 - "$SITE/index.html" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r'https://[^"]*three[^"]*\.js', './vendor/three.module.js', s)
open(p, 'w').write(s)
PY
fi
curl -s --noproxy '*' -o /dev/null http://127.0.0.1:8099/ 2>/dev/null || \
  (cd "$SITE" && nohup python3 -m http.server 8099 >/dev/null 2>&1 & sleep 1)
cd tools && node "$@"
