'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Рендерер сообщает main, что идёт длительный процесс
// (processing / export / regenerate). Main использует флаг
// при закрытии окна и Cmd+Q.
contextBridge.exposeInMainWorld('desktopShell', {
  setAppBusy: (busy) => {
    ipcRenderer.send('app:set-busy', Boolean(busy));
  },
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  onUpdateDownloadEnded: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update-download:ended', handler);
    return () => ipcRenderer.removeListener('update-download:ended', handler);
  },
});
