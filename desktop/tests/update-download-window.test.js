'use strict';

const {
  buildProgressPage,
  bindParentWindow,
  clampRatio,
  computeCenteredPlacement,
  createUpdateDownloadWindow,
  WINDOW_WIDTH,
  WINDOW_HEIGHT,
} = require('../src/update-download-window');

function createMockWindow() {
  const listeners = {};
  let x = 0;
  let y = 0;
  let width = WINDOW_WIDTH;
  let height = WINDOW_HEIGHT;
  let parent = null;
  return {
    isDestroyed: jest.fn(() => false),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    loadURL: jest.fn(),
    setPosition: jest.fn((nextX, nextY) => {
      x = nextX;
      y = nextY;
    }),
    getBounds: jest.fn(() => ({ x, y, width, height })),
    setParentWindow: jest.fn((nextParent) => {
      parent = nextParent;
    }),
    getParentWindow: jest.fn(() => parent),
    getPosition: jest.fn(() => [x, y]),
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
    removeAllListeners: jest.fn((event) => {
      delete listeners[event];
    }),
    once: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
    webContents: {
      executeJavaScript: jest.fn().mockResolvedValue(undefined),
    },
    emitReady() {
      listeners['ready-to-show']?.();
    },
    emitMoved() {
      listeners.moved?.();
    },
    emitClose() {
      listeners.close?.();
    },
  };
}

function createMockParent(bounds = { x: 100, y: 80, width: 1200, height: 800 }) {
  const listeners = {};
  return {
    isDestroyed: jest.fn(() => false),
    getBounds: jest.fn(() => bounds),
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
    removeListener: jest.fn((event, handler) => {
      delete listeners[event];
    }),
    emit(event) {
      listeners[event]?.();
    },
  };
}

test('computeCenteredPlacement uses current main bounds', () => {
  const placement = computeCenteredPlacement(
    { x: 200, y: 100, width: 1000, height: 700 },
    { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
  );

  expect(placement).toEqual({
    x: 200 + Math.round((1000 - WINDOW_WIDTH) / 2),
    y: 100 + Math.round((700 - WINDOW_HEIGHT) / 2),
    offsetX: Math.round((1000 - WINDOW_WIDTH) / 2),
    offsetY: Math.round((700 - WINDOW_HEIGHT) / 2),
  });
});

test('buildProgressPage includes drag region, esc hint and cancel button', () => {
  const html = buildProgressPage();

  expect(html).toContain('-webkit-app-region:drag');
  expect(html).toContain('Esc to cancel');
  expect(html).toContain('id="cancel-btn"');
  expect(html).not.toContain('drag to move');
});

test('detaches from the parent when detachFromParent is called', () => {
  const parent = createMockParent();
  const created = createMockWindow();
  const progress = createUpdateDownloadWindow({
    BrowserWindow: jest.fn(() => created),
  });

  progress.show({ parent });
  expect(progress.isFollowingMainWindow()).toBe(true);

  progress.detachFromParent();

  expect(progress.isFollowingMainWindow()).toBe(false);
  expect(created.setParentWindow).toHaveBeenCalledWith(null);
});

test('keeps following when moved only partially outside parent bounds', () => {
  const parent = createMockParent({ x: 100, y: 80, width: 1200, height: 800 });
  const created = createMockWindow();
  const progress = createUpdateDownloadWindow({
    BrowserWindow: jest.fn(() => created),
  });

  progress.show({ parent });
  expect(progress.isFollowingMainWindow()).toBe(true);

  created.setPosition(50, 80);
  created.emitMoved();

  expect(progress.isFollowingMainWindow()).toBe(true);
});

test('detaches from the parent when fully moved outside parent bounds', () => {
  const parent = createMockParent({ x: 100, y: 80, width: 1200, height: 800 });
  const created = createMockWindow();
  const progress = createUpdateDownloadWindow({
    BrowserWindow: jest.fn(() => created),
  });

  progress.show({ parent });
  expect(progress.isFollowingMainWindow()).toBe(true);

  created.setPosition(-400, 80);
  created.emitMoved();

  expect(progress.isFollowingMainWindow()).toBe(false);
  expect(created.setParentWindow).toHaveBeenCalledWith(null);
});

test.each([
  [-1, 0],
  [0.42, 0.42],
  [2, 1],
])('clampRatio(%p) → expected range', (input, expected) => {
  expect(clampRatio(input)).toBe(expected);
});

test('creates a non-modal child window centered on the parent', () => {
  const parent = createMockParent();
  const created = createMockWindow();
  const BrowserWindow = jest.fn(() => created);

  const progress = createUpdateDownloadWindow({ BrowserWindow });
  progress.show({ parent });

  expect(BrowserWindow).toHaveBeenCalledWith(
    expect.objectContaining({
      modal: false,
      parent,
      movable: true,
    }),
  );
  expect(BrowserWindow).not.toHaveBeenCalledWith(
    expect.objectContaining({ alwaysOnTop: true }),
  );

  const expected = computeCenteredPlacement(parent.getBounds());
  expect(created.setPosition).toHaveBeenCalledWith(expected.x, expected.y, false);
  expect(parent.on).not.toHaveBeenCalledWith('move', expect.any(Function));
});

test('recenters again on ready-to-show using fresh parent bounds', () => {
  const parent = createMockParent({ x: 100, y: 80, width: 1200, height: 800 });
  const created = createMockWindow();
  const progress = createUpdateDownloadWindow({
    BrowserWindow: jest.fn(() => created),
  });

  progress.show({ parent });
  parent.getBounds.mockReturnValue({ x: 500, y: 300, width: 1200, height: 800 });
  created.emitReady();

  const expected = computeCenteredPlacement({
    x: 500,
    y: 300,
    width: 1200,
    height: 800,
  });
  expect(created.setPosition).toHaveBeenLastCalledWith(expected.x, expected.y, false);
});

test('calls onCancel when the progress window is closed by the user', () => {
  const created = createMockWindow();
  const onCancel = jest.fn();
  const progress = createUpdateDownloadWindow({
    BrowserWindow: jest.fn(() => created),
  });

  progress.show({ onCancel });
  created.emitClose();

  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('bindParentWindow detaches minimize, restore and hide listeners', () => {
  const parent = createMockParent();
  const onHide = jest.fn();
  const detach = bindParentWindow(parent, {
    onMinimize: jest.fn(),
    onRestore: jest.fn(),
    onHide,
  });

  parent.emit('hide');
  expect(onHide).toHaveBeenCalledTimes(1);

  detach();
  parent.emit('hide');
  expect(onHide).toHaveBeenCalledTimes(1);
});
