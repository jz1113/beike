import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeReasoningEffort, reasoningCapability, reasoningRequestOptions } from '../assistant/reasoning';
import { configureDomainRuntime } from '../core/runtime';
import { configuredTextProtocol, resolveTextProtocol, textModelCapability } from './deepseek';
import { resolveModalityModelRoute } from './modalityStorage';
import {
  GEMINI_EXTENDED_ASPECT_RATIOS,
  GEMINI_STANDARD_ASPECT_RATIOS,
  geminiSupportedAspectRatios,
  geminiSupportedResolutions,
  resolveGeminiAspectRatio,
  resolveGeminiImageSizeTier,
  resolveGeminiPixelSize,
} from './model-adapters/image/geminiImageSizes';
import {
  inferVendorId,
  sortModelsByVendor,
  getVendorDisplayName,
} from './modelSorting';
import { formatUserError, unwrapJsonErrorMessage } from './upstreamErrors';
import { reconcileStoredWorkflowDefaults, resolveEnabledModelId } from './workflowModelDefaults';
import { repairWorkflowModelsForSettings, type WorkflowCapability } from './workflowModels';
import { selectedTextModel, selectedTextProtocol } from './workflowModelStorage';

describe('modelSorting', () => {
  describe('inferVendorId', () => {
    it('accurately identifies vendors for approved and raw model ids', () => {
      expect(inferVendorId('gpt-5.6-luna')).toBe('openai');
      expect(inferVendorId('claude-opus-5')).toBe('anthropic');
      expect(inferVendorId('gemini-3.8-flash')).toBe('google');
      expect(inferVendorId('grok-4.6')).toBe('xai');
      expect(inferVendorId('deepseek-v4-flash')).toBe('deepseek');
      expect(inferVendorId('doubao-seedance-2.0-mini')).toBe('bytedance');
      expect(inferVendorId('qwen3.8-max')).toBe('alibaba');
      expect(inferVendorId('kling-video-v3')).toBe('kuaishou');
      expect(inferVendorId('vidu-video-2.0')).toBe('vidu');
      expect(inferVendorId('speech-2.8-hd')).toBe('minimax');
      expect(inferVendorId('speech-02-turbo')).toBe('minimax');
      expect(inferVendorId('tts-1-hd')).toBe('openai');
      expect(inferVendorId('fish-speech-1.5')).not.toBe('minimax');
    });

    it('returns human-friendly vendor display names', () => {
      expect(getVendorDisplayName('openai')).toBe('OpenAI');
      expect(getVendorDisplayName('anthropic')).toBe('Anthropic');
      expect(getVendorDisplayName('google')).toBe('Google');
      expect(getVendorDisplayName('xai')).toBe('xAI');
      expect(getVendorDisplayName('deepseek')).toBe('DeepSeek');
    });
  });

  describe('sortModelsByVendor', () => {
    it('places smart model at the very top', () => {
      const list = [
        { id: 'gemini-3.7-flash' },
        { id: 'smart-reasoning', isSmart: true },
        { id: 'gpt-5.6-luna' },
      ];
      const sorted = sortModelsByVendor(list);
      expect(sorted[0].id).toBe('smart-reasoning');
    });

    it('sorts mixed vendors according to vendor priority and model generation', () => {
      const input = [
        { id: 'muse-wonder-1.0' },
        { id: 'qwen3.8-max' },
        { id: 'kimi-k2.5' },
        { id: 'gpt-5.6-luna' },
        { id: 'grok-4.6' },
        { id: 'gemini-3.7-flash' },
        { id: 'gemini-3.8-flash' },
        { id: 'claude-sonnet-5' },
        { id: 'deepseek-v4-flash' },
      ];

      const sorted = sortModelsByVendor(input);
      const sortedIds = sorted.map((m) => m.id);

      expect(sortedIds).toEqual([
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gpt-5.6-luna',
        'claude-sonnet-5',
        'grok-4.6',
        'deepseek-v4-flash',
        'kimi-k2.5',
        'qwen3.8-max',
        'muse-wonder-1.0',
      ]);
    });

    it('orders models of the same vendor by generation score and tier', () => {
      const openaiModels = [
        { id: 'gpt-5.4-mini' },
        { id: 'gpt-6-luna' },
        { id: 'gpt-5.6-sol' },
        { id: 'gpt-5.6-luna' },
      ];

      const sorted = sortModelsByVendor(openaiModels);
      expect(sorted.map((m) => m.id)).toEqual([
        'gpt-6-luna',
        'gpt-5.6-sol',
        'gpt-5.6-luna',
        'gpt-5.4-mini',
      ]);
    });
  });
});

describe('formatUserError', () => {
  it('turns an upstream deadline into a readable image timeout', () => {
    expect(formatUserError('context deadline exceeded')).toBe('上游生图超时');
    expect(formatUserError('提交响应未确认：context deadline exceeded。请先在上游任务记录核实是否已创建任务，避免重复生成'))
      .toBe('提交响应未确认：上游生图超时。请先在上游任务记录核实是否已创建任务，避免重复生成');
  });

  it('unwraps nested JSON error wrappers from video and image providers', () => {
    const raw = '{"code":"1501","message":"Input material may contain sensitive content: videoUrls[0]. Please replace the material and try again | 用户输入的素材可能包含敏感内容：videoUrls[0]，请更换素材后重试"}';
    expect(unwrapJsonErrorMessage(raw)).toContain('参考视频未通过安全检测');
    expect(unwrapJsonErrorMessage(raw)).not.toContain('"code"');
    expect(formatUserError(raw)).toContain('参考视频未通过安全检测');
  });

  it('redacts signed OSS reference URLs and decodes filenames in error messages', () => {
    const truncatedSignedUrl =
      'https://jinzhuo11.oss-cn-beijing.aliyuncs.com/seedance/refs/202610/%E8%A7%86%E9%A2%91%E5%8F%82%E8%80%831.mp4?x-oss-credential=LTAI5t6uxgrYLFmsaBCUc1SX%2F20261031%2Fcn-beijing%2Foss';
    const formattedBare = formatUserError(truncatedSignedUrl);
    expect(formattedBare).toContain('【参考视频：视频参考1.mp4】处理失败');
    expect(formattedBare).not.toContain('x-oss-credential');

    const withReason = `${truncatedSignedUrl}: 视频素材时长超出限制`;
    const formattedWithReason = formatUserError(withReason);
    expect(formattedWithReason).toBe('【参考视频：视频参考1.mp4】: 视频素材时长超出限制');
  });
});

describe('geminiImageSizes', () => {
  it('supports all 14 official aspect ratios on gemini-nano-banana-2.1 and gemini-3.1-flash-image', () => {
    expect(geminiSupportedAspectRatios('gemini-nano-banana-2.1')).toEqual(GEMINI_EXTENDED_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('gemini-3.1-flash-image')).toEqual(GEMINI_EXTENDED_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('nano-banana-2')).toEqual(GEMINI_EXTENDED_ASPECT_RATIOS);
    for (const ratio of GEMINI_EXTENDED_ASPECT_RATIOS) {
      expect(resolveGeminiAspectRatio('gemini-nano-banana-2.1', ratio)).toBe(ratio);
    }
  });

  it('restricts Pro, Lite, and 2.5 Flash to the 10 standard aspect ratios and maps extreme ratios', () => {
    expect(geminiSupportedAspectRatios('gemini-3-pro-image')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('nano-banana-pro')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('gemini-3.1-flash-lite-image')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS);
    expect(geminiSupportedAspectRatios('gemini-2.5-flash-image')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS);
    expect(resolveGeminiAspectRatio('nano-banana-pro', '1:8')).toBe('9:16');
    expect(resolveGeminiAspectRatio('nano-banana-pro', '8:1')).toBe('21:9');
  });

  it('omits aspectRatio for auto/default/smart and resolves exact official pixel sizes', () => {
    expect(resolveGeminiAspectRatio('gemini-nano-banana-2.1', 'auto')).toBeUndefined();
    expect(resolveGeminiAspectRatio('gemini-nano-banana-2.1', 'smart')).toBeUndefined();
    expect(resolveGeminiAspectRatio('gemini-nano-banana-2.1', 'default')).toBeUndefined();

    expect(resolveGeminiPixelSize('3:4', 'gemini-nano-banana-2.1', 'low')).toBe('896x1200');
    expect(resolveGeminiPixelSize('3:4', 'gemini-nano-banana-2.1', 'medium')).toBe('1792x2400');
    expect(resolveGeminiPixelSize('3:4', 'gemini-nano-banana-2.1', 'high')).toBe('3584x4800');
    expect(resolveGeminiPixelSize('1:4', 'gemini-nano-banana-2.1', 'high')).toBe('2048x8192');
    expect(resolveGeminiPixelSize('8:1', 'gemini-nano-banana-2.1', 'medium')).toBe('6144x768');
    expect(resolveGeminiPixelSize('3:4', 'nano-banana', 'high')).toBe('864x1184');
  });

  it('enforces uppercase K for image_size and respects Lite / 2.5 Flash resolution limits', () => {
    expect(geminiSupportedResolutions('gemini-nano-banana-2.1')).toEqual(['1K', '2K', '4K']);
    expect(geminiSupportedResolutions('gemini-3.1-flash-lite-image')).toEqual(['1K']);
    expect(geminiSupportedResolutions('gemini-2.5-flash-image')).toEqual(['1K']);
    expect(resolveGeminiImageSizeTier('gemini-nano-banana-2.1', '1k')).toBe('1K');
    expect(resolveGeminiImageSizeTier('gemini-nano-banana-2.1', 'high')).toBe('4K');
    expect(resolveGeminiImageSizeTier('gemini-3.1-flash-lite-image', 'high')).toBe('1K');
    expect(resolveGeminiImageSizeTier('nano-banana', 'high')).toBeUndefined();
    expect(resolveGeminiImageSizeTier('nano-banana-pro', 'high')).toBe('4K');
  });
});

describe('text protocol and thinking capabilities', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  beforeEach(() => { data.clear(); configureDomainRuntime({ storage }); vi.stubGlobal('window', { localStorage: storage }); });
  afterEach(() => { configureDomainRuntime({ storage: null }); vi.unstubAllGlobals(); });

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

  it('lets an auto model protocol inherit the configured channel protocol', () => {
    data.set('beike_modality_models_v1_chat', JSON.stringify([
      { id: 'chat-auto', modelId: 'gemini-3-flash', name: 'Gemini via relay', modality: 'chat', channelId: 'auto-channel', textProtocol: 'auto' },
    ]));
    data.set('beike_api_providers_v2', JSON.stringify([
      { id: 'auto-channel', baseUrl: 'https://auto-channel.example', apiKey: 'key', providerType: 'openai' },
    ]));
    expect(resolveModalityModelRoute('chat', 'chat-auto').textProtocol).toBe('openai');
  });

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

describe('workflowModelDefaults', () => {
  describe('resolveEnabledModelId bidirectional prefix compatibility', () => {
    it('matches bare model ID to openai-responses prefixed route model without falling back', () => {
      const models = [
        { id: 'openai-responses:gpt-5.4-mini' },
        { id: 'openai-responses:gpt-6-luna' },
      ];
      const resolved = resolveEnabledModelId('gpt-6-luna', models);
      expect(resolved).toBe('openai-responses:gpt-6-luna');
    });

    it('matches prefixed route model to bare model ID', () => {
      const models = [
        { id: 'gpt-5.4-mini' },
        { id: 'gpt-6-luna' },
      ];
      const resolved = resolveEnabledModelId('openai-responses:gpt-6-luna', models);
      expect(resolved).toBe('gpt-6-luna');
    });
  });

  it('initializes vision and assistant with Luna even when another model is listed first', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    };
    const models: WorkflowCapability[] = ['gpt-5.4-mini', 'gpt-6-luna'].map(id => ({
      id, channel: 'openai', enabled: true, isMultimodal: true, isAssistant: true,
    }));
    const defaults = reconcileStoredWorkflowDefaults(models, storage);
    expect(defaults.vision).toBe('openai-responses:gpt-6-luna');
    expect(defaults.assistant).toBe('openai-responses:gpt-6-luna');
    expect(storage.getItem('ai_multimodal_model')).toBe(defaults.vision);
    expect(storage.getItem('ai_assistant_model')).toBe(defaults.assistant);
  });

  it('preserves openai channel models in assistant defaults without falling back', () => {
    const memoryStore: Record<string, string> = {
      ai_assistant_model: 'gpt-6-luna',
      beike_assistant_selected_model: 'gpt-6-luna',
    };

    const mockStorage = {
      getItem: (key: string) => memoryStore[key] ?? null,
      setItem: (key: string, value: string) => { memoryStore[key] = value; },
      removeItem: (key: string) => { delete memoryStore[key]; },
      clear: () => { Object.keys(memoryStore).forEach((k) => delete memoryStore[k]); },
    };

    const models: WorkflowCapability[] = [
      {
        id: 'gpt-5.4-mini',
        channel: 'openai',
        enabled: true,
        isMultimodal: true,
        isAssistant: true,
      },
      {
        id: 'gpt-6-luna',
        channel: 'openai',
        enabled: true,
        isMultimodal: true,
        isAssistant: true,
      },
      {
        id: 'deepseek-v4-flash',
        channel: 'deepseek',
        enabled: true,
        isMultimodal: true,
        isAssistant: true,
      },
    ];

    const result = reconcileStoredWorkflowDefaults(models, mockStorage);
    expect(result.assistant).toBe('openai-responses:gpt-6-luna');
    expect(mockStorage.getItem('beike_assistant_selected_model')).toBe('openai-responses:gpt-6-luna');
  });
});
