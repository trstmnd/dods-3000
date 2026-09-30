#!/usr/bin/env bash
# Controles deterministes de DODS 3000. Aucun reseau, aucun navigateur.
# Usage : ./check.sh
set -u
cd "$(dirname "$0")"
ok=0; ko=0
t() { if eval "$2" >/dev/null 2>&1; then echo "  OK   $1"; ok=$((ok+1)); else echo "  FAIL $1"; ko=$((ko+1)); fi; }

echo "DODS 3000 - controles"

# 1. fichiers presents
for f in index.html style.css src/main.js src/game.js src/world.js src/diver.js src/spots.js src/fx.js src/audio.js src/noise.js src/i18n.js; do
  t "fichier $f" "[ -f '$f' ]"
done

# 2. syntaxe de chaque module (node lit le .mjs en module ES)
tmp=$(mktemp -d)
for f in src/*.js; do
  cp "$f" "$tmp/$(basename "$f" .js).mjs"
  t "syntaxe $f" "node --check '$tmp/$(basename "$f" .js).mjs'"
done

# 3. les 6 spots sont complets et coherents
cp src/spots.js "$tmp/spots.mjs"
t "spots complets" "node --input-type=module -e \"
  const m = await import('file://$tmp/spots.mjs');
  const need = ['id','name','place','placeEn','height','diff','platform','note','noteEn','palette'];
  const pneed = ['sky','sun','sunPos','water','deep','rock','rock2','fog','fogDensity','ambient'];
  if (m.SPOTS.length < 4) throw new Error('trop peu de spots');
  const ids = new Set();
  for (const s of m.SPOTS) {
    for (const k of need) if (s[k] === undefined) throw new Error(s.id + ' sans ' + k);
    for (const k of pneed) if (s.palette[k] === undefined) throw new Error(s.id + ' palette sans ' + k);
    if (ids.has(s.id)) throw new Error('id double ' + s.id);
    ids.add(s.id);
    if (s.height < 5 || s.height > 60) throw new Error(s.id + ' hauteur hors bornes');
    if (s.diff < 1 || s.diff > 5) throw new Error(s.id + ' difficulte hors bornes');
    if (!['board','bridge','rock','terrace'].includes(s.platform)) throw new Error(s.id + ' plateforme inconnue');
    if (!m.DIFF_LABEL[s.diff] || !m.DIFF_LABEL_EN[s.diff]) throw new Error(s.id + ' difficulte sans libelle');
  }
\""

# 3 bis. le dictionnaire i18n : memes cles en francais et en anglais, aucune valeur vide
t "i18n : memes cles en fr et en" "node --input-type=module -e \"
  const m = await import('file://$tmp/i18n.mjs');
  const f = Object.keys(m.DICT.fr).sort(), e = Object.keys(m.DICT.en).sort();
  if (f.join() !== e.join()) throw new Error('cles differentes');
  for (const l of ['fr','en']) for (const [k, v] of Object.entries(m.DICT[l])) if (!v) throw new Error(l + ' ' + k + ' vide');
\""

# 4. les fenetres de tuck restent jouables a toutes les hauteurs
cp src/game.js "$tmp/game.mjs"
t "fenetres de tuck jouables" "node --input-type=module -e \"
  const src = (await import('node:fs')).readFileSync('src/game.js','utf8');
  const m = src.match(/const perfectLo = ([0-9.]+);[\s\S]*?const perfectHi = perfectLo \+ ([0-9.]+) \* k;/);
  const e = src.match(/mapLinear\(height, 10, 34, 1\.0, ([0-9.]+)\), ([0-9.]+), 1\.05\)/);
  if (!m || !e) throw new Error('fenetres introuvables');
  const lo = +m[1], span = +m[2], kEnd = Math.max(+e[1], +e[2]);
  if (lo < 0.05 || lo > 0.12) throw new Error('perfectLo hors bornes');
  // 0,09 s au sommet : sous ce seuil un expert recentre ne tient plus (bot.mjs, 30/09)
  if (span * kEnd < 0.09) throw new Error('fenetre trop serree sur les spots hauts');
\""

# 5. le point d entree est bien cable
t "importmap three" "grep -q 'cdn.jsdelivr.net/npm/three@' index.html"
t "integrity sur three" "grep -q 'sha384-' index.html"
t "module main.js charge" "grep -q 'src/main.js' index.html"
t "un seul canvas" "[ \$(grep -c '<canvas' index.html) -eq 1 ]"

# 6. regles de style maison
t "aucun tiret cadratin" "! grep -rlP '\xe2\x80\x94' index.html style.css src/ README.md AGENTS.md ROADMAP.md JOURNAL.md tools/README.md"

# 7. le cadrage pour les agents de code est en place
t "AGENTS.md present" "[ -f AGENTS.md ]"
t "opencode.json valide" "node -e \"JSON.parse(require('fs').readFileSync('opencode.json','utf8'))\""

# 8. les invariants de la v2 : un geste, une note, une boucle sans dechets
t "une seule fonction de note (verdict et mise)" "[ \$(grep -c 'gradeAt(' src/game.js) -ge 3 ]"
t "note a l'instant du doigt (late)" "grep -q 'jump.down(late)' src/main.js && grep -q 'jump.up(late)' src/main.js"
t "parabole integree exactement" "grep -q '0.5 \\* g \\* step \\* step' src/game.js"
t "camera sans allocation par image" "! awk '/^  placeCamera\\(k\\) \\{/,/^  \\}/' src/game.js | grep -q 'new THREE'"
t "pas de backdrop-filter (flou recalcule a chaque image)" "! grep -q 'backdrop-filter:' style.css"
t "appui long sans defilement ni zoom" "grep -q 'canvas#scene{[^}]*touch-action:none' style.css"
t "repetition clavier ignoree" "grep -q 'if (e.repeat) return;' src/main.js"
t "three minifie et verifie" "grep -q 'three.module.min.js' index.html"
t "planche a pas fixe" "grep -q 'TUNING.planche.step' src/game.js"
t "rafales fixees par saut" "grep -q 'jump.reset(state.jumpIndex)' src/main.js"

# 9. la version affichee existe et est unique
t "version exposee" "grep -qE \"^export const VERSION = 'v[0-9]+\\.[0-9]+'\" src/main.js"
t "version injectee dans la page" "grep -q 'id=\"version\"' index.html"

rm -rf "$tmp"
echo
echo "  $ok OK, $ko FAIL"
[ "$ko" -eq 0 ]
