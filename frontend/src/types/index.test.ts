// frontend/src/types/index.test.ts
import { resolveDevMockProvider } from './index';

describe('resolveDevMockProvider', () => {
  test('returns mock in dev/test builds', () => {
    expect(resolveDevMockProvider(false)).toBe('mock');
  });

  test('returns null in production builds', () => {
    expect(resolveDevMockProvider(true)).toBeNull();
  });
});
