import { fireEvent, render, screen } from '@testing-library/react';
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

beforeEach(() => {
  useAppStore.setState(initialState, true);
  localStorage.clear();
  jest.restoreAllMocks();
});

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

test('opens the DMG URL in a new external window', () => {
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
