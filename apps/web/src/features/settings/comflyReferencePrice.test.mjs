import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comflyQuotations, comflyTokenPrice, quotationSummary } from './comflyReferencePrice.ts';
test('PDF snapshot preserves fixed prices, units and non-default groups', () => {
  assert.equal(quotationSummary(comflyQuotations('gpt-image-2')[0]), '฿0.06/次');
  assert.equal(quotationSummary(comflyQuotations('gpt-image-2.5-flare')[0]), '฿0.15/次');
  assert.equal(quotationSummary(comflyQuotations('kling-video-v3').find(q => q.group === '默认分组')), '฿1/credits');
  assert.equal(comflyQuotations('gemini-3.8-flash')[0].group, 'Gemini优质');
  assert.equal(comflyTokenPrice('gemini-3.8-flash'), undefined);
  assert.deepEqual(comflyQuotations('openai/gpt-image-2'), []);
});
test('partial online pricing keeps PDF fallback for missing models without mixing groups', () => {
  const live = { 'gpt-6-luna': { promptPer1k: 1, completionPer1k: 2 } };
  assert.deepEqual(comflyTokenPrice('gpt-6-luna', live), live['gpt-6-luna']);
  assert.deepEqual(comflyTokenPrice('gpt-6-sol', live), { promptPer1k: 0.002, completionPer1k: 0.01 });
  assert.equal(comflyTokenPrice('unknown', live), undefined);
});
