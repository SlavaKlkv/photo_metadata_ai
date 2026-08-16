import { isBlockingAppProcess, setDesktopAppBusy } from './appBusy';

test.each([
  [
    'idle',
    {
      isProcessing: false,
      isExporting: false,
      regeneratingFileId: null,
    },
    false,
  ],
  [
    'processing',
    {
      isProcessing: true,
      isExporting: false,
      regeneratingFileId: null,
    },
    true,
  ],
  [
    'exporting',
    {
      isProcessing: false,
      isExporting: true,
      regeneratingFileId: null,
    },
    true,
  ],
  [
    'regenerating',
    {
      isProcessing: false,
      isExporting: false,
      regeneratingFileId: 'file-1',
    },
    true,
  ],
])('%s → expected %s', (_label, state, expected) => {
  expect(isBlockingAppProcess(state)).toBe(expected);
});

test('setDesktopAppBusy forwards to the desktop shell when present', () => {
  const setAppBusy = jest.fn();
  window.desktopShell = { setAppBusy };

  setDesktopAppBusy(true);
  setDesktopAppBusy(false);

  expect(setAppBusy).toHaveBeenNthCalledWith(1, true);
  expect(setAppBusy).toHaveBeenNthCalledWith(2, false);

  delete window.desktopShell;
});

test('setDesktopAppBusy is a no-op without the desktop shell', () => {
  delete window.desktopShell;
  expect(() => setDesktopAppBusy(true)).not.toThrow();
});
