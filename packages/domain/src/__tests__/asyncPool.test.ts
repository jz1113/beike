import { describe, expect, it } from 'vitest';
import { mapWithConcurrency, Semaphore } from '../asyncPool';

describe('mapWithConcurrency', () => {
  it('preserves order with limited concurrency', async () => {
    const items = [1, 2, 3, 4, 5];
    let peak = 0;
    let inFlight = 0;

    const out = await mapWithConcurrency(items, 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });

    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('Semaphore', () => {
  it('limits concurrent runners', async () => {
    const sem = new Semaphore(2);
    let peak = 0;
    let inFlight = 0;

    await Promise.all(
      Array.from({ length: 4 }, () =>
        sem.run(async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((r) => setTimeout(r, 10));
          inFlight--;
        })
      )
    );

    expect(peak).toBeLessThanOrEqual(2);
  });
});
