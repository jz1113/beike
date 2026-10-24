import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '../core/runtime';
import { configuredTextProtocol, resolveTextProtocol, textModelCapability } from './textProtocol';
import { selectedTextModel, selectedTextProtocol } from './textModelRoute';
import { repairWorkflowModelsForSettings } from './workflowModels';
import { resolveModalityModelRoute } from './modalityStorage';
import { normalizeReasoningEffort, reasoningCapability, reasoningRequestOptions } from '../assistant/reasoning';

const data = new Map<string, string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
beforeEach(() => { data.clear(); configureDomainRuntime({ storage }); vi.stubGlobal('window', { localStorage: storage }); });
afterEach(() => { configureDomainRuntime({ storage: null }); vi.unstubAllGlobals(); });

describe('text protocol selection', () => {
  it('infers native protocols from actual IDs, independently of the channel default', () => {
    expect(resolveTextProtocol('gemini-4-argon')).toBe('gemini');
    expect(resolveTextProtocol('claude-5.5-haiku')).toBe('anthropic');
    expect(resolveTextProtocol('gpt-6-sol')).toBe('openai');
    expect(resolveTextProtocol('claude-5.5-haiku', 'openai')).toBe('openai');
    expect(resolveTextProtocol('my-alias')).toBe('openai');
    expect(textModelCapability('claude-unknown')).toBeUndefined();
  });
  it('preserves explicit and legacy native choices, but does not turn the old Chat Completions default into an override', () => {
    expect(configuredTextProtocol({ apiTemplate: 'gemini' })).toBe('gemini');
    expect(configuredTextProtocol({ apiTemplate: 'anthropic' })).toBe('anthropic');
    expect(configuredTextProtocol({ apiTemplate: 'openai' })).toBe('openai');
    expect(configuredTextProtocol({ apiTemplate: 'chat_completions' })).toBeUndefined();
    expect(configuredTextProtocol({ textProtocol: 'auto', apiTemplate: 'openai' })).toBe('auto');
    const [saved] = repairWorkflowModelsForSettings([{ id: 'gemini-4-argon', channel: 'my-provider', providerId: 'my-provider', name: 'Claude', isCustom: true, apiTemplate: 'gemini', textProtocol: 'openai', customBaseUrl: 'https://example.test', customApiKey: 'test-key' }]);
    expect(saved).toMatchObject({ textProtocol: 'openai', apiTemplate: 'gemini', customBaseUrl: 'https://example.test', customApiKey: 'test-key' });
    data.set('custom_models', JSON.stringify([saved]));
    expect(selectedTextProtocol('gemini-4-argon')).toBe('openai');
  });
  it('resolves duplicate selections to the upstream model while preserving the chosen protocol and credentials', () => {
    data.set('beike_modality_models_v1_chat', JSON.stringify([
      { id: 'route-a', modelId: 'claude-5.5-haiku', name: 'Gemini', modality: 'chat', channelId: 'a' },
      { id: 'route-b', modelId: 'claude-5.5-haiku', name: 'Gemini', modality: 'chat', channelId: 'b', textProtocol: 'openai' },
    ]));
    data.set('beike_api_providers_v2', JSON.stringify([{ id: 'a', baseUrl: 'https://a.test', apiKey: 'a' }, { id: 'b', baseUrl: 'https://b.test', apiKey: 'b' }]));
    expect(selectedTextModel('route-b').modelId).toBe('claude-5.5-haiku');
    expect(selectedTextProtocol('route-a')).toBe('anthropic');
    expect(selectedTextProtocol('route-b')).toBe('openai');
    expect(resolveModalityModelRoute('chat', 'route-b')).toMatchObject({ textProtocol: 'openai', baseUrl: 'https://b.test', apiKey: 'b' });
    expect(resolveModalityModelRoute('image', 'gemini-image')).not.toHaveProperty('textProtocol');
  });
});

describe('confirmed thinking capabilities', () => {
  it('shows Argon levels and Haiku adaptive effort only on the supported protocol', () => {
    expect(reasoningCapability('gemini-4-argon').levels).toEqual(['low', 'medium', 'high']);
    expect(reasoningRequestOptions('gemini-4-argon', 'high')).toEqual({ thinkingConfig: { thinkingLevel: 'high' } });
    expect(reasoningRequestOptions('claude-haiku-5-5', 'medium')).toEqual({ thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } });
    expect(normalizeReasoningEffort('claude-haiku-5-5', 'xhigh')).toBe('xhigh');
    expect(normalizeReasoningEffort('claude-haiku-5-5', 'max')).toBe('max');
    expect(normalizeReasoningEffort('claude-sonnet-4-6', 'max')).toBe('max');
    expect(normalizeReasoningEffort('claude-sonnet-4-6', 'xhigh')).toBe('high');
    expect(normalizeReasoningEffort('gemini-3-pro-preview', 'medium')).toBe('high');
    expect(normalizeReasoningEffort('gemini-4-argon', 'xhigh')).toBe('high');
    expect(reasoningRequestOptions('gemini-2.5-pro', 'high')).toEqual({ thinkingConfig: { thinkingBudget: 12288 } });
    expect(reasoningCapability('claude-5.5-haiku').levels).toEqual([]);
    expect(reasoningCapability('openai-responses:gemini-4-argon').levels).toEqual([]);
    expect(reasoningCapability('claude-haiku-5-5', 'openai').levels).toEqual([]);
    expect(reasoningCapability('deepseek-official:deepseek-flash').levels).toEqual(['low', 'high', 'xhigh', 'max']);
    expect(reasoningCapability('gpt-6-astra').levels).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(reasoningCapability('claude-unknown').levels).toEqual([]);
    expect(reasoningRequestOptions('claude-unknown', 'high')).toEqual({});
  });
  it('uses the real selected model and does not infer capabilities from a display name', () => {
    data.set('custom_models', JSON.stringify([{ id: 'unknown-alias', name: 'Claude 5.5 Haiku', textProtocol: 'anthropic' }]));
    expect(reasoningCapability('unknown-alias').levels).toEqual([]);
    data.set('custom_models', JSON.stringify([{ id: 'claude-5.5-haiku', routeId: 'my-haiku-route', textProtocol: 'openai' }]));
    expect(reasoningCapability('my-haiku-route').levels).toEqual([]);
  });
});
