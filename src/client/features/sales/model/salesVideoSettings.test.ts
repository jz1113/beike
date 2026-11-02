import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, normalizeScriptTemplate, type SalesReferenceSlot } from '@shared/domain/sales';
import { emptySalesProductionPlan, parseSalesProductionPlan } from './salesProductionDraft';
import { resolveSalesVideoSettings } from './salesVideoSettings';

const script = normalizeScriptTemplate({ format: 'product', durationSec: 13.8, shots: [{ beats: [{ start: 0, end: 13.8, action: '展示商品' }] }] })!;
const references: SalesReferenceSlot[] = [
  { slotIndex: 1, mixedToken: '{{Mixed 1}}', apiToken: '图片1', kind: 'product', label: '当前商品', url: '/product.jpg' },
];

describe('sales video parameter constraints', () => {
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

  it('uses explicit output preferences and locks ratios only when the model requires it', () => {
    const plan = { ...emptySalesProductionPlan(), videoAspectRatio: '16:9', videoResolution: '1080P', videoDurationSec: 15 };
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
    const assembled = assembleSalesVideoPrompt({ script, productName: '商品', selectedImages: [{ index: 0, url: plan.customSceneImageUrl, role: 'main' }],
      beatBindings: [], persona: null, scene: null, customSceneImageUrl: plan.customSceneImageUrl });
    expect(assembled.references).toHaveLength(1);
    expect(assembled.references[0]).toMatchObject({ kind: 'product', roles: ['product', 'scene'] });
    expect(assembled.enginePrompt).toContain('场景参考 图片1');
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
