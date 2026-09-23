import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetryableUpstreamError, isRetryableUpstreamStatus } from './upstreamErrors.ts';

test('model fallback only follows an explicit rejected endpoint', () => {
  assert.equal(isRetryableUpstreamStatus(404), true);
  for (const status of [408, 409, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableUpstreamStatus(status), false);
    assert.equal(isRetryableUpstreamError(Object.assign(new Error('upstream failed'), { status })), false);
  }
  assert.equal(isRetryableUpstreamError(new Error('fetch failed')), false);
  assert.equal(isRetryableUpstreamError(new DOMException('timed out', 'TimeoutError')), false);
});
