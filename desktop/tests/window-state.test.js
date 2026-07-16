'use strict';

const fs = require('fs');
const { screen } = require('electron');

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/user-data') },
  screen: {
    getAllDisplays: jest.fn(),
    getPrimaryDisplay: jest.fn(),
  },
}));

const {
  getWindowState,
  resetWindowState,
  saveWindowState,
} = require('../src/window-state');

const workArea = { x: 0, y: 0, width: 1200, height: 800 };

beforeEach(() => {
  jest.clearAllMocks();
  screen.getAllDisplays.mockReturnValue([{ workArea }]);
  screen.getPrimaryDisplay.mockReturnValue({ workArea });
});

test('returns valid visible saved state', () => {
  const saved = {
    x: 10,
    y: 20,
    width: 900,
    height: 700,
    isMaximized: true,
  };
  fs.readFileSync.mockReturnValue(JSON.stringify(saved));

  expect(getWindowState()).toEqual(saved);
});

test('falls back to display-relative default for invalid state', () => {
  fs.readFileSync.mockReturnValue(
    JSON.stringify({ x: 5000, y: 5000, width: 100, height: 100 })
  );

  expect(getWindowState()).toEqual({
    width: 1080,
    height: 720,
    isMaximized: false,
  });
});

test('saves normal bounds and maximized state', () => {
  const window = {
    getNormalBounds: jest.fn(() => ({
      x: 1,
      y: 2,
      width: 900,
      height: 700,
    })),
    isMaximized: jest.fn(() => true),
  };

  saveWindowState(window);

  expect(fs.writeFileSync).toHaveBeenCalledWith(
    '/tmp/user-data/window-state.json',
    JSON.stringify({
      x: 1,
      y: 2,
      width: 900,
      height: 700,
      isMaximized: true,
    })
  );
});

test('resets fullscreen and maximized window to default bounds', () => {
  const window = {
    isFullScreen: jest.fn(() => true),
    setFullScreen: jest.fn(),
    isMaximized: jest.fn(() => true),
    unmaximize: jest.fn(),
    setBounds: jest.fn(),
    center: jest.fn(),
  };

  resetWindowState(window);

  expect(fs.unlinkSync).toHaveBeenCalledWith(
    '/tmp/user-data/window-state.json'
  );
  expect(window.setFullScreen).toHaveBeenCalledWith(false);
  expect(window.unmaximize).toHaveBeenCalled();
  expect(window.setBounds).toHaveBeenCalledWith({
    width: 1080,
    height: 720,
  });
  expect(window.center).toHaveBeenCalled();
});
