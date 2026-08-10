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

test('resets fullscreen and maximized window to default size keeping position', () => {
  const window = {
    isFullScreen: jest.fn(() => true),
    setFullScreen: jest.fn(),
    isMaximized: jest.fn(() => true),
    unmaximize: jest.fn(),
    getBounds: jest.fn(() => ({ x: 40, y: 30, width: 500, height: 400 })),
    setBounds: jest.fn(),
    center: jest.fn(),
  };

  resetWindowState(window);

  expect(fs.unlinkSync).toHaveBeenCalledWith(
    '/tmp/user-data/window-state.json'
  );
  expect(window.setFullScreen).toHaveBeenCalledWith(false);
  expect(window.unmaximize).toHaveBeenCalled();
  // Размер сброшен к дефолту, положение сохранено, окно не центрируется.
  expect(window.setBounds).toHaveBeenCalledWith({
    x: 40,
    y: 30,
    width: 1080,
    height: 720,
  });
  expect(window.center).not.toHaveBeenCalled();
});

test('clamps position so resized window stays within work area', () => {
  const window = {
    isFullScreen: jest.fn(() => false),
    setFullScreen: jest.fn(),
    isMaximized: jest.fn(() => false),
    unmaximize: jest.fn(),
    // Окно у правого/нижнего края: новый размер увёл бы его за workArea.
    getBounds: jest.fn(() => ({ x: 1100, y: 700, width: 200, height: 150 })),
    setBounds: jest.fn(),
  };

  resetWindowState(window);

  expect(window.setBounds).toHaveBeenCalledWith({
    x: 120, // 1200 - 1080
    y: 80, // 800 - 720
    width: 1080,
    height: 720,
  });
});
