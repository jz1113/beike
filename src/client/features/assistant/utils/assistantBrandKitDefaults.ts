import type { BrandKitProfile } from '@shared/domain/products/brandKitModels';

/** Defaults for a new editable assistant brand profile. */
export function createAssistantBrandKit(existingCount: number): BrandKitProfile {
  return {
      id: `brand-custom-${Date.now()}`,
      name: '新品牌资产 ' + (existingCount + 1),
      badge: '自定义',
      brandTone: '现代极简，高级质感，自然柔和漫反射',
      colors: { primary: '#1E293B', primaryName: '深灰', secondary: '#F1F5F9', secondaryName: '纯白' },
      modelDna: {
        gender: 'female',
        ageGroup: '25岁东亚职场女性',
        ethnicity: '自然东亚面孔',
        hairStyle: '黑色锁骨齐肩发',
        makeupAndOutfit: '清爽通透淡妆，极简白色衬衫'
      },
      preferredScenes: ['原木风采光书房', '极简商业影棚'],
      negativeRules: ['严禁塑料反光', '严禁暗角']
    };
}
