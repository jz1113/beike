import assert from 'node:assert/strict';
import test from 'node:test';
import { runBatchVisionAnalyze } from './batchVisionAnalyzeQueue.ts';

test('batch progress counts only analyses that actually completed', async () => {
  const finished = [];
  const success = await runBatchVisionAnalyze({
    items: [{ id: 'one' }, { id: 'two' }],
    concurrency: 2,
    isAborted: () => false,
    analyzeOne: async (item) => item.id === 'one',
    onItemStart: () => {},
    onItemFinish: (count) => finished.push(count),
    onItemError: () => {},
  });
  assert.equal(success, 1);
  assert.equal(finished.at(-1), 2);
});
