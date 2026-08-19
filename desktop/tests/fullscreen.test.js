'use strict';

const { installFullscreenControls } = require('../src/fullscreen');

function createWindow({ isFullScreen = true } = {}) {
  const listeners = {};
  const window = {
    on: jest.fn((eventName, handler) => {
      listeners[eventName] = handler;
    }),
    webContents: {
      on: jest.fn((eventName, handler) => {
        listeners[eventName] = handler;
      }),
      send: jest.fn(),
    },
    isFullScreen: jest.fn(() => isFullScreen),
    setFullScreen: jest.fn(),
  };

  installFullscreenControls(window);

  return { listeners, window };
}

test('exits fullscreen on Escape and consumes the key press', () => {
  const { listeners, window } = createWindow();
  const event = { preventDefault: jest.fn() };

  listeners['before-input-event'](event, {
    type: 'keyDown',
    key: 'Escape',
  });

  expect(event.preventDefault).toHaveBeenCalled();
  expect(window.setFullScreen).toHaveBeenCalledWith(false);
});

test('does not consume Escape outside fullscreen', () => {
  const { listeners, window } = createWindow({ isFullScreen: false });
  const event = { preventDefault: jest.fn() };

  listeners['before-input-event'](event, {
    type: 'keyDown',
    key: 'Escape',
  });

  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(window.setFullScreen).not.toHaveBeenCalled();
});

test('ignores Escape keyup events', () => {
  const { listeners, window } = createWindow();
  const event = { preventDefault: jest.fn() };

  listeners['before-input-event'](event, {
    type: 'keyUp',
    key: 'Escape',
  });

  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(window.setFullScreen).not.toHaveBeenCalled();
});

test('notifies the renderer after entering fullscreen', () => {
  const { listeners, window } = createWindow();

  listeners['enter-full-screen']();

  expect(window.webContents.send).toHaveBeenCalledWith(
    'app:entered-fullscreen'
  );
});
