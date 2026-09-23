import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReviewBatchSubmit } from './reviewBatchSubmit.ts';
import { ReviewPacer } from './reviewPacer.ts';

function options(request) {
  const row = { id: 'sheet:2', query: '测试词', status: 'idle' };
  const versions = new Map();
  let dispatches = 0;
  return {
    row, versions,
    run: createReviewBatchSubmit({
      model: 'deepseek-flash', apiKey: 'test', lookup: false, rulesVersion: 0,
      signal: new AbortController().signal, shouldStop: () => false,
      indices: new Map([[row.id, 0]]), versions, pacer: new ReviewPacer(),
      onDispatch: () => { dispatches += 1; },
      onSuccess: () => {}, onRateLimit: () => {}, onFailure: () => {}, request,
    }),
    get dispatches() { return dispatches; },
  };
}

test('confirmed 429 uses a new idempotency key, then accepts one result', async () => {
  const keys = [];
  const run = options(async (_body, _signal, key) => {
    keys.push(key);
    if (keys.length === 1) throw Object.assign(new Error('限流'), { rateLimited: true });
    return { success: true, results: [{ id: 'sheet:2', category: '动物', producible: '制作', categoryReason: '动物相关', rejectReason: '' }] };
  });
  await run.run([run.row]);
  assert.equal(run.dispatches, 2);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(run.versions.get(0), 1);
});

test('unknown submission outcome is never resubmitted automatically', async () => {
  const run = options(async () => { throw new Error('提交结果不确定'); });
  await assert.rejects(run.run([run.row]), /提交结果不确定/);
  assert.equal(run.dispatches, 1);
  assert.equal(run.versions.size, 0);
});
