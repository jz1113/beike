import test from 'node:test';
import assert from 'node:assert/strict';
import { retryWhenLocalApiUnavailable } from '../../shared/api/localApiRetry.ts';

test('retries the Vite local-sidecar 502 until the API is ready', async () => {
  let calls = 0;
  const response = await retryWhenLocalApiUnavailable(() => {
    calls += 1;
    return Promise.resolve(calls === 1
      ? new Response(JSON.stringify({ error: '本地后台服务未连接 (127.0.0.1:3000)' }), { status: 502 })
      : new Response(JSON.stringify({ success: true }), { status: 200 }));
  }, { delays: [0] });

  assert.equal(calls, 2);
  assert.equal(response.status, 200);
});

test('does not retry a normal API failure', async () => {
  let calls = 0;
  const response = await retryWhenLocalApiUnavailable(() => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({ error: '模型配置错误' }), { status: 400 }));
  }, { delays: [0] });

  assert.equal(calls, 1);
  assert.equal(response.status, 400);
});
