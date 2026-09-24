import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from './fetch.ts';
import { configureDomainRuntime } from '@beike/domain/runtime';

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

test('OpenAI model discovery tries the same gateway /models path and accepts Codex slugs', async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return urls.length === 1
      ? Response.json({ message: 'not found' }, { status: 404 })
      : Response.json({ models: [{ slug: 'gpt-6-sol', display_name: 'GPT 6 Sol' }] });
  };
  try {
    const response = await POST(new Request('http://localhost/api/system/models/fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', baseUrl: 'https://example.com/v1', apiKey: 'test-key', strict: true }),
    }));
    const body = await response.json();
    assert.deepEqual(urls, ['https://example.com/v1/models', 'https://example.com/models']);
    assert.equal(response.status, 200);
    assert.deepEqual(body.models.map(model => model.id), ['gpt-6-sol']);
  } finally { globalThis.fetch = originalFetch; }
});

test('OpenAI model discovery reports an empty incompatible directory', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ result: { unexpected: [] } });
  try {
    const response = await POST(new Request('http://localhost/api/system/models/fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', baseUrl: 'https://example.com', apiKey: 'test-key', strict: true }),
    }));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.match(body.error, /不兼容格式/);
  } finally { globalThis.fetch = originalFetch; }
});

test('production does not send an API key to a public HTTP gateway', async () => {
  configureDomainRuntime({ env: { NODE_ENV: 'production', ALLOW_CUSTOM_BASE_URL: 'false' } });
  try {
    const response = await POST(new Request('http://localhost/api/system/models/fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', baseUrl: 'http://8.211.191.95:8080/', apiKey: 'test-key', strict: true }),
    }));
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.error, /HTTPS/);
  } finally {
    configureDomainRuntime({ env: {} });
  }
});

test('production reads models from a consented public HTTP gateway', async () => {
  const originalFetch = globalThis.fetch;
  configureDomainRuntime({ env: { NODE_ENV: 'production', ALLOW_CUSTOM_BASE_URL: 'false' } });
  let requestedUrl = '';
  let authorization = '';
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    authorization = init.headers.Authorization;
    return Response.json({ data: [{ id: 'gpt-6-luna' }] });
  };
  try {
    const response = await POST(new Request('https://app.example/api/system/models/fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai', baseUrl: 'http://8.211.191.95:8080/',
        apiKey: 'test-key', allowInsecureHttp: true, strict: true,
      }),
    }));
    assert.equal(response.status, 200);
    assert.equal(requestedUrl, 'http://8.211.191.95:8080/v1/models');
    assert.equal(authorization, 'Bearer test-key');
    assert.deepEqual((await response.json()).models.map(model => model.id), ['gpt-6-luna']);
  } finally {
    globalThis.fetch = originalFetch;
    configureDomainRuntime({ env: {} });
  }
});

test('HTTPS handshake failure suggests a confirmed HTTP endpoint without exposing the key', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), authorization: init.headers?.Authorization });
    if (requests.length === 1) {
      const error = new TypeError('fetch failed');
      error.cause = { code: 'ERR_SSL_WRONG_VERSION_NUMBER' };
      throw error;
    }
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  };
  try {
    const response = await POST(new Request('https://app.example/api/system/models/fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', baseUrl: 'https://8.211.191.95:8080', apiKey: 'test-key', strict: true }),
    }));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.suggestedBaseUrl, 'http://8.211.191.95:8080');
    assert.match(body.error, /HTTPS.*HTTP/);
    assert.deepEqual(requests, [
      { url: 'https://8.211.191.95:8080/v1/models', authorization: 'Bearer test-key' },
      { url: 'http://8.211.191.95:8080/v1/models', authorization: undefined },
    ]);
  } finally { globalThis.fetch = originalFetch; }
});
