import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestReviewBatch } from './reviewRequest.ts';

const signal = new AbortController().signal;
const result = { id: 'sheet:2', category: '动物', producible: '制作', categoryReason: '动物相关', rejectReason: '' };
const json = (body, status = 200) => Response.json(body, { status });

test('HTML gateway failure replays the identical submission key and recovers a receipt', async () => {
  const keys = [];
  const fetcher = async (_path, init) => {
    keys.push(init.headers['x-idempotency-key']);
    return keys.length === 1
      ? new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })
      : json({ success: true, results: [result] });
  };
  const response = await requestReviewBatch('{}', signal, 'keyword:same:0', { fetcher, retryDelayMs: 0 });
  assert.deepEqual(keys, ['keyword:same:0', 'keyword:same:0']);
  assert.deepEqual(response.results, [result]);
});

test('unknown submission stays quarantined and is not retried under a new key', async () => {
  const keys = [];
  const fetcher = async (_path, init) => {
    keys.push(init.headers['x-idempotency-key']);
    return keys.length === 1
      ? new Response('<html>Bad Gateway</html>', { status: 502 })
      : json({ success: false, submissionUnknown: true, error: '提交结果待核对' }, 409);
  };
  await assert.rejects(
    requestReviewBatch('{}', signal, 'keyword:same:0', { fetcher, retryDelayMs: 0 }),
    (error) => error.outcomeUncertain === true && error.infrastructureFailure === true,
  );
  assert.deepEqual(keys, ['keyword:same:0', 'keyword:same:0']);
});

test('persistent HTML error is sanitized and bounded', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response('<html>Bad Gateway</html>', { status: 502 }); };
  await assert.rejects(
    requestReviewBatch('{}', signal, 'keyword:same:0', { fetcher, retryDelayMs: 0 }),
    (error) => error.outcomeUncertain === true && /HTTP 502 非 JSON/.test(error.message) && !error.message.includes('<html>'),
  );
  assert.equal(calls, 3);
});

test('confirmed provider rejection is not replayed as a transport failure', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return json({ success: false, error: '余额不足', code: 'deepseek_api_error' }, 402); };
  await assert.rejects(
    requestReviewBatch('{}', signal, 'keyword:same:0', { fetcher, retryDelayMs: 0 }),
    (error) => error.fatalConfig === true && error.outcomeUncertain !== true,
  );
  assert.equal(calls, 1);
});

test('server failure with an uncertain charge is isolated from paid retries', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return json({ success: false, error: '审核服务内部错误' }, 500); };
  await assert.rejects(
    requestReviewBatch('{}', signal, 'keyword:same:0', { fetcher, retryDelayMs: 0 }),
    (error) => error.outcomeUncertain === true && error.infrastructureFailure === true,
  );
  assert.equal(calls, 1);
});
