import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMultimodalClientOverrides } from './gatewayClient.ts';

test('OpenAI Responses setting routes only GPT 5.6/6 visual models through its independent key', () => {
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
    assert.deepEqual(getMultimodalClientOverrides('gpt-6-astra'), {
      customBaseUrl: 'https://api.openai.com/v1', customApiKey: 'openai-key', apiFormat: 'openai-responses',
    });
    assert.deepEqual(getMultimodalClientOverrides('gpt-5.6'), {
      customBaseUrl: 'https://api.openai.com/v1', customApiKey: 'openai-key', apiFormat: 'openai-responses',
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
