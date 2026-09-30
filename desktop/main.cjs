// DODS 3000, version bureau (Steam). Une fenetre Electron qui sert le jeu web tel quel,
// sans reseau : Three.js est copie dans app/vendor par build.mjs, et le jeu est servi par
// un protocole app:// (les modules ES refusent file://).
//
// Steam est optionnel : si steamworks.js se charge et que le client Steam tourne, les
// succes remontent. Sinon le jeu tourne pareil, hors Steam (itch.io, test local).
const { app, BrowserWindow, protocol, net, ipcMain, Menu, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'app');
const CONF = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'steam.json'), 'utf8')); } catch { return {}; } })();
// L'AppID reel se pose dans steam.json apres creation de la fiche Steamworks. 480 est
// l'application de test publique de Valve (Spacewar), utilisable par tout developpeur.
const APP_ID = Number(process.env.SteamAppId || CONF.appId || 0);

// Le sandbox SUID de Chromium n'existe pas dans le runtime Linux de Steam (Steam Deck).
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');
// Le jeu regle lui-meme sa definition : on ne laisse pas le systeme lisser les images.
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let steam = null;
function initSteam() {
  if (!APP_ID || process.env.DODS_NO_STEAM) return;
  try {
    const sw = require('steamworks.js');
    steam = sw.init(APP_ID);
    if (CONF.overlay) sw.electronEnableSteamOverlay();
    console.log('[steam] ok, joueur :', steam.localplayer.getName());
  } catch (e) {
    steam = null;
    console.log('[steam] indisponible :', e.message);
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
]);

// Reglages d'affichage gardes entre deux lancements (plein ecran ou fenetre).
const PREFS = path.join(app.getPath('userData'), 'desktop.json');
const prefs = (() => { try { return JSON.parse(fs.readFileSync(PREFS, 'utf8')); } catch { return { fullscreen: true }; } })();
const savePrefs = () => { try { fs.writeFileSync(PREFS, JSON.stringify(prefs)); } catch {} };

let win = null;
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1600, width), height: Math.min(900, height),
    minWidth: 960, minHeight: 540,
    backgroundColor: '#0a1a2b',
    // DODS_WINDOWED : les tests ouvrent une fenetre, jamais le plein ecran de la machine.
    fullscreen: process.env.DODS_WINDOWED ? false : !!prefs.fullscreen,
    title: 'DODS 3000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.on('enter-full-screen', () => { prefs.fullscreen = true; savePrefs(); win.webContents.send('fullscreen', true); });
  win.on('leave-full-screen', () => { prefs.fullscreen = false; savePrefs(); win.webContents.send('fullscreen', false); });
  // Aucun lien sortant ne doit ouvrir une fenetre dans le jeu.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const alt = input.alt || input.meta;
    if (input.key === 'F11' || (alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (process.env.DODS_DEVTOOLS && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.loadURL('app://dods/index.html');
}

ipcMain.handle('dods:quit', () => app.quit());
ipcMain.handle('dods:fullscreen', (_, on) => { if (win) win.setFullScreen(on === undefined ? !win.isFullScreen() : !!on); return win ? win.isFullScreen() : false; });
ipcMain.handle('dods:isFullscreen', () => (win ? win.isFullScreen() : false));
ipcMain.handle('dods:steam', () => ({ on: !!steam, name: steam ? steam.localplayer.getName() : null }));
ipcMain.handle('dods:achieve', (_, id) => {
  if (!steam || typeof id !== 'string') return false;
  try { return steam.achievement.activate(id); } catch (e) { console.log('[steam] succes', id, e.message); return false; }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT)) return new Response('interdit', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  initSteam();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
