import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, bindBeatProductImages, normalizeScriptTemplate } from '@shared/domain/sales';
import { emptySalesProductionPlan, type SalesProductionPlanState } from './salesProductionDraft';
import { patchSalesProductionPlan, salesProductionOutputKeys, staleSalesProductionOutputs } from './salesProductionOutputs';

const completed = (): SalesProductionPlanState => ({ ...emptySalesProductionPlan(), generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '/voice.mp3', mixedVideoUrl: '/final.mp4' });
const script = normalizeScriptTemplate({ title: '商品展示', durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
function outputKeys(url = '/first.jpg', plan = completed()) {
  const images = [{ index: 0, role: 'main' as const, url }];
  const assembled = assembleSalesVideoPrompt({ script, productName: '上衣', selectedImages: images, beatBindings: bindBeatProductImages(script, images), persona: null, scene: null });
  return salesProductionOutputKeys(assembled, plan, images, null, null);
}

describe('sales media invalidation', () => {
  it.each(['expression', 'transition'] as const)('invalidates video and mix after changing only %s, retaining narration', (field) => {
    const beat = { index: 0, subject: '人物', action: '举手', expression: '看镜头', transition: '保持站位', spokenLine: '台词', subtitle: '' };
    const plan = { ...completed(), adaptedBeats: [beat] };
    const next = patchSalesProductionPlan(plan, { adaptedBeats: [{ ...beat, [field]: '修订后的表演' }] });
    expect(next).toMatchObject({ generatedVideoUrl: '', mixedVideoUrl: '', voiceoverAudioUrl: '/voice.mp3' });
  });

  it.each<Partial<SalesProductionPlanState>>([
    { personaId: 'other-person' }, { customPersonaFaceUrl: '/new-face.jpg' }, { sceneId: 'new-scene' },
    { customSceneImageUrl: '/new-scene.jpg' }, { beatImageOverrides: { 0: '/other-product.jpg' } },
    { beatActionIds: { 0: 'new-depth' } }, { imitationMode: 'depth_imitation' }, { scriptVideoReference: 'depth' },
    { presentationMode: 'clean_visual' }, { videoAspectRatio: '16:9' }, { videoDurationSec: 10 },
    { adaptedBeats: [{ index: 0, subject: '', action: '转身', spokenLine: '', subtitle: '' }] },
  ])('invalidates both video outputs when a visual input changes: %j', (patch) => {
    expect(patchSalesProductionPlan(completed(), patch)).toMatchObject({ generatedVideoUrl: '', mixedVideoUrl: '' });
  });

  it('invalidates only audio and the mix when selecting another voice', () => {
    expect(patchSalesProductionPlan(completed(), { voiceId: 'new-voice' })).toMatchObject({ generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '', mixedVideoUrl: '' });
  });

  it('invalidates the old visual result after adapting with a newer prompt, even if its text matches', () => {
    const previous = { ...completed(), adaptedPromptVersion: 'plan-adapt:old' };
    const current = patchSalesProductionPlan(previous, { adaptedPromptVersion: 'plan-adapt:new' });
    expect(current).toMatchObject({ generatedVideoUrl: '', mixedVideoUrl: '', voiceoverAudioUrl: '/voice.mp3' });
    expect(staleSalesProductionOutputs(previous, outputKeys('/first.jpg', previous), outputKeys('/first.jpg', current)))
      .toEqual({ generatedVideoUrl: '', mixedVideoUrl: '' });
  });

  it('invalidates only the final mix when changing music', () => {
    expect(patchSalesProductionPlan(completed(), { customBgmUrl: '/new-track.mp3' })).toMatchObject({ generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '/voice.mp3', mixedVideoUrl: '' });
  });

  it('keeps fresh generated, uploaded and mixed results, while replacing their downstream mix', () => {
    const video = patchSalesProductionPlan(completed(), { generatedVideoUrl: '/new.mp4' });
    expect(video).toMatchObject({ generatedVideoUrl: '/new.mp4', mixedVideoUrl: '' });
    expect(staleSalesProductionOutputs(video, outputKeys(), outputKeys('/first.jpg', video))).toEqual({});
    expect(patchSalesProductionPlan(video, { mixedVideoUrl: '/new-final.mp4' }).mixedVideoUrl).toBe('/new-final.mp4');
    expect(patchSalesProductionPlan(completed(), { voiceoverAudioUrl: '/new-voice.mp3' })).toMatchObject({ voiceoverAudioUrl: '/new-voice.mp3', mixedVideoUrl: '' });
  });

  it('invalidates old results when gallery selection changes outside plan editing', () => {
    expect(staleSalesProductionOutputs(completed(), outputKeys(), outputKeys('/other-product.jpg'))).toEqual({ generatedVideoUrl: '', mixedVideoUrl: '' });
  });

  it('does not invalidate completed outputs when the same choices are reapplied', () => {
    expect(patchSalesProductionPlan(completed(), { beatImageOverrides: {}, videoModel: completed().videoModel })).toEqual(completed());
    expect(staleSalesProductionOutputs(completed(), outputKeys(), outputKeys())).toEqual({});
  });
});

describe('independent subtitle drafts', () => {
  it('keeps paid video, narration and final mix when only a subtitle is changed', () => {
    const plan = { ...completed(), adaptedBeats: [{ index: 0, subject: '商品', action: '展示商品', spokenLine: '商品介绍', subtitle: '原字幕' }] };
    const updated = patchSalesProductionPlan(plan, { adaptedBeats: [{ ...plan.adaptedBeats[0], subtitle: '修正字幕' }] });
    expect(updated).toMatchObject({ generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '/voice.mp3', mixedVideoUrl: '/final.mp4' });
    expect(staleSalesProductionOutputs(updated, outputKeys('/first.jpg', plan), outputKeys('/first.jpg', updated))).toEqual({});
  });

  it('keeps existing media when adding the first subtitle without changing motion or speech', () => {
    const updated = patchSalesProductionPlan(completed(), { adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '新字幕' }] });
    expect(updated).toMatchObject({ generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '/voice.mp3', mixedVideoUrl: '/final.mp4' });
  });
});
