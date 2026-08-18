'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function requestCancel() {
  ipcRenderer.send('update-download:cancel');
}

contextBridge.exposeInMainWorld('updateDownloadShell', {
  cancel: requestCancel,
});

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cancel-btn')?.addEventListener('click', requestCancel);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    requestCancel();
  }
});
