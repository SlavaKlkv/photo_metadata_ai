'use strict';

const {
  buildApplicationMenuTemplate,
} = require('../src/application-menu');

test('places Check for Updates in the native application menu', () => {
  const onCheckForUpdates = jest.fn();
  const onResetWindowSize = jest.fn();

  const template = buildApplicationMenuTemplate({
    appName: 'Photo Metadata AI',
    onCheckForUpdates,
    onResetWindowSize,
  });

  expect(template[0].label).toBe('Photo Metadata AI');
  expect(template[0].submenu[0]).toEqual({ role: 'about' });
  expect(template[0].submenu[1]).toEqual({
    label: 'Check for Updates…',
    click: onCheckForUpdates,
  });

  const windowMenu = template.find((item) => item.label === 'Window');
  expect(
    windowMenu.submenu.find((item) => item.label === 'Reset Window Size')
  ).toMatchObject({
    accelerator: 'Ctrl+Cmd+0',
    click: onResetWindowSize,
  });
});
