import { describe, expect, it } from 'vitest';
import { matchPromptFolderRules } from './promptFolderRuleMatch';
import type { AssetProductCategory } from './assetOrganization';

const categories: AssetProductCategory[] = [
  { id: 'digital_3c', name: '手机通讯', parentId: null, position: 0 },
  { id: 'camera_deco', name: '镜头模组', parentId: 'digital_3c', keywords: '["手机","折叠屏"]', position: 0 },
  { id: 'prompt_subcategory:digital_3c:phone', name: '手机', parentId: 'digital_3c', keywords: '["手机"]', position: 1 },
  { id: 'prompt_subcategory:digital_3c:case', name: '手机壳', parentId: 'digital_3c', keywords: '["手机壳"]', position: 2 },
];
describe('reference folder rules', () => {
  it('ignores legacy action categories and promotional gifts', () => {
    expect(matchPromptFolderRules(categories, '华为nova15pro 手机（晒单送手机壳）', { 赠品: '手机壳' })?.folder.id).toBe('prompt_subcategory:digital_3c:phone');
    expect(matchPromptFolderRules(categories, 'iPhone 手机壳')?.folder.id).toBe('prompt_subcategory:digital_3c:case');
  });
  it('does not match archived children or children without visible roots', () => {
    expect(matchPromptFolderRules(categories.slice(1), '手机')).toBeNull();
    expect(matchPromptFolderRules(categories.map(row => row.parentId?.includes('digital') ? { ...row, isArchived: true } : row), '手机')).toBeNull();
  });
});
