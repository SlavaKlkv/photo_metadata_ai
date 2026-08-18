import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppStore } from '../../../store/useAppStore';
import { UpdateBanner } from './UpdateBanner';

const initialState = useAppStore.getState();
const updateInfo = {
  status: 'ok' as const,
  update_available: true,
  current_version: '1.0.0',
  latest_version: '1.1.0',
  release_url: 'https://github.com/example/releases/tag/v1.1.0',
  download_url: 'https://github.com/example/releases/download/v1.1.0/app.dmg',
};

const endedListeners = new Set<() => void>();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  localStorage.clear();
  jest.restoreAllMocks();
  endedListeners.clear();
  window.desktopShell = {
    downloadUpdate: jest.fn().mockResolvedValue(undefined),
    onUpdateDownloadEnded: (callback) => {
      endedListeners.add(callback);
      return () => endedListeners.delete(callback);
    },
  };
});

afterEach(() => {
  delete window.desktopShell;
});

function emitUpdateDownloadEnded() {
  act(() => {
    endedListeners.forEach((listener) => listener());
  });
}

test('renders the available version only while visible', () => {
  const { unmount } = render(<UpdateBanner />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  unmount();

  useAppStore.setState({
    updateInfo,
    isUpdateBannerVisible: true,
  });
  render(<UpdateBanner />);

  expect(screen.getByRole('status')).toHaveTextContent(
    'Version 1.1.0 is available',
  );
});

test('downloads the DMG, hides the banner and does not persist dismiss', () => {
  const downloadUpdate = jest.fn().mockResolvedValue(undefined);
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  window.desktopShell = {
    downloadUpdate,
    onUpdateDownloadEnded: (callback) => {
      endedListeners.add(callback);
      return () => endedListeners.delete(callback);
    },
  };
  useAppStore.setState({
    updateInfo,
    isUpdateBannerVisible: true,
  });
  render(<UpdateBanner />);

  fireEvent.click(screen.getByRole('button', { name: 'Download' }));

  expect(downloadUpdate).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem('update_dismissed_version')).toBeNull();
});

test('restores the banner after a failed desktop download', async () => {
  const downloadUpdate = jest.fn().mockRejectedValue(new Error('offline'));
  window.desktopShell = {
    downloadUpdate,
    onUpdateDownloadEnded: (callback) => {
      endedListeners.add(callback);
      return () => endedListeners.delete(callback);
    },
  };
  useAppStore.setState({
    updateInfo,
    isUpdateBannerVisible: true,
  });
  render(<UpdateBanner />);

  fireEvent.click(screen.getByRole('button', { name: 'Download' }));

  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

test('restores the banner when the desktop shell reports download ended', () => {
  useAppStore.setState({
    updateInfo,
    isUpdateBannerVisible: false,
  });
  render(<UpdateBanner />);

  emitUpdateDownloadEnded();

  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('does not restore a dismissed version', () => {
  localStorage.setItem('update_dismissed_version', '1.1.0');
  useAppStore.setState({
    updateInfo,
    isUpdateBannerVisible: false,
  });
  render(<UpdateBanner />);

  emitUpdateDownloadEnded();

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('opens the DMG URL when the desktop shell is absent', () => {
  delete window.desktopShell;
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  useAppStore.setState({
    updateInfo,
    isUpdateBannerVisible: true,
  });
  render(<UpdateBanner />);

  fireEvent.click(screen.getByRole('button', { name: 'Download' }));

  expect(open).toHaveBeenCalledWith(
    updateInfo.download_url,
    '_blank',
    'noopener,noreferrer',
  );
});

test('falls back to the release page when a DMG asset is absent', () => {
  delete window.desktopShell;
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  useAppStore.setState({
    updateInfo: { ...updateInfo, download_url: null },
    isUpdateBannerVisible: true,
  });
  render(<UpdateBanner />);

  fireEvent.click(screen.getByRole('button', { name: 'Download' }));

  expect(open).toHaveBeenCalledWith(
    updateInfo.release_url,
    '_blank',
    'noopener,noreferrer',
  );
});

test('dismisses the banner for the current version', () => {
  useAppStore.setState({
    updateInfo,
    isUpdateBannerVisible: true,
  });
  render(<UpdateBanner />);

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem('update_dismissed_version')).toBe('1.1.0');
});
