#!/bin/sh
# Lance un scenario du harnais contre une copie servie en local.
#
#   ./tools/run.sh timing.mjs
#   ./tools/run.sh entree.mjs 0.15 crevette
#
# Le jeu est servi sur le port 8099 depuis tools/.site, une copie du depot. Si
# tools/vendor/ contient le module three reclame par l'importmap, l'importmap est
# reecrit vers cette copie locale : c'est indispensable dans un environnement ou
# le CDN est bloque, et sans effet ailleurs. Voir tools/README.md.
set -e
cd "$(dirname "$0")/.."
SITE=tools/.site
mkdir -p "$SITE"
cp index.html style.css "$SITE/"
mkdir -p "$SITE/src" && cp src/*.js "$SITE/src/"
# La copie locale porte le nom exact du fichier que l'importmap reclame
# (three.module.min.js depuis la v2.0) : le hash d'integrity doit correspondre
# octet pour octet, sinon le navigateur refuse le module.
if ls tools/vendor/three.module*.js >/dev/null 2>&1; then
  mkdir -p "$SITE/vendor" && cp tools/vendor/three.module*.js "$SITE/vendor/"
  # les addons (Water, post-traitement) : miroir local de examples/jsm, sinon le CDN
  if [ -d tools/vendor/jsm ]; then cp -R tools/vendor/jsm "$SITE/vendor/"; fi
  python3 -c '
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r"https://[^\"]*/(three[^\"/]*\.js)", r"./vendor/\1", s)
s = re.sub(r"https://cdn\.jsdelivr\.net/npm/three@[0-9.]+/examples/jsm/", "./vendor/jsm/", s)
open(p, "w").write(s)
' "$SITE/index.html"
fi
curl -s --noproxy '*' -o /dev/null http://127.0.0.1:8099/ 2>/dev/null || \
  (cd "$SITE" && nohup python3 -m http.server 8099 >/dev/null 2>&1 & sleep 1)
cd tools && node "$@"
