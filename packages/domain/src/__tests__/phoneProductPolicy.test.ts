import { describe, expect, it } from 'vitest';
import { enforcePhoneGenerationPolicy, isPhoneProduct, isActionAllowedForProduct, PHONE_GENERATION_POLICY } from '../phoneProductPolicy';
import { buildUnifiedDeconstructPrompt, buildPerImageReversePrompt } from '../assetDeconstruct/prompts';
import { buildVisionSystemPrompt, buildReplicationOptimizeSystemPrompt } from '../vision';

describe('phone product boundaries', () => {
  it.each(['iPhone 17 Pro', '荣耀300 手机', 'vivo X300', 'iQOO Z11S', 'OPPO Reno15', '华为 Mate80', '三星 S26'])('recognizes devices: %s', title => expect(isPhoneProduct(title)).toBe(true));
  it.each(['iPhone17 手机壳', '手机挂绳', '三星屏幕膜', '银手镯', '保温杯'])('does not apply device rules to %s', title => expect(enforcePhoneGenerationPolicy('原始提示词', title)).toBe('原始提示词'));
  it('applies one guard to phone prompts while preserving requested framing', () => {
    const prompt = enforcePhoneGenerationPolicy('四宫格，不同俯视角度', '手机');
    expect(prompt).toContain('四宫格，不同俯视角度');
    expect(prompt).toContain('每格各一台');
    expect(enforcePhoneGenerationPolicy(prompt, '手机')).toBe(prompt);
  });
  it('excludes packaging actions only for devices', () => {
    expect(isActionAllowedForProduct('手机', { title: '斜置包装俯视机位' })).toBe(false);
    expect(isActionAllowedForProduct('手机', { title: '背板特写，无包装盒' })).toBe(true);
    expect(isActionAllowedForProduct('珠宝礼盒', { title: '开箱' })).toBe(true);
  });
  it('covers both reverse paths even when a custom category dictionary is provided', () => {
    const unified = buildUnifiedDeconstructPrompt({ imageCount: 3, targetCategory: 'digital_3c', customSubCategories: [] });
    const retry = buildPerImageReversePrompt({ imageIndex: 2, totalImages: 3 });
    for (const text of [unified, retry]) {
      expect(text).toContain('连接方式无法确认');
      expect(text).toContain('正反面组合展示');
      expect(text).toContain('reverse_prompt 母本如实记录');
    }
  });
  it('adds the same device constraints to original and replication planning', () => {
    const original = buildVisionSystemPrompt({ productTitle: '手机', shotCount: 4 });
    const replica = buildReplicationOptimizeSystemPrompt({ productTitle: '手机', referenceImageCount: 1, modelPersona: 'none', reverseShots: [{ shot_no: 1, reverse_prompt: '盒装手机' }] });
    expect(original).toContain(PHONE_GENERATION_POLICY);
    expect(replica).toContain(PHONE_GENERATION_POLICY);
    expect(buildVisionSystemPrompt({ productTitle: '手镯' })).not.toContain(PHONE_GENERATION_POLICY);
  });
});
