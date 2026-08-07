// frontend/src/utils/logger.test.ts
import { logger } from './logger';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  jest.restoreAllMocks();
});

test('вне production делегирует в консоль', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const warnSpy = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const errorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);

  const error = new Error('boom');
  logger.log('info', 42);
  logger.warn('careful');
  logger.error('failed', error);

  expect(logSpy).toHaveBeenCalledWith('info', 42);
  expect(warnSpy).toHaveBeenCalledWith('careful');
  expect(errorSpy).toHaveBeenCalledWith('failed', error);
});

test('в production не пишет в консоль', () => {
  process.env.NODE_ENV = 'production';

  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const warnSpy = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const errorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);

  logger.log('info', 42);
  logger.warn('careful');
  logger.error('failed', new Error('boom'));

  expect(logSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();
});
