'use strict';

const {
  buildQuitConfirmOptions,
  createCloseGuard,
  isQuitConfirmed,
} = require('../src/close-guard');

test('quit confirm dialog warns about interrupting a running process', () => {
  const options = buildQuitConfirmOptions();

  expect(options.type).toBe('warning');
  expect(options.buttons).toEqual(['Cancel', 'Quit']);
  // Enter и Esc не могут висеть на одной кнопке на macOS.
  expect(options.defaultId).toBe(1);
  expect(options.cancelId).toBe(0);
  expect(options.defaultId).not.toBe(options.cancelId);
  expect(options.message).toMatch(/process is still running/i);
  expect(options.detail).toMatch(/interrupt/i);
  expect(options.detail).toContain(
    '【Enter】 Quit  ·  【Esc】 Cancel  ·  【Space】 Confirm selection'
  );
});

test('Quit button response is treated as confirmation', () => {
  expect(isQuitConfirmed({ response: 1 })).toBe(true);
  expect(isQuitConfirmed({ response: 0 })).toBe(false);
  expect(isQuitConfirmed(null)).toBe(false);
});

test('allows window close when the app is not busy', () => {
  const event = { preventDefault: jest.fn() };
  const guard = createCloseGuard({
    isBusy: () => false,
    showConfirm: jest.fn(),
    requestQuit: jest.fn(),
  });

  guard.handleWindowClose(event);

  expect(event.preventDefault).not.toHaveBeenCalled();
});

test('blocks window close and shows confirm when busy', async () => {
  const event = { preventDefault: jest.fn() };
  const showConfirm = jest.fn().mockResolvedValue({ response: 0 });
  const requestQuit = jest.fn();
  const guard = createCloseGuard({
    isBusy: () => true,
    showConfirm,
    requestQuit,
  });

  guard.handleWindowClose(event);
  await Promise.resolve();

  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(showConfirm).toHaveBeenCalledTimes(1);
  expect(requestQuit).not.toHaveBeenCalled();
});

test('requests quit after the user confirms from the window close path', async () => {
  const showConfirm = jest.fn().mockResolvedValue({ response: 1 });
  const requestQuit = jest.fn();
  const guard = createCloseGuard({
    isBusy: () => true,
    showConfirm,
    requestQuit,
  });

  guard.handleWindowClose({ preventDefault: jest.fn() });
  await Promise.resolve();
  await Promise.resolve();

  expect(requestQuit).toHaveBeenCalledTimes(1);
});

test('blocks before-quit when busy and allows it after confirmation', async () => {
  const showConfirm = jest.fn().mockResolvedValue({ response: 1 });
  const requestQuit = jest.fn();
  const guard = createCloseGuard({
    isBusy: () => true,
    showConfirm,
    requestQuit,
  });

  const firstQuit = { preventDefault: jest.fn() };
  guard.handleBeforeQuit(firstQuit);
  expect(firstQuit.preventDefault).toHaveBeenCalledTimes(1);

  await Promise.resolve();
  await Promise.resolve();
  expect(requestQuit).toHaveBeenCalledTimes(1);

  // После подтверждения повторный before-quit больше не блокируется.
  const secondQuit = { preventDefault: jest.fn() };
  guard.handleBeforeQuit(secondQuit);
  expect(secondQuit.preventDefault).not.toHaveBeenCalled();
});

test('does not open a second confirm dialog while one is in flight', async () => {
  let resolveConfirm;
  const showConfirm = jest.fn(
    () =>
      new Promise((resolve) => {
        resolveConfirm = resolve;
      })
  );
  const guard = createCloseGuard({
    isBusy: () => true,
    showConfirm,
    requestQuit: jest.fn(),
  });

  guard.handleWindowClose({ preventDefault: jest.fn() });
  guard.handleBeforeQuit({ preventDefault: jest.fn() });

  expect(showConfirm).toHaveBeenCalledTimes(1);

  resolveConfirm({ response: 0 });
  await Promise.resolve();
});
