import { describe, expect, it } from 'vitest';
import { resolveTemplateStyleWithJewelryGuard } from '../jewelryGuard';

describe('jewelry recipe product guard', () => {
  it('does not apply a persisted jewelry recipe to phones', () => {
    expect(resolveTemplateStyleWithJewelryGuard('珠宝首饰全品类\n保持耳饰受光', '荣耀300 手机')).toBe('auto');
    expect(resolveTemplateStyleWithJewelryGuard('珠宝首饰全品类\n保持耳饰受光', 'iPhone 香槟金手机')).toBe('auto');
  });
  it('preserves a non-jewelry custom recipe and valid jewelry guidance', () => {
    expect(resolveTemplateStyleWithJewelryGuard('自然生活持机展示', '荣耀300 手机')).toBe('自然生活持机展示');
    expect(resolveTemplateStyleWithJewelryGuard('珠宝首饰全品类', '珍珠耳饰')).toContain('本商品子品类专属强化守卫');
  });
});
