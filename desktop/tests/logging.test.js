'use strict';

const fs = require('fs');
const { app } = require('electron');

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(),
}));
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/photo-metadata-logs') },
}));

const { pipeBackendLogs } = require('../src/logging');

test('creates log directory and pipes both backend streams', () => {
  const logStream = { write: jest.fn() };
  const backendProcess = {
    stdout: { pipe: jest.fn() },
    stderr: { pipe: jest.fn() },
  };
  fs.createWriteStream.mockReturnValue(logStream);

  const result = pipeBackendLogs(backendProcess);

  expect(app.getPath).toHaveBeenCalledWith('logs');
  expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/photo-metadata-logs', {
    recursive: true,
  });
  expect(fs.createWriteStream).toHaveBeenCalledWith(
    '/tmp/photo-metadata-logs/backend.log',
    { flags: 'a' }
  );
  expect(logStream.write).toHaveBeenCalledWith(
    expect.stringContaining('backend started')
  );
  expect(backendProcess.stdout.pipe).toHaveBeenCalledWith(logStream);
  expect(backendProcess.stderr.pipe).toHaveBeenCalledWith(logStream);
  expect(result).toBe('/tmp/photo-metadata-logs/backend.log');
});
