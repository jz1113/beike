import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGatewayClientHeaders, getModelCredentials } from './gatewayClient';

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
};

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
});

describe('qwen image credentials', () => {
  it('uses the saved Qianwen provider when the model has no gateway of its own', () => {
    memory.set('ai_base_url', 'https://ai.comfly.org');
    memory.set('ai_api_key', 'global-key');
    memory.set('beike_api_providers_v2', JSON.stringify([
      { id: 'qianwen_platform', providerType: 'dashscope', baseUrl: 'https://maas.qianwenaiapi.com', apiKey: 'qwen-key' },
    ]));
    expect(getModelCredentials('qwen-image-3.0-pro')).toMatchObject({
      baseUrl: 'https://maas.qianwenaiapi.com',
      apiKey: 'qwen-key',
      protocol: 'dashscope',
    });
    const headers = getGatewayClientHeaders('qwen-image-3.0-pro');
    expect(headers['x-custom-base-url']).toBe('https://maas.qianwenaiapi.com');
    expect(headers['x-custom-api-key']).toBe('qwen-key');
    expect(headers['x-custom-protocol']).toBe('dashscope');
  });

  it('keeps an explicitly bound gateway and leaves qwen-image-max on the global gateway', () => {
    memory.set('beike_api_providers_v2', JSON.stringify([
      { id: 'qianwen_platform', providerType: 'dashscope', baseUrl: 'https://maas.qianwenaiapi.com', apiKey: 'qwen-key' },
      { id: 'comfly', providerType: 'openai', baseUrl: 'https://ai.comfly.org', apiKey: 'comfly-key' },
    ]));
    memory.set('custom_models', JSON.stringify([
      { id: 'qwen-image-3.0-pro', providerId: 'comfly' },
    ]));
    expect(getModelCredentials('qwen-image-3.0-pro').baseUrl).toBe('https://ai.comfly.org');
    expect(getModelCredentials('qwen-image-max')).toEqual({});
    expect(getModelCredentials('qwen-image')).toEqual({});
    expect(getModelCredentials('qwen-image-edit')).toEqual({});
  });
});
