'use strict';

const { shell } = require('electron');

jest.mock('electron', () => ({
  app: { quit: jest.fn() },
  shell: { openExternal: jest.fn() },
}));

const { app } = require('electron');
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

test('opens https links in the system browser, denies the window, then quits', async () => {
  const handler = installAndGetHandler();

  const result = handler({
    url: 'https://github.com/SlavaKlkv/photo_metadata_ai/releases',
  });

  expect(shell.openExternal).toHaveBeenCalledWith(
    'https://github.com/SlavaKlkv/photo_metadata_ai/releases'
  );
  expect(result).toEqual({ action: 'deny' });

  await Promise.resolve();
  expect(app.quit).toHaveBeenCalledTimes(1);
});

test('does not quit when opening the download URL fails', async () => {
  const openExternal = jest.fn().mockRejectedValue(new Error('blocked'));
  const quit = jest.fn();
  const handler = installAndGetHandler({ openExternal, quit });

  handler({
    url: 'https://github.com/example/releases/download/v1.1.0/app.dmg',
  });

  await Promise.resolve();
  await Promise.resolve();

  expect(openExternal).toHaveBeenCalled();
  expect(quit).not.toHaveBeenCalled();
});

test.each(['http://localhost:8000/', 'file:///etc/passwd', 'about:blank'])(
  'denies %s without opening it externally or quitting',
  async (url) => {
    const quit = jest.fn();
    const handler = installAndGetHandler({ quit });

    const result = handler({ url });

    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(result).toEqual({ action: 'deny' });

    await Promise.resolve();
    expect(quit).not.toHaveBeenCalled();
  }
);
