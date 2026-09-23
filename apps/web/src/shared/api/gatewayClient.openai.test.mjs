import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMultimodalClientOverrides } from './gatewayClient.ts';

test('the same GPT model ID stays on its selected Comfly or OpenAI route', () => {
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const values = new Map([
    ['openai_responses_enabled', 'true'],
    ['openai_base_url', 'https://api.openai.com/v1'],
    ['openai_api_key', 'openai-key'],
    ['ai_base_url', 'https://ai.comfly.org'],
    ['ai_api_key', 'comfly-key'],
  ]);
  globalThis.localStorage = { getItem: (key) => values.get(key) || null };
  globalThis.window = {};
  try {
    assert.deepEqual(getMultimodalClientOverrides('openai-responses:gpt-6-astra'), {
      customBaseUrl: 'https://api.openai.com/v1', customApiKey: 'openai-key', apiFormat: 'openai-responses',
    });
    assert.deepEqual(getMultimodalClientOverrides('openai-responses:gpt-5.6'), {
      customBaseUrl: 'https://api.openai.com/v1', customApiKey: 'openai-key', apiFormat: 'openai-responses',
    });
    assert.deepEqual(getMultimodalClientOverrides('gpt-6-astra'), {
      customBaseUrl: 'https://ai.comfly.org', customApiKey: 'comfly-key',
      customWanbangKey: undefined, customWanbangSecret: undefined,
    });
    assert.deepEqual(getMultimodalClientOverrides('gpt-image-2'), {
      customBaseUrl: 'https://ai.comfly.org', customApiKey: 'comfly-key',
      customWanbangKey: undefined, customWanbangSecret: undefined,
    });
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.window = previousWindow;
  }
});

test('HTTP consent is tied to the exact saved OpenAI gateway address', () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map([
    ['openai_responses_enabled', 'true'],
    ['openai_base_url', 'http://8.211.191.95:8080'],
    ['openai_api_key', 'openai-key'],
    ['openai_insecure_http_consent_url', 'http://8.211.191.95:8080'],
  ]);
  globalThis.localStorage = { getItem: (key) => values.get(key) || null };
  try {
    assert.equal(getMultimodalClientOverrides('openai-responses:gpt-6-luna').allowInsecureHttp, true);
    values.set('openai_base_url', 'http://8.211.191.96:8080');
    assert.equal(getMultimodalClientOverrides('openai-responses:gpt-6-luna').allowInsecureHttp, undefined);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('a selected OpenAI route never falls back to the Comfly key', () => {
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const values = new Map([
    ['openai_responses_enabled', 'true'],
    ['ai_base_url', 'https://ai.comfly.org'],
    ['ai_api_key', 'comfly-key'],
  ]);
  globalThis.localStorage = { getItem: key => values.get(key) || null };
  globalThis.window = {};
  try {
    assert.throws(() => getMultimodalClientOverrides('openai-responses:gpt-6-luna'), /OpenAI 渠道 API Key/);
    assert.equal(getMultimodalClientOverrides('gpt-6-luna').customApiKey, 'comfly-key');
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.window = previousWindow;
  }
});
