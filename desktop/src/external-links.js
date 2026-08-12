'use strict';

const { app, shell } = require('electron');

/**
 * Перехватывает window.open из рендерера: https-ссылки открываются
 * в системном браузере, новые окна Electron не создаются никогда.
 * Нужно для кнопки «Download» в баннере обновления: после открытия
 * ссылки приложение закрывается, чтобы пользователь мог заменить
 * бандл из нового DMG.
 */
function installExternalLinkHandler(webContents, deps = {}) {
  const openExternal = deps.openExternal ?? ((url) => shell.openExternal(url));
  const quit = deps.quit ?? (() => app.quit());

  webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void Promise.resolve(openExternal(url)).then(
        () => {
          quit();
        },
        () => {
          // Если браузер не открылся — оставляем приложение открытым.
        }
      );
    }
    return { action: 'deny' };
  });
}

module.exports = { installExternalLinkHandler };
