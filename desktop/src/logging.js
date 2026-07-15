'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Направляет stdout/stderr backend-процесса в файл под app.getPath('logs')
 * (~/Library/Logs/Photo Metadata AI/backend.log). Возвращает путь к логу.
 */
function pipeBackendLogs(backendProcess) {
  const logsDir = app.getPath('logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, 'backend.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  logStream.write(
    `\n--- backend started ${new Date().toISOString()} ---\n`
  );
  backendProcess.stdout.pipe(logStream);
  backendProcess.stderr.pipe(logStream);

  return logPath;
}

module.exports = { pipeBackendLogs };
