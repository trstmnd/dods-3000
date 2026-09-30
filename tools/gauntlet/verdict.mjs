// Lit les sorties d'une passe du gauntlet et ecrit VERDICT.md : une porte par ligne, PASS,
// FAIL ou WARN. FAIL bloque une livraison. WARN est un signal de design a faire juger par
// un relecteur : un script ne decide pas si un jeu est trop facile.
//   node tools/gauntlet/verdict.mjs tools/gauntlet/out/<passe>
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT || !fs.existsSync(OUT)) { console.log('usage : verdict.mjs <dossier de passe>'); process.exit(2); }
const read = f => { try { return fs.readFileSync(path.join(OUT, f), 'utf8'); } catch { return null; } };
const json = f => { const s = read(f); if (!s) return null; const i = s.indexOf('{'); try { return JSON.parse(s.slice(i)); } catch { return null; } };
const gates = [];
const gate = (etage, nom, etat, detail) => gates.push({ etage, nom, etat, detail });

// 1. check.sh
const chk = read('1-check.txt') || '';
const m = chk.match(/(\d+) OK, (\d+) FAIL/);
gate('1', 'check.sh', m && m[2] === '0' ? 'PASS' : 'FAIL', m ? `${m[1]} OK, ${m[2]} FAIL` : 'sortie illisible');

// 2. scenarios du harnais
for (const s of ['smoke', 'timing', 'geste', 'serie', 'leak', 'planche']) {
  const raw = read(`2-${s}.json`);
  if (raw == null) { gate('2', s, 'FAIL', 'absent'); continue; }
  const crash = /^\s*(Error|TypeError|ReferenceError|page\.|browserType\.)/m.test(raw);
  const errs = /"(erreurs|errs)":\s*\[\s*"/.test(raw);
  const ko = /"(tousOk|ok)":\s*false/.test(raw);
  gate('2', s, crash || errs || ko ? 'FAIL' : 'PASS', crash ? 'le scenario a plante' : errs ? 'erreurs console' : ko ? 'un cas a echoue' : 'ok');
}

// 3. joueur simule : accessibilite, plafond de maitrise, courbe de difficulte
const bot = json('3-bot.json');
if (!bot) gate('3', 'bot', 'FAIL', 'absent ou illisible');
else {
  const r = bot.resultats, ids = Object.keys(r.debutant);
  gate('3', 'bot sans erreur', bot.erreurs.length ? 'FAIL' : 'PASS', bot.erreurs.length ? bot.erreurs[0] : `${bot.runsParSpot} runs x ${ids.length} spots x 3 profils`);
  const first = r.debutant[ids[0]];
  const echec = first.smack + first.chute;
  gate('3', 'debutant, 1er spot : smack + chute <= 25 %', echec <= 25 ? 'PASS' : 'WARN', `${echec} %`);
  const last = r.expert[ids[ids.length - 1]];
  gate('3', 'expert, dernier spot : PERFECT <= 85 % (marge de maitrise)', last.perfect <= 85 ? 'PASS' : 'WARN', `${last.perfect} % de PERFECT`);
  const reg = ids.map(id => r.regulier[id].perfect);
  gate('3', 'regulier : PERFECT baisse du 1er au dernier spot', reg[reg.length - 1] < reg[0] ? 'PASS' : 'WARN', reg.join(' > ') + ' %');
  const spread = ids.map(id => r.expert[id].scoreMoyen);
  gate('3', 'expert : score moyen monte avec la hauteur', spread.every((v, i) => !i || v >= spread[i - 1] * 0.95) ? 'PASS' : 'WARN', spread.join(' < '));
}

// 4. hearth-probe
const h = json('4-hearth.json');
if (!h) gate('4', 'hearth sweep', 'FAIL', 'absent ou illisible');
else {
  const txt = JSON.stringify(h);
  const findings = (h.result && (h.result.findings || h.result.report?.findings)) || h.findings || [];
  const bad = findings.filter(f => /crash|black|unresponsive|error/i.test(JSON.stringify(f)));
  gate('4', 'hearth : aucun crash, ecran noir ni jeu fige', h.ok === false ? 'FAIL' : bad.length ? 'FAIL' : 'PASS',
    h.ok === false ? (h.error?.message || txt.slice(0, 160)) : `${findings.length} constats, ${bad.length} graves`);
}

// 5. captures
const shots = [];
const walk = d => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else shots.push(p); } };
walk(path.join(OUT, '5-shots'));
const pngs = shots.filter(f => f.endsWith('.png'));
const errFiles = shots.filter(f => f.endsWith('erreurs.txt'));
gate('5', 'captures sans erreur console', errFiles.length ? 'FAIL' : pngs.length ? 'PASS' : 'FAIL', `${pngs.length} images, ${errFiles.length} fichiers d'erreurs`);

// 6. bureau
const dk = json('6-desktop.json');
if (dk) gate('6', 'bureau : Electron hors ligne, sans erreur', dk.ok ? 'PASS' : 'FAIL', dk.ok ? `${dk.taille.join('x')}, Steam ${dk.steam && dk.steam.on ? 'actif' : 'absent (normal hors Steam)'}` : JSON.stringify(dk.erreurs || dk).slice(0, 160));

const fails = gates.filter(g => g.etat === 'FAIL').length, warns = gates.filter(g => g.etat === 'WARN').length;
const md = [
  `# Verdict du gauntlet : ${fails ? 'FAIL' : 'PASS'}`, '',
  `${gates.length} portes, ${fails} FAIL, ${warns} WARN. Passe : \`${OUT}\`.`, '',
  '| Etage | Porte | Etat | Detail |', '|---|---|---|---|',
  ...gates.map(g => `| ${g.etage} | ${g.nom} | ${g.etat} | ${String(g.detail).replace(/\|/g, '/')} |`), '',
  '## Images pour les relecteurs', '',
  ...pngs.map(p => `- ${path.relative(OUT, p)}`), ''
].join('\n');
fs.writeFileSync(path.join(OUT, 'VERDICT.md'), md);
console.log(md.split('\n').slice(0, 6 + gates.length).join('\n'));
process.exitCode = fails ? 1 : 0;
