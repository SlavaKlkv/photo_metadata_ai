import { act, render, screen } from '@testing-library/react';
import {
  FULLSCREEN_HINT_DURATION_MS,
  FullscreenHint,
} from './FullscreenHint';

const fullscreenListeners = new Set<() => void>();

beforeEach(() => {
  jest.useFakeTimers();
  fullscreenListeners.clear();
  window.desktopShell = {
    onEnterFullscreen: (callback) => {
      fullscreenListeners.add(callback);
      return () => fullscreenListeners.delete(callback);
    },
  };
});

afterEach(() => {
  delete window.desktopShell;
  jest.clearAllTimers();
  jest.useRealTimers();
});

function enterFullscreen() {
  act(() => {
    fullscreenListeners.forEach((listener) => listener());
  });
}

test('briefly shows an Escape hint after entering fullscreen', () => {
  render(<FullscreenHint />);

  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  enterFullscreen();

  expect(screen.getByRole('status')).toHaveTextContent(
    'Press Esc to exit full screen',
  );

  act(() => {
    jest.advanceTimersByTime(FULLSCREEN_HINT_DURATION_MS);
  });

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('restarts the display duration when fullscreen is entered again', () => {
  render(<FullscreenHint />);

  enterFullscreen();
  act(() => {
    jest.advanceTimersByTime(FULLSCREEN_HINT_DURATION_MS - 500);
  });

  enterFullscreen();
  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('unsubscribes from fullscreen events on unmount', () => {
  const { unmount } = render(<FullscreenHint />);

  expect(fullscreenListeners.size).toBe(1);

  unmount();

  expect(fullscreenListeners.size).toBe(0);
});
