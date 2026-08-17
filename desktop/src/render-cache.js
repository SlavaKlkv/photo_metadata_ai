'use strict';

const fs = require('fs');
const path = require('path');
const { app, session } = require('electron');

// Разметка приложения приезжает из встроенного backend по http://localhost,
// поэтому Chromium кеширует её как обычный сайт. После замены .app старый
// index.html из кеша тянул за собой бандлы прежней сборки, и обновление
// выглядело как «ничего не изменилось». Заголовки на стороне backend решают
// это для будущих запусков, а уже осевший кеш нужно сбросить один раз —
// при первом старте новой версии.

function versionFilePath() {
  return path.join(app.getPath('userData'), 'renderer-cache-version.json');
}

function readCachedVersion(readFile) {
  try {
    return JSON.parse(readFile(versionFilePath(), 'utf8')).version;
  } catch {
    // Нет файла или он битый — считаем, что версия сменилась.
    return null;
  }
}

/**
 * Сбрасывает HTTP-кеш рендерера, если приложение запускается в версии,
 * отличной от той, что работала в прошлый раз.
 */
async function clearRendererCacheOnVersionChange({
  version = app.getVersion(),
  readFile = fs.readFileSync,
  writeFile = fs.writeFileSync,
  clearCache = () => session.defaultSession.clearCache(),
} = {}) {
  if (readCachedVersion(readFile) === version) {
    return false;
  }

  try {
    await clearCache();
  } catch {
    // Устаревший кеш неприятен, но ронять запуск из-за него нельзя.
  }

  try {
    writeFile(versionFilePath(), JSON.stringify({ version }));
  } catch {
    // Не записали — в следующий раз кеш просто почистится повторно.
  }

  return true;
}

module.exports = { clearRendererCacheOnVersionChange };
