import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from './fetch.ts';

test('联池模型拉取使用固定端点并保留完整模型 ID', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let authorization = '';
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    authorization = init.headers.Authorization;
    return Response.json({ data: [
      { id: 'openai/gpt-image-2', model_type: 'image' },
      { id: 'bytedance/seedance-2.0', model_type: 'video' },
      { id: 'openai/gpt-image-2', model_type: 'image' },
    ] });
  };
  try {
    const req = new Request('http://localhost/api/system/models/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-custom-api-key': 'wrong-key' },
      body: JSON.stringify({ provider: 'lianchi', baseUrl: 'https://wrong.example', apiKey: 'pool-key', strict: true }),
    });
    const res = await POST(req);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(requestedUrl, 'https://api.gapnet.ai/endpoint/v1/models');
    assert.equal(authorization, 'Bearer pool-key');
    assert.equal(body.provider, 'lianchi');
    assert.equal(body.count, 2);
    assert.deepEqual(body.models.map(model => [model.id, model.supported]), [
      ['openai/gpt-image-2', true], ['bytedance/seedance-2.0', false],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('联池模型拉取缺少独立密钥时不回退到 Comfly 模型', async () => {
  const req = new Request('http://localhost/api/system/models/fetch', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-custom-api-key': 'comfly-key' },
    body: JSON.stringify({ provider: 'lianchi', strict: true }),
  });
  const res = await POST(req);
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.success, false);
  assert.deepEqual(body.models, []);
});
