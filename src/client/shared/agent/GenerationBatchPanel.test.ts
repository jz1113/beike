import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import GenerationBatchPanel, { initialBatchDraft } from './GenerationBatchPanel';
import { resolveBatchModelSummary, resolvePreferredBatchModel } from './GenerationBatchSettings';
import type { GenerationPromptSource } from './generationBatchSources';

const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
};

beforeEach(() => {
  data.clear();
  configureDomainRuntime({ storage });
  vi.stubGlobal('window', {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  configureDomainRuntime({ storage: null });
  vi.unstubAllGlobals();
});

const imageSource: GenerationPromptSource = {
  sourceId: 'agent:session-1:task-1:abc',
  kind: 'agent',
  sessionId: 'session-1',
  replyId: 'task-1',
  media: [],
  entries: [
    {
      id: 'prompt-1',
      title: '可直接复制的绘图提示词',
      prompt: '自然柔和光影，3:4 竖版构图',
      mediaType: 'image',
      aspect: '3:4',
    },
  ],
};

describe('GenerationBatchPanel and GenerationBatchSettings', () => {
  it('defaults to collapsed bar showing active model badge and quick generate button, and renders visual controls when expanded', () => {
    const collapsedHtml = renderToStaticMarkup(createElement(GenerationBatchPanel, { source: imageSource }));
    expect(collapsedHtml).toContain('共 1 项：1 张图片');
    expect(collapsedHtml).not.toContain('0 条视频');
    expect(collapsedHtml).toContain('GPT Image 2');
    expect(collapsedHtml).toContain('· 3:4 · 4K');
    expect(collapsedHtml).toContain('并行生成选中的 1 项');
    expect(collapsedHtml).toContain('展开清单');
    expect(collapsedHtml).not.toContain('aria-label="批量图片模型"');

    const expandedHtml = renderToStaticMarkup(createElement(GenerationBatchPanel, { source: imageSource, defaultOpen: true }));
    expect(expandedHtml).toContain('收起清单');
    expect(expandedHtml).toContain('aria-label="批量图片模型"');
    expect(expandedHtml).toContain('画面比例');
    expect(expandedHtml).toContain('1K');
    expect(expandedHtml).toContain('2K');
    expect(expandedHtml).toContain('4K');
    expect(expandedHtml).not.toContain('媒体提交并发数');
  });

  it('syncs initial settings aspect ratio and duration from extracted prompt entries when no draft is saved', () => {
    const mixedSource: GenerationPromptSource = {
      ...imageSource,
      entries: [
        { id: 'img-1', title: '海报', prompt: '9:16 竖版海报', mediaType: 'image', aspect: '9:16' },
        { id: 'vid-1', title: '口播', prompt: '镜头推进', mediaType: 'video', aspect: '9:16', duration: 8 },
      ],
    };
    const draft = initialBatchDraft(mixedSource);
    expect(draft.settings.imageAspect).toBe('9:16');
    expect(draft.settings.videoAspect).toBe('9:16');
    expect(draft.settings.videoDuration).toBe(8);
  });

  it('prefers user-saved or custom synced models over the generic gpt-image-2 seed fallback and summarizes display labels', () => {
    const models = [
      { id: 'qwen-image-3.0-pro', name: 'Qwen Image 3.0 Pro', desc: '已同步', upstreamId: 'qwen-image-3.0-pro' },
      { id: 'gpt-image-2', name: 'GPT Image', desc: '默认', upstreamId: 'gpt-image-2' },
    ];
    data.set('beike_modality_models_v1_image', JSON.stringify([
      { id: 'custom-qwen', name: 'Qwen Image 3.0 Pro', modality: 'image', modelId: 'qwen-image-3.0-pro' },
      { id: 'img_openai', name: 'GPT Image', modality: 'image', modelId: 'gpt-image-2', isDefault: true },
    ]));
    expect(resolvePreferredBatchModel('image', 'gpt-image-2', models)).toBe('qwen-image-3.0-pro');
    expect(resolveBatchModelSummary('image', 'qwen-image-3.0-pro', models).label).toBe('Qwen Image 3.0 Pro');

    data.set('ai_image_gen_model', 'gpt-image-2');
    expect(resolvePreferredBatchModel('image', 'gpt-image-2', models)).toBe('gpt-image-2');
  });
});
