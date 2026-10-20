import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_PROVIDERS_STORAGE_KEY,
  API_REMOVED_PROVIDERS_KEY,
  DEFAULT_PROVIDERS,
  loadStoredProviders,
  type ApiProvider,
} from './apiProviderTypes';

const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
};

function provider(partial: Pick<ApiProvider, 'id' | 'name' | 'baseUrl'> & Partial<ApiProvider>): ApiProvider {
  return {
    providerType: 'openai',
    apiKey: '',
    enabled: true,
    isRemovable: true,
    ...partial,
  };
}

describe('loadStoredProviders', () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage });
  });

  it('shows only Comfly when nothing is stored', () => {
    expect(DEFAULT_PROVIDERS.map(item => item.id)).toEqual(['comfly_gateway']);
    expect(loadStoredProviders().map(item => item.id)).toEqual(['comfly_gateway']);
  });

  it('drops untouched built-in providers and remembers the removal', () => {
    store.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      provider({ id: 'comfly_gateway', name: 'Comfly 网关', baseUrl: 'https://ai.comfly.org' }),
      provider({ id: 'openai_official', name: 'OpenAI', baseUrl: 'https://api.openai.com/' }),
      provider({ id: 'deepseek_official', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '   ' }),
      provider({ id: 'qianwen_platform', name: '千问 AI 平台', baseUrl: 'https://maas.qianwenaiapi.com', providerType: 'dashscope' }),
      provider({ id: 'lianchi_images', name: '联池图像接口', baseUrl: 'https://api.gapnet.ai/endpoint' }),
      provider({ id: 'gpt_best_gateway', name: 'gpt-best 网关', baseUrl: 'https://api.gpt-best.com' }),
    ]));

    expect(loadStoredProviders().map(item => item.id)).toEqual(['comfly_gateway']);
    expect(JSON.parse(store.get(API_REMOVED_PROVIDERS_KEY) || '[]')).toEqual([
      'openai_official',
      'deepseek_official',
      'qianwen_platform',
      'lianchi_images',
      'gpt_best_gateway',
    ]);
    expect(JSON.parse(store.get(API_PROVIDERS_STORAGE_KEY) || '[]').map((item: ApiProvider) => item.id)).toEqual(['comfly_gateway']);
  });

  it('keeps a built-in provider that has a key or a changed address', () => {
    store.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      provider({ id: 'openai_official', name: 'OpenAI', baseUrl: 'https://api.openai.com', apiKey: 'sk-live' }),
      provider({ id: 'deepseek_official', name: 'DeepSeek', baseUrl: 'https://proxy.example/deepseek' }),
    ]));

    const loaded = loadStoredProviders();
    expect(loaded.map(item => item.id)).toEqual(['openai_official', 'deepseek_official', 'comfly_gateway']);
    expect(loaded.find(item => item.id === 'openai_official')).toMatchObject({ apiKey: 'sk-live', providerType: 'openai' });
    expect(store.has(API_REMOVED_PROVIDERS_KEY)).toBe(false);
  });

  it('keeps providers the user added', () => {
    store.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      provider({ id: 'comfly_gateway', name: 'Comfly 网关', baseUrl: 'https://ai.comfly.org' }),
      provider({ id: 'provider_custom', name: '自建中转', baseUrl: 'https://relay.example', apiKey: 'sk-custom', isCustom: true }),
    ]));

    expect(loadStoredProviders().map(item => item.id)).toEqual(['comfly_gateway', 'provider_custom']);
  });
});
