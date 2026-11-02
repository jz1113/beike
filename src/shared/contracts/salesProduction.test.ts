import { describe, expect, it } from 'vitest';
import { salesPlanAdaptResponseSchema } from './salesProduction';

describe('sales adaptation response performance', () => {
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
