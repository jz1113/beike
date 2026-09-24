import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODEL_OUTPUT_ATTEMPTS, reviewBatchWithRecovery } from './reviewBatchRecovery.ts';

const row = (id) => ({ id: String(id) });

test('retries a fully malformed batch once and then keeps the result', async () => {
  let calls = 0;
  const completed = [];
  await reviewBatchWithRecovery({
    rows: [1, 2, 3].map(row),
    submit: async (rows) => {
      calls += 1;
      if (calls === 1) throw { modelOutputInvalid: true };
      completed.push(...rows.map((item) => item.id));
      return [];
    },
    isModelOutputError: (error) => error?.modelOutputInvalid === true,
    onSingleRowFailure: () => assert.fail('no row should fail'),
    shouldStop: () => false,
  });
  assert.equal(calls, 2);
  assert.deepEqual(completed, ['1', '2', '3']);
});

test('retries only the failed ids once and does not split the batch', async () => {
  const completed = [];
  const failed = [];
  const sizes = [];
  await reviewBatchWithRecovery({
    rows: [1, 2, 3, 4].map(row),
    submit: async (rows) => {
      sizes.push(rows.length);
      completed.push(...rows.filter((item) => item.id !== '3').map((item) => item.id));
      return rows.some((item) => item.id === '3') ? ['3'] : [];
    },
    isModelOutputError: () => false,
    onSingleRowFailure: (item) => failed.push(item.id),
    shouldStop: () => false,
  });
  assert.deepEqual(sizes, [4, 1]);
  assert.deepEqual(completed, ['1', '2', '4']);
  assert.deepEqual(failed, ['3']);
  assert.equal(MODEL_OUTPUT_ATTEMPTS, 2);
});

test('does not retry uncertain submission errors', async () => {
  let calls = 0;
  await assert.rejects(reviewBatchWithRecovery({
    rows: [1, 2].map(row),
    submit: async () => { calls += 1; throw new Error('提交结果不确定'); },
    isModelOutputError: (error) => error?.modelOutputInvalid === true,
    onSingleRowFailure: () => assert.fail('no row should be marked failed'),
    shouldStop: () => false,
  }), /提交结果不确定/);
  assert.equal(calls, 1);
});

test('stops after one full retry when every row stays malformed', async () => {
  let calls = 0;
  const failed = [];
  const result = await reviewBatchWithRecovery({
    rows: Array.from({ length: 50 }, (_, index) => row(index)),
    submit: async () => { calls += 1; throw { modelOutputInvalid: true }; },
    isModelOutputError: (error) => error?.modelOutputInvalid === true,
    onSingleRowFailure: (item) => failed.push(item.id),
    onUnresolvedRows: (rows) => failed.push(...rows.map((item) => item.id)),
    shouldStop: () => false,
  });
  assert.equal(calls, MODEL_OUTPUT_ATTEMPTS);
  assert.equal(result.exhausted, true);
  assert.equal(failed.length, 50);
});
