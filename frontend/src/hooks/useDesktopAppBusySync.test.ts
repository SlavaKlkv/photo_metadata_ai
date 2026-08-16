import { renderHook } from '@testing-library/react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { useDesktopAppBusySync } from './useDesktopAppBusySync';

const setAppBusy = jest.fn();

beforeEach(() => {
  setAppBusy.mockClear();
  window.desktopShell = { setAppBusy };
  useUIStore.setState({ isProcessing: false, isExporting: false });
  useAppStore.setState({ regeneratingFileId: null });
});

afterEach(() => {
  delete window.desktopShell;
});

test('reports busy while processing and clears it on unmount', () => {
  useUIStore.setState({ isProcessing: true });

  const { unmount } = renderHook(() => useDesktopAppBusySync());

  expect(setAppBusy).toHaveBeenCalledWith(true);

  unmount();
  expect(setAppBusy).toHaveBeenLastCalledWith(false);
});

test('reports busy while exporting', () => {
  useUIStore.setState({ isExporting: true });

  renderHook(() => useDesktopAppBusySync());

  expect(setAppBusy).toHaveBeenCalledWith(true);
});

test('reports busy while regenerating a file', () => {
  useAppStore.setState({ regeneratingFileId: 'file-2' });

  renderHook(() => useDesktopAppBusySync());

  expect(setAppBusy).toHaveBeenCalledWith(true);
});

test('reports idle when no process is running', () => {
  renderHook(() => useDesktopAppBusySync());

  expect(setAppBusy).toHaveBeenCalledWith(false);
});
