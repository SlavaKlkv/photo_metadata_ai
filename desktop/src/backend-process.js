'use strict';

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEV_BINARY = path.join(
  PROJECT_ROOT,
  'backend',
  'dist',
  'photo-metadata-backend'
);
const BACKEND_CWD = path.join(PROJECT_ROOT, 'backend');

/**
 * Возвращает путь к бинарнику backend или null, если запуск идёт из
 * исходников через uv (бинарника не существует).
 *
 * Упакованное приложение: бинарник из resources/backend/<arch>/.
 * Dev-режим: локально собранный backend/dist/photo-metadata-backend.
 */
function resolveBackendBinaryPath() {
  if (app.isPackaged) {
    // Бинарники backend лежат раздельно по архитектурам, а не склеенные
    // в universal2: spec собирает onefile, где Python и .dylib приклеены
    // overlay'ем в конец файла, а lipo сохраняет лишь один overlay —
    // Intel-срез тогда получал arm64-библиотеки и падал при старте.
    const archDir = process.arch === 'x64' ? 'x86_64' : 'arm64';
    return path.join(
      process.resourcesPath,
      'backend',
      archDir,
      'photo-metadata-backend'
    );
  }

  return fs.existsSync(DEV_BINARY) ? DEV_BINARY : null;
}

/**
 * Запускает backend-процесс.
 *
 * Если бинарника нет, backend поднимается из исходников через uv —
 * самый быстрый цикл разработки, сборка PyInstaller не нужна.
 */
function spawnBackend() {
  // Версия приложения (desktop/package.json — единственный источник
  // истины) передаётся backend'у для проверки обновлений; без неё
  // endpoint /api/v1/desktop/updates отключён.
  const backendEnv = {
    ...process.env,
    DESKTOP_APP_VERSION: app.getVersion(),
  };

  const binary = resolveBackendBinaryPath();
  if (binary) {
    return spawn(binary, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: backendEnv,
    });
  }

  return spawn('uv', ['run', 'python', '-m', 'app.desktop_main'], {
    cwd: BACKEND_CWD,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: backendEnv,
  });
}

/**
 * Убивает осиротевшие backend-процессы прошлых запусков.
 *
 * Если оболочку сняли принудительно (kill -9, краш), её backend
 * остаётся жить и держит порт 8000: новое окно молча работает со
 * старым процессом, чей вывод никуда не пишется. Благодаря
 * requestSingleInstanceLock в main.js на этот момент других живых
 * экземпляров приложения нет, поэтому найденный процесс нашего
 * бинарника — гарантированно сирота.
 *
 * Матч идёт по полной командной строке (`-f -x`), а не по имени
 * процесса: имя photo-metadata-backend одинаково у обоих срезов, у
 * дымового теста сборки и у бинарников других сборок, и `pkill -x` по
 * имени убивал их все. Полный путь сужает матч ровно до нашего запуска.
 */
function killOrphanedBackends() {
  const binary = resolveBackendBinaryPath();
  if (!binary) {
    // Запуск из исходников: постоянного бинарника нет, убивать нечего.
    return;
  }

  try {
    execFileSync('/usr/bin/pkill', ['-f', '-x', binary]);
  } catch {
    // pkill выходит с кодом 1, когда убивать некого — это норма
  }
}

module.exports = {
  spawnBackend,
  killOrphanedBackends,
  resolveBackendBinaryPath,
};
