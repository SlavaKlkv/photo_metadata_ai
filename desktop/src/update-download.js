'use strict';

const fs = require('fs');
const path = require('path');

const FALLBACK_DMG_NAME = 'Photo-Metadata-AI.dmg';
const DOWNLOAD_CANCELLED = 'Update download cancelled';

function uniqueSavePath(filePath, existsSync = fs.existsSync) {
  if (!existsSync(filePath)) {
    return filePath;
  }

  const ext = path.extname(filePath);
  const base = ext ? filePath.slice(0, -ext.length) : filePath;
  let n = 1;
  while (existsSync(`${base} (${n})${ext}`)) {
    n += 1;
  }
  return `${base} (${n})${ext}`;
}

function filenameFromItem(item) {
  const name =
    typeof item.getFilename === 'function' ? String(item.getFilename() || '') : '';
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    return FALLBACK_DMG_NAME;
  }
  return path.basename(trimmed);
}

/**
 * Качает .dmg в Downloads, открывает его и закрывает приложение.
 * Закрывать нужно после скачивания: пока процесс жив, бандл в
 * Applications занят и его нельзя заменить.
 */
async function downloadUpdateAndQuit({
  url,
  session,
  downloadDir,
  openPath,
  showItemInFolder,
  quit,
  onProgress,
  abortSignal,
  existsSync = fs.existsSync,
}) {
  const dest = await new Promise((resolve, reject) => {
    let downloadItem = null;
    let settled = false;

    const finish = (handler, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      handler(value);
    };

    const onWillDownload = (_event, item) => {
      downloadItem = item;
      session.removeListener('will-download', onWillDownload);
      const savePath = uniqueSavePath(
        path.join(downloadDir, filenameFromItem(item)),
        existsSync
      );
      item.setSavePath(savePath);

      if (typeof onProgress === 'function') {
        item.on('updated', () => {
          const total = item.getTotalBytes();
          const received = item.getReceivedBytes();
          onProgress(total > 0 ? received / total : 0);
        });
      }

      item.once('done', (_doneEvent, state) => {
        if (state === 'completed') {
          finish(resolve, savePath);
        } else if (abortSignal?.aborted) {
          finish(reject, new Error(DOWNLOAD_CANCELLED));
        } else {
          finish(reject, new Error(`Update download ${state}`));
        }
      });
    };

    const cleanup = () => {
      session.removeListener('will-download', onWillDownload);
      abortSignal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (downloadItem && typeof downloadItem.cancel === 'function') {
        downloadItem.cancel();
        return;
      }
      cleanup();
      finish(reject, new Error(DOWNLOAD_CANCELLED));
    };

    if (abortSignal?.aborted) {
      finish(reject, new Error(DOWNLOAD_CANCELLED));
      return;
    }

    abortSignal?.addEventListener('abort', onAbort);
    session.on('will-download', onWillDownload);
    try {
      session.downloadURL(url);
    } catch (error) {
      finish(reject, error);
    }
  });

  const openError = await openPath(dest);
  if (openError && typeof showItemInFolder === 'function') {
    showItemInFolder(dest);
  }
  quit();
  return dest;
}

module.exports = {
  DOWNLOAD_CANCELLED,
  FALLBACK_DMG_NAME,
  uniqueSavePath,
  filenameFromItem,
  downloadUpdateAndQuit,
};
