import { describe, expect, it } from 'vitest';
import { reviewBatchWithRecovery } from './reviewBatchRecovery';

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: String(index + 1) }));

describe('reviewBatchWithRecovery', () => {
  it('splits a large malformed batch in half instead of resubmitting it whole', async () => {
    const sizes: number[] = [];
    let calls = 0;
    const result = await reviewBatchWithRecovery({
      rows: rows(12),
      shouldStop: () => false,
      isModelOutputError: (error) => error instanceof Error && error.message === 'bad',
      onSingleRowFailure: () => {},
      submit: async (chunk) => {
        calls += 1;
        sizes.push(chunk.length);
        if (calls === 1) throw new Error('bad');
        return [];
      },
    });
    expect(sizes).toEqual([12, 6, 6]);
    expect(result.attempts).toBe(3);
    expect(result.exhausted).toBe(false);
  });

  it('retries a small malformed batch once', async () => {
    const sizes: number[] = [];
    let calls = 0;
    await reviewBatchWithRecovery({
      rows: rows(4),
      shouldStop: () => false,
      isModelOutputError: (error) => error instanceof Error && error.message === 'bad',
      onSingleRowFailure: () => {},
      submit: async (chunk) => {
        calls += 1;
        sizes.push(chunk.length);
        if (calls === 1) throw new Error('bad');
        return [];
      },
    });
    expect(sizes).toEqual([4, 4]);
  });
});
