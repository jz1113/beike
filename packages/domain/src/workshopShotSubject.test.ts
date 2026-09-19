import { expect, it } from 'vitest';
import { resolveAssetShotSubject } from './workshopShotSubject';
it('uses explicit placement and hands types without imposing a portrait', () => {
  expect(resolveAssetShotSubject({ shotType: 'pure_product' })?.has_human).toBe(false);
  expect(resolveAssetShotSubject({ title: '仅手部持机特写' })?.shot_type).toBe('hand_held_only');
  expect(resolveAssetShotSubject({ action: '无人物，商品平放台面' })?.shot_type).toBe('pure_product');
  expect(resolveAssetShotSubject({ action: '低头看手机', reversePrompt: '负面约束：无人物畸形' })).toBeUndefined();
});
