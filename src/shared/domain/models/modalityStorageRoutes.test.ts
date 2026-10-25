import { describe, it, expect, beforeEach, vi } from 'vitest';
import { API_PROVIDERS_STORAGE_KEY, getModalityStorageKey, resolveModalityModelRoute } from './modalityStorage';
import { configureDomainRuntime } from '../core/runtime';

const memoryStore = new Map<string, string>();

describe('modality route credentials and protocols', () => {
  beforeEach(() => {
    memoryStore.clear();
    const mockStorage = {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStore.set(key, value);
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
    };
    configureDomainRuntime({ storage: mockStorage });
    vi.stubGlobal('localStorage', mockStorage);
  });

  it('resolves model credentials by item id or model id, then channel, then global', () => {
    memoryStore.set('beike_modality_global_config_v1', JSON.stringify({
      baseUrl: 'https://global.example',
      apiKey: 'sk-global',
    }));
    memoryStore.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'comfly_gateway', name: 'Comfly', baseUrl: 'https://channel.example', apiKey: 'sk-channel' },
    ]));
    memoryStore.set(getModalityStorageKey('image'), JSON.stringify([
      {
        id: 'img_own',
        name: 'Own',
        modality: 'image',
        modelId: 'own-model',
        baseUrl: 'https://own.example',
        apiKey: 'sk-own',
        channelId: 'comfly_gateway',
      },
      {
        id: 'img_channel',
        name: 'Channel',
        modality: 'image',
        modelId: 'channel-model',
        channelId: 'comfly_gateway',
        isDefault: true,
      },
      {
        id: 'img_missing',
        name: 'Missing',
        modality: 'image',
        modelId: 'missing-model',
        channelId: 'gone',
      },
      {
        id: 'img_partial',
        name: 'Partial',
        modality: 'image',
        modelId: 'partial-model',
        apiKey: 'sk-partial',
        channelId: 'comfly_gateway',
      },
    ]));

    expect(resolveModalityModelRoute('image', 'img_own')).toEqual({
      modelId: 'own-model',
      baseUrl: 'https://own.example',
      apiKey: 'sk-own',
    });
    expect(resolveModalityModelRoute('image', 'channel-model')).toEqual({
      modelId: 'channel-model',
      baseUrl: 'https://channel.example',
      apiKey: 'sk-channel',
    });
    expect(resolveModalityModelRoute('image', 'img_channel').modelId).toBe('channel-model');
    expect(resolveModalityModelRoute('image', 'img_missing')).toEqual({
      modelId: 'missing-model',
      baseUrl: 'https://global.example',
      apiKey: 'sk-global',
    });
    expect(resolveModalityModelRoute('image', 'img_partial')).toEqual({
      modelId: 'partial-model',
      baseUrl: 'https://channel.example',
      apiKey: 'sk-partial',
    });
    expect(resolveModalityModelRoute('image')).toMatchObject({
      modelId: 'channel-model',
      baseUrl: 'https://channel.example',
    });
  });

  it('inherits the channel text protocol for vendor aliases exposed by compatible gateways', () => {
    memoryStore.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'comfly_gateway', baseUrl: 'https://channel.example', apiKey: 'sk-channel', providerType: 'openai' },
    ]));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      {
        id: 'chat_claude_channel',
        name: 'Claude 5.5 Haiku · Comfly',
        modality: 'chat',
        vendor: 'anthropic',
        modelId: 'claude-5.5-haiku',
        channelId: 'comfly_gateway',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'chat_claude_channel')).toMatchObject({
      modelId: 'claude-5.5-haiku',
      textProtocol: 'openai',
      baseUrl: 'https://channel.example',
      apiKey: 'sk-channel',
    });
  });

  it('inherits the protocol from a matching provider when a model uses the global channel', () => {
    memoryStore.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'comfly_gateway', baseUrl: 'https://channel.example/v1', apiKey: 'sk-channel', providerType: 'openai' },
    ]));
    memoryStore.set('beike_modality_global_config_v1', JSON.stringify({
      baseUrl: 'https://channel.example/v1', apiKey: 'sk-channel',
    }));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      {
        id: 'chat_global_gemini',
        name: 'Gemini via global gateway',
        modality: 'chat',
        vendor: 'google',
        modelId: 'gemini-2.5-flash',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'chat_global_gemini')).toMatchObject({
      textProtocol: 'openai',
      baseUrl: 'https://channel.example/v1',
      apiKey: 'sk-channel',
    });
  });

  it('reads the legacy provider field when restoring a saved channel', () => {
    memoryStore.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'legacy_gateway', baseUrl: 'https://legacy.example', apiKey: 'sk-legacy', provider: 'openai' },
    ]));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      {
        id: 'chat_legacy_claude',
        name: 'Claude via legacy gateway',
        modality: 'chat',
        vendor: 'anthropic',
        modelId: 'claude-haiku-5-5',
        channelId: 'legacy_gateway',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'chat_legacy_claude')).toMatchObject({
      textProtocol: 'openai',
      baseUrl: 'https://legacy.example',
      apiKey: 'sk-legacy',
    });
  });

  it('recognizes official native endpoints when no provider record is available', () => {
    memoryStore.set('beike_modality_global_config_v1', JSON.stringify({
      baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'google-key',
    }));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      {
        id: 'chat_native_gemini',
        name: 'Gemini native',
        modality: 'chat',
        vendor: 'google',
        modelId: 'gemini-2.5-flash',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'chat_native_gemini')).toMatchObject({
      textProtocol: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'google-key',
    });
  });

  it('treats the built-in Comfly global endpoint as OpenAI compatible', () => {
    memoryStore.set('beike_modality_global_config_v1', JSON.stringify({
      baseUrl: 'https://ai.comfly.org', apiKey: 'comfly-key',
    }));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      {
        id: 'chat_comfly_gemini',
        name: 'Gemini via Comfly',
        modality: 'chat',
        vendor: 'google',
        modelId: 'gemini-2.5-flash',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'chat_comfly_gemini').textProtocol).toBe('openai');
  });

  it('uses the built-in Comfly transport for a Claude model saved with a native protocol', () => {
    memoryStore.set('beike_modality_global_config_v1', JSON.stringify({
      baseUrl: 'https://ai.comfly.org', apiKey: 'comfly-key',
    }));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      {
        id: 'chat_comfly_claude',
        name: 'Claude 5.5 Haiku',
        modality: 'chat',
        vendor: 'anthropic',
        modelId: 'claude-haiku-5-5',
        textProtocol: 'anthropic',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'chat_comfly_claude')).toMatchObject({
      textProtocol: 'openai',
      baseUrl: 'https://ai.comfly.org',
      apiKey: 'comfly-key',
    });
  });

  it('restores credentials from a legacy workflow model selected by route id', () => {
    memoryStore.set('custom_models', JSON.stringify([
      {
        id: 'claude-haiku-5-5',
        routeId: 'legacy-claude-route',
        customBaseUrl: 'https://legacy-relay.example/v1',
        customApiKey: 'legacy-key',
        textProtocol: 'openai',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'legacy-claude-route')).toMatchObject({
      modelId: 'claude-haiku-5-5',
      textProtocol: 'openai',
      baseUrl: 'https://legacy-relay.example/v1',
      apiKey: 'legacy-key',
    });
  });

  it('can force the global default channel while keeping the selected model id', () => {
    memoryStore.set('beike_modality_global_config_v1', JSON.stringify({
      baseUrl: 'https://ai.comfly.org',
      apiKey: 'default-key',
    }));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      {
        id: 'chat_claude_default',
        name: 'Claude 5.5 Haiku',
        modality: 'chat',
        vendor: 'anthropic',
        modelId: 'claude-haiku-5-5',
        baseUrl: 'https://old-model.example/v1',
        apiKey: 'old-model-key',
        textProtocol: 'anthropic',
      },
    ]));
    memoryStore.set('custom_models', JSON.stringify([
      {
        id: 'claude-haiku-5-5',
        routeId: 'legacy-claude-route',
        customBaseUrl: 'https://old-legacy.example/v1',
        customApiKey: 'old-legacy-key',
        textProtocol: 'anthropic',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'chat_claude_default', { channel: 'default' })).toEqual({
      modelId: 'claude-haiku-5-5',
      textProtocol: 'openai',
      baseUrl: 'https://ai.comfly.org',
      apiKey: 'default-key',
    });
    expect(resolveModalityModelRoute('chat', 'legacy-claude-route', { channel: 'default' })).toEqual({
      modelId: 'claude-haiku-5-5',
      textProtocol: 'openai',
      baseUrl: 'https://ai.comfly.org',
      apiKey: 'default-key',
    });
  });

  it('keeps an explicit model protocol override over the channel protocol', () => {
    memoryStore.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'comfly_gateway', baseUrl: 'https://channel.example', apiKey: 'sk-channel', providerType: 'openai' },
    ]));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      {
        id: 'chat_claude_native',
        name: 'Claude Native',
        modality: 'chat',
        vendor: 'anthropic',
        modelId: 'claude-5.5-haiku',
        textProtocol: 'anthropic',
        channelId: 'comfly_gateway',
      },
    ]));

    expect(resolveModalityModelRoute('chat', 'chat_claude_native').textProtocol).toBe('anthropic');
  });

});
