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
    downloadAndQuit: jest.fn(),
    openExternal: jest.fn(),
  });

  expect(showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "You're using the latest version.",
      detail: 'Version 1.0.0 is installed.',
    })
  );
});

test('downloads the DMG and quits after the file is saved', async () => {
  const showMessageBox = jest.fn().mockResolvedValue({ response: 0 });
  const downloadAndQuit = jest.fn().mockResolvedValue('/tmp/app.dmg');
  const openExternal = jest.fn();

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue(availableUpdate),
    showMessageBox,
    downloadAndQuit,
    openExternal,
  });

  expect(showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Version 1.1.0 is available.',
      buttons: ['Download', 'Later'],
    })
  );
  expect(downloadAndQuit).toHaveBeenCalledWith(availableUpdate.download_url);
  expect(openExternal).not.toHaveBeenCalled();
});

test('does not download when the user chooses Later', async () => {
  const downloadAndQuit = jest.fn();
  const openExternal = jest.fn();

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue(availableUpdate),
    showMessageBox: jest.fn().mockResolvedValue({ response: 1 }),
    downloadAndQuit,
    openExternal,
  });

  expect(downloadAndQuit).not.toHaveBeenCalled();
  expect(openExternal).not.toHaveBeenCalled();
});

test('keeps the app open when the DMG download fails', async () => {
  const showMessageBox = jest
    .fn()
    .mockResolvedValueOnce({ response: 0 })
    .mockResolvedValueOnce({ response: 0 });
  const downloadAndQuit = jest.fn().mockRejectedValue(new Error('offline'));

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue(availableUpdate),
    showMessageBox,
    downloadAndQuit,
    openExternal: jest.fn(),
  });

  expect(showMessageBox).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: 'Could not download the update.',
    })
  );
});

test('opens the release page when a DMG is absent', async () => {
  const openExternal = jest.fn().mockResolvedValue(undefined);
  const downloadAndQuit = jest.fn();

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue({
      ...availableUpdate,
      download_url: null,
    }),
    showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
    downloadAndQuit,
    openExternal,
  });

  expect(openExternal).toHaveBeenCalledWith(availableUpdate.release_url);
  expect(downloadAndQuit).not.toHaveBeenCalled();
});

test('shows an informational result when no download link exists', async () => {
  const showMessageBox = jest.fn().mockResolvedValue({ response: 0 });
  const downloadAndQuit = jest.fn();
  const openExternal = jest.fn();

  await checkForUpdatesFromMenu({
    requestUpdate: jest.fn().mockResolvedValue({
      ...availableUpdate,
      download_url: null,
      release_url: null,
    }),
    showMessageBox,
    downloadAndQuit,
    openExternal,
  });

  expect(showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({ buttons: ['OK'], cancelId: 0 })
  );
  expect(downloadAndQuit).not.toHaveBeenCalled();
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
    downloadAndQuit: jest.fn(),
    openExternal: jest.fn(),
  });

  expect(showMessageBox).toHaveBeenCalledWith(
    expect.objectContaining({ message })
  );
});
