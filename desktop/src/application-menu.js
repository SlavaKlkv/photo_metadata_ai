'use strict';

function buildApplicationMenuTemplate({
  appName,
  onCheckForUpdates,
  onResetWindowSize,
}) {
  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        {
          label: 'Check for Updates…',
          click: onCheckForUpdates,
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          // Не Alt+цифра: на macOS Option+цифра порождает спецсимвол
          // (зависит от раскладки), и такой акселератор не срабатывает.
          label: 'Reset Window Size',
          accelerator: 'Ctrl+Cmd+0',
          click: onResetWindowSize,
        },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
}

module.exports = { buildApplicationMenuTemplate };
