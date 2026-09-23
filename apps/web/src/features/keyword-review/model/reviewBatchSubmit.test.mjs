import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReviewBatchSubmit } from './reviewBatchSubmit.ts';
import { ReviewPacer } from './reviewPacer.ts';

function options(request, reviewMode) {
  const row = { id: 'sheet:2', query: '测试词', status: 'idle' };
  const versions = new Map();
  let dispatches = 0;
  return {
    row, versions,
    run: createReviewBatchSubmit({
      model: 'deepseek-flash', reviewMode, apiKey: 'test', lookup: false, rulesVersion: 0,
      signal: new AbortController().signal, shouldStop: () => false,
      indices: new Map([[row.id, 0]]), versions, pacer: new ReviewPacer(),
      onDispatch: () => { dispatches += 1; },
      onSuccess: () => {}, onRateLimit: () => {}, onFailure: () => {}, request,
    }),
    get dispatches() { return dispatches; },
  };
}

test('confirmed 429 uses a new idempotency key, then accepts one result', async () => {
  const keys = [];
  const run = options(async (_body, _signal, key) => {
    keys.push(key);
    if (keys.length === 1) throw Object.assign(new Error('限流'), { rateLimited: true });
    return { success: true, results: [{ id: 'sheet:2', category: '动物', producible: '制作', categoryReason: '动物相关', rejectReason: '' }] };
  });
  await run.run([run.row]);
  assert.equal(run.dispatches, 2);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(run.versions.get(0), 1);
});

test('video submissions have a distinct fingerprint while image requests keep the legacy body', async () => {
  const sent = [];
  const request = async (body, _signal, key) => {
    sent.push({ body: JSON.parse(body), key });
    return { success: true, results: [{ id: 'sheet:2', category: '动物', producible: '制作', categoryReason: '宠物饲养', rejectReason: '' }] };
  };
  const image = options(request, 'image');
  const video = options(request, 'video');
  await image.run([image.row]);
  await video.run([video.row]);
  assert.equal(sent[0].body.reviewMode, undefined);
  assert.equal(sent[0].body.provider, undefined);
  const legacyPayload = JSON.stringify({
    model: 'deepseek-flash', lookup: false, rulesVersion: 0,
    rows: [{ id: image.row.id, query: image.row.query }],
  });
  const legacyHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacyPayload))),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(sent[0].key, `keyword:${legacyHash}:0`);
  assert.equal(sent[1].body.reviewMode, 'video');
  assert.notEqual(sent[0].key, sent[1].key);
});

test('unknown submission outcome is never resubmitted automatically', async () => {
  const run = options(async () => { throw new Error('提交结果不确定'); });
  await assert.rejects(run.run([run.row]), /提交结果不确定/);
  assert.equal(run.dispatches, 1);
  assert.equal(run.versions.size, 0);
});

test('gateway selection sends the chosen model, provider and endpoint', async () => {
  const row = { id: 'sheet:2', query: '测试词', status: 'idle' };
  let requestBody;
  const submit = createReviewBatchSubmit({
    model: 'gemini-3.7-flash', provider: 'gateway', baseUrl: 'https://ai.comfly.org',
    apiKey: 'gateway-key', lookup: false, rulesVersion: 1,
    signal: new AbortController().signal, shouldStop: () => false,
    indices: new Map([[row.id, 0]]), versions: new Map(), pacer: new ReviewPacer(),
    onDispatch: () => {}, onSuccess: () => {}, onRateLimit: () => {}, onFailure: () => {},
    request: async (body) => {
      requestBody = JSON.parse(body);
      return { success: true, results: [] };
    },
  });
  await submit([row]);
  assert.equal(requestBody.model, 'gemini-3.7-flash');
  assert.equal(requestBody.provider, 'gateway');
  assert.equal(requestBody.customBaseUrl, 'https://ai.comfly.org');
  assert.equal(requestBody.customApiKey, 'gateway-key');
});
