'use strict';

const http = require('http');

jest.mock('http', () => ({
  get: jest.fn(),
}));

const {
  HEALTH_URL,
  TIMEOUT_MS,
  waitForBackend,
} = require('../src/health-check');

beforeEach(() => {
  jest.clearAllMocks();
});

test('resolves true after a successful health response', async () => {
  const request = {
    on: jest.fn().mockReturnThis(),
    destroy: jest.fn(),
  };
  const response = {
    statusCode: 200,
    resume: jest.fn(),
  };
  http.get.mockImplementationOnce((url, options, callback) => {
    expect(url).toBe(HEALTH_URL);
    expect(options).toEqual({ timeout: 2000 });
    callback(response);
    return request;
  });

  await expect(waitForBackend()).resolves.toBe(true);
  expect(response.resume).toHaveBeenCalled();
  expect(TIMEOUT_MS).toBe(30000);
});

test('aborts before making a request when backend already exited', async () => {
  await expect(waitForBackend(() => true)).resolves.toBe(false);
  expect(http.get).not.toHaveBeenCalled();
});
