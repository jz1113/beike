import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { callVisionModel } from './analyzeVisionCall.ts';
import { callVisionJson } from './deconstruct/visionCall.ts';
import { buildOpenAIVisionRequest, extractOpenAIResponseText } from './openaiResponses.ts';

test('Responses vision request preserves text, image and model without Chat Completions fields', () => {
  const body = buildOpenAIVisionRequest('gpt-6-astra', [
    { type: 'text', text: '分析这张图' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
  ], 4096, true);
  assert.equal(body.model, 'gpt-6-astra');
  assert.deepEqual(body.input[0].content, [
    { type: 'input_text', text: '分析这张图' },
    { type: 'input_image', image_url: 'data:image/jpeg;base64,abc', detail: 'auto' },
  ]);
  assert.equal(body.max_output_tokens, 4096);
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, 'json_object');
  assert.equal('messages' in body, false);
});

test('Responses output reads nested output_text and rejects incomplete outputs', () => {
  assert.equal(extractOpenAIResponseText({ output: [
    { type: 'reasoning', content: [] },
    { type: 'message', content: [{ type: 'output_text', text: '第一段' }, { type: 'output_text', text: '第二段' }] },
  ] }), '第一段第二段');
  assert.throws(() => extractOpenAIResponseText({ status: 'incomplete', output_text: '部分内容' }), /不完整/);
});

test('vision call sends OpenAI Responses format and reads token usage', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  let requestBody;
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    requestBody = JSON.parse(init.body);
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"prompts":[]}' }] }], usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 } });
  };
  try {
    const result = await callVisionModel('gpt-5.6-luna', [
      { type: 'text', text: '返回 JSON' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
    ], 'https://api.openai.com/v1', 'test-key', [], 4, false, 'openai-responses');
    assert.equal(requestedUrl, 'https://api.openai.com/v1/responses');
    assert.equal(requestBody.input[0].content[1].type, 'input_image');
    assert.deepEqual(result.triedModels, ['gpt-5.6-luna']);
    assert.deepEqual(result.usage, { promptTokens: 11, completionTokens: 7, totalTokens: 18 });
  } finally { globalThis.fetch = originalFetch; }
});

test('asset deconstruction uses Responses JSON format and reads nested output', async () => {
  let requestedPath = '';
  let requestBody;
  const server = createServer(async (request, response) => {
    requestedPath = request.url;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requestBody = JSON.parse(Buffer.concat(chunks).toString());
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"items":[]}' }] }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    const result = await callVisionJson({
      modelsToTry: ['gpt-6-luna'], targetBaseUrl: `http://127.0.0.1:${address.port}`,
      targetApiKey: 'test-key', apiFormat: 'openai-responses',
      contentArray: [{ type: 'text', text: '返回 JSON' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } }],
      label: 'test',
    });
    assert.equal(requestedPath, '/v1/responses');
    assert.equal(requestBody.text.format.type, 'json_object');
    assert.equal(requestBody.input[0].content[1].type, 'input_image');
    assert.deepEqual(result, { rawJsonText: '{"items":[]}', usedModel: 'gpt-6-luna' });
  } finally { server.close(); }
});
