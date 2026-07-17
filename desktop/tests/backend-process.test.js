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

test('uses packaged backend from resources', () => {
  app.isPackaged = true;
  const previousResourcesPath = process.resourcesPath;
  process.resourcesPath = '/Applications/Test.app/Contents/Resources';

  try {
    spawnBackend();
  } finally {
    process.resourcesPath = previousResourcesPath;
  }

  expect(childProcess.spawn).toHaveBeenCalledWith(
    '/Applications/Test.app/Contents/Resources/backend/photo-metadata-backend',
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

test('kills orphaned backend and ignores pkill no-match error', () => {
  killOrphanedBackends();
  expect(childProcess.execFileSync).toHaveBeenCalledWith('/usr/bin/pkill', [
    '-x',
    'photo-metadata-backend',
  ]);

  childProcess.execFileSync.mockImplementationOnce(() => {
    throw new Error('no process');
  });
  expect(() => killOrphanedBackends()).not.toThrow();
});
