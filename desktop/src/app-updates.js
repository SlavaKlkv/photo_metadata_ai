'use strict';

const UPDATES_PATH = '/api/v1/desktop/updates?force=true';

async function fetchDesktopUpdate(appUrl, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${appUrl}${UPDATES_PATH}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Update check failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object') {
    throw new Error('Update check returned an invalid response');
  }

  return payload;
}

async function checkForUpdatesFromMenu({
  requestUpdate,
  showMessageBox,
  downloadAndQuit,
  openExternal,
}) {
  let updateInfo;
  try {
    updateInfo = await requestUpdate();
  } catch {
    await showMessageBox({
      type: 'warning',
      title: 'Photo Metadata AI',
      message: 'Could not check for updates.',
      detail: 'Check your internet connection and try again.',
      buttons: ['OK'],
    });
    return;
  }

  if (updateInfo.status === 'disabled') {
    await showMessageBox({
      type: 'info',
      title: 'Photo Metadata AI',
      message: 'Update checks are unavailable in this build.',
      buttons: ['OK'],
    });
    return;
  }

  if (updateInfo.status !== 'ok') {
    await showMessageBox({
      type: 'warning',
      title: 'Photo Metadata AI',
      message: 'Could not check for updates.',
      detail: 'GitHub Releases is temporarily unavailable. Try again later.',
      buttons: ['OK'],
    });
    return;
  }

  if (!updateInfo.update_available || !updateInfo.latest_version) {
    await showMessageBox({
      type: 'info',
      title: 'Photo Metadata AI',
      message: "You're using the latest version.",
      detail: updateInfo.current_version
        ? `Version ${updateInfo.current_version} is installed.`
        : undefined,
      buttons: ['OK'],
    });
    return;
  }

  const downloadUrl = updateInfo.download_url;
  const releaseUrl = updateInfo.release_url;
  const result = await showMessageBox({
    type: 'info',
    title: 'Photo Metadata AI',
    message: `Version ${updateInfo.latest_version} is available.`,
    detail: downloadUrl
      ? 'The DMG will download to your Downloads folder. The app will quit when the download finishes so you can replace it in Applications.'
      : 'Open GitHub Releases to view the new version.',
    buttons: downloadUrl
      ? ['Download', 'Later']
      : releaseUrl
        ? ['Open in Browser', 'Later']
        : ['OK'],
    defaultId: 0,
    cancelId: downloadUrl || releaseUrl ? 1 : 0,
  });

  if (result.response !== 0) {
    return;
  }

  if (downloadUrl) {
    try {
      await downloadAndQuit(downloadUrl);
    } catch {
      await showMessageBox({
        type: 'warning',
        title: 'Photo Metadata AI',
        message: 'Could not download the update.',
        detail: 'Check your internet connection and try again.',
        buttons: ['OK'],
      });
    }
    return;
  }

  if (releaseUrl) {
    await openExternal(releaseUrl);
  }
}

module.exports = {
  UPDATES_PATH,
  checkForUpdatesFromMenu,
  fetchDesktopUpdate,
};
