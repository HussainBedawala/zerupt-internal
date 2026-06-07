import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimiter } from '../rate-limit.js';

beforeEach(() => {
  resetRateLimiter();
});

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit('tokenA')).toBe(true);
    }
  });

  it('blocks the 61st request within a minute', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('tokenB');
    }
    expect(checkRateLimit('tokenB')).toBe(false);
  });

  it('tracks keys independently', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('tokenC');
    }
    // Different key should be unaffected
    expect(checkRateLimit('tokenD')).toBe(true);
  });

  it('resets between test runs', () => {
    for (let i = 0; i < 60; i++) checkRateLimit('tokenE');
    expect(checkRateLimit('tokenE')).toBe(false);

    resetRateLimiter();
    expect(checkRateLimit('tokenE')).toBe(true);
  });
});
