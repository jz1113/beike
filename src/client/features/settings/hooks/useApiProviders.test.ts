import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { apiFetch } from '@client/shared/api/apiClient';
import { useApiProviders } from './useApiProviders';
import {
  API_PROVIDERS_STORAGE_KEY,
  API_REMOVED_PROVIDERS_KEY,
  testModelConnection,
  type ApiProvider,
} from '../model/apiProviderTypes';

// Exercise hook state and effect cleanup without mounting a browser or calling a paid service.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, pending: [] as Array<() => void> }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value; }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const index = hooks.cursor++;
    const previous = hooks.slots[index] as { deps: unknown[]; cleanup?: () => void } | undefined;
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      hooks.pending.push(() => { previous?.cleanup?.(); hooks.slots[index] = { deps, cleanup: effect() }; });
    }
  },
  useMemo: (factory: () => unknown) => factory(), useCallback: (callback: unknown) => callback,
}));
vi.mock('../model/apiProviderTypes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/apiProviderTypes')>()),
  testModelConnection: vi.fn(),
}));
vi.mock('@client/shared/api/apiToken', () => ({ getClientAccessToken: () => '', syncAppTokenCookie: () => {} }));
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => '', syncWorkspaceCookie: () => {} }));

const memory = new Map<string, string>();
let failKey = '';
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (key === failKey) { failKey = ''; throw new Error('QuotaExceededError'); }
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    if (key === failKey) { failKey = ''; throw new Error('QuotaExceededError'); }
    memory.delete(key);
  },
};
const saved: ApiProvider = { id: 'custom', name: 'Custom', providerType: 'openai', baseUrl: 'https://saved.example', apiKey: 'saved-key', enabled: true, isRemovable: true, isCustom: true };
const toast = vi.fn();
const removed = vi.fn();
let active = true;
function ProviderHarness() {
  return useApiProviders({ isOpen: active, showToast: toast, onProviderRemoved: removed });
}
function render() {
  hooks.cursor = 0;
  let result = ProviderHarness();
  if (hooks.pending.length) {
    hooks.pending.splice(0).forEach(effect => effect());
    hooks.cursor = 0;
    result = ProviderHarness();
  }
  return result;
}
function unmount() {
  hooks.slots.forEach(value => { if (value && typeof value === 'object' && 'cleanup' in value) (value as { cleanup?: () => void }).cleanup?.(); });
  hooks.slots = []; hooks.pending = [];
}
beforeEach(() => {
  hooks.slots = []; hooks.pending = []; active = true; failKey = ''; memory.clear(); vi.clearAllMocks();
  memory.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([saved]));
  memory.set(API_REMOVED_PROVIDERS_KEY, JSON.stringify(['comfly_gateway']));
  memory.set('beike_modality_models_v1_chat', JSON.stringify([{ id: 'chat', modelId: 'gemini-custom', modality: 'chat', isCustom: true, channelId: saved.id }]));
  configureDomainRuntime({ storage });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true })));
});
afterEach(() => { unmount(); configureDomainRuntime({ storage: null }); vi.unstubAllGlobals(); });

describe('provider draft and commit acceptance', () => {
  it('S01/S02 isolates edits from actual requests and discards them when settings remount', async () => {
    render().updateCurrentProvider({ baseUrl: 'https://draft.example', apiKey: 'draft-key', providerType: 'gemini' });
    expect(render().currentProvider.baseUrl).toBe('https://draft.example');
    expect(getGatewayClientHeaders('chat')).toMatchObject({ 'x-custom-base-url': saved.baseUrl, 'x-custom-api-key': saved.apiKey });
    await apiFetch('/api/generate/canvas-text', { method: 'POST', body: JSON.stringify({ model: 'chat', prompt: 'test' }) });
    const body = vi.mocked(fetch).mock.calls[0][1]?.body as string;
    expect(JSON.parse(body)).toMatchObject({ customBaseUrl: saved.baseUrl, customApiKey: saved.apiKey, textProtocol: 'openai' });
    unmount();
    expect(render().currentProvider).toEqual(saved);
  });
  it('S03 publishes the complete saved pair and S08 protocol together', () => {
    render().updateCurrentProvider({ baseUrl: 'https://next.example', apiKey: 'next-key', providerType: 'anthropic' });
    const hook = render();
    hook.saveProvider(hook.currentProvider, saved);
    expect(getGatewayClientHeaders('chat')).toMatchObject({ 'x-custom-base-url': 'https://next.example', 'x-custom-api-key': 'next-key' });
    expect(JSON.parse(memory.get(API_PROVIDERS_STORAGE_KEY)!)[0].providerType).toBe('anthropic');
  });
  it('S04 preserves the running provider and editable draft when saving fails', () => {
    render().updateCurrentProvider({ baseUrl: 'https://draft.example', enabled: false });
    const hook = render(); failKey = API_PROVIDERS_STORAGE_KEY;
    expect(() => hook.saveProvider(hook.currentProvider, saved)).toThrow('本地配置保存失败');
    expect(getGatewayClientHeaders('chat')['x-custom-base-url']).toBe(saved.baseUrl);
    expect(render().currentProvider.enabled).toBe(false);
    expect(JSON.parse(memory.get(API_PROVIDERS_STORAGE_KEY)!)[0].enabled).toBe(true);
  });
  it('S04 does not add or delete on storage failure, and deletion rolls back its first write', () => {
    failKey = API_PROVIDERS_STORAGE_KEY;
    expect(render().addProvider({ ...saved, name: 'Other', baseUrl: 'https://other.example' })).toBe(false);
    expect(render().providers).toEqual([saved]);
    failKey = API_REMOVED_PROVIDERS_KEY;
    expect(render().removeProvider(saved.id)).toBe(false);
    expect(render().providers).toEqual([saved]);
    expect(JSON.parse(memory.get(API_PROVIDERS_STORAGE_KEY)!)).toEqual([saved]);
    expect(removed).not.toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining('移除服务商失败'));
    expect(render().removeProvider(saved.id)).toBe(true);
    expect(removed).toHaveBeenCalledOnce();
  });
  it.each(['custom_models', 'ai_image_gen_model'])('S04 rolls provider removal back when associated %s cannot be saved', key => {
    memory.set('custom_models', JSON.stringify([{ id: 'gpt-image-2', name: 'Removed image', providerId: saved.id, isCustom: true, enabled: true, isImage: true }]));
    memory.set('ai_image_gen_model', 'gpt-image-2');
    const before = [...memory.entries()].sort();
    failKey = key;
    expect(render().removeProvider(saved.id)).toBe(false);
    expect([...memory.entries()].sort()).toEqual(before);
    expect(render().currentProvider.id).toBe(saved.id);
    expect(removed).not.toHaveBeenCalled();
  });
});

describe('connection evidence belongs to one configuration version', () => {
  it('S05 ignores an old response even after editing back to the same values', async () => {
    let finish!: (value: { ok: boolean; message: string }) => void;
    vi.mocked(testModelConnection).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = render().testProvider();
    render().updateCurrentProvider({ apiKey: 'changed' }); render();
    render().updateCurrentProvider({ apiKey: saved.apiKey }); render();
    finish({ ok: true, message: 'old result' }); await pending;
    expect(render().testResults[saved.id]).toBeUndefined();
    expect(toast).not.toHaveBeenCalledWith('old result');
  });
  it('S05 invalidates a completed result on edits', async () => {
    vi.mocked(testModelConnection).mockResolvedValueOnce({ ok: true, message: 'passed' });
    await render().testProvider();
    expect(render().testResults[saved.id]?.ok).toBe(true);
    render().updateCurrentProvider({ catalogPath: '/other/models' });
    expect(render().testResults[saved.id]).toBeUndefined();
  });
  it.each(['remove', 'close'] as const)('S05 ignores responses after %s', async action => {
    let finish!: (value: { ok: boolean; message: string }) => void;
    vi.mocked(testModelConnection).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = render().testProvider();
    if (action === 'remove') render().removeProvider(saved.id);
    else active = false;
    render(); finish({ ok: true, message: 'stale passed' }); await pending;
    expect(render().testResults[saved.id]).toBeUndefined();
    expect(toast).not.toHaveBeenCalledWith('stale passed');
  });
});
