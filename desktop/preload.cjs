// Pont minimal entre le jeu et la fenetre : quitter, plein ecran, succes Steam. Le jeu web
// teste `window.dodsDesktop` : absent dans un navigateur, il ne fait rien de plus.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dodsDesktop', {
  quit: () => ipcRenderer.invoke('dods:quit'),
  fullscreen: on => ipcRenderer.invoke('dods:fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('dods:isFullscreen'),
  steam: () => ipcRenderer.invoke('dods:steam'),
  achieve: id => ipcRenderer.invoke('dods:achieve', id),
  onFullscreen: fn => ipcRenderer.on('fullscreen', (_, on) => fn(on))
});
