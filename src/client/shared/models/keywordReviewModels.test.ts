import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { DEEPSEEK_BASE_URL } from '@shared/domain/models/deepseek';
import { API_PROVIDERS_STORAGE_KEY, getModalityStorageKey } from '@shared/domain/models/modalityStorage';
import {
  loadKeywordReviewModels,
  resolveKeywordReviewRoute,
  resolveStoredKeywordReviewModel,
} from './keywordReviewModels';

const memory = new Map<string, string>();

describe('keyword review models', () => {
  beforeEach(() => {
    memory.clear();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    };
    configureDomainRuntime({ storage });
    vi.stubGlobal('localStorage', storage);
  });

  it('keeps the same chat model on each gateway and leaves workflow models out', () => {
    memory.set(getModalityStorageKey('chat'), JSON.stringify([
      { id: 'chat-a', name: 'Gemini', modality: 'chat', modelId: 'gemini-3-flash', channelId: 'a', textProtocol: 'gemini' },
      { id: 'chat-b', name: 'Gemini', modality: 'chat', modelId: 'gemini-3-flash', channelId: 'b', textProtocol: 'openai' },
    ]));
    memory.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'a', name: '网关甲', baseUrl: 'https://a.test', apiKey: 'key-a' },
      { id: 'b', name: '网关乙', baseUrl: 'https://b.test', apiKey: 'key-b' },
    ]));
    memory.set('custom_models', JSON.stringify([
      { id: 'only-workflow', name: 'Workflow Only', isMultimodal: true, isCustom: true, enabled: true },
    ]));

    const options = loadKeywordReviewModels();
    const gems = options.filter((option) => option.model === 'gemini-3-flash');
    expect(gems.map((option) => option.name).sort()).toEqual(['Gemini · 网关乙', 'Gemini · 网关甲']);
    expect(new Set(gems.map((option) => option.value)).size).toBe(2);
    expect(options.some((option) => option.model === 'only-workflow')).toBe(false);
    expect(options.some((option) => option.source === 'official' && option.provider === 'deepseek')).toBe(true);

    const gateway = gems.find((option) => option.name.includes('网关乙'));
    expect(gateway).toBeDefined();
    expect(resolveKeywordReviewRoute(gateway!)).toMatchObject({
      provider: 'gateway',
      model: 'gemini-3-flash',
      baseUrl: 'https://b.test',
      apiKey: 'key-b',
      textProtocol: 'openai',
      keySource: 'channel',
    });
    expect(resolveStoredKeywordReviewModel('gateway:gemini-3-flash', options)).toBe(gems[0].value);
    expect(resolveStoredKeywordReviewModel(gems[1].value, options)).toBe(gems[1].value);
    expect(resolveStoredKeywordReviewModel('missing-model', options)).toBe(options[0].value);
  });

  it('routes a workflow model through its own gateway when chat models are not synced', () => {
    memory.set('custom_models', JSON.stringify([{
      id: 'review-gateway-model',
      name: 'Gemini',
      channel: 'gateway-b',
      providerId: 'gateway-b',
      isMultimodal: true,
      isCustom: true,
      enabled: true,
      textProtocol: 'gemini',
      customBaseUrl: 'https://gateway-b.test',
      customApiKey: 'b-key',
    }]));

    const options = loadKeywordReviewModels();
    const model = options.find((option) => option.model === 'review-gateway-model');
    expect(model?.source).toBe('workflow');
    expect(resolveKeywordReviewRoute(model!)).toMatchObject({
      provider: 'gateway',
      model: 'review-gateway-model',
      baseUrl: 'https://gateway-b.test',
      apiKey: 'b-key',
      textProtocol: 'gemini',
      keySource: 'channel',
    });
    expect(resolveKeywordReviewRoute(options.find((option) => option.source === 'official')!)).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-flash',
      baseUrl: DEEPSEEK_BASE_URL,
      apiKey: '',
      keySource: 'deepseek',
    });
  });

  it('inherits the configured channel protocol for workflow models', () => {
    memory.set('custom_models', JSON.stringify([{
      id: 'claude-channel-model',
      routeId: 'claude-channel-route',
      name: 'Claude',
      channel: 'openai',
      providerId: 'provider-anthropic',
      isMultimodal: true,
      isCustom: true,
      enabled: true,
    }]));
    memory.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([{
      id: 'provider-anthropic',
      name: '兼容网关',
      baseUrl: 'https://gateway.example.test',
      apiKey: 'channel-key',
      providerType: 'openai',
    }]));

    const option = loadKeywordReviewModels().find((item) => item.model === 'claude-channel-model');
    expect(option).toBeDefined();
    expect(resolveKeywordReviewRoute(option!)).toMatchObject({
      provider: 'gateway',
      model: 'claude-channel-model',
      baseUrl: 'https://gateway.example.test',
      apiKey: 'channel-key',
      textProtocol: 'openai',
      keySource: 'channel',
    });
  });

  it('uses the synced official DeepSeek route instead of adding a second one', () => {
    memory.set(getModalityStorageKey('chat'), JSON.stringify([
      { id: 'ds', name: 'DeepSeek Flash', modality: 'chat', modelId: 'deepseek-flash', channelId: 'ds', textProtocol: 'openai' },
    ]));
    memory.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'ds', name: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'ds-key' },
    ]));

    const flashes = loadKeywordReviewModels().filter((option) => option.model === 'deepseek-flash');
    expect(flashes).toHaveLength(1);
    expect(flashes[0].source).toBe('modality');
    expect(resolveKeywordReviewRoute(flashes[0])).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-flash',
      baseUrl: DEEPSEEK_BASE_URL,
      apiKey: 'ds-key',
      keySource: 'channel',
    });
  });

  it.each(['disabled', 'removed'])('refuses a previously selected chat model after its gateway is %s', (state) => {
    const provider = { id: 'missing', name: '测试渠道', enabled: true };
    memory.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([provider]));
    memory.set(getModalityStorageKey('chat'), JSON.stringify([
      { id: 'gone', name: 'Gemini', modality: 'chat', modelId: 'gemini-3-flash', channelId: 'missing' },
    ]));
    const model = loadKeywordReviewModels().find((option) => option.routeId === 'gone');
    expect(model).toBeDefined();
    memory.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify(state === 'disabled' ? [{...provider, enabled: false}] : []));
    expect(loadKeywordReviewModels().some(option => option.routeId === 'gone')).toBe(false);
    expect(() => resolveKeywordReviewRoute(model!)).toThrow('所选模型的渠道已停用或移除，请重新选择');
  });
});
