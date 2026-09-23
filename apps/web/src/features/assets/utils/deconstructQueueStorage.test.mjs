import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readQueueConcurrency, persistQueueConcurrency } from './deconstructQueueStorage.ts';

test('deconstruct concurrency persists selectable values and clamps old invalid values', () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  persistQueueConcurrency(4);
  assert.equal(readQueueConcurrency(), 4);
  values.set('asset_deconstruct_queue_concurrency', '99');
  assert.equal(readQueueConcurrency(), 8);
  values.set('asset_deconstruct_queue_concurrency', '0');
  assert.equal(readQueueConcurrency(), 1);
});
