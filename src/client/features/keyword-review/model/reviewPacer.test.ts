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
