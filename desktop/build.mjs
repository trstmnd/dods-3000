// Prepare et empaquette la version bureau de DODS 3000.
//
//   node build.mjs stage          copie le jeu dans app/, Three.js en local, sans reseau
//   node build.mjs pack [cibles]  stage puis builds dans dist/ (defaut : les 4 cibles Steam)
//                                 cibles : darwin-arm64,darwin-x64,win32-x64,linux-x64
//
// Le jeu web ne change pas : c'est ici que l'importmap est reecrite vers la copie locale de
// Three.js. Le hash d'integrity reste celui du web, et on verifie que les octets copies le
// respectent : sinon le navigateur refuserait le module et l'ecran resterait noir.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const APP = path.join(HERE, 'app');
const cmd = process.argv[2] || 'stage';

function stage() {
  fs.rmSync(APP, { recursive: true, force: true });
  fs.mkdirSync(path.join(APP, 'src'), { recursive: true });
  fs.mkdirSync(path.join(APP, 'vendor'), { recursive: true });
  for (const f of ['index.html', 'style.css']) fs.copyFileSync(path.join(REPO, f), path.join(APP, f));
  for (const f of fs.readdirSync(path.join(REPO, 'src'))) if (f.endsWith('.js')) fs.copyFileSync(path.join(REPO, 'src', f), path.join(APP, 'src', f));

  let html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const m = html.match(/"three":\s*"(https:[^"]+\/(three[^"/]*\.js))"/);
  if (!m) throw new Error('importmap de three introuvable dans index.html');
  const [, url, file] = m;
  const version = url.match(/three@([\d.]+)/)[1];
  const integ = html.match(new RegExp(`"${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}":\\s*"(sha384-[^"]+)"`));
  const src = path.join(HERE, 'node_modules', 'three', 'build', file);
  if (!fs.existsSync(src)) throw new Error(`three ${version} absent : npm i -D three@${version} dans desktop/`);
  const buf = fs.readFileSync(src);
  const got = 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
  if (integ && integ[1] !== got) throw new Error(`three copie != integrity de index.html (${got})`);
  fs.writeFileSync(path.join(APP, 'vendor', file), buf);
  html = html.split(url).join(`./vendor/${file}`);
  fs.writeFileSync(path.join(APP, 'index.html'), html);
  const n = fs.readdirSync(path.join(APP, 'src')).length;
  console.log(`stage : ${n} modules, three ${version} local (${(buf.length / 1024).toFixed(0)} Ko), integrity verifiee`);
}

// La bibliotheque Steam doit etre a cote de l'executable, pas seulement dans node_modules.
const STEAM_LIB = {
  'win32-x64': ['win64/steam_api64.dll', '.'],
  'linux-x64': ['linux64/libsteam_api.so', '.'],
  'darwin-arm64': ['osx/libsteam_api.dylib', 'DODS 3000.app/Contents/MacOS'],
  'darwin-x64': ['osx/libsteam_api.dylib', 'DODS 3000.app/Contents/MacOS']
};

async function pack(targets) {
  stage();
  const { packager } = await import('@electron/packager');
  const out = path.join(HERE, 'dist');
  const icons = path.join(HERE, 'icons');
  const results = [];
  for (const t of targets) {
    const [platform, arch] = t.split('-');
    const icon = platform === 'darwin' ? path.join(icons, 'icon.icns') : platform === 'win32' ? path.join(icons, 'icon.ico') : path.join(icons, 'icon.png');
    const opts = {
      dir: HERE, out, platform, arch, overwrite: true, prune: true,
      name: 'DODS 3000', executableName: platform === 'linux' ? 'dods3000' : 'DODS 3000',
      appBundleId: 'co.monod.dods3000', appCategoryType: 'public.app-category.sports-games',
      appCopyright: 'Tristan Monod', appVersion: JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'))).version,
      win32metadata: { CompanyName: 'Tristan Monod', ProductName: 'DODS 3000', FileDescription: 'DODS 3000' },
      asar: { unpack: '**/node_modules/steamworks.js/dist/**' },
      ignore: [/^\/dist/, /^\/node_modules\/(@types|undici-types|playwright-core)(\/|$)/, /^\/icons\.sh$/, /^\/build\.mjs$/, /^\/smoke\.mjs$/, /^\/icons\/src/, /^\/node_modules\/(electron|@electron|three)(\/|$)/, /\.map$/]
    };
    if (fs.existsSync(icon)) opts.icon = icon;
    try {
      const [dir] = await packager(opts);
      const [lib, dest] = STEAM_LIB[t];
      const from = path.join(HERE, 'node_modules', 'steamworks.js', 'dist', lib);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, dest, path.basename(lib)));
      pruneLocales(dir, platform);
      results.push({ cible: t, dossier: path.relative(HERE, dir), taille: du(dir) });
    } catch (e) {
      results.push({ cible: t, erreur: e.message.split('\n')[0] });
    }
  }
  console.log(JSON.stringify(results, null, 1));
  if (results.some(r => r.erreur)) process.exitCode = 1;
}

// Chromium embarque 55 langues d'interface (48 Mo) : le jeu n'en parle que 2.
const KEEP = ['en-US', 'en-GB', 'fr'];
function pruneLocales(dir, platform) {
  if (platform === 'darwin') {
    const res = path.join(dir, 'DODS 3000.app/Contents/Frameworks/Electron Framework.framework/Resources');
    if (!fs.existsSync(res)) return;
    for (const f of fs.readdirSync(res)) if (f.endsWith('.lproj') && !KEEP.some(k => f === k.replace('-', '_') + '.lproj' || f === k + '.lproj' || f === 'en.lproj')) fs.rmSync(path.join(res, f), { recursive: true, force: true });
    return;
  }
  const loc = path.join(dir, 'locales');
  if (!fs.existsSync(loc)) return;
  for (const f of fs.readdirSync(loc)) if (!KEEP.includes(f.replace('.pak', ''))) fs.rmSync(path.join(loc, f));
}

function du(dir) {
  try { return execFileSync('du', ['-sh', dir]).toString().split('\t')[0]; } catch { return '?'; }
}

if (cmd === 'stage') stage();
else if (cmd === 'pack') await pack((process.argv[3] || 'darwin-arm64,darwin-x64,win32-x64,linux-x64').split(','));
else { console.log('usage : node build.mjs stage|pack [cibles]'); process.exitCode = 2; }
