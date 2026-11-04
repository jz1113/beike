import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, bindBeatProductImages, normalizeScriptTemplate } from '@shared/domain/sales';
import { emptySalesProductionPlan, planForSelectedScript, type SalesProductionPlanState } from './salesProductionDraft';
import { patchSalesProductionPlan, salesProductionOutputKeys, staleSalesProductionOutputs } from './salesProductionOutputs';

const completed = (): SalesProductionPlanState => ({ ...emptySalesProductionPlan(), generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '/voice.mp3', mixedVideoUrl: '/final.mp4' });
const script = normalizeScriptTemplate({ title: '商品展示', durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, action: '展示商品' }] }] })!;
function outputKeys(url = '/first.jpg', plan = completed()) {
  const images = [{ index: 0, role: 'main' as const, url }];
  const assembled = assembleSalesVideoPrompt({ script, productName: '上衣', selectedImages: images, beatBindings: bindBeatProductImages(script, images), persona: null, scene: null });
  return salesProductionOutputKeys(assembled, plan, images, null, null);
}

describe('sales media invalidation', () => {
  it('invalidates finished media when visual observations change while retaining reusable audio', () => {
    const personaVisualProfile = { imageUrl: '/main.jpg', presence: 'silent_model' as const, temperament: '清爽',
      gaze: '注视镜头', expression: '浅笑', posture: '肩背舒展', limitations: '静态图片' };
    const plan = { ...completed(), personaVisualProfile };
    expect(patchSalesProductionPlan(plan, { personaVisualProfile: { ...personaVisualProfile, gaze: '视线稍偏镜头' } }))
      .toMatchObject({ generatedVideoUrl: '', mixedVideoUrl: '', voiceoverAudioUrl: '/voice.mp3' });
    expect(patchSalesProductionPlan(plan, { personaVisualProfile: { ...personaVisualProfile } })).toEqual(plan);
  });
  it('invalidates Grok video, mix and recovery receipt when the preset changes while retaining the library sample', () => {
    const plan = { ...completed(), videoModel: 'grok-imagine-video-1.5', videoVoiceId: 'eve', pendingVideoTask: {
      taskId: 'submitted', model: 'grok-imagine-video-1.5', modelSelection: 'grok-imagine-video-1.5', sourceKey: 'previous',
    } };
    expect(patchSalesProductionPlan(plan, { videoVoiceId: 'leo' }))
      .toMatchObject({ generatedVideoUrl: '', mixedVideoUrl: '', pendingVideoTask: null, voiceoverAudioUrl: '/voice.mp3' });
    expect(outputKeys('/first.jpg', { ...plan, videoVoiceId: undefined })).toEqual(outputKeys('/first.jpg', { ...plan, videoVoiceId: '' }));
  });

  it('keeps Grok video and pending-task keys independent of the inactive voice library', () => {
    const plan = { ...completed(), videoModel: 'grok-imagine-video-1.5', videoVoiceId: 'eve' };
    const assembled = assembleSalesVideoPrompt({ model: plan.videoModel, videoVoiceId: 'eve', script,
      productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null });
    const voice = { id: 'speaker', name: '库人声', voiceId: 'speaker-code', ttsVoice: 'speaker-code', gender: 'female', tags: [], sampleAudioUrl: '/saved.mp3', promptText: '', source: 'voice_library' };
    const before = salesProductionOutputKeys(assembled, { ...plan, voiceId: voice.id }, [], voice, null);
    const changed = salesProductionOutputKeys(assembled, { ...plan, voiceId: 'other', voiceModel: 'other-model' }, [], { ...voice, sampleAudioUrl: '/changed.mp3' }, null);
    const removed = salesProductionOutputKeys(assembled, plan, [], null, null);
    expect(changed.video).toBe(before.video);
    expect(removed.video).toBe(before.video);
    expect(salesProductionOutputKeys({ ...assembled, voiceIds: ['leo'] }, { ...plan, videoVoiceId: 'leo' }, [], voice, null).video).not.toBe(before.video);
  });

  it.each(['speech', ''] as const)('preserves Grok outputs through library refresh and cleanup patches (override=%s)', (voiceModeOverride) => {
    const plan = { ...completed(), voiceModeOverride, videoModel: 'grok-imagine-video-1.5', videoVoiceId: 'eve', pendingVideoTask: {
      taskId: 'grok-task', model: 'grok-imagine-video-1.5', modelSelection: 'grok-imagine-video-1.5', sourceKey: 'previous',
    } };
    const assembled = assembleSalesVideoPrompt({ model: plan.videoModel, videoVoiceId: plan.videoVoiceId, script,
      productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null });
    const voice = { id: 'speaker', name: '库人声', voiceId: 'speaker-code', ttsVoice: 'speaker-code', gender: 'female', tags: [], sampleAudioUrl: '/saved.mp3', promptText: '', source: 'voice_library' };
    const before = salesProductionOutputKeys(assembled, plan, [], voice, null);
    const after = salesProductionOutputKeys(assembled, plan, [], { ...voice, sampleAudioUrl: '/replacement.mp3' }, null);
    const stale = staleSalesProductionOutputs(plan, before, after);
    expect(stale).toEqual({});
    expect(patchSalesProductionPlan(plan, stale)).toEqual(plan);
    expect(patchSalesProductionPlan(plan, { voiceoverAudioUrl: '' })).toMatchObject({ generatedVideoUrl: '/video.mp4', mixedVideoUrl: '/final.mp4', pendingVideoTask: plan.pendingVideoTask });
    expect(patchSalesProductionPlan(plan, { voiceId: 'other-library-voice' })).toMatchObject({ generatedVideoUrl: '/video.mp4', mixedVideoUrl: '/final.mp4', pendingVideoTask: plan.pendingVideoTask });
  });
  it.each([true, false])('invalidates video, final mix and recovery receipt when Context IR changes from %s', (videoContextIrEnabled) => {
    const plan = { ...completed(), videoContextIrEnabled, pendingVideoTask: {
      taskId: 'submitted', model: 'MiniMax-H3', modelSelection: 'metaso-h3', sourceKey: 'previous',
    } };
    const patch = { videoContextIrEnabled: !videoContextIrEnabled };
    const next = patchSalesProductionPlan(plan, patch);
    expect(next).toMatchObject({ ...patch, generatedVideoUrl: '', mixedVideoUrl: '', pendingVideoTask: null, voiceoverAudioUrl: '/voice.mp3' });
    expect(staleSalesProductionOutputs(plan, outputKeys('/first.jpg', plan), outputKeys('/first.jpg', { ...plan, ...patch })))
      .toEqual({ generatedVideoUrl: '', mixedVideoUrl: '', pendingVideoTask: null });
    expect(patchSalesProductionPlan(plan, { videoContextIrEnabled })).toEqual(plan);
  });

  it('treats a legacy omitted Context IR flag as enabled in output and recovery keys', () => {
    const legacy = { ...completed(), videoContextIrEnabled: undefined };
    expect(outputKeys('/first.jpg', legacy)).toEqual(outputKeys('/first.jpg', { ...legacy, videoContextIrEnabled: true }));
    expect(patchSalesProductionPlan(legacy, { videoContextIrEnabled: true })).toMatchObject({ generatedVideoUrl: '/video.mp4', mixedVideoUrl: '/final.mp4' });
  });

  it('invalidates retimed voiceover audio while retaining a reusable speech voice sample', () => {
    for (const mode of ['voiceover', 'speech'] as const) {
      const assembled = assembleSalesVideoPrompt({ script, productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null, voiceModeOverride: mode });
      const before = salesProductionOutputKeys(assembled, completed(), [], null, null, '', 'timing-15');
      const after = salesProductionOutputKeys(assembled, completed(), [], null, null, '', 'timing-10');
      expect(staleSalesProductionOutputs(completed(), before, after)).toEqual(mode === 'voiceover' ? { voiceoverAudioUrl: '', mixedVideoUrl: '' } : {});
    }
  });

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
    expect(patchSalesProductionPlan({ ...completed(), voiceModeOverride: 'voiceover' }, { voiceId: 'new-voice' })).toMatchObject({ generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '', mixedVideoUrl: '' });
  });

  it.each<Partial<SalesProductionPlanState>>([{ voiceId: 'other-speaker' }, { voiceModel: 'other-tts-model' }, { voiceModeOverride: 'voiceover' }])('discards a speech reference when its voice, synthesis model or purpose changes: %j', (patch) => {
    expect(patchSalesProductionPlan({ ...completed(), voiceModeOverride: 'speech' }, patch))
      .toMatchObject({ voiceoverAudioUrl: '', generatedVideoUrl: '', mixedVideoUrl: '' });
  });

  it('keeps an explicitly selected speech reference when applying a different script', () => {
    const plan = { ...completed(), voiceModeOverride: 'speech' as const, scriptId: 'old-script' };
    const next = patchSalesProductionPlan(plan, planForSelectedScript(plan, 'new-script'));
    expect(next).toMatchObject({ scriptId: 'new-script', voiceoverAudioUrl: '/voice.mp3', generatedVideoUrl: '', mixedVideoUrl: '' });
  });

  it('retains the visual result when a script-inherited narrator produces its postproduction audio', () => {
    const plan = completed();
    expect(plan.voiceModeOverride).toBe('');
    expect(patchSalesProductionPlan(plan, { voiceoverAudioUrl: '/new-narration.mp3' }))
      .toMatchObject({ generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '/new-narration.mp3', mixedVideoUrl: '' });
  });

  it('uses the resolved speech mode to invalidate inherited speech when its audio reference changes', () => {
    const voice = { id: 'speaker', name: '说话人', voiceId: 'speaker-code', ttsVoice: 'speaker-code', gender: 'female', tags: [], sampleAudioUrl: '', promptText: '', source: 'voice_library' };
    const plan = { ...completed(), voiceId: voice.id };
    const next = patchSalesProductionPlan(plan, { voiceoverAudioUrl: '/new-reference.mp3' });
    const keys = (current: SalesProductionPlanState) => salesProductionOutputKeys(assembleSalesVideoPrompt({ script, productName: '商品', selectedImages: [], beatBindings: [], persona: null, scene: null,
      voice, voiceAudioUrl: current.voiceoverAudioUrl }), current, [], voice, null);
    expect({ ...next, ...staleSalesProductionOutputs(next, keys(plan), keys(next)) })
      .toMatchObject({ generatedVideoUrl: '', mixedVideoUrl: '', voiceoverAudioUrl: '/new-reference.mp3' });
  });

  it('invalidates the original speech video and recovery receipt when changing the speaker or its reference audio', () => {
    const plan = { ...completed(), voiceModeOverride: 'speech' as const,
      pendingVideoTask: { taskId: 'old', model: 'seedance', modelSelection: 'seedance', sourceKey: 'old-voice' } };
    expect(patchSalesProductionPlan(plan, { voiceId: 'other-voice' }))
      .toMatchObject({ generatedVideoUrl: '', mixedVideoUrl: '', voiceoverAudioUrl: '', pendingVideoTask: null });
    expect(patchSalesProductionPlan(plan, { voiceoverAudioUrl: '/new-reference.mp3' }))
      .toMatchObject({ generatedVideoUrl: '', mixedVideoUrl: '', voiceoverAudioUrl: '/new-reference.mp3', pendingVideoTask: null });
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
    expect(patchSalesProductionPlan({ ...completed(), voiceModeOverride: 'voiceover' }, { voiceoverAudioUrl: '/new-voice.mp3' }))
      .toMatchObject({ generatedVideoUrl: '/video.mp4', voiceoverAudioUrl: '/new-voice.mp3', mixedVideoUrl: '' });
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
