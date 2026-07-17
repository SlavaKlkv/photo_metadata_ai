'use strict';

const {
  UPDATES_PATH,
  checkForUpdatesFromMenu,
  fetchDesktopUpdate,
} = require('../src/app-updates');

const availableUpdate = {
  status: 'ok',
  update_available: true,
  current_version: '1.0.0',
  latest_version: '1.1.0',
  release_url: 'https://github.com/example/releases/tag/v1.1.0',
  download_url: 'https://github.com/example/releases/download/v1.1.0/app.dmg',
};

test('forces a fresh update check through the local backend', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(availableUpdate),
  });

  await expect(
    fetchDesktopUpdate('http://localhost:8000', fetchImpl)
  ).resolves.toEqual(availableUpdate);
  expect(fetchImpl).toHaveBeenCalledWith(
    `http://localhost:8000${UPDATES_PATH}`,
    {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }
  );
});

test('rejects failed and malformed backend responses', async () => {
  await expect(
    fetchDesktopUpdate(
      'http://localhost:8000',
      jest.fn().mockResolvedValue({ ok: false, status: 503 })
    )
  ).rejects.toThrow('HTTP 503');

  await expect(
    fetchDesktopUpdate(
      'http://localhost:8000',
      jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(null),
      })
    )
  ).rejects.toThrow('invalid response');
});

test('shows the installed version is current', async () => {
  const showMessageBox = jest.fn().mockResolvedValue({ response: 0 });

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue({
      ...availableUpdate,
      update_available: false,
      latest_version: '1.0.0',
    }),
    showMessageBox,
    openExternal: jest.fn(),
  });

  expect(showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "You're using the latest version.",
      detail: 'Version 1.0.0 is installed.',
    })
  );
});

test('offers and opens the DMG for an available version', async () => {
  const showMessageBox = jest.fn().mockResolvedValue({ response: 0 });
  const openExternal = jest.fn().mockResolvedValue(undefined);

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue(availableUpdate),
    showMessageBox,
    openExternal,
  });

  expect(showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Version 1.1.0 is available.',
      buttons: ['Download', 'Later'],
    })
  );
  expect(openExternal).toHaveBeenCalledWith(availableUpdate.download_url);
});

test('does not download when the user chooses Later', async () => {
  const openExternal = jest.fn();

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue(availableUpdate),
    showMessageBox: jest.fn().mockResolvedValue({ response: 1 }),
    openExternal,
  });

  expect(openExternal).not.toHaveBeenCalled();
});

test('falls back to the release page when a DMG is absent', async () => {
  const openExternal = jest.fn().mockResolvedValue(undefined);

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue({
      ...availableUpdate,
      download_url: null,
    }),
    showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
    openExternal,
  });

  expect(openExternal).toHaveBeenCalledWith(availableUpdate.release_url);
});

test('shows an informational result when no download link exists', async () => {
  const showMessageBox = jest.fn().mockResolvedValue({ response: 0 });
  const openExternal = jest.fn();

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue({
      ...availableUpdate,
      download_url: null,
      release_url: null,
    }),
    showMessageBox,
    openExternal,
  });

  expect(showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({ buttons: ['OK'], cancelId: 0 })
  );
  expect(openExternal).not.toHaveBeenCalled();
});

test.each([
  {
    requestUpdate: jest.fn().mockRejectedValue(new Error('offline')),
    message: 'Could not check for updates.',
  },
  {
    requestUpdate: jest.fn().mockResolvedValue({
      status: 'unavailable',
      update_available: false,
    }),
    message: 'Could not check for updates.',
  },
  {
    requestUpdate: jest.fn().mockResolvedValue({
      status: 'disabled',
      update_available: false,
    }),
    message: 'Update checks are unavailable in this build.',
  },
])('shows a native non-actionable result', async ({ requestUpdate, message }) => {
  const showMessageBox = jest.fn().mockResolvedValue({ response: 0 });

  await checkForUpdatesFromMenu({
    requestUpdate,
    showMessageBox,
    openExternal: jest.fn(),
  });

  expect(showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({ message })
  );
});
