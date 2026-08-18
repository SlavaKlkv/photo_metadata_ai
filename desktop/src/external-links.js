'use strict';

const { shell } = require('electron');

/**
 * Перехватывает window.open из рендерера: https-ссылки открываются
 * в системном браузере, новые окна Electron не создаются никогда.
 * Приложение не закрываем: иначе прямая загрузка .dmg в Chrome
 * выглядит как «окно исчезло, в Dock что-то мигнуло».
 */
function installExternalLinkHandler(webContents, deps = {}) {
  const openExternal = deps.openExternal ?? ((url) => shell.openExternal(url));

  webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void Promise.resolve(openExternal(url)).catch(() => {
        // Если браузер не открылся — остаёмся в приложении.
      });
    }
    return { action: 'deny' };
  });
}

module.exports = { installExternalLinkHandler };
