import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, normalizeScriptTemplate, type SalesReferenceSlot } from '@shared/domain/sales';
import { emptySalesProductionPlan, parseSalesProductionPlan } from './salesProductionDraft';
import { resolveSalesVideoSettings } from './salesVideoSettings';

const script = normalizeScriptTemplate({ format: 'product', durationSec: 13.8, shots: [{ beats: [{ start: 0, end: 13.8, action: '展示商品' }] }] })!;
const longScript = normalizeScriptTemplate({ format: 'product', durationSec: 16.4, shots: [{ beats: [{ start: 0, end: 16.4, action: '展示商品' }] }] })!;
const references: SalesReferenceSlot[] = [
  { slotIndex: 1, mixedToken: '{{Mixed 1}}', apiToken: '图片1', kind: 'product', label: '当前商品', url: '/product.jpg' },
];

describe('sales video parameter constraints', () => {
  it('validates Grok preset speech and restricts reference generation to at most 720P', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'grok-imagine-video-1.5', videoVoiceId: 'eve', voiceModeOverride: 'speech' as const };
    expect(resolveSalesVideoSettings(plan, script, references)).toMatchObject({ resolution: '720P', supportedResolutions: ['480P', '720P'], validationError: '' });
    expect(resolveSalesVideoSettings(plan, script, references, ['/saved.mp3']).validationError).toContain('不能与音频文件混用');
    expect(resolveSalesVideoSettings({ ...plan, videoRefMode: 'first_frame', videoResolution: '1080P' }, script, references).supportedResolutions).toEqual(['480P', '720P']);
  });
  it('defaults new Seedance speech requests to 720P while retaining an explicitly selected supported resolution', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini', voiceModeOverride: 'speech' as const };
    const audio = ['/storage/local/selected-voice.mp3'];
    expect(resolveSalesVideoSettings(plan, script, references, audio)).toMatchObject({ resolution: '720P', validationError: '' });
    expect(resolveSalesVideoSettings({ ...plan, videoResolution: '480P' }, script, references, audio))
      .toMatchObject({ resolution: '480P', validationError: '' });
  });

  it('validates and preserves actual voice-reference audio with the visual inputs', () => {
    const plan = { ...emptySalesProductionPlan(), voiceModeOverride: 'speech' as const };
    const audio = ['/storage/local/selected-voice.mp3'];
    const result = resolveSalesVideoSettings(plan, script, references, audio);
    expect(result).toMatchObject({ audios: audio, images: ['/product.jpg'], validationError: '' });
    expect(resolveSalesVideoSettings({ ...plan, videoRefMode: 'first_frame' }, script, references, audio).validationError).toContain('全能参考');
    const short = { ...script, durationSec: 5 };
    expect(resolveSalesVideoSettings({ ...plan, videoModel: 'veo3.1' }, short, references, audio).validationError).toContain('参考音频');
    expect(audio).toEqual(['/storage/local/selected-voice.mp3']);
  });

  it.each(['viduq4-preview', 'vidu-q4-preview', 'viduq4', 'MiniMax-H3'])('allows %s sales speech with the selected voice sample', (videoModel) => {
    const plan = { ...emptySalesProductionPlan(), videoModel, voiceModeOverride: 'speech' as const };
    const audios = ['/storage/local/selected-voice.mp3'];
    expect(resolveSalesVideoSettings(plan, script, references, audios))
      .toMatchObject({ model: videoModel, refMode: 'omni', images: ['/product.jpg'], audios, durationSec: 14, validationError: '' });
    expect(resolveSalesVideoSettings({ ...plan, videoRefMode: 'first_frame' }, script, references, audios).validationError).toContain('全能参考');
  });

  it('migrates old plans and retains selected mode, ratio, resolution and duration across saves', () => {
    expect(parseSalesProductionPlan({})).toMatchObject({ videoRefMode: '', videoDurationSec: 0 });
    const plan = { ...emptySalesProductionPlan(), videoRefMode: 'first_frame', videoAspectRatio: '16:9', videoResolution: '1080P', videoDurationSec: 15 };
    expect(parseSalesProductionPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(parseSalesProductionPlan({ videoDurationSec: NaN, videoRefMode: 'invalid' })).toMatchObject({ videoDurationSec: 0, videoRefMode: '' });
  });

  it('defaults to a supported duration that covers the complete script', () => {
    const result = resolveSalesVideoSettings(emptySalesProductionPlan(), script, references);
    expect(result).toMatchObject({ durationSec: 14, refMode: 'omni', aspectRatio: '9:16', validationError: '' });
    expect(result.supportedDurations.every((duration) => duration >= 14)).toBe(true);
  });

  it('explains why a 16.4-second script cannot run on Mini without shortening the script', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini' };
    const result = resolveSalesVideoSettings(plan, longScript, references);
    expect(result).toMatchObject({ durationSec: 17, supportedDurations: [], images: ['/product.jpg'] });
    expect(result.durationError).toContain('脚本时长 16.4 秒');
    expect(result.durationError).toContain('至少需要 17 秒');
    expect(result.durationError).toContain('Seedance 2.0 mini 在 720P、全能参考 下最长支持 15 秒');
    expect(result.durationError).toContain('切换支持至少 17 秒的模型，或选择更短的参考脚本');
    expect(result.validationError).toBe(result.durationError);
    expect(resolveSalesVideoSettings({ ...plan, videoDurationSec: 17 }, longScript, references).validationError).toBe(result.durationError);
    expect(longScript.durationSec).toBe(16.4);
  });

  it('uses 17 seconds when switching to a model that can cover the complete script', () => {
    const result = resolveSalesVideoSettings({ ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.5' }, longScript, references);
    expect(result).toMatchObject({ model: 'doubao-seedance-2.5', durationSec: 17, durationError: '', validationError: '' });
    expect(result.supportedDurations).toContain(17);
  });

  it('enforces the Mini limit at the fractional script-duration boundary', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini' };
    expect(resolveSalesVideoSettings(plan, { ...longScript, durationSec: 15 }, references))
      .toMatchObject({ durationSec: 15, supportedDurations: [15], durationError: '', validationError: '' });
    const result = resolveSalesVideoSettings(plan, { ...longScript, durationSec: 15.1 }, references);
    expect(result).toMatchObject({ durationSec: 16, supportedDurations: [] });
    expect(result.durationError).toContain('至少需要 16 秒');
    expect(result.durationError).toContain('最长支持 15 秒');
  });

  it('rejects a saved duration outside the model capability even if the script fits', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini', videoDurationSec: 17 };
    const result = resolveSalesVideoSettings(plan, script, references);
    expect(result).toMatchObject({ durationSec: 17, supportedDurations: [14, 15], durationError: '' });
    expect(result.validationError).toContain('不支持所选时长');
  });

  it('keeps missing-reference errors ahead of an independent duration conflict', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini', sceneId: 'chosen-room' };
    const presenter = normalizeScriptTemplate({ ...longScript, format: 'presenter', assetSlots: { persona: { required: true, presence: 'silent_model' } } })!;
    const result = resolveSalesVideoSettings(plan, presenter, references);
    expect(result.durationError).toContain('最长支持 15 秒');
    expect(result.validationError).toContain('先选择出镜人物');
    expect(resolveSalesVideoSettings(plan, longScript, references).validationError).toContain('所选场景的参考图不可用');
    expect(resolveSalesVideoSettings({ ...plan, sceneId: '', imitationMode: 'depth_imitation', scriptVideoReference: 'depth' }, longScript, references).validationError)
      .toContain('关联深度视频尚未就绪');
  });

  it('blocks a model that cannot fit the script or accept every reviewed reference', () => {
    const plan = emptySalesProductionPlan();
    expect(resolveSalesVideoSettings({ ...plan, videoModel: 'veo3.1' }, script, references).validationError).toContain('时长');
    expect(resolveSalesVideoSettings({ ...plan, videoDurationSec: 5 }, script, references).validationError).toContain('至少 14 秒');
    const allReferences = [...references, { ...references[0], slotIndex: 2, kind: 'action' as const, mediaType: 'video' as const, url: '/depth.mp4' }];
    const result = resolveSalesVideoSettings({ ...plan, videoRefMode: 'first_frame' }, script, allReferences);
    expect(result.validationError).toContain('首帧');
    expect(result.images).toEqual(['/product.jpg']);
    expect(result.videos).toEqual(['/depth.mp4']);
  });

  it.each(['edit', 'extend', 'first_frame'])('rejects %s before a linked depth video could be used as an editable source or a frame input', (videoRefMode) => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.5', videoRefMode,
      imitationMode: 'depth_imitation' as const, scriptVideoReference: 'depth' as const };
    const depth: SalesReferenceSlot = { slotIndex: 2, mixedToken: '{{Mixed 2}}', apiToken: '视频1',
      kind: 'action', mediaType: 'video', label: '深度动作', url: '/depth.mp4' };
    const materials = [...references, depth];
    const result = resolveSalesVideoSettings(plan, script, materials);
    expect(result.validationError).toContain('深度动作模仿仅支持全能参考');
    expect(result.videos).toEqual(['/depth.mp4']);
    expect(resolveSalesVideoSettings({ ...plan, videoRefMode: 'omni' }, script, materials).validationError).toBe('');
  });

  it('uses explicit output preferences and locks ratios only when the model requires it', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.5', videoAspectRatio: '16:9', videoResolution: '1080P', videoDurationSec: 15 };
    expect(resolveSalesVideoSettings(plan, script, references)).toMatchObject({ aspectRatio: '16:9', resolution: '1080P', durationSec: 15 });
    expect(resolveSalesVideoSettings({ ...plan, videoRefMode: 'first_frame' }, script, references).aspectRatio).toBe('adaptive');
  });

  it('requires the chosen scene image instead of submitting only the product references', () => {
    const plan = { ...emptySalesProductionPlan(), sceneId: 'chosen-room' };
    expect(resolveSalesVideoSettings(plan, script, references).validationError).toContain('所选场景的参考图不可用');
    const room: SalesReferenceSlot = { slotIndex: 2, mixedToken: '{{Mixed 2}}', apiToken: '图片2', kind: 'scene', label: '所选客厅', url: '/chosen-room.jpg' };
    expect(resolveSalesVideoSettings(plan, script, [...references, room]).validationError).toBe('');
    expect(resolveSalesVideoSettings({ ...plan, sceneId: '', customSceneImageUrl: '/upload.jpg' }, script, references).validationError).toContain('场景');
  });

  it('keeps a deduplicated image valid when it is explicitly bound as both product and scene', () => {
    const plan = { ...emptySalesProductionPlan(), customSceneImageUrl: '/product-in-room.jpg' };
    const assembled = assembleSalesVideoPrompt({ finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}', script, productName: '商品', selectedImages: [{ index: 0, url: plan.customSceneImageUrl, role: 'main' }],
      beatBindings: [], persona: null, scene: null, customSceneImageUrl: plan.customSceneImageUrl });
    expect(assembled.references).toHaveLength(1);
    expect(assembled.references[0]).toMatchObject({ kind: 'product', roles: ['product', 'scene'] });
    expect(assembled.enginePrompt).toContain('当前场景参考：@图片1');
    expect(resolveSalesVideoSettings(plan, script, assembled.references)).toMatchObject({ images: ['/product-in-room.jpg'], validationError: '' });
  });

  it('requires an actual identity image for presenter scripts even when products and action videos are present', () => {
    const presenter = normalizeScriptTemplate({ ...script, format: 'presenter', assetSlots: { persona: { required: true, presence: 'silent_model' } } })!;
    const plan = emptySalesProductionPlan();
    const materials: SalesReferenceSlot[] = [...references, {
      slotIndex: 2, mixedToken: '{{Mixed 2}}', apiToken: '视频1', kind: 'action', mediaType: 'video', label: '动作', url: '/action.mp4',
    }];
    expect(resolveSalesVideoSettings(plan, presenter, materials).validationError).toContain('先选择出镜人物');
    const face: SalesReferenceSlot = { slotIndex: 3, mixedToken: '{{Mixed 3}}', apiToken: '图片2', kind: 'persona_face', label: '人脸', url: '/face.jpg' };
    expect(resolveSalesVideoSettings(plan, presenter, [...materials, face]).validationError).toBe('');
    expect(resolveSalesVideoSettings(plan, presenter, [...materials, { ...face, kind: 'persona_body' }]).validationError).toBe('');
    expect(resolveSalesVideoSettings(plan, presenter, [...materials, { ...face, kind: 'persona_identity' }]).validationError).toBe('');
    expect(resolveSalesVideoSettings(plan, presenter, [...materials, { ...face, url: '  ' }]).validationError).toContain('人物参考');
    expect(resolveSalesVideoSettings(plan, script, references).validationError).toBe('');
  });
});
