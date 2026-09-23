import assert from 'node:assert/strict';
import test from 'node:test';
import { multimodalPriceScore, sortMultimodalModelsByPrice } from './multimodalPriceSort.ts';

test('sorts priced multimodal models by equal input/output token cost', () => {
  const models = [
    { id: 'gpt-6-sol', isMultimodal: true },
    { id: 'gpt-image-2', isImage: true },
    { id: 'grok-4.7', isMultimodal: true },
    { id: 'gpt-6-luna', isMultimodal: true },
    { id: 'unknown-model', isMultimodal: true },
    { id: 'gpt-5.6-luna', isMultimodal: true },
  ];
  assert.deepEqual(sortMultimodalModelsByPrice(models).map((model) => model.id), [
    'gpt-6-luna', 'gpt-image-2', 'gpt-5.6-luna', 'grok-4.7', 'gpt-6-sol', 'unknown-model',
  ]);
  assert.equal(multimodalPriceScore('unknown-model'), null);
  assert.deepEqual(models.map((model) => model.id).slice(0, 2), ['gpt-6-sol', 'gpt-image-2']);
});

test('live Comfly prices override the local snapshot without moving image slots', () => {
  const models = [
    { id: 'gpt-5.6-luna', isMultimodal: true },
    { id: 'gpt-image-2', isImage: true },
    { id: 'gpt-6-luna', isMultimodal: true },
  ];
  const live = {
    'gpt-5.6-luna': { promptPer1k: 0.001, completionPer1k: 0.006 },
    'gpt-6-luna': { promptPer1k: 0.0001, completionPer1k: 0.0005 },
  };
  assert.deepEqual(sortMultimodalModelsByPrice(models, live).map((item) => item.id), [
    'gpt-6-luna', 'gpt-image-2', 'gpt-5.6-luna',
  ]);
});
