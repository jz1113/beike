import { describe, expect, it } from 'vitest';
import { isWorkshopAssetApplicable, resolveWorkshopCategoryScope } from './workshopAssetSelection';
import { inferProductCategoryAndAnatomy } from './productCategory';

const categories = [
  { id: 'jewelry', name: '珠宝首饰', parentId: null, position: 0 },
  { id: 'earrings', name: '耳饰', parentId: 'jewelry', position: 0 },
  { id: 'necklaces', name: '项链', parentId: 'jewelry', position: 1 },
  { id: 'phone', name: '手机通讯', parentId: null, position: 1 },
];

describe('workshop product scope', () => {
  it.each(['荣耀300 5G全网通智能手机', '小米红米Note15 Pro 子夜黑', 'vivo iQOO Z11S', 'iPhone 17 香槟金手机'])(
    'recognizes the sold phone: %s', title => {
      expect(inferProductCategoryAndAnatomy(title).primaryCategory).toBe('digital');
      expect(resolveWorkshopCategoryScope(categories, title)).toEqual(['phone']);
    });
  it('includes parent applicability without taking unrelated siblings when a subcategory matches', () => {
    expect(resolveWorkshopCategoryScope(categories, '珍珠耳饰')).toEqual(['earrings', 'jewelry']);
    expect(resolveWorkshopCategoryScope(categories, '珍珠耳饰', { 商品品类: '珠宝首饰' })).toEqual(['earrings', 'jewelry']);
  });
  it('keeps old style/anatomy fields independent and never treats unclassified as universal', () => {
    const scope = resolveWorkshopCategoryScope(categories, '荣耀300 手机');
    expect(isWorkshopAssetApplicable({ id: 'phone', productCategoryIds: '["phone"]' }, scope)).toBe(true);
    expect(isWorkshopAssetApplicable({ id: 'jewel', productCategoryIds: '["jewelry"]' }, scope)).toBe(false);
    expect(isWorkshopAssetApplicable({ id: 'unknown', productCategoryIds: '[]', isUniversal: false }, scope)).toBe(false);
    expect(isWorkshopAssetApplicable({ id: 'universal', productCategoryIds: '[]', isUniversal: true }, scope)).toBe(true);
    expect(isWorkshopAssetApplicable({ id: 'legacy', productCategoryIds: undefined }, scope)).toBe(false);
  });
});
