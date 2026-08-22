import { describe, expect, it } from 'vitest';
import {
  applyWorkshopModeSession,
  createDefaultWorkshopSession,
  extractWorkshopModeSession,
} from './workshopSession';

describe('workshopSession', () => {
  it('extract and apply round-trip preserves session fields', () => {
    const base = createDefaultWorkshopSession('social_face_product_swap');
    const session = {
      ...base,
      currentStep: 3,
      product: { title: '测试商品', picUrl: 'https://example.com/a.jpg' },
      images: [{ url: 'https://example.com/a.jpg', type: 'main' as const, selected: true }],
      clonedSocialImages: [{ url: 'https://example.com/ref.jpg', selected: true }],
      generatedPrompts: [{ shot_no: 1, title: '镜1', prompt: 'test prompt', selected: true }],
      generationTasks: [{ id: 'shot-0', shotNo: 1, title: '镜1', prompt: 'test', status: 'SUCCESS' as const, progress: '100%', createdAt: 1 }],
      modelPersona: '独立人设',
    };

    const flat = {
      ...createDefaultWorkshopSession('storyboard_generate'),
      ...applyWorkshopModeSession(session),
    };

    const extracted = extractWorkshopModeSession(flat);
    expect(extracted.currentStep).toBe(3);
    expect(extracted.product?.title).toBe('测试商品');
    expect(extracted.clonedSocialImages).toHaveLength(1);
    expect(extracted.generatedPrompts).toHaveLength(1);
    expect(extracted.generationTasks[0]?.status).toBe('SUCCESS');
    expect(extracted.modelPersona).toBe('独立人设');
  });

  it('default sessions for social and original are independent', () => {
    const social = createDefaultWorkshopSession('social_face_product_swap');
    const original = createDefaultWorkshopSession('storyboard_generate');
    expect(social.sceneAnchorEnabled).toBe(true);
    expect(original.sceneAnchorEnabled).toBe(true);
    expect(social.clonedSocialImages).toEqual([]);
    expect(original.clonedSocialImages).toEqual([]);
  });
});
