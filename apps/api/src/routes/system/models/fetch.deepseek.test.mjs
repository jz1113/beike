import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from './fetch.ts';
const request = body => new Request('http://localhost/api/system/models/fetch', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-custom-api-key': 'wrong-gateway-key' }, body: JSON.stringify({ provider: 'deepseek', ...body }),
});
test('DeepSeek requires its independent key and never returns gateway fallback models', async () => {
  const response = await POST(request({}));
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).models, []);
});
test('DeepSeek discovery preserves exact upstream IDs, unapproved models and declared capabilities', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.deepseek.com/models');
    assert.equal(init.headers.Authorization, 'Bearer independent-key');
    return Response.json({ data: [null, { id: 'deepseek-flash', name: 'Flash', input_modalities: ['text', 'image'] }, { id: 'future-model' }, { id: 'future-model' }] });
  };
  try {
    const body = await (await POST(request({ apiKey: 'independent-key', baseUrl: 'https://ignored.invalid' }))).json();
    assert.equal(body.provider, 'deepseek');
    assert.deepEqual(body.models.map(m => m.id), ['deepseek-flash', 'future-model']);
    assert.deepEqual(body.models[0].inputModalities, ['text', 'image']);
    assert.deepEqual(body.models[1].inputModalities, []);
  } finally { globalThis.fetch = original; }
});
test('DeepSeek network and authentication failures return empty catalogs', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 503]) {
      globalThis.fetch = async () => Response.json({}, { status });
      const response = await POST(request({ apiKey: 'independent-key' }));
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.deepEqual(body.models, []);
    }
    globalThis.fetch = async () => { throw new Error('network'); };
    assert.equal((await POST(request({ apiKey: 'independent-key' }))).status, 502);
  } finally { globalThis.fetch = original; }
});
