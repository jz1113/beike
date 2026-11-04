import { describe, expect, it } from 'vitest';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { buildCategorySkillNavigation } from './promptLibraryNavigation';

const categories: AssetProductCategory[] = [
  { id: 'digital_3c', name: '手机通讯', parentId: null, position: 0 },
  { id: 'prompt_subcategory:digital_3c:phone', name: '手机', parentId: 'digital_3c', position: 0 },
  { id: 'archived', name: '已归档', parentId: null, position: 1, isArchived: true },
];
describe('技能类目导航', () => {
  it('直接从类目读取技能，不依赖图库是否有参考图', () => {
    const options = buildCategorySkillNavigation(categories);
    expect(options.find(option => option.id === 'phone')).toMatchObject({
      parentId: 'digital_3c', parent: '手机通讯', label: '手机', folderId: 'prompt_subcategory:digital_3c:phone',
    });
    expect(options.some(option => option.parentId === 'archived')).toBe(false);
    expect(buildCategorySkillNavigation([])).toEqual([]);
  });
});
