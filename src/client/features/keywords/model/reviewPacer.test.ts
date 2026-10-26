import { describe, expect, it, vi } from 'vitest';
import { ReviewPacer } from './reviewPacer';

describe('ReviewPacer', () => {
  it('backs off between retry passes and caps the wait at one minute', async () => {
    vi.useFakeTimers();
    try {
      const pacer = new ReviewPacer();
      for (const [round, delay] of [[1, 5_000], [2, 10_000], [3, 20_000], [4, 40_000], [5, 60_000], [1000, 60_000]]) {
        let finished = false;
        const waiting = pacer.waitToRetry(round, () => false).then((value) => { finished = value; });
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(finished).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await waiting;
        expect(finished).toBe(true);
      }
      expect(await pacer.acquire(() => false)).toBe(true);
      pacer.succeeded();
    } finally { vi.useRealTimers(); }
  });

  it('honors a stop during retry backoff within half a second', async () => {
    vi.useFakeTimers();
    try {
      const pacer = new ReviewPacer();
      let stopped = false;
      const waiting = pacer.waitToRetry(5, () => stopped);
      await vi.advanceTimersByTimeAsync(300);
      stopped = true;
      await vi.advanceTimersByTimeAsync(200);
      expect(await waiting).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

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

  it('halves the ceiling after a timeout and does not double back', async () => {
    const pacer = new ReviewPacer(8);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(2);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(4);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.timedOut();
    expect(pacer.concurrency).toBe(2);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(2);
  });

  it('does not raise concurrency after a slow success and halves when above two', async () => {
    const pacer = new ReviewPacer(8);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(4);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeededSlow();
    expect(pacer.concurrency).toBe(2);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeededSlow();
    expect(pacer.concurrency).toBe(2);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(2);
  });

  it('keeps a single in-flight request after a timeout at the floor', async () => {
    const pacer = new ReviewPacer(8);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.timedOut();
    expect(pacer.concurrency).toBe(1);
    expect(await pacer.acquire(() => false)).toBe(true);
    pacer.succeeded();
    expect(pacer.concurrency).toBe(1);
  });
});
