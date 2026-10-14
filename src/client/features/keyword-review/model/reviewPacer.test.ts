import { describe, expect, it } from 'vitest';
import { ReviewPacer } from './reviewPacer';

describe('ReviewPacer', () => {
  it('warms the prefix cache with one request and then doubles', async () => {
    const pacer = new ReviewPacer(8);
    expect(pacer.concurrency).toBe(1);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(2);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(4);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(8);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(8);
  });
});
