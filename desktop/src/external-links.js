'use strict';

const { shell } = require('electron');

/**
 * Перехватывает window.open из рендерера: https-ссылки открываются
 * в системном браузере, новые окна Electron не создаются никогда.
 * Нужно для кнопки «Download» в баннере обновления.
 */
function installExternalLinkHandler(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

module.exports = { installExternalLinkHandler };
