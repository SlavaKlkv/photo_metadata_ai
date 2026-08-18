'use strict';

const { shell } = require('electron');

jest.mock('electron', () => ({
  shell: { openExternal: jest.fn() },
}));

const { installExternalLinkHandler } = require('../src/external-links');

function installAndGetHandler(deps) {
  const webContents = { setWindowOpenHandler: jest.fn() };
  installExternalLinkHandler(webContents, deps);
  expect(webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
  return webContents.setWindowOpenHandler.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  shell.openExternal.mockResolvedValue(undefined);
});

test('opens https links in the system browser and keeps the app running', async () => {
  const handler = installAndGetHandler();

  const result = handler({
    url: 'https://github.com/SlavaKlkv/photo_metadata_ai/releases',
  });

  expect(shell.openExternal).toHaveBeenCalledWith(
    'https://github.com/SlavaKlkv/photo_metadata_ai/releases'
  );
  expect(result).toEqual({ action: 'deny' });

  await Promise.resolve();
});

test('does not throw when opening the download URL fails', async () => {
  const openExternal = jest.fn().mockRejectedValue(new Error('blocked'));
  const handler = installAndGetHandler({ openExternal });

  expect(() =>
    handler({
      url: 'https://github.com/example/releases/download/v1.1.0/app.dmg',
    })
  ).not.toThrow();

  await Promise.resolve();
  await Promise.resolve();

  expect(openExternal).toHaveBeenCalled();
});

test.each(['http://localhost:8000/', 'file:///etc/passwd', 'about:blank'])(
  'denies %s without opening it externally',
  async (url) => {
    const handler = installAndGetHandler();

    const result = handler({ url });

    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(result).toEqual({ action: 'deny' });
  }
);
