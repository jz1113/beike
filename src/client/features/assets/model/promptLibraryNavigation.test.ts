import { describe, expect, it } from 'vitest';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { buildPromptLibraryNavigation, filterPromptLibraryNavigation, populatedPromptLibraryNavigation } from './promptLibraryNavigation';

const categories: AssetProductCategory[] = [
  { id: 'digital_3c', name: '手机通讯', parentId: null, position: 0 },
  { id: 'prompt_subcategory:digital_3c:phone', name: '手机', parentId: 'digital_3c', position: 0 },
  { id: 'archived', name: '旧分类', parentId: null, position: 1, isArchived: true },
];
const albums: PromptAlbum[] = [{ id: 'legacy', name: '旧图集', productCategoryId: 'digital_3c' }];
const items: AssetLibrarySlim[] = [
  { id: 'a', title: '白色 Phone', displayNumber: 17, productCategoryIds: '["digital_3c"]', productSubcategory: 'phone', tags: '极简', usageCount: 2 },
  { id: 'b', title: '耳机特写', displayNumber: 2, albumId: 'legacy', productSubcategory: 'earphone' },
  { id: 'c', displayNumber: 21, productCategoryIds: '[]', albumId: 'legacy' },
  { id: 'd', isUniversal: true },
];

describe('prompt library direct category navigation', () => {
  it('hides empty browse folders while preserving a selected empty folder and subcategory', () => {
    const folders = [
      { id: 'empty', name: '空分类', count: 0, isVirtual: undefined, children: [{ id: 'empty-child', name: '空细分', count: 0 }] },
      { id: 'populated', name: '有素材', count: 1, isVirtual: undefined, children: [{ id: 'used', name: '有内容', count: 1 }, { id: 'unused', name: '无内容', count: 0 }] },
    ];
    expect(populatedPromptLibraryNavigation(folders, 'all', 'all')).toEqual([{ ...folders[1], children: [folders[1].children[0]] }]);
    expect(populatedPromptLibraryNavigation(folders, 'empty', 'empty-child')[0]).toEqual(folders[0]);
    expect(populatedPromptLibraryNavigation(folders, 'populated', 'unused')[0].children).toEqual(folders[1].children);
    expect(folders[1].children).toHaveLength(2);
  });

  it('makes subcategories available from the root with correct inherited and explicit counts', () => {
    const folders = buildPromptLibraryNavigation(items, categories, albums);
    expect(folders.map(folder => folder.id)).toEqual(['digital_3c', 'universal', 'unclassified']);
    expect(folders[0]).toMatchObject({ name: '手机通讯', count: 2 });
    expect(folders[0].children.find(child => child.id === 'phone')).toEqual({ id: 'phone', name: '手机', count: 1 });
    expect(folders[0].children.find(child => child.id === 'earphone')?.count).toBe(1);
    expect(folders.find(folder => folder.id === 'unclassified')?.count).toBe(1);
  });

  it('finds child categories while preserving their parent and original counts', () => {
    const folders = buildPromptLibraryNavigation(items, categories, albums);
    expect(filterPromptLibraryNavigation(folders, '手机通讯')).toEqual([folders[0]]);
    const originalChildren = [...folders[0].children];
    const result = filterPromptLibraryNavigation(folders, '耳机');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'digital_3c', count: 2 });
    expect(result[0].children).toEqual([{ id: 'earphone', name: '耳机', count: 1 }]);
    expect(filterPromptLibraryNavigation(folders, '不存在')).toEqual([]);
    expect(filterPromptLibraryNavigation(folders, '  ')).toBe(folders);
    expect(folders[0].children).toEqual(originalChildren);
  });

  it('matches category names without case sensitivity', () => {
    const folders = [{ id: 'digital', name: 'Digital', count: 5, isVirtual: undefined, children: [{ id: 'phone', name: 'Phone', count: 3 }] }];
    expect(filterPromptLibraryNavigation(folders, ' PHONE ')[0].children).toEqual(folders[0].children);
    expect(filterPromptLibraryNavigation(folders, 'DIGITAL')).toEqual(folders);
  });
});
