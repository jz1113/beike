import assert from 'node:assert/strict';
import test from 'node:test';
import { deepSeekResponseError, DeepSeekApiError } from './keywordReviewUpstreamError.ts';

test('DeepSeek errors show a useful reason without exposing only an HTTP number', async () => {
  const response = Response.json({ error: { message: 'Invalid API key', type: 'authentication_error' } }, { status: 401 });
  const error = await deepSeekResponseError(response);
  assert.equal(error instanceof DeepSeekApiError, true);
  assert.equal(error.status, 401);
  assert.match(error.message, /API Key 无效或已失效/);
  assert.match(error.message, /Invalid API key/);
  assert.doesNotMatch(error.message, /HTTP 401/);
});

test('DeepSeek format errors include the provider parameter detail', async () => {
  const response = Response.json({ error: { message: 'max_tokens is invalid' } }, { status: 400 });
  const error = await deepSeekResponseError(response);
  assert.match(error.message, /请求格式有误/);
  assert.match(error.message, /max_tokens is invalid/);
});

test('DeepSeek errors still have a useful fallback without JSON', async () => {
  const response = new Response('server busy', { status: 503 });
  const error = await deepSeekResponseError(response);
  assert.equal(error.status, 503);
  assert.match(error.message, /服务繁忙/);
});

test('balance, parameter, rate limit and server errors have distinct suggestions', async () => {
  for (const [status, reason] of [
    [402, '余额不足'],
    [422, '请求参数有误'],
    [429, '请求过于频繁'],
    [500, '服务暂时故障'],
  ]) {
    const error = await deepSeekResponseError(new Response(null, { status }));
    assert.match(error.message, new RegExp(reason));
  }
});

test('gateway errors identify the selected provider', async () => {
  const error = await deepSeekResponseError(new Response(null, { status: 429 }), '模型网关');
  assert.equal(error.provider, '模型网关');
  assert.match(error.message, /模型网关请求过于频繁/);
});
