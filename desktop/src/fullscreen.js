'use strict';

function installFullscreenControls(window) {
  window.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      input.key === 'Escape' &&
      window.isFullScreen()
    ) {
      event.preventDefault();
      window.setFullScreen(false);
    }
  });

  window.on('enter-full-screen', () => {
    window.webContents.send('app:entered-fullscreen');
  });
}

module.exports = { installFullscreenControls };
