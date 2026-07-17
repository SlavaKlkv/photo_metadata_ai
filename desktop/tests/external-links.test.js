'use strict';

const { shell } = require('electron');

jest.mock('electron', () => ({
  shell: { openExternal: jest.fn() },
}));

const { installExternalLinkHandler } = require('../src/external-links');

function installAndGetHandler() {
  const webContents = { setWindowOpenHandler: jest.fn() };
  installExternalLinkHandler(webContents);
  expect(webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
  return webContents.setWindowOpenHandler.mock.calls[0][0];
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('opens https links in the system browser and denies the window', () => {
  const handler = installAndGetHandler();

  const result = handler({
    url: 'https://github.com/SlavaKlkv/photo_metadata_ai/releases',
  });

  expect(shell.openExternal).toHaveBeenCalledWith(
    'https://github.com/SlavaKlkv/photo_metadata_ai/releases'
  );
  expect(result).toEqual({ action: 'deny' });
});

test.each(['http://localhost:8000/', 'file:///etc/passwd', 'about:blank'])(
  'denies %s without opening it externally',
  (url) => {
    const handler = installAndGetHandler();

    const result = handler({ url });

    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(result).toEqual({ action: 'deny' });
  }
);
