'use strict';

const path = require('path');

const {
  DOWNLOAD_CANCELLED,
  FALLBACK_DMG_NAME,
  uniqueSavePath,
  filenameFromItem,
  downloadUpdateAndQuit,
} = require('../src/update-download');

test('keeps the original path when the file does not exist', () => {
  expect(
    uniqueSavePath('/tmp/app.dmg', () => false)
  ).toBe('/tmp/app.dmg');
});

test('appends a numeric suffix until the path is free', () => {
  const existsSync = jest.fn(
    (filePath) =>
      filePath === '/tmp/app.dmg' || filePath === '/tmp/app (1).dmg'
  );

  expect(uniqueSavePath('/tmp/app.dmg', existsSync)).toBe('/tmp/app (2).dmg');
});

test('uses the download item filename when it is a plain basename', () => {
  expect(
    filenameFromItem({ getFilename: () => 'Photo-Metadata-AI-1.2.3-arm64.dmg' })
  ).toBe('Photo-Metadata-AI-1.2.3-arm64.dmg');
});

test.each(['', '.', '../secret.dmg', 'foo/bar.dmg', 'foo\\bar.dmg'])(
  'rejects unsafe filename %j',
  (name) => {
    expect(filenameFromItem({ getFilename: () => name })).toBe(FALLBACK_DMG_NAME);
  }
);

function createDownloadItem({ filename = 'app.dmg', state = 'completed' } = {}) {
  const listeners = {};
  return {
    getFilename: () => filename,
    getTotalBytes: () => 100,
    getReceivedBytes: () => 40,
    setSavePath: jest.fn(),
    cancel: jest.fn(),
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
    once: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
    emit(event, ...args) {
      listeners[event]?.(...args);
    },
    listeners,
  };
}

function createSession(item, { emitUpdated = false, emitDone = true } = {}) {
  let willDownload;
  return {
    on: jest.fn((event, handler) => {
      if (event === 'will-download') {
        willDownload = handler;
      }
    }),
    removeListener: jest.fn(),
    downloadURL: jest.fn(() => {
      willDownload({}, item);
      if (emitUpdated) {
        item.emit('updated');
      }
      if (emitDone) {
        item.emit('done', {}, item._state || 'completed');
      }
    }),
  };
}

test('saves the DMG, opens it, then quits', async () => {
  const item = createDownloadItem();
  const session = createSession(item);
  const openPath = jest.fn().mockResolvedValue('');
  const showItemInFolder = jest.fn();
  const quit = jest.fn();
  const onProgress = jest.fn();

  await expect(
    downloadUpdateAndQuit({
      url: 'https://github.com/example/releases/download/v1.1.0/app.dmg',
      session,
      downloadDir: '/tmp',
      openPath,
      showItemInFolder,
      quit,
      onProgress,
      existsSync: () => false,
    })
  ).resolves.toBe(path.join('/tmp', 'app.dmg'));

  expect(item.setSavePath).toHaveBeenCalledWith(path.join('/tmp', 'app.dmg'));
  expect(session.removeListener).toHaveBeenCalledWith(
    'will-download',
    expect.any(Function)
  );
  expect(openPath).toHaveBeenCalledWith(path.join('/tmp', 'app.dmg'));
  expect(showItemInFolder).not.toHaveBeenCalled();
  expect(quit).toHaveBeenCalledTimes(1);
});

test('reports download progress while the file is transferring', async () => {
  const item = createDownloadItem();
  const session = createSession(item, { emitUpdated: true });
  const onProgress = jest.fn();

  await downloadUpdateAndQuit({
    url: 'https://example.com/app.dmg',
    session,
    downloadDir: '/tmp',
    openPath: jest.fn().mockResolvedValue(''),
    quit: jest.fn(),
    onProgress,
    existsSync: () => false,
  });

  expect(onProgress).toHaveBeenCalledWith(0.4);
});

test('reveals the file in Finder when opening the DMG fails', async () => {
  const item = createDownloadItem();
  const session = createSession(item);
  const showItemInFolder = jest.fn();
  const dest = path.join('/tmp', 'app.dmg');

  await downloadUpdateAndQuit({
    url: 'https://example.com/app.dmg',
    session,
    downloadDir: '/tmp',
    openPath: jest.fn().mockResolvedValue('Failed to open'),
    showItemInFolder,
    quit: jest.fn(),
    existsSync: () => false,
  });

  expect(showItemInFolder).toHaveBeenCalledWith(dest);
});

test('does not quit when the download is interrupted', async () => {
  const item = createDownloadItem();
  item._state = 'interrupted';
  const session = createSession(item);
  const quit = jest.fn();

  await expect(
    downloadUpdateAndQuit({
      url: 'https://example.com/app.dmg',
      session,
      downloadDir: '/tmp',
      openPath: jest.fn(),
      quit,
      existsSync: () => false,
    })
  ).rejects.toThrow('interrupted');

  expect(quit).not.toHaveBeenCalled();
});

test('cancels an in-flight download when abort is requested', async () => {
  const item = createDownloadItem();
  let willDownload;
  const session = {
    on: jest.fn((event, handler) => {
      if (event === 'will-download') {
        willDownload = handler;
      }
    }),
    removeListener: jest.fn(),
    downloadURL: jest.fn(() => {
      willDownload({}, item);
    }),
  };
  const controller = new AbortController();
  const quit = jest.fn();
  const promise = downloadUpdateAndQuit({
    url: 'https://example.com/app.dmg',
    session,
    downloadDir: '/tmp',
    openPath: jest.fn(),
    quit,
    abortSignal: controller.signal,
    existsSync: () => false,
  });

  controller.abort();
  item.emit('done', {}, 'cancelled');

  await expect(promise).rejects.toThrow(DOWNLOAD_CANCELLED);
  expect(item.cancel).toHaveBeenCalledTimes(1);
  expect(quit).not.toHaveBeenCalled();
});

test('does not quit when downloadURL throws before the transfer starts', async () => {
  const session = {
    on: jest.fn(),
    removeListener: jest.fn(),
    downloadURL: jest.fn(() => {
      throw new Error('blocked');
    }),
  };
  const quit = jest.fn();

  await expect(
    downloadUpdateAndQuit({
      url: 'https://example.com/app.dmg',
      session,
      downloadDir: '/tmp',
      openPath: jest.fn(),
      quit,
    })
  ).rejects.toThrow('blocked');

  expect(session.removeListener).toHaveBeenCalledWith(
    'will-download',
    expect.any(Function)
  );
  expect(quit).not.toHaveBeenCalled();
});
