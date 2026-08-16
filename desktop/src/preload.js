'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Рендерер сообщает main, что идёт длительный процесс
// (processing / export / regenerate). Main использует флаг
// при закрытии окна и Cmd+Q.
contextBridge.exposeInMainWorld('desktopShell', {
  setAppBusy: (busy) => {
    ipcRenderer.send('app:set-busy', Boolean(busy));
  },
});
