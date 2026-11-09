import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '../gatewayClient';
import { pollSingleTaskResult, submitImageGenTaskResult } from './generationApi';

vi.mock('../apiToken', () => ({ getClientAccessToken: () => '', syncAppTokenCookie: () => {} }));
vi.mock('../workspaceClient', () => ({ getWorkspaceSecret: () => '', syncWorkspaceCookie: () => {} }));
vi.mock('@client/shared/utils/modelUsage', async original => ({ ...await original<typeof import('@client/shared/utils/modelUsage')>(), recordMediaTaskUsage: vi.fn() }));
vi.mock('./generationAbort', async original => ({ ...await original<typeof import('./generationAbort')>(), sleepWhilePolling: async () => {} }));

const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
const channel = { id: 'selected', providerType: 'openai', enabled: true, baseUrl: 'https://selected.example', apiKey: 'selected-key' };
const calls: Array<{ input: string; headers: Headers; body?: Record<string, unknown> }> = [];
beforeEach(() => {
  calls.length = 0; values.clear(); configureDomainRuntime({ storage });
  vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('localStorage', storage);
  setClientGatewayApiKey(undefined); setClientGatewayBaseUrl(undefined);
  values.set('ai_base_url', 'https://global.example'); values.set('ai_api_key', 'global-key');
  values.set('beike_api_providers_v2', JSON.stringify([channel]));
  values.set('beike_modality_models_v1_image', JSON.stringify([{ id: 'gpt-image-2', modelId: 'gpt-image-2', name: 'Selected', isCustom: true, modality: 'image', channelId: channel.id }]));
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ input, headers: new Headers(init?.headers), ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) } : {}) });
    if (init?.method === 'POST') {
      // A provider save during the asynchronous operation must not reroute its polls.
      values.set('beike_api_providers_v2', JSON.stringify([{ ...channel, baseUrl: 'https://later.example', apiKey: 'later-key' }]));
      return Response.json({ success: true, taskId: 'original-task', status: 'IN_PROGRESS' });
    }
    return Response.json({ success: true, status: 'SUCCESS', resultUrl: 'https://media.example/result.png' });
  }));
});
afterEach(() => { configureDomainRuntime({ storage: null }); setClientGatewayApiKey(undefined); setClientGatewayBaseUrl(undefined); vi.unstubAllGlobals(); });

it('S06/S07 uses the selected pair in body and headers and pins it through asynchronous polling', async () => {
  await expect(submitImageGenTaskResult({ model: 'gpt-image-2', prompt: 'test' }, { isAborted: () => false }))
    .resolves.toEqual({ url: 'https://media.example/result.png', temporary: false });
  expect(calls).toHaveLength(2);
  expect(calls[0].body).toMatchObject({ customBaseUrl: channel.baseUrl, customApiKey: channel.apiKey });
  for (const call of calls) {
    expect(call.headers.get('x-custom-base-url')).toBe(channel.baseUrl);
    expect(call.headers.get('x-custom-api-key')).toBe(channel.apiKey);
  }
});

it('S08 keeps a complete model override over channel and global defaults', async () => {
  values.set('beike_modality_models_v1_image', JSON.stringify([{ id: 'gpt-image-2', modelId: 'gpt-image-2', name: 'Own', isCustom: true, modality: 'image', channelId: channel.id, baseUrl: 'https://own.example', apiKey: 'own-key' }]));
  await submitImageGenTaskResult({ model: 'gpt-image-2', prompt: 'test' }, { isAborted: () => false });
  expect(calls[0].body).toMatchObject({ customBaseUrl: 'https://own.example', customApiKey: 'own-key' });
  expect(calls[1].headers.get('x-custom-api-key')).toBe('own-key');
});

it('S06/S08 retains channel identity when two selected entries share an upstream model ID', async () => {
  values.set('beike_api_providers_v2', JSON.stringify([channel, { ...channel, id: 'other', baseUrl: 'https://other.example', apiKey: 'other-key' }]));
  values.set('beike_modality_models_v1_image', JSON.stringify([
    { id: 'first', modelId: 'gpt-image-2', name: 'First', isCustom: true, modality: 'image', channelId: channel.id },
    { id: 'second', modelId: 'gpt-image-2', name: 'Second', isCustom: true, modality: 'image', channelId: 'other' },
  ]));
  await submitImageGenTaskResult({ model: 'gpt-image-2', prompt: 'test' }, { isAborted: () => false, modelSelection: 'second' });
  expect(calls[0].body).toMatchObject({ model: 'gpt-image-2', customBaseUrl: 'https://other.example', customApiKey: 'other-key' });
  expect(calls[1].headers.get('x-custom-base-url')).toBe('https://other.example');
});

it('S08 resolves a channel entry ID to the upstream model while retaining its credentials', async () => {
  values.set('beike_modality_models_v1_image', JSON.stringify([{ id: 'chosen-entry', modelId: 'gpt-image-2', name: 'Chosen', isCustom: true, modality: 'image', channelId: channel.id }]));
  await submitImageGenTaskResult({ model: 'chosen-entry', prompt: 'test' }, { isAborted: () => false });
  expect(calls[0].body).toMatchObject({ model: 'gpt-image-2', customBaseUrl: channel.baseUrl });
  expect(calls[1].input).toContain('model=gpt-image-2');
});

it('S07 pins the upstream model as well as the route when the catalog changes during submission', async () => {
  values.set('beike_modality_models_v1_image', JSON.stringify([{ id: 'chosen-entry', modelId: 'gpt-image-2', name: 'Chosen', isCustom: true, modality: 'image', channelId: channel.id }]));
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (...args) => {
    const response = await original(...args);
    if (args[1]?.method === 'POST') values.set('beike_modality_models_v1_image', JSON.stringify([
      { id: 'chosen-entry', modelId: 'different-image-model', name: 'Changed', isCustom: true, modality: 'image', channelId: channel.id },
    ]));
    return response;
  });
  await submitImageGenTaskResult({ model: 'chosen-entry', prompt: 'test' }, { isAborted: () => false });
  expect(calls[1].input).toContain('model=gpt-image-2');
});

it('S07 stops recovery immediately on a persisted route conflict without sending a new POST', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: false, code: 'task_route_changed', submissionUnknown: true, error: '原任务渠道已变化，请核对' }, { status: 409 }));
  await expect(pollSingleTaskResult('original-task', () => false, undefined, 'gpt-image-2')).rejects.toThrow('原任务渠道已变化');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0][1]?.method).not.toBe('POST');
});

it('uses the synchronized visual route instead of a legacy record with the same model ID', async () => {
  values.set('custom_models', JSON.stringify([{ id:'gpt-image-2', customBaseUrl:'https://old.example', customApiKey:'old-key' }]));
  await submitImageGenTaskResult({ model:'gpt-image-2', prompt:'test' }, {isAborted:()=>false});
  expect(calls[0].body).toMatchObject({customBaseUrl:channel.baseUrl,customApiKey:channel.apiKey});
});

it('does not attach the global or saved channel key to a different per-model address', async () => {
  values.set('beike_modality_models_v1_image', JSON.stringify([
    { id:'gpt-image-2', modelId:'gpt-image-2', name:'Other address', modality:'image', channelId:channel.id, baseUrl:'https://other.example' },
  ]));
  await submitImageGenTaskResult({ model:'gpt-image-2', prompt:'test' }, {isAborted:()=>false});
  expect(calls[0].body).toMatchObject({customBaseUrl:'https://other.example'});
  for (const call of calls) expect(call.headers.has('x-custom-api-key')).toBe(false);
  expect(calls[0].body).not.toHaveProperty('customApiKey');
});

it('does not attach a global Key to a canvas text route with an explicit different address', async () => {
  const {apiFetch}=await import('../apiClient');
  await apiFetch('/api/generate/canvas-text',{method:'POST',body:JSON.stringify({model:'test-chat',customBaseUrl:'https://other.example'})});
  expect(calls[0].headers.get('x-custom-base-url')).toBe('https://other.example');
  expect(calls[0].headers.has('x-custom-api-key')).toBe(false);
});

it('routes an external lookalike media proxy through the app without sending it app credentials', async () => {
  const { apiFetch, proxyMediaUrl } = await import('../apiClient');
  const external = 'https://media.example/api/system/proxy-image?url=external';
  expect(proxyMediaUrl(external)).toBe('/api/system/proxy-image?url=' + encodeURIComponent(external));
  await expect(apiFetch(external)).rejects.toThrow('外部地址');
  expect(fetch).not.toHaveBeenCalled();
});
