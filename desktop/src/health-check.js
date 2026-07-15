'use strict';

const http = require('http');

const HEALTH_URL = 'http://127.0.0.1:8000/api/v1/desktop/health';
const POLL_INTERVAL_MS = 300;
const TIMEOUT_MS = 30000;

function probeOnce() {
  return new Promise((resolve) => {
    const request = http.get(HEALTH_URL, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

/**
 * Опрашивает health-эндпоинт backend, пока он не ответит 200
 * или не истечёт таймаут. `shouldAbort` позволяет прервать ожидание,
 * если backend-процесс упал раньше времени.
 */
async function waitForBackend(shouldAbort) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (shouldAbort && shouldAbort()) {
      return false;
    }
    if (await probeOnce()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

module.exports = { waitForBackend, HEALTH_URL, TIMEOUT_MS };
