import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { selectedTextModel } from '@shared/domain/models/workflowModelStorage';
import { resolveModalityModelRoute, type StoredModalityModelItem } from '@shared/domain/models/modalityStorage';
import {
  getGatewayClientHeaders, getModelCredentials, getMultimodalClientOverrides,
  setClientGatewayApiKey, setClientGatewayBaseUrl,
} from './gatewayClient';

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); },
};
const compatible = { id: 'compatible', providerType: 'openai', baseUrl: 'https://compatible.example/v1', apiKey: 'fixture-compatible' };
const native = { id: 'native', providerType: 'gemini', baseUrl: 'https://native.example', apiKey: 'fixture-native' };

beforeEach(() => {
  memory.clear();
  configureDomainRuntime({ storage });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  setClientGatewayApiKey(undefined);
  setClientGatewayBaseUrl(undefined);
  memory.set('ai_base_url', 'https://global.example');
  memory.set('ai_api_key', 'fixture-global');
  memory.set('beike_api_providers_v2', JSON.stringify([compatible, native]));
});
afterEach(() => {
  setClientGatewayApiKey(undefined);
  setClientGatewayBaseUrl(undefined);
  configureDomainRuntime({ storage: null });
  vi.unstubAllGlobals();
});

function saveChat(items: Array<Partial<StoredModalityModelItem> & Pick<StoredModalityModelItem, 'id' | 'modelId'>>) {
  memory.set('beike_modality_models_v1_chat', JSON.stringify(items.map((item) => ({ name: item.id, modality: 'chat', isCustom: true, ...item }))));
}

describe('configured text model gateway routes', () => {
  it.each(['chosen-entry', 'gemini-custom'])('keeps synced selection %s ahead of a legacy entry with the same upstream ID', (selection) => {
    saveChat([{ id: 'chosen-entry', modelId: 'gemini-custom', channelId: compatible.id, textProtocol: 'auto' }]);
    memory.set('custom_models', JSON.stringify([
      { id: 'gemini-custom', routeId: 'legacy-entry', customBaseUrl: 'https://legacy.example', customApiKey: 'fixture-legacy', apiTemplate: 'gemini' },
      { id: 'stale-upstream', routeId: 'chosen-entry', customBaseUrl: 'https://stale-entry.example', customApiKey: 'fixture-stale', apiTemplate: 'anthropic' },
    ]));

    expect(selectedTextModel(selection).modelId).toBe('gemini-custom');
    expect(getMultimodalClientOverrides(selection)).toMatchObject({
      customBaseUrl: compatible.baseUrl, customApiKey: compatible.apiKey, textProtocol: 'openai',
    });
    expect(getGatewayClientHeaders(selection)).toMatchObject({
      'x-custom-base-url': compatible.baseUrl, 'x-custom-api-key': compatible.apiKey,
    });
  });

  it('keeps duplicate upstream models on their individually selected channels and protocols', () => {
    saveChat([
      { id: 'compatible-entry', modelId: 'gemini-custom', channelId: compatible.id },
      { id: 'native-entry', modelId: 'gemini-custom', channelId: native.id },
    ]);
    for (const [selection, provider, protocol] of [
      ['compatible-entry', compatible, 'openai'], ['native-entry', native, 'gemini'],
    ] as const) {
      const route = resolveModalityModelRoute('chat', selection);
      expect(selectedTextModel(selection).modelId).toBe(route.modelId);
      expect(getMultimodalClientOverrides(selection)).toMatchObject({
        customBaseUrl: provider.baseUrl, customApiKey: provider.apiKey, textProtocol: protocol,
      });
      expect(getModelCredentials(selection)).toMatchObject({ baseUrl: route.baseUrl, apiKey: route.apiKey });
    }
  });

  it.each([undefined, 'auto'] as const)('inherits channel transport when the model protocol is %s', (textProtocol) => {
    saveChat([{ id: 'entry', modelId: 'claude-custom', channelId: compatible.id, textProtocol }]);
    expect(getMultimodalClientOverrides('entry').textProtocol).toBe('openai');
  });

  it.each(['openai', 'gemini', 'anthropic'] as const)('retains an explicit %s model override over the channel protocol', (textProtocol) => {
    saveChat([{ id: 'entry', modelId: 'gemini-custom', channelId: compatible.id, textProtocol }]);
    expect(getMultimodalClientOverrides('entry')).toMatchObject({
      customBaseUrl: compatible.baseUrl, customApiKey: compatible.apiKey, textProtocol,
    });
  });

  it('retains model-specific base and credentials without inheriting a legacy route', () => {
    saveChat([{ id: 'own-entry', modelId: 'gpt-custom', channelId: compatible.id,
      baseUrl: 'https://model.example/v1', apiKey: 'fixture-model', textProtocol: 'openai' }]);
    memory.set('custom_models', JSON.stringify([{ id: 'gpt-custom', customBaseUrl: 'https://legacy.example', customApiKey: 'fixture-legacy' }]));
    expect(getMultimodalClientOverrides('gpt-custom')).toMatchObject({
      customBaseUrl: 'https://model.example/v1', customApiKey: 'fixture-model', textProtocol: 'openai',
    });
  });

  it('keeps a synced global-channel choice and respects explicitly cleared runtime credentials', () => {
    saveChat([{ id: 'global-entry', modelId: 'gpt-custom', channelId: '' }]);
    memory.set('custom_models', JSON.stringify([{ id: 'gpt-custom', customBaseUrl: 'https://legacy.example', customApiKey: 'fixture-legacy' }]));
    setClientGatewayBaseUrl('https://runtime.example');
    setClientGatewayApiKey('fixture-runtime');
    expect(getMultimodalClientOverrides('gpt-custom')).toMatchObject({
      customBaseUrl: 'https://runtime.example', customApiKey: 'fixture-runtime', textProtocol: 'openai',
    });
    setClientGatewayApiKey(null);
    expect(getMultimodalClientOverrides('gpt-custom').customApiKey).toBeUndefined();
    expect(getGatewayClientHeaders('gpt-custom')['x-custom-api-key']).toBeUndefined();
  });

  it('preserves a configured Responses template while restoring the upstream model ID', () => {
    saveChat([{ id: 'response-entry', modelId: 'gpt-custom', channelId: compatible.id, apiTemplate: 'responses' }]);
    memory.set('custom_models', JSON.stringify([{ id: 'gpt-custom', customBaseUrl: 'https://legacy.example', customApiKey: 'fixture-legacy', apiTemplate: 'anthropic' }]));
    expect(selectedTextModel('response-entry')).toMatchObject({ modelId: 'gpt-custom', apiTemplate: 'responses' });
    expect(getMultimodalClientOverrides('response-entry')).toMatchObject({
      customBaseUrl: compatible.baseUrl, customApiKey: compatible.apiKey, apiFormat: 'openai-responses', textProtocol: 'openai',
    });
  });

  it('supports older configured chat items that predate the modality field', () => {
    memory.set('beike_modality_models_v1_chat', JSON.stringify([{ id: 'older-entry', name: 'Older', modelId: 'gemini-custom', channelId: compatible.id }]));
    expect(getMultimodalClientOverrides('older-entry')).toMatchObject({ customBaseUrl: compatible.baseUrl, textProtocol: 'openai' });
  });
});

describe('legacy and official text routes remain available', () => {
  it('uses a legacy route ID before another legacy row with a colliding upstream ID', () => {
    memory.set('custom_models', JSON.stringify([
      { id: 'chosen-route', routeId: 'other-route', customBaseUrl: 'https://other.example', customApiKey: 'fixture-other' },
      { id: 'claude-selected', routeId: 'chosen-route', customBaseUrl: 'https://chosen.example', customApiKey: 'fixture-chosen', textProtocol: 'anthropic' },
    ]));
    expect(selectedTextModel('chosen-route').modelId).toBe('claude-selected');
    expect(getMultimodalClientOverrides('chosen-route')).toMatchObject({
      customBaseUrl: 'https://chosen.example', customApiKey: 'fixture-chosen', textProtocol: 'anthropic',
    });
  });

  it('keeps legacy native protocol inference when there is no matching synced chat item', () => {
    saveChat([{ id: 'unrelated', modelId: 'gpt-unrelated', channelId: compatible.id }]);
    memory.set('custom_models', JSON.stringify([{ id: 'claude-legacy', providerId: compatible.id }]));
    expect(getMultimodalClientOverrides('claude-legacy')).toMatchObject({
      customBaseUrl: compatible.baseUrl, customApiKey: compatible.apiKey, textProtocol: 'anthropic',
    });
  });

  it('retains official DeepSeek routing and credentials', () => {
    memory.set('deepseek_api_key', 'fixture-deepseek');
    expect(selectedTextModel('deepseek-official:deepseek-flash').modelId).toBe('deepseek-flash');
    expect(getMultimodalClientOverrides('deepseek-official:deepseek-flash')).toMatchObject({
      customBaseUrl: 'https://api.deepseek.com', customApiKey: 'fixture-deepseek', textProtocol: 'openai',
    });
  });

  it('retains official Responses routing and saved HTTP consent', () => {
    memory.set('openai_responses_enabled', 'true');
    memory.set('openai_api_key', 'fixture-openai');
    memory.set('openai_base_url', 'http://responses.example');
    memory.set('openai_insecure_http_consent_url', 'http://responses.example');
    expect(selectedTextModel('openai-responses:gpt-custom').modelId).toBe('gpt-custom');
    expect(getMultimodalClientOverrides('openai-responses:gpt-custom')).toMatchObject({
      customBaseUrl: 'http://responses.example', customApiKey: 'fixture-openai', textProtocol: 'openai',
      apiFormat: 'openai-responses', allowInsecureHttp: true,
    });
  });
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
