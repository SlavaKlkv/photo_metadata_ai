'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const { app } = require('electron');

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
  spawn: jest.fn(() => ({ pid: 1 })),
}));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));
jest.mock('electron', () => ({
  app: { isPackaged: false, getVersion: jest.fn(() => '1.0.0') },
}));

const {
  killOrphanedBackends,
  spawnBackend,
} = require('../src/backend-process');

beforeEach(() => {
  jest.clearAllMocks();
  app.isPackaged = false;
  app.getVersion.mockReturnValue('1.0.0');
  fs.existsSync.mockReturnValue(false);
});

test('uses source backend in development when binary is absent', () => {
  spawnBackend();

  expect(childProcess.spawn).toHaveBeenCalledWith(
    'uv',
    ['run', 'python', '-m', 'app.desktop_main'],
    expect.objectContaining({
      cwd: expect.stringMatching(/backend$/),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: expect.objectContaining({ DESKTOP_APP_VERSION: '1.0.0' }),
    })
  );
});

test('uses built development binary when available', () => {
  fs.existsSync.mockReturnValue(true);

  spawnBackend();

  expect(childProcess.spawn).toHaveBeenCalledWith(
    expect.stringMatching(/backend\/dist\/photo-metadata-backend$/),
    [],
    expect.objectContaining({
      stdio: ['ignore', 'pipe', 'pipe'],
      env: expect.objectContaining({ DESKTOP_APP_VERSION: '1.0.0' }),
    })
  );
});

// Бинарники backend лежат раздельно по архитектурам: склейка lipo в
// universal2 отдавала Intel-срезу arm64-библиотеки, и backend падал при
// старте на Intel. Регрессия видна только по выбранному пути.
function withPackagedArch(arch, action) {
  app.isPackaged = true;
  const previousResourcesPath = process.resourcesPath;
  const previousArch = Object.getOwnPropertyDescriptor(process, 'arch');
  process.resourcesPath = '/Applications/Test.app/Contents/Resources';
  Object.defineProperty(process, 'arch', { value: arch, configurable: true });

  try {
    action();
  } finally {
    process.resourcesPath = previousResourcesPath;
    Object.defineProperty(process, 'arch', previousArch);
  }
}

function spawnPackagedWithArch(arch) {
  withPackagedArch(arch, spawnBackend);
}

test('uses arm64 packaged backend on Apple Silicon', () => {
  spawnPackagedWithArch('arm64');

  expect(childProcess.spawn).toHaveBeenCalledWith(
    '/Applications/Test.app/Contents/Resources/backend/arm64/photo-metadata-backend',
    [],
    expect.objectContaining({
      stdio: ['ignore', 'pipe', 'pipe'],
      env: expect.objectContaining({ DESKTOP_APP_VERSION: '1.0.0' }),
    })
  );
});

test('uses x86_64 packaged backend on Intel', () => {
  spawnPackagedWithArch('x64');

  expect(childProcess.spawn).toHaveBeenCalledWith(
    '/Applications/Test.app/Contents/Resources/backend/x86_64/photo-metadata-backend',
    [],
    expect.objectContaining({
      stdio: ['ignore', 'pipe', 'pipe'],
      env: expect.objectContaining({ DESKTOP_APP_VERSION: '1.0.0' }),
    })
  );
});

test('passes app version reported by Electron, not a hardcoded one', () => {
  app.getVersion.mockReturnValue('2.3.4');

  spawnBackend();

  const options = childProcess.spawn.mock.calls[0][2];
  expect(options.env.DESKTOP_APP_VERSION).toBe('2.3.4');
});

// Матч по полному пути, а не по имени процесса: `pkill -x
// photo-metadata-backend` убивал и дымовой тест сборки, и бинарники
// других сборок — имя у всех одинаковое.
test('kills orphaned arm64 backend by its exact command line', () => {
  withPackagedArch('arm64', killOrphanedBackends);

  expect(childProcess.execFileSync).toHaveBeenCalledWith('/usr/bin/pkill', [
    '-f',
    '-x',
    '/Applications/Test.app/Contents/Resources/backend/arm64/photo-metadata-backend',
  ]);
});

test('kills orphaned x86_64 backend by its exact command line', () => {
  withPackagedArch('x64', killOrphanedBackends);

  expect(childProcess.execFileSync).toHaveBeenCalledWith('/usr/bin/pkill', [
    '-f',
    '-x',
    '/Applications/Test.app/Contents/Resources/backend/x86_64/photo-metadata-backend',
  ]);
});

test('kills orphaned development binary by its path', () => {
  fs.existsSync.mockReturnValue(true);

  killOrphanedBackends();

  expect(childProcess.execFileSync).toHaveBeenCalledWith('/usr/bin/pkill', [
    '-f',
    '-x',
    expect.stringMatching(/backend\/dist\/photo-metadata-backend$/),
  ]);
});

test('skips pkill when backend runs from sources', () => {
  killOrphanedBackends();

  expect(childProcess.execFileSync).not.toHaveBeenCalled();
});

test('ignores pkill no-match error', () => {
  fs.existsSync.mockReturnValue(true);
  childProcess.execFileSync.mockImplementationOnce(() => {
    throw new Error('no process');
  });

  expect(() => killOrphanedBackends()).not.toThrow();
});
