import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithRetry } from './gatewayCredentials.ts';

test('the gateway helper never replays a billable POST after a server error', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(null, { status: 503 }); };
  try {
    const response = await fetchWithRetry('https://example.com/v1/images/generations', { method: 'POST' }, { maxAttempts: 3 });
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('the gateway helper never replays a billable POST after transport loss', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('fetch failed'); };
  try {
    await assert.rejects(fetchWithRetry('https://example.com/v1/images/generations', { method: 'POST' }, { maxAttempts: 3 }), /fetch failed/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
