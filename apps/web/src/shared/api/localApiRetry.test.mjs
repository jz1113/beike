import assert from 'node:assert/strict';
import test from 'node:test';
import { retryWhenLocalApiUnavailable } from './localApiRetry.ts';

test('a lost model POST response is never replayed', async () => {
  let calls = 0;
  await assert.rejects(
    retryWhenLocalApiUnavailable(async () => {
      calls += 1;
      throw new TypeError('Failed to fetch');
    }, { delays: [0] }),
    /Failed to fetch/,
  );
  assert.equal(calls, 1);
});

test('an explicit local sidecar unavailable response may be retried', async () => {
  let calls = 0;
  const response = await retryWhenLocalApiUnavailable(async () => {
    calls += 1;
    return calls === 1
      ? Response.json({ error: '本地后台服务未连接' }, { status: 502 })
      : Response.json({ success: true });
  }, { delays: [0] });
  assert.equal(response.ok, true);
  assert.equal(calls, 2);
});
