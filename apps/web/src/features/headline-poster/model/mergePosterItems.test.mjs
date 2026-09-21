import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePosterItems } from './mergePosterItems.ts';

test('mergePosterItems retains every imported row beyond 100', () => {
  const imported = Array.from({ length: 122 }, (_, index) => ({ id: `row-${index}` }));
  const merged = mergePosterItems([], imported);

  assert.equal(merged.length, 122);
  assert.equal(merged[121].id, 'row-121');
});
