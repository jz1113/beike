import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { getMultimodalClientOverrides, setClientGatewayApiKey, setClientGatewayBaseUrl } from '../gatewayClient';
import { withModelRoute } from './modelRoute';

const data = new Map<string, string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
beforeEach(() => {
  data.clear(); configureDomainRuntime({ storage });
  vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('localStorage', storage);
  setClientGatewayApiKey(undefined); setClientGatewayBaseUrl(undefined);
  data.set('ai_base_url', 'https://default.test'); data.set('ai_api_key', 'global');
});
afterEach(() => { configureDomainRuntime({ storage: null }); vi.unstubAllGlobals(); });
const routed = (path: string, body: Record<string, unknown>) => JSON.parse(withModelRoute(path, { method: 'POST', body: JSON.stringify(body) })!.body as string);

describe('text model request routing', () => {
  it.each(['gemini-4-argon', 'claude-5.5-haiku'])('retains an OpenAI channel URL and key while selecting %s native protocol', (model) => {
    data.set('custom_models', JSON.stringify([{ id: model, providerId: 'relay' }]));
    data.set('beike_api_providers_v2', JSON.stringify([{ id: 'relay', providerType: 'openai', baseUrl: 'https://relay.test/v1', apiKey: 'relay-key' }]));
    expect(getMultimodalClientOverrides(model)).toMatchObject({ customBaseUrl: 'https://relay.test/v1', customApiKey: 'relay-key', textProtocol: model.startsWith('gemini') ? 'gemini' : 'anthropic' });
  });
  it('passes an explicit protocol to model probes while keeping credentials and service probes intact', () => {
    expect(routed('/api/system/config', { model: 'claude-5.5-haiku', baseUrl: 'https://relay.test', apiKey: 'probe-key' }))
      .toMatchObject({ model: 'claude-5.5-haiku', textProtocol: 'anthropic', baseUrl: 'https://relay.test', apiKey: 'probe-key' });
    expect(routed('/api/system/config', { model: 'gemini-4-argon', textProtocol: 'openai' }).textProtocol).toBe('openai');
    expect(routed('/api/system/config', { type: 'ai' }).textProtocol).toBe('auto');
    const init = { method: 'POST', body: JSON.stringify({ type: 'wanbang', wanbangKey: 'test' }) };
    expect(withModelRoute('/api/system/config', init)).toBe(init);
  });
  it('resolves probe selection IDs without changing the chosen relay or protocol', () => {
    data.set('beike_modality_models_v1_chat', JSON.stringify([
      { id: 'native', modelId: 'gemini-4-argon', name: 'Native', modality: 'chat', textProtocol: 'gemini' },
      { id: 'compatible', modelId: 'gemini-4-argon', name: 'Compatible', modality: 'chat', textProtocol: 'openai' },
    ]));
    expect(routed('/api/system/config', { type: 'ai', model: 'compatible', baseUrl: 'http://probe-relay.test', apiKey: 'probe-key', allowInsecureHttp: true }))
      .toMatchObject({ type: 'ai', model: 'gemini-4-argon', textProtocol: 'openai', baseUrl: 'http://probe-relay.test', apiKey: 'probe-key', allowInsecureHttp: true });
    expect(routed('/api/system/config', { type: 'ai', model: 'native' }).textProtocol).toBe('gemini');
    expect(routed('/api/system/config', { type: 'ai', model: 'native', textProtocol: 'anthropic' }).textProtocol).toBe('anthropic');
  });
  it.each(['wanbang', 'external_scraper', 'qiyun'])('leaves %s service probes unchanged even with a model field', type => {
    const init = { method: 'POST', body: JSON.stringify({ type, model: 'claude-5.5-haiku', apiKey: 'service-key' }) };
    expect(withModelRoute('/api/system/config', init)).toBe(init);
  });
  it('does not clear Responses or insecure HTTP consent', () => {
    const result = routed('/api/generate/analyze', { model: 'gpt-6-sol', customBaseUrl: 'http://local.test', customApiKey: 'chosen-key', apiFormat: 'openai-responses', allowInsecureHttp: true });
    expect(result).toMatchObject({ apiFormat: 'openai-responses', allowInsecureHttp: true, customBaseUrl: 'http://local.test', customApiKey: 'chosen-key', textProtocol: 'openai' });
    data.set('custom_models', JSON.stringify([{ id: 'gpt-6-sol', apiTemplate: 'responses', customBaseUrl: 'https://relay.test', customApiKey: 'key' }]));
    expect(getMultimodalClientOverrides('gpt-6-sol')).toMatchObject({ apiFormat: 'openai-responses', textProtocol: 'openai' });
  });
  it('keeps explicitly supplied channel headers instead of injecting another channel into the body', () => {
    const result = withModelRoute('/api/generate/analyze', { method: 'POST',
      headers: { 'x-custom-base-url': 'https://chosen.test', 'x-custom-api-key': 'chosen' },
      body: JSON.stringify({ model: 'gemini-4-argon' }),
    });
    expect(JSON.parse(result!.body as string)).toMatchObject({ textProtocol: 'gemini' });
    expect(JSON.parse(result!.body as string)).not.toHaveProperty('customApiKey');
  });
  it('uses duplicate selection credentials before restoring the upstream ID', () => {
    data.set('beike_modality_models_v1_chat', JSON.stringify([
      { id: 'a', modelId: 'gemini-4-argon', name: 'GPT', modality: 'chat', baseUrl: 'https://a.test', apiKey: 'a' },
      { id: 'b', modelId: 'gemini-4-argon', name: 'GPT', modality: 'chat', baseUrl: 'https://b.test', apiKey: 'b', textProtocol: 'openai' },
    ]));
    expect(routed('/api/generate/canvas-text', { model: 'b', prompt: 'hello' })).toMatchObject({ model: 'gemini-4-argon', customBaseUrl: 'https://b.test', customApiKey: 'b', textProtocol: 'openai' });
  });
  it.each(['/api/assistant/turn/start', '/api/generate/analyze', '/api/generate/copywriting', '/api/generate/ppt-outline', '/api/generate/ppt-detail', '/api/generate/ppt-narration', '/api/generate/video-sales/analyze', '/api/generate/video-sales/script', '/api/generate/video-sales/select-images', '/api/generate/video-sales/finalize-prompts', '/api/generate/keyword-review', '/api/generate/headline-title', '/api/generate/headline-design', '/api/generate/headline-deconstruct'])('routes %s text/vision requests', path => {
    expect(routed(path, { model: 'claude-5.5-haiku' }).textProtocol).toBe('anthropic');
    expect(routed(path, { model: 'claude-5.5-haiku', textProtocol: 'openai', customApiKey: 'chosen' })).toMatchObject({ textProtocol: 'openai', customApiKey: 'chosen' });
  });
  it.each(['/api/generate/image', '/api/generate/video', '/api/generate/ppt-slide', '/api/generate/audio'])('leaves %s generation requests unchanged', path => {
    const init = { method: 'POST', body: JSON.stringify({ model: 'gemini-image', apiFormat: 'keep' }) };
    expect(withModelRoute(path, init)).toBe(init);
  });
});
