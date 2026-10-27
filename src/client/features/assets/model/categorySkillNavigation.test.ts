import { describe, expect, it } from 'vitest';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { buildCategorySkillNavigation } from './promptLibraryNavigation';

const categories: AssetProductCategory[] = [
  { id: 'digital_3c', name: '手机通讯', parentId: null, position: 0 },
  { id: 'prompt_subcategory:digital_3c:phone', name: '手机', parentId: 'digital_3c', position: 0 },
  { id: 'archived', name: '已归档', parentId: null, position: 1, isArchived: true },
];
const albums: PromptAlbum[] = [{ id: 'legacy', name: '旧图集', productCategoryId: 'digital_3c' }];

describe('技能类目与参考图库的对应关系', () => {
  it('以归档规则统计参考数量，兼容旧图集并尊重显式待分类', () => {
    const result = buildCategorySkillNavigation([
      { id: 'assigned', productCategoryIds: '["digital_3c"]', productSubcategory: 'phone' },
      { id: 'legacy', albumId: 'legacy', productSubcategory: 'phone' },
      { id: 'unclassified', productCategoryIds: '[]', albumId: 'legacy', productSubcategory: 'phone' },
      { id: 'other', productCategoryIds: '["archived"]', productSubcategory: 'phone' },
    ], categories, albums);
    expect(result.find(option => option.id === 'phone')).toMatchObject({
      parentId: 'digital_3c', parent: '手机通讯', label: '手机', count: 2,
    });
    expect(result.some(option => option.parentId === 'archived')).toBe(false);
  });

  it('空类目仍能进入技能管理，且导航能回到原细分类目', () => {
    const result = buildCategorySkillNavigation([], categories, albums);
    expect(result.find(option => option.id === 'phone')).toMatchObject({
      parentId: 'digital_3c', folderId: 'prompt_subcategory:digital_3c:phone', count: 0,
    });
    expect(buildCategorySkillNavigation([], [], [])).toEqual([]);
  });
});
