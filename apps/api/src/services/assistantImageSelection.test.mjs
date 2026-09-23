import assert from 'node:assert/strict';
import test from 'node:test';
import { shortlistImages } from './assistantImageSelection.ts';

const images = Array.from({ length: 25 }, (_, index) => ({ url: `https://example.com/${index}.jpg`, label: `图${index}` }));
const base = { images, requirement: '选择商品图', model: 'test-model', baseUrl: 'https://example.com', apiKey: 'test', onProgress() {} };

test('a server error after image selection submission does not replay the batch', async () => {
  let calls = 0;
  await assert.rejects(shortlistImages({ ...base, fetcher: async () => {
    calls += 1;
    return Response.json({ error: 'busy' }, { status: 503 });
  } }), /HTTP 503/);
  assert.equal(calls, 1);
});

test('malformed paid image selection output does not replay the batch', async () => {
  let calls = 0;
  await assert.rejects(shortlistImages({ ...base, fetcher: async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: '[]' } }] });
  } }), /未返回完整/);
  assert.equal(calls, 1);
});
