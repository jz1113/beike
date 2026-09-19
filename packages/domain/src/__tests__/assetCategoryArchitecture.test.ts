import { expect, it } from 'vitest';
import { resolveCategoryArchitecture, categoryArchitectureGuidance } from '../assetCategoryArchitecture';
import { filterBatchAssetOptions } from '../workshopAssetSelection';
import { buildPerImageReversePrompt } from '../assetDeconstruct/prompts';
const categories = [
  { id: 'uuid-phone', name: '手机通讯', parentId: null, position: 0 },
  { id: 'uuid-leaf', name: '旗舰款', parentId: 'uuid-phone', position: 0 },
  { id: 'uuid-jewel', name: '珠宝首饰', parentId: null, position: 1 },
];
it('matches names and inherits ancestors without requiring fixed category IDs', () => {
  expect(resolveCategoryArchitecture(categories, 'uuid-phone')).toBe('digital_3c');
  expect(resolveCategoryArchitecture(categories, 'uuid-leaf')).toBe('digital_3c');
  expect(resolveCategoryArchitecture(categories, 'uuid-jewel')).toBe('jewelry');
  expect(resolveCategoryArchitecture(categories, 'missing')).toBe('universal');
  expect(resolveCategoryArchitecture([{ id: 'loop', name: '未知', parentId: 'loop', position: 0 }], 'loop')).toBe('universal');
});
it('keeps mixed-batch manual choices compatible with every product while including universal assets', () => {
  const assets = [
    { id: 'phone', productCategoryIds: '["uuid-phone"]' },
    { id: 'jewel', productCategoryIds: '["uuid-jewel"]' },
    { id: 'both', productCategoryIds: '["uuid-phone","uuid-jewel"]' },
    { id: 'common', isUniversal: true },
    { id: 'reference', isUniversal: true, provenance: 'reference_import' },
  ];
  expect(filterBatchAssetOptions(assets, categories, [{ title: '手机' }]).map(a => a.id)).toEqual(['phone', 'both', 'common']);
  expect(filterBatchAssetOptions(assets, categories, [{ title: '手机' }, { title: '银手镯' }]).map(a => a.id)).toEqual(['both', 'common']);
  expect(filterBatchAssetOptions(assets, categories, []).map(a => a.id)).toEqual(['common']);
});
it('retains category architecture and custom dictionary during a single-image retry', () => {
  const prompt = buildPerImageReversePrompt({ imageIndex: 2, totalImages: 3, targetCategory: 'digital_3c',
    customSubCategories: [{ id: 'custom-screen', parentId: 'digital_3c', label: '屏幕细节', shortLabel: '屏幕', keywords: ['壁纸'] }] });
  expect(prompt).toContain(categoryArchitectureGuidance('digital_3c'));
  expect(prompt).toContain('custom-screen');
  expect(prompt).toContain('image_index=2');
});
it('does not let a stale hint override an explicit category architecture', () => {
  const prompt = buildPerImageReversePrompt({ imageIndex: 1, totalImages: 1, targetCategory: 'digital_3c', userHint: '参考以前首饰项目的光线' });
  expect(prompt).toContain('手机数码商拍细分规范');
  expect(prompt).not.toContain('珠宝首饰商拍二级细分类目规范');
});
