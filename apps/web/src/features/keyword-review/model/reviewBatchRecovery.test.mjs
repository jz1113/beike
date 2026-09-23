import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewBatchWithRecovery } from './reviewBatchRecovery.ts';

test('retries malformed output and finishes a batch', async () => {
  let calls = 0;
  const completed = [];
  await reviewBatchWithRecovery({
    rows: [1, 2, 3],
    submit: async (rows) => {
      calls += 1;
      if (calls === 1) throw { modelOutputInvalid: true };
      completed.push(...rows);
    },
    isModelOutputError: (error) => error?.modelOutputInvalid === true,
    onSingleRowFailure: () => assert.fail('no row should fail'),
    shouldStop: () => false,
  });
  assert.equal(calls, 2);
  assert.deepEqual(completed, [1, 2, 3]);
});

test('isolates persistent malformed output and completes every other row', async () => {
  const completed = [];
  const failed = [];
  await reviewBatchWithRecovery({
    rows: [1, 2, 3, 4],
    submit: async (rows) => {
      if (rows.includes(3)) throw { modelOutputInvalid: true };
      completed.push(...rows);
    },
    isModelOutputError: (error) => error?.modelOutputInvalid === true,
    onSingleRowFailure: (row) => failed.push(row),
    shouldStop: () => false,
  });
  assert.deepEqual(completed, [1, 2, 4]);
  assert.deepEqual(failed, [3]);
});

test('does not retry uncertain submission errors', async () => {
  let calls = 0;
  await assert.rejects(reviewBatchWithRecovery({
    rows: [1, 2],
    submit: async () => { calls += 1; throw new Error('提交结果不确定'); },
    isModelOutputError: (error) => error?.modelOutputInvalid === true,
    onSingleRowFailure: () => assert.fail('no row should be marked failed'),
    shouldStop: () => false,
  }), /提交结果不确定/);
  assert.equal(calls, 1);
});
