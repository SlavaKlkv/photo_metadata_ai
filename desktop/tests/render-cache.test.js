'use strict';

// Регрессия: после замены .app окно открывало старую разметку из HTTP-кеша
// Chromium — правки интерфейса не появлялись, пока кеш не протухнет сам.

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/user-data'),
    getVersion: jest.fn(() => '1.2.3'),
  },
  session: { defaultSession: { clearCache: jest.fn() } },
}));

const {
  clearRendererCacheOnVersionChange,
} = require('../src/render-cache');

const setup = (savedVersion) => {
  const clearCache = jest.fn().mockResolvedValue(undefined);
  const writeFile = jest.fn();
  const readFile = jest.fn(() => {
    if (savedVersion === undefined) {
      throw new Error('ENOENT');
    }
    return JSON.stringify({ version: savedVersion });
  });
  return { clearCache, writeFile, readFile };
};

test('чистит кеш при запуске новой версии', async () => {
  const { clearCache, writeFile, readFile } = setup('1.2.2');

  const cleared = await clearRendererCacheOnVersionChange({
    version: '1.2.3',
    readFile,
    writeFile,
    clearCache,
  });

  expect(cleared).toBe(true);
  expect(clearCache).toHaveBeenCalledTimes(1);
  expect(writeFile).toHaveBeenCalledWith(
    expect.stringContaining('renderer-cache-version.json'),
    JSON.stringify({ version: '1.2.3' })
  );
});

test('не трогает кеш при повторном запуске той же версии', async () => {
  const { clearCache, writeFile, readFile } = setup('1.2.3');

  const cleared = await clearRendererCacheOnVersionChange({
    version: '1.2.3',
    readFile,
    writeFile,
    clearCache,
  });

  expect(cleared).toBe(false);
  expect(clearCache).not.toHaveBeenCalled();
  expect(writeFile).not.toHaveBeenCalled();
});

test('первый запуск без файла версии чистит кеш', async () => {
  const { clearCache, writeFile, readFile } = setup(undefined);

  const cleared = await clearRendererCacheOnVersionChange({
    version: '1.2.3',
    readFile,
    writeFile,
    clearCache,
  });

  expect(cleared).toBe(true);
  expect(clearCache).toHaveBeenCalledTimes(1);
});

test('ошибка очистки кеша не роняет запуск', async () => {
  const { writeFile, readFile } = setup('1.2.2');
  const clearCache = jest.fn().mockRejectedValue(new Error('cache locked'));

  await expect(
    clearRendererCacheOnVersionChange({
      version: '1.2.3',
      readFile,
      writeFile,
      clearCache,
    })
  ).resolves.toBe(true);
  expect(writeFile).toHaveBeenCalled();
});

test('несохранённая версия не мешает запуску', async () => {
  const { clearCache, readFile } = setup('1.2.2');
  const writeFile = jest.fn(() => {
    throw new Error('read-only volume');
  });

  await expect(
    clearRendererCacheOnVersionChange({
      version: '1.2.3',
      readFile,
      writeFile,
      clearCache,
    })
  ).resolves.toBe(true);
  expect(clearCache).toHaveBeenCalledTimes(1);
});
