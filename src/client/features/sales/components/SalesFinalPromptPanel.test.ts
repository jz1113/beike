import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguredModelPickerProps } from '@client/shared/models/ConfiguredModelPicker';
import { assembleSalesVideoPrompt, normalizeScriptTemplate, type AssembledSalesPrompt, type SalesVoiceCandidate } from '@shared/domain/sales';
import { emptySalesProductionPlan } from '../model/salesProductionDraft';
import * as videoCompatibility from '../model/salesVideoCompatibility';
import { SalesFinalPromptPanel } from './SalesFinalPromptPanel';

vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));
const modelPicker = vi.hoisted(() => ({ current: null as ConfiguredModelPickerProps | null }));
vi.mock('@client/shared/models/ConfiguredModelPicker', () => ({ ConfiguredModelPicker: (input: ConfiguredModelPickerProps) => {
  if (input.ariaLabel === '视频生成模型') modelPicker.current = input;
  return createElement('button', { disabled: input.disabled, 'aria-label': input.ariaLabel }, '切换模型');
} }));
const depth = vi.hoisted(() => ({ preparing: false, error: '', url: '', rejected: false,
  precheckUrls: [] as string[], precheckEnabled: false, reviewed: null as AssembledSalesPrompt | null }));
vi.mock('../hooks/useSalesDepthReferences', () => ({ useSalesDepthReferences: ({ assembled }: { assembled: AssembledSalesPrompt }) => ({
  assembled: depth.url ? { ...assembled, references: assembled.references.map((slot) => slot.mediaType === 'video' ? { ...slot, url: depth.url } : slot) } : assembled,
  preparing: depth.preparing, error: depth.error, canRetry: Boolean(depth.error), retry: () => {},
}) }));
vi.mock('@client/shared/api/generation/seedancePrecheck', () => ({ useSeedancePrecheck: (items: { url: string }[], enabled: boolean) => {
  depth.precheckUrls = items.map((item) => item.url); depth.precheckEnabled = enabled;
  return depth.rejected ? new Map([[depth.url, { url: depth.url, status: 'rejected', error: '片段校验失败' }]]) : new Map();
} }));
vi.mock('./SalesReferenceReview', () => ({ SalesReferenceReview: ({ assembled }: { assembled: AssembledSalesPrompt }) => { depth.reviewed = assembled; return null; } }));
vi.mock('./SalesDeliveryPreview', () => ({ SalesDeliveryPreview: () => null }));
vi.mock('./SalesVideoDurationNotice', () => ({ SalesVideoDurationNotice: () => null }));

const voice: SalesVoiceCandidate = { id: 'voice', name: '本次口播人声', voiceId: 'soft', ttsVoice: 'soft', gender: 'female', tags: [], sampleAudioUrl: '/chosen.mp3', promptText: '', source: 'user' };
beforeEach(() => { modelPicker.current = null; Object.assign(depth, { preparing: false, error: '', url: '', rejected: false, precheckUrls: [], precheckEnabled: false, reviewed: null }); });
afterEach(() => vi.restoreAllMocks());
function props(selectedVoice: SalesVoiceCandidate | null = voice, voiceAudioUrl = ''): ComponentProps<typeof SalesFinalPromptPanel> {
  const script = normalizeScriptTemplate({ durationSec: 5, format: 'product', voiceMode: 'speech', shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
  const assembled = assembleSalesVideoPrompt({ finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}', script, productName: '当前商品', selectedImages: [{ index: 0, url: '/product.jpg', role: 'main' }], beatBindings: [], persona: null, scene: null, voice: selectedVoice, voiceAudioUrl,
    adaptedBeats: [{ index: 0, subject: '商品', action: '展示商品', spokenLine: '这是本次完整台词。', subtitle: '' }] });
  return {
    script, assembled, beatBindings: [], plan: { ...emptySalesProductionPlan(), voiceId: selectedVoice?.id || '', voiceoverAudioUrl: voiceAudioUrl },
    videoModels: [], voiceModels: [], rankedVoices: [{ item: voice, score: 1, reasons: [] }], selectedVoice, busy: '', progressText: '',
    onEditMaterials: () => {}, onEditStoryboard: () => {}, onOpenVoiceMaterials: () => {}, onPatchPlan: () => {}, onSynthesizeVoice: () => {}, onGenerateVideo: () => {}, onUploadRawVideo: () => {}, onMixFinal: () => {}, onCancel: () => {},
  };
}

describe('delivery video model controls', () => {
  it('shows the stale storyboard reason next to the recovery action before generation', () => {
    const input = props();
    input.generationSourceError = '拍摄场景已变更';
    input.onReadaptStoryboard = vi.fn();
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, input));
    expect(html).toMatch(/<p[^>]*role="status"[^>]*>拍摄场景已变更<\/p>/);
    expect(html).toContain('按当前设置重新改写分镜');
  });

  it('offers model switching with the current script, material and voice references', () => {
    const patch = vi.spyOn(videoCompatibility, 'salesVideoModelPatch');
    const input = props();
    input.videoModels = [{ id: 'wan3.0-video', modelId: 'wan3.0-video', entryId: 'wan-channel', name: '万相 3.0' }];
    input.onPatchPlan = vi.fn();
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, input));
    expect(html).toContain('aria-label="视频生成模型"');
    expect(html).toContain('模型选择');
    expect(html).toContain('模型设置');
    expect(modelPicker.current?.disabled).toBe(false);
    expect(modelPicker.current?.options).toContainEqual(expect.objectContaining({ id: 'wan3.0-video' }));
    modelPicker.current!.onChange('wan3.0-video');
    expect(patch).toHaveBeenCalledWith('wan3.0-video', { plan: input.plan, script: input.script,
      references: input.assembled.references, audios: input.assembled.audios || [] });
    expect(input.onPatchPlan).toHaveBeenCalledWith(expect.objectContaining({ videoModel: 'wan3.0-video' }));
  });

  it.each(['preparing', 'generating'] as const)('locks model switching while %s', (phase) => {
    const input = props();
    if (phase === 'preparing') depth.preparing = true;
    else input.busy = 'video';
    renderToStaticMarkup(createElement(SalesFinalPromptPanel, input));
    expect(modelPicker.current?.disabled).toBe(true);
  });
});

describe('delivery speech voice controls', () => {
  it('uses the explicit Grok preset without requiring a library voice or a synthesized reference', () => {
    const input = props(null);
    input.plan = { ...input.plan, videoModel: 'grok-imagine-video-1.5', videoVoiceId: 'eve' };
    input.assembled = assembleSalesVideoPrompt({ model: input.plan.videoModel, videoVoiceId: 'eve',
      finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}', script: input.script,
      productName: '商品', selectedImages: [{ index: 0, url: '/product.jpg', role: 'main' }], beatBindings: [], persona: null, scene: null,
      adaptedBeats: [{ index: 0, subject: '商品', action: '展示商品', spokenLine: '本次口播台词。', subtitle: '' }] });
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, input));
    expect(html).toContain('真人口播 · Eve');
    expect(html).toContain('Grok 官方预置音色');
    expect(html).toContain('aria-label="Grok 官方口播音色"');
    expect(html).not.toContain('生成音色参考');
    expect(html).not.toContain('请选择人声');
  });
  it('shows the actual selected voice and sample without offering redundant synthesis', () => {
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, props()));
    expect(html).toContain(`真人口播 · ${voice.name}`);
    expect(html).toContain('选择口播人声');
    expect(html).toContain('已绑定声音样本');
    expect(html).toContain('src="/chosen.mp3"');
    expect(html).not.toContain('aria-label="语音合成模型"');
    expect(html).not.toContain('声音已克隆');
  });

  it('offers explicit short reference synthesis for voices without a sample', () => {
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, props({ ...voice, sampleAudioUrl: '' }, '/synthesized.mp3')));
    expect(html).toContain('重新生成音色参考');
    expect(html).toContain('使用固定试听句生成音色参考，修改台词后可继续复用');
    expect(html).toContain('合成参考音频试听');
    expect(html).toContain('src="/synthesized.mp3"');
  });

  it('enables preparing a speech reference before the storyboard dialogue is written', () => {
    const input = props({ ...voice, sampleAudioUrl: '' });
    input.assembled = { ...input.assembled, narrationText: '', voiceError: '请先生成或填写本次分镜台词，再生成带人声的视频。' };
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, input));
    const synthesisButton = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .find(([, , body]) => body.replace(/<[^>]*>/g, '') === '生成音色参考');
    expect(synthesisButton).toBeDefined();
    expect(synthesisButton?.[1]).not.toContain('disabled=""');
  });

  it('explains the missing voice and disables synthesis before a user selects one', () => {
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, props(null)));
    expect(html).toContain('需选择人声');
    expect(html).toContain('请选择人声，真人口播和画外旁白都需要绑定声音');
    expect(html).toContain('请先选择本次使用的人声');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?生成音色参考<\/button>/);
  });
});

describe('delivery prepared motion review', () => {
  function depthProps() {
    const input = props();
    input.plan = { ...input.plan, videoModel: 'doubao-seedance-2.0-mini' };
    input.assembled = { ...input.assembled, imitationMode: 'depth_imitation', references: [...input.assembled.references, {
      slotIndex: 2, kind: 'action', mediaType: 'video', url: '/overlong-source-depth.mp4', label: '深度动作视频', mixedToken: '{{Mixed 2}}', apiToken: '视频1',
    }] };
    return input;
  }
  function generateButton(html: string) {
    return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .find(([, , body]) => body.replace(/<[^>]*>/g, '') === '生成视频');
  }

  it('waits for a prepared depth reference before prechecking or asking for material confirmation', () => {
    depth.preparing = true;
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, depthProps()));
    expect(depth.precheckEnabled).toBe(false);
    expect(depth.reviewed).toBeNull();
    expect(html).toContain('正在按本次分镜准备深度动作片段');
    expect(generateButton(html)?.[1]).toContain('disabled=""');
  });

  it('checks and reviews the actual prepared URL and blocks clips rejected by model validation', () => {
    depth.url = '/actual-short-depth.mp4'; depth.rejected = true;
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, depthProps()));
    expect(depth.precheckEnabled).toBe(true);
    expect(depth.precheckUrls).toContain(depth.url);
    expect(depth.precheckUrls).not.toContain('/overlong-source-depth.mp4');
    expect(depth.reviewed?.references.at(-1)?.url).toBe(depth.url);
    expect(html).toContain('有 1 份素材未通过校验');
    expect(generateButton(html)?.[1]).toContain('disabled=""');
  });

  it('prechecks and previews the saved product copy while preserving the action slot', () => {
    const input = depthProps();
    input.plan.productFaceEdits = { '/product.jpg': { url: '/masked.png', regions: [{ x: 0, y: 0, width: 0.2, height: 0.3 }] } };
    depth.url = '/prepared.mp4';
    renderToStaticMarkup(createElement(SalesFinalPromptPanel, input));
    expect(depth.precheckUrls).toEqual(['/masked.png', '/prepared.mp4']);
    expect(depth.reviewed?.references.map((slot) => slot.url)).toEqual(depth.precheckUrls);
  });

  it('keeps preparation errors visible and prevents source-only confirmation', () => {
    depth.error = '本次动作片段准备失败';
    const html = renderToStaticMarkup(createElement(SalesFinalPromptPanel, depthProps()));
    expect(depth.precheckEnabled).toBe(false);
    expect(depth.reviewed).toBeNull();
    expect(html).toContain(depth.error);
    expect(html).toContain('重试动作片段准备');
    expect(html).toContain('调整引用素材');
    expect(html).not.toContain('sales-delivery-bottom-hint');
    expect(generateButton(html)?.[1]).toContain('disabled=""');
  });
});
