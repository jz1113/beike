import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../rateLimiter';

describe('RateLimiter', () => {
  it('should space out calls according to target QPS', async () => {
    // Test with 20 QPS (50ms interval) for fast testing
    const limiter = new RateLimiter(20);
    const start = Date.now();
    const timestamps: number[] = [];

    const tasks = Array.from({ length: 4 }, async () => {
      await limiter.acquire();
      timestamps.push(Date.now() - start);
    });

    await Promise.all(tasks);
    expect(timestamps.length).toBe(4);
    // The 4th task should be executed at least 140ms later (3 intervals of 50ms)
    expect(timestamps[3]).toBeGreaterThanOrEqual(120);
  });

  it('should handle backoff properly', async () => {
    const limiter = new RateLimiter(50);
    limiter.triggerBackoff(100);
    const start = Date.now();

    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });
});
