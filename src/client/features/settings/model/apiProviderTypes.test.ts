import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGatewayClientOverrides, setClientGatewayApiKey, setClientGatewayBaseUrl } from '@client/shared/api/gatewayClient';
import { credentialGet, clearCredentialMemoryCache } from '@client/shared/api/credentialClient';
import {
  API_PROVIDERS_STORAGE_KEY,
  API_REMOVED_PROVIDERS_KEY,
  catalogRequestProtocol,
  commitProviderConfig,
  DEFAULT_PROVIDERS,
  loadStoredProviders,
  parseRemoteModelFetch,
  sameProviderRoute,
  testModelConnection,
  type ApiProvider,
} from './apiProviderTypes';
import { parseCurl, qwenAsyncPreset, qwenSyncPreset } from './curlTemplate';

const fetch = vi.hoisted(() => vi.fn());
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: fetch }));

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
      provider({ id: 'gpt_best_gateway', name: 'gpt-best 网关', baseUrl: 'https://api.gpt-best.com' }),
    ]));

    expect(loadStoredProviders().map(item => item.id)).toEqual(['comfly_gateway']);
    expect(JSON.parse(store.get(API_REMOVED_PROVIDERS_KEY) || '[]')).toEqual([
      'openai_official',
      'deepseek_official',
      'qianwen_platform',
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

  it('reuses the same OpenAI route without merging separate accounts or protocols', () => {
    const first = provider({id:'one',name:'渠道一',baseUrl:'https://example.test/v1',apiKey:'test-one'});
    const other = {...first, baseUrl:'https://example.test/'};
    expect(sameProviderRoute(first,other)).toBe(true);
    expect(sameProviderRoute(first,{...other,apiKey:'test-two'})).toBe(false);
    expect(sameProviderRoute(first,{...other,providerType:'anthropic'})).toBe(false);
  });

  it('keeps providers the user added', () => {
    store.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      provider({ id: 'comfly_gateway', name: 'Comfly 网关', baseUrl: 'https://ai.comfly.org' }),
      provider({ id: 'provider_custom', name: '自建中转', baseUrl: 'https://relay.example', apiKey: 'sk-custom', isCustom: true }),
    ]));

    expect(loadStoredProviders().map(item => item.id)).toEqual(['comfly_gateway', 'provider_custom']);
  });
});

describe('explicit model catalog transport', () => {
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  });
  it('keeps native protocol intent on relay URLs and uses OpenAI for default/compatible catalogs', () => {
    expect(catalogRequestProtocol('gemini')).toEqual({ catalogProtocol: 'gemini', providerType: 'gemini' });
    expect(catalogRequestProtocol('anthropic')).toEqual({ catalogProtocol: 'anthropic', providerType: 'anthropic' });
    expect(catalogRequestProtocol()).toEqual({ catalogProtocol: 'openai', providerType: 'openai' });
    expect(catalogRequestProtocol('dashscope')).toEqual({ catalogProtocol: 'openai', providerType: 'dashscope' });
    expect(catalogRequestProtocol('custom', 'gemini')).toEqual({ catalogProtocol: 'gemini', providerType: 'custom' });
  });
  it.each(['gemini', 'anthropic', 'openai'])('sends %s directory probes with explicit catalog metadata', async providerType => {
    await testModelConnection('Relay', { providerType, baseUrl: 'https://relay.example/v1', apiKey: 'test-key' });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/system/models/fetch', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ providerType, catalogProtocol: providerType, baseUrl: 'https://relay.example/v1', apiKey: 'test-key', isPing: true, strict: true });
  });
  it('preserves an explicit native catalog protocol on a custom relay', async () => {
    await testModelConnection('Custom relay', { providerType: 'custom', catalogProtocol: 'gemini', baseUrl: 'https://relay.example', apiKey: 'test-key' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ providerType: 'custom', catalogProtocol: 'gemini', isPing: true, strict: true });
  });
  it('supports legacy provider fields without converting catalog checks to billable text generation', async () => {
    await testModelConnection('Claude relay', { provider: 'anthropic', apiKey: 'test-key' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ provider: 'anthropic', providerType: 'anthropic', catalogProtocol: 'anthropic' });
    expect(fetch.mock.calls[0][0]).toBe('/api/system/models/fetch');
  });
});

describe('commitProviderConfig', () => {
  let failKey = '';
  const commitStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === failKey) { failKey = ''; throw new Error('quota'); }
      store.set(key, value);
    },
    removeItem: (key: string) => { store.delete(key); },
  };
  const original: ApiProvider = { id: 'comfly_gateway', name: 'Comfly', baseUrl: 'https://old.example', apiKey: 'old-key', providerType: 'openai', enabled: true, isRemovable: true };
  const changed = { ...original, baseUrl: 'https://new.example', apiKey: 'new-key' };
  beforeEach(() => {
    store.clear(); failKey = ''; clearCredentialMemoryCache();
    vi.stubGlobal('localStorage', commitStorage);
    vi.stubGlobal('window', { localStorage: commitStorage, dispatchEvent: vi.fn() });
    store.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([original]));
    store.set('ai_base_url', original.baseUrl); store.set('ai_api_key', original.apiKey);
    store.set('beike_modality_global_config_v1', JSON.stringify({ baseUrl: original.baseUrl, apiKey: original.apiKey, baseUrlHistory: [], apiKeyHistory: [] }));
    store.set('custom_models', JSON.stringify([{ id: 'custom', providerId: original.id, customBaseUrl: original.baseUrl, customApiKey: original.apiKey }]));
    store.set('beike_modality_models_v1_image', JSON.stringify([
      { id: 'inherited', channelId: original.id, modelId: 'gpt-image-2', baseUrl: original.baseUrl, apiKey: original.apiKey },
      { id: 'owned', channelId: original.id, modelId: 'owned', baseUrl: 'https://owned.example', apiKey: 'own-key' },
    ]));
    setClientGatewayBaseUrl(original.baseUrl); setClientGatewayApiKey(original.apiKey);
  });
  afterEach(() => { setClientGatewayBaseUrl(undefined); setClientGatewayApiKey(undefined); clearCredentialMemoryCache(); vi.unstubAllGlobals(); });

  it.each(['beike_modality_global_config_v1', 'ai_custom_base_url', 'ai_custom_api_key', 'custom_models',
    'beike_modality_models_v1_image', API_PROVIDERS_STORAGE_KEY, 'beike_api_provider_saved_credentials_v1', 'ai_base_url', 'ai_api_key',
  ])('S04 rolls back every affected group when %s fails', async key => {
    const before = [...store.entries()].sort();
    expect(await credentialGet('ai_api_key')).toBe('old-key');
    failKey = key;
    expect(() => commitProviderConfig(changed, original)).toThrow('本地配置保存失败');
    expect([...store.entries()].sort()).toEqual(before);
    expect(getGatewayClientOverrides()).toMatchObject({ customBaseUrl: original.baseUrl, customApiKey: original.apiKey });
    expect(await credentialGet('ai_api_key')).toBe(original.apiKey);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('S03/S08 commits inherited credentials together, preserves model overrides, then publishes', async () => {
    await credentialGet('ai_api_key'); // old cached value must be invalidated on commit
    expect(commitProviderConfig(changed, original).updated).toBe(3);
    const models = JSON.parse(store.get('beike_modality_models_v1_image')!);
    expect(models[0]).not.toHaveProperty('apiKey');
    expect(models[0]).not.toHaveProperty('baseUrl');
    expect(models[1]).toMatchObject({ baseUrl: 'https://owned.example', apiKey: 'own-key' });
    expect(getGatewayClientOverrides()).toMatchObject({ customBaseUrl: changed.baseUrl, customApiKey: changed.apiKey });
    expect(await credentialGet('ai_api_key')).toBe(changed.apiKey);
    expect(window.dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it('does not publish or overwrite a configuration removed in another window', () => {
    store.set(API_PROVIDERS_STORAGE_KEY, '[]');
    store.set(API_REMOVED_PROVIDERS_KEY, JSON.stringify([original.id]));
    expect(() => commitProviderConfig(changed, original)).toThrow('已移除');
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves OpenAI enable and HTTP consent validation in the atomic save path', () => {
    const openAI = { ...original, id: 'openai_official', baseUrl: 'http://8.8.8.8' };
    store.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([openAI]));
    const before = [...store.entries()].sort();
    expect(() => commitProviderConfig(openAI, openAI, { openAI: { enabled: true, allowInsecureHttp: false } })).toThrow('明文传输');
    expect([...store.entries()].sort()).toEqual(before);
    expect(() => commitProviderConfig({ ...openAI, apiKey: '' }, openAI, { openAI: { enabled: true, allowInsecureHttp: true } })).toThrow('API Key');
    commitProviderConfig(openAI, openAI, { openAI: { enabled: true, allowInsecureHttp: true } });
    expect(store.get('openai_responses_enabled')).toBe('true');
    expect(store.get('openai_insecure_http_consent_url')).toBe(openAI.baseUrl);
  });
});

describe('parseRemoteModelFetch', () => {
  it('keeps the gateway model ids from a real catalog', () => {
    const parsed = parseRemoteModelFetch({
      success: true,
      models: [{ id: 'vendor/claude-opus-4-6', name: 'Claude Opus' }, { id: 'custom-model' }],
    });
    expect(parsed).toEqual({ ok: true, ids: ['vendor/claude-opus-4-6', 'custom-model'] });
  });

  it('does not treat the official fallback catalog as a remote pull', () => {
    const parsed = parseRemoteModelFetch({
      success: true,
      isFallback: true,
      warning: '已自动载入官方精选推荐模型库',
      models: [{ id: 'gpt-6-sol' }, { id: 'claude-opus-5' }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain('官方精选');
  });

  it('reports a failed catalog without exposing fallback models', () => {
    const parsed = parseRemoteModelFetch({ success: false, error: '网络连接失败', models: [{ id: 'gpt-image-2' }] });
    expect(parsed).toEqual({ ok: false, message: '网络连接失败' });
  });
});

describe('parseCurl', () => {
  it('reads the Qianwen sync example into a request template', () => {
    const template = parseCurl(`curl --location 'https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation' \\
--header 'Content-Type: application/json' \\
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \\
--data '{"model":"qwen-image-3.0","input":{"messages":[{"role":"user","content":[{"text":"一只柯基"}]}]}}'`);
    expect(template.submit.method).toBe('POST');
    expect(template.submit.url).toBe('https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(template.submit.headers?.Authorization).toBe('Bearer {{apiKey}}');
    expect(template.submit.body).toContain('qwen-image-3.0');
  });

  it('builds native sync and async presets from the provider base URL', () => {
    const sync = qwenSyncPreset('https://maas.qianwenaiapi.com/compatible-mode/v1');
    expect(sync.submit.url).toBe('https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(sync.result.imageUrlPath).toBe('output.choices.0.message.content.0.image');
    const asyncTemplate = qwenAsyncPreset('https://dashscope.aliyuncs.com');
    expect(asyncTemplate.submit.headers?.['X-DashScope-Async']).toBe('enable');
    expect(asyncTemplate.poll?.url).toBe('https://dashscope.aliyuncs.com/api/v1/tasks/{{taskId}}');
    expect(asyncTemplate.result.taskIdPath).toBe('output.task_id');
  });
});
