import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDefaultGroupPrices } from './pricing.ts';

test('Comfly ratios match the supplied default-group quotation', () => {
  const prices = parseDefaultGroupPrices({
    group_ratio: { default: 1, origin: 7.3 },
    data: [
      { model_name: 'gpt-6-luna', quota_type: 0, model_ratio: 0.05, completion_ratio: 5, enable_groups: ['default', 'origin'] },
      { model_name: 'gpt-5.6-luna', quota_type: 0, model_ratio: 0.5, completion_ratio: 6, enable_groups: ['default'] },
      { model_name: 'grok-4.7', quota_type: 0, model_ratio: 1, completion_ratio: 3, enable_groups: ['default'] },
      { model_name: 'image-only', quota_type: 1, model_ratio: 1, completion_ratio: 1, enable_groups: ['default'] },
      { model_name: 'other-group', quota_type: 0, model_ratio: 1, completion_ratio: 1, enable_groups: ['origin'] },
    ],
  });
  assert.deepEqual(prices['gpt-6-luna'], { promptPer1k: 0.0001, completionPer1k: 0.0005 });
  assert.deepEqual(prices['gpt-5.6-luna'], { promptPer1k: 0.001, completionPer1k: 0.006 });
  assert.deepEqual(prices['grok-4.7'], { promptPer1k: 0.002, completionPer1k: 0.006 });
  assert.equal(prices['image-only'], undefined);
  assert.equal(prices['other-group'], undefined);
});
