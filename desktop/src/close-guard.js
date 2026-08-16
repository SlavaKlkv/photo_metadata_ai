'use strict';

/**
 * Подтверждение выхода, пока в приложении идёт процесс
 * (обработка, экспорт, regenerate). Состояние busy приходит
 * из рендерера через IPC; диалог — нативный Electron.
 */

function buildQuitConfirmOptions() {
  return {
    type: 'warning',
    buttons: ['Cancel', 'Quit'],
    // На macOS у кнопки только один key equivalent: если defaultId и
    // cancelId указывают на один индекс, Return не вешается ни на что
    // (остаётся только Escape). Поэтому Enter → Quit, Esc → Cancel.
    defaultId: 1,
    cancelId: 0,
    title: 'Quit Photo Metadata AI?',
    message: 'A process is still running.',
    detail:
      'Quitting now will interrupt it, and progress may be lost.\n\n' +
      '【Enter】 Quit  ·  【Esc】 Cancel  ·  【Space】 Confirm selection',
  };
}

function isQuitConfirmed(result) {
  return result != null && result.response === 1;
}

/**
 * @param {{
 *   isBusy: () => boolean,
 *   showConfirm: () => Promise<{ response: number }>,
 *   requestQuit: () => void,
 * }} deps
 */
function createCloseGuard({ isBusy, showConfirm, requestQuit }) {
  let allowQuit = false;
  let confirmInFlight = false;

  async function confirmAndQuit() {
    if (confirmInFlight || allowQuit) {
      return;
    }
    confirmInFlight = true;
    try {
      const result = await showConfirm();
      if (isQuitConfirmed(result)) {
        allowQuit = true;
        requestQuit();
      }
    } finally {
      confirmInFlight = false;
    }
  }

  function handleWindowClose(event) {
    if (allowQuit || !isBusy()) {
      return;
    }
    event.preventDefault();
    void confirmAndQuit();
  }

  function handleBeforeQuit(event) {
    if (allowQuit || !isBusy()) {
      return;
    }
    event.preventDefault();
    void confirmAndQuit();
  }

  return {
    handleWindowClose,
    handleBeforeQuit,
  };
}

module.exports = {
  buildQuitConfirmOptions,
  createCloseGuard,
  isQuitConfirmed,
};
