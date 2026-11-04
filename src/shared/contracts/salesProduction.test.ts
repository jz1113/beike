import { describe, expect, it } from 'vitest';
import { salesPlanAdaptBodySchema, salesPlanAdaptResponseSchema } from './salesProduction';

describe('sales adaptation response performance', () => {
  it('preserves image-bound visual observations through response decoding and rejects empty analysis', () => {
    const personaVisualProfile = { imageUrl: '/main.jpg', presence: 'full_presenter', temperament: '眉眼舒展，清爽',
      gaze: '目光聚焦镜头', expression: '嘴角轻提', posture: '肩线自然', limitations: '静态照片' };
    const result = { success: true, beats: [{ index: 0, action: '举手' }], personaVisualProfile };
    expect(salesPlanAdaptResponseSchema.parse(result).personaVisualProfile).toEqual(personaVisualProfile);
    expect(salesPlanAdaptResponseSchema.safeParse({ ...result, personaVisualProfile: { ...personaVisualProfile,
      temperament: '', gaze: '', expression: '', posture: '' } }).success).toBe(false);
  });
  it('retains independent expression and continuity through response decoding', () => {
    const beat = { index: 0, subject: '人物', action: '举手', expression: '举臂时抬眼浅笑', transition: '保持末姿势', spokenLine: '', subtitle: '' };
    expect(salesPlanAdaptResponseSchema.parse({ success: true, beats: [beat] }).beats).toEqual([beat]);
  });

  it('keeps legacy missing performance distinguishable from explicitly cleared fields', () => {
    const beat = { index: 0, subject: '', action: '保留旧动作', spokenLine: '', subtitle: '' };
    const legacy = salesPlanAdaptResponseSchema.parse({ success: true, beats: [beat] }).beats[0];
    expect(legacy.expression).toBeUndefined();
    expect(legacy.transition).toBeUndefined();
    expect(salesPlanAdaptResponseSchema.parse({ success: true, beats: [{ ...beat, expression: '', transition: '' }] }).beats[0])
      .toMatchObject({ expression: '', transition: '' });
  });
});

describe('sales adaptation exclusion types', () => {
  const input = { productName: '开衫', model: 'text-model', beats: [{ index: 0, shotIndex: 0, start: 0, end: 3, purpose: 'showcase', shotSize: '中景', camera: '固定', refAction: '展示商品', requiredView: 'front', assignedView: 'front', imageLabel: '主图', buyingPoint: '' }] };

  it('retains typed non-product exclusions and legacy strings in the same request', () => {
    const sourceExclusions = [{ term: '暮色背景', type: 'scene' }, { term: '原片人物', type: 'person_appearance' }, { term: '原款外套', type: 'product' }, '旧版商品词', ''];
    expect(salesPlanAdaptBodySchema.parse({ ...input, sourceExclusions }).sourceExclusions).toEqual(sourceExclusions);
  });

  it.each([{ term: '原人物' }, { term: '原人物', type: '' }, { term: '', type: 'scene' }, { term: '原人物', type: 1 }])('rejects an exclusion whose type cannot be preserved: %j', (exclusion) => {
    expect(salesPlanAdaptBodySchema.safeParse({ ...input, sourceExclusions: [exclusion] }).success).toBe(false);
  });
});
