import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, bindBeatProductImages, normalizeScriptTemplate } from '@shared/domain/sales';
import { salesReferenceReviewKey } from './salesReferenceReview';

describe('sales reference confirmation', () => {
  const script = normalizeScriptTemplate({ title: '商品展示', durationSec: 8,
    shots: [{ start: 0, end: 8, beats: [{ start: 0, end: 4, requiredView: 'front' }, { start: 4, end: 8, requiredView: 'back' }] }],
  })!;
  const images = [{ index: 0, url: '/front.jpg', role: 'main' as const, view: 'front' as const }, { index: 1, url: '/back.jpg', role: 'main' as const, view: 'back' as const }];
  const bindings = bindBeatProductImages(script, images);
  const assembled = assembleSalesVideoPrompt({ script, productName: '开衫', selectedImages: images, beatBindings: bindings, persona: null, scene: null });
  const key = salesReferenceReviewKey(assembled, bindings, 'script-1');

  it('invalidates confirmation for replacement assets, changed uses, warnings and scripts', () => {
    expect(salesReferenceReviewKey({ ...assembled, references: assembled.references.map((slot) => ({ ...slot, url: '/replacement.jpg' })) }, bindings, 'script-1')).not.toBe(key);
    expect(salesReferenceReviewKey(assembled, bindings.map((binding) => ({ ...binding, image: images[1] })), 'script-1')).not.toBe(key);
    expect(salesReferenceReviewKey({ ...assembled, warnings: ['缺少人物参考'] }, bindings, 'script-1')).not.toBe(key);
    expect(salesReferenceReviewKey({ ...assembled, audios: ['/new-voice.mp3'] }, bindings, 'script-1')).not.toBe(key);
    expect(salesReferenceReviewKey({ ...assembled, voiceIds: ['eve'] }, bindings, 'script-1')).not.toBe(key);
    expect(salesReferenceReviewKey({ ...assembled, voiceIds: ['eve'] }, bindings, 'script-1'))
      .not.toBe(salesReferenceReviewKey({ ...assembled, voiceIds: ['leo'] }, bindings, 'script-1'));
    expect(salesReferenceReviewKey(assembled, bindings, 'script-2')).not.toBe(key);
  });

  it('preserves confirmation when only generated copy changes', () => {
    expect(salesReferenceReviewKey({ ...assembled, enginePrompt: '新画面文案' }, bindings, 'script-1')).toBe(key);
  });
});
