import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from './fetch.ts';

test('OpenAI model discovery uses independent key and shows the complete returned directory', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let authorization = '';
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    authorization = init.headers.Authorization;
    return Response.json({ data: [
      { id: 'gpt-6-astra', owned_by: 'openai' },
      { id: 'gpt-5.6-luna', owned_by: 'openai' },
      { id: 'gpt-5.6', owned_by: 'openai' },
      { id: 'text-embedding-3-small', owned_by: 'openai' },
    ] });
  };
  try {
    const response = await POST(new Request('http://localhost/api/system/models/fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-custom-api-key': 'comfly-key' },
      body: JSON.stringify({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'openai-key', strict: true }),
    }));
    const body = await response.json();
    assert.equal(requestedUrl, 'https://api.openai.com/v1/models');
    assert.equal(authorization, 'Bearer openai-key');
    assert.equal(body.provider, 'openai');
    assert.deepEqual(body.models.map(model => [model.id, model.supported]), [
      ['gpt-6-astra', true], ['gpt-5.6-luna', true], ['gpt-5.6', true], ['text-embedding-3-small', false],
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test('OpenAI model discovery never uses Comfly key or fallback catalog', async () => {
  const response = await POST(new Request('http://localhost/api/system/models/fetch', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-custom-api-key': 'comfly-key' },
    body: JSON.stringify({ provider: 'openai', strict: true }),
  }));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.deepEqual(body.models, []);
});
