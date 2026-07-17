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
 * Запускает backend-процесс.
 *
 * Упакованное приложение: бинарник из resources/backend/.
 * Dev-режим: локально собранный backend/dist/photo-metadata-backend,
 * если он есть, иначе запуск из исходников через uv (самый быстрый
 * цикл разработки, сборка PyInstaller не нужна).
 */
function spawnBackend() {
  // Версия приложения (desktop/package.json — единственный источник
  // истины) передаётся backend'у для проверки обновлений; без неё
  // endpoint /api/v1/desktop/updates отключён.
  const backendEnv = {
    ...process.env,
    DESKTOP_APP_VERSION: app.getVersion(),
  };

  if (app.isPackaged) {
    const packagedBinary = path.join(
      process.resourcesPath,
      'backend',
      'photo-metadata-backend'
    );
    return spawn(packagedBinary, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: backendEnv,
    });
  }

  if (fs.existsSync(DEV_BINARY)) {
    return spawn(DEV_BINARY, [], {
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
 * экземпляров приложения нет, поэтому любой найденный
 * photo-metadata-backend — гарантированно сирота.
 */
function killOrphanedBackends() {
  try {
    execFileSync('/usr/bin/pkill', ['-x', 'photo-metadata-backend']);
  } catch {
    // pkill выходит с кодом 1, когда убивать некого — это норма
  }
}

module.exports = { spawnBackend, killOrphanedBackends };
