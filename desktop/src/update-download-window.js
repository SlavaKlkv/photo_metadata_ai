'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');

const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 190;

function buildProgressPage() {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' +
    'body{margin:0;display:flex;flex-direction:column;background:#17151f;' +
    'color:#eceaf8;font-family:-apple-system,sans-serif;height:100vh}' +
    '.drag{-webkit-app-region:drag;padding:16px 16px 10px;display:flex;' +
    'flex-direction:column;align-items:center;gap:10px}' +
    'p{margin:0;font-size:15px;font-weight:500}' +
    '.track{width:280px;height:6px;border-radius:999px;background:#2a2738;overflow:hidden}' +
    '.bar{height:100%;width:0;background:linear-gradient(90deg,#6f6ce4,#b3a6f7);' +
    'transition:width .15s ease}' +
    '.pct{font-size:13px;color:#b3a6f7;min-width:3ch;text-align:center}' +
    '.footer{-webkit-app-region:no-drag;display:flex;flex-direction:column;' +
    'align-items:center;gap:8px;padding:0 16px 16px}' +
    '.hint{font-size:12px;color:#8a869c;margin:0}' +
    'button{padding:6px 14px;border:1px solid #3d3952;border-radius:8px;' +
    'background:#2a2738;color:#eceaf8;font-size:13px;cursor:pointer}' +
    'button:hover{background:#353148}' +
    '</style></head><body>' +
    '<div class="drag">' +
    '<p>Downloading update…</p>' +
    '<div class="track"><div id="bar" class="bar"></div></div>' +
    '<div id="pct" class="pct">0%</div>' +
    '</div>' +
    '<div class="footer">' +
    '<p class="hint">Esc to cancel</p>' +
    '<button type="button" id="cancel-btn">Cancel</button>' +
    '</div>' +
    '</body></html>'
  );
}

function clampRatio(ratio) {
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return Math.max(0, Math.min(1, ratio));
}

function computeCenteredPlacement(mainBounds, size = {}) {
  const width = size.width ?? WINDOW_WIDTH;
  const height = size.height ?? WINDOW_HEIGHT;
  const offsetX = Math.round((mainBounds.width - width) / 2);
  const offsetY = Math.round((mainBounds.height - height) / 2);

  return {
    x: mainBounds.x + offsetX,
    y: mainBounds.y + offsetY,
    offsetX,
    offsetY,
  };
}

function isFullyOutsideParentBounds(parentBounds, childBounds) {
  const parentRight = parentBounds.x + parentBounds.width;
  const parentBottom = parentBounds.y + parentBounds.height;
  const childRight = childBounds.x + childBounds.width;
  const childBottom = childBounds.y + childBounds.height;

  return (
    childRight <= parentBounds.x ||
    childBounds.x >= parentRight ||
    childBottom <= parentBounds.y ||
    childBounds.y >= parentBottom
  );
}

function bindParentWindow(parent, handlers) {
  const { onMinimize, onRestore, onHide } = handlers;

  parent.on('minimize', onMinimize);
  parent.on('restore', onRestore);
  parent.on('hide', onHide);

  return () => {
    if (parent.isDestroyed()) {
      return;
    }
    parent.removeListener('minimize', onMinimize);
    parent.removeListener('restore', onRestore);
    parent.removeListener('hide', onHide);
  };
}

/**
 * Окно прогресса загрузки .dmg.
 * На macOS — child главного окна: ОС двигает его вместе с parent без ручного
 * setPosition на каждый move. После ручного перетаскивания — setParentWindow(null).
 * modal: false — главное окно не блокируется, close-guard работает.
 */
function createUpdateDownloadWindow(deps = {}) {
  const BrowserWindowImpl = deps.BrowserWindow ?? BrowserWindow;
  const bindParent = deps.bindParentWindow ?? bindParentWindow;
  const preloadPath =
    deps.preloadPath ?? path.join(__dirname, 'update-download-preload.js');
  let window = null;
  let detachFromParent = null;
  let shouldRevealOnRestore = false;
  let closingProgrammatically = false;
  let onCancel = null;
  let attachedToParent = false;
  let boundParent = null;

  function hide() {
    if (window && !window.isDestroyed()) {
      window.hide();
    }
  }

  function reveal() {
    if (shouldRevealOnRestore && window && !window.isDestroyed()) {
      window.show();
    }
  }

  function handleUserCancel() {
    if (closingProgrammatically) {
      return;
    }
    onCancel?.();
  }

  function setWindowPosition(x, y) {
    if (!window || window.isDestroyed()) {
      return;
    }
    window.setPosition(Math.round(x), Math.round(y), false);
  }

  function centerOnParent() {
    if (!window || window.isDestroyed() || !boundParent || boundParent.isDestroyed()) {
      return;
    }
    const placement = computeCenteredPlacement(boundParent.getBounds());
    setWindowPosition(placement.x, placement.y);
  }

  function detachFromParentWindow() {
    if (!attachedToParent || !window || window.isDestroyed()) {
      return;
    }
    attachedToParent = false;
    if (typeof window.setParentWindow === 'function') {
      window.setParentWindow(null);
    }
  }

  function detachWhenOutsideParent() {
    if (
      !attachedToParent ||
      !window ||
      window.isDestroyed() ||
      !boundParent ||
      boundParent.isDestroyed()
    ) {
      return;
    }
    if (isFullyOutsideParentBounds(boundParent.getBounds(), window.getBounds())) {
      detachFromParentWindow();
    }
  }

  function attachWindowListeners() {
    if (!window || window.isDestroyed()) {
      return;
    }

    window.on('close', () => {
      handleUserCancel();
    });
    window.on('moved', detachWhenOutsideParent);
  }

  function show({ parent, onCancel: cancelHandler } = {}) {
    onCancel = cancelHandler ?? null;
    boundParent = parent && !parent.isDestroyed() ? parent : null;
    attachedToParent = Boolean(boundParent);
    closingProgrammatically = false;

    if (window && !window.isDestroyed()) {
      if (boundParent) {
        if (typeof window.setParentWindow === 'function') {
          window.setParentWindow(boundParent);
          attachedToParent = true;
        }
        centerOnParent();
      }
      shouldRevealOnRestore = true;
      window.show();
      return window;
    }

    shouldRevealOnRestore = true;
    detachFromParent?.();
    detachFromParent = null;

    window = new BrowserWindowImpl({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      resizable: false,
      frame: false,
      show: false,
      modal: false,
      closable: true,
      movable: true,
      skipTaskbar: true,
      parent: boundParent ?? undefined,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    attachWindowListeners();

    if (boundParent) {
      centerOnParent();

      detachFromParent = bindParent(boundParent, {
        onMinimize: hide,
        onRestore: reveal,
        onHide: hide,
      });
    }

    window.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(buildProgressPage())
    );
    window.once('ready-to-show', () => {
      if (!window || window.isDestroyed()) {
        return;
      }
      if (boundParent && !boundParent.isDestroyed()) {
        centerOnParent();
      }
      window.show();
    });

    return window;
  }

  function setProgress(ratio) {
    if (!window || window.isDestroyed()) {
      return;
    }

    const percent = Math.round(clampRatio(ratio) * 100);
    void window.webContents
      .executeJavaScript(
        `(() => {
          const bar = document.getElementById('bar');
          const pct = document.getElementById('pct');
          if (bar) bar.style.width = '${percent}%';
          if (pct) pct.textContent = '${percent}%';
        })();`
      )
      .catch(() => {});
  }

  function close() {
    shouldRevealOnRestore = false;
    attachedToParent = false;
    closingProgrammatically = true;
    detachFromParent?.();
    detachFromParent = null;
    boundParent = null;
    if (window && !window.isDestroyed()) {
      window.removeAllListeners('close');
      window.close();
    }
    window = null;
    onCancel = null;
  }

  return {
    show,
    hide,
    reveal,
    setProgress,
    close,
    detachFromParent: detachFromParentWindow,
    isFollowingMainWindow: () => attachedToParent,
  };
}

module.exports = {
  WINDOW_WIDTH,
  WINDOW_HEIGHT,
  buildProgressPage,
  bindParentWindow,
  clampRatio,
  computeCenteredPlacement,
  createUpdateDownloadWindow,
};
