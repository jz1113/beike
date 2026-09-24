import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateReviewYuan, isDeepSeekPeakHour, readTokenUsage } from './reviewCost.ts';

test('reads chat and lookup usage shapes', () => {
  assert.deepEqual(readTokenUsage({
    prompt_tokens: 100, completion_tokens: 40, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20,
  }), { cacheHit: 80, cacheMiss: 20, completion: 40 });
  assert.deepEqual(readTokenUsage({
    input_tokens: 30, output_tokens: 4, input_tokens_details: { cached_tokens: 10 },
  }), { cacheHit: 10, cacheMiss: 20, completion: 4 });
});

test('weekday Beijing afternoon is peak and Sunday is off-peak', () => {
  assert.equal(isDeepSeekPeakHour(new Date('2026-09-24T07:00:00Z')), true);
  assert.equal(isDeepSeekPeakHour(new Date('2026-09-27T07:00:00Z')), false);
  const usage = { cacheHit: 1_000_000, cacheMiss: 1_000_000, completion: 1_000_000 };
  assert.equal(estimateReviewYuan(usage, new Date('2026-09-24T07:00:00Z')).yuan, 10.04);
  assert.equal(estimateReviewYuan(usage, new Date('2026-09-27T07:00:00Z')).yuan, 5.02);
});
