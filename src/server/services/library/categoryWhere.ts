type PrismaOrClause = Record<string, unknown>;

const SCENE_CATEGORY_OR: Record<string, PrismaOrClause[]> = {
  chinese_style: [
    { category: 'chinese_style' },
    { title: { contains: '中式' } },
    { title: { contains: '园林' } },
    { title: { contains: '茶' } },
    { title: { contains: '町屋' } },
  ],
  luxury_modern: [
    { category: 'luxury_modern' },
    { title: { contains: '现代' } },
    { title: { contains: '都会' } },
    { title: { contains: '大理石' } },
    { title: { contains: '高层' } },
  ],
  casual_street: [
    { category: 'casual_street' },
    { title: { contains: '街' } },
    { title: { contains: '酒馆' } },
    { title: { contains: '咖啡' } },
    { title: { contains: '长椅' } },
  ],
  vacation_nature: [
    { category: 'vacation_nature' },
    { title: { contains: '海' } },
    { title: { contains: '沙滩' } },
    { title: { contains: '度假' } },
    { title: { contains: '自然' } },
    { title: { contains: '田' } },
  ],
  home_living: [
    { category: 'home_living' },
    { title: { contains: '起居' } },
    { title: { contains: '沙发' } },
    { title: { contains: '生活' } },
    { title: { contains: '房' } },
  ],
  minimal_office: [
    { category: 'minimal_office' },
    { title: { contains: '办公' } },
    { title: { contains: '工位' } },
    { title: { contains: '原木' } },
  ],
};

const OUTFIT_CATEGORY_OR: Record<string, PrismaOrClause[]> = {
  chinese_style: [
    { category: 'chinese_style' },
    { title: { contains: '新中式' } },
    { title: { contains: '马面裙' } },
    { title: { contains: '真丝' } },
    { title: { contains: '盘扣' } },
  ],
  french_chic: [
    { category: 'french_chic' },
    { title: { contains: '法式' } },
    { title: { contains: '针织' } },
    { title: { contains: '牛仔' } },
    { title: { contains: '衬衫' } },
  ],
  luxury_modern: [
    { category: 'luxury_modern' },
    { title: { contains: '西装' } },
    { title: { contains: '羊绒' } },
    { title: { contains: '都会' } },
    { title: { contains: '阔腿裤' } },
  ],
  casual_street: [
    { category: 'casual_street' },
    { title: { contains: '街头' } },
    { title: { contains: '工装' } },
    { title: { contains: '衬衫' } },
    { title: { contains: '休闲' } },
  ],
  vacation_nature: [
    { category: 'vacation_nature' },
    { title: { contains: '度假' } },
    { title: { contains: '长裙' } },
    { title: { contains: '蕾丝' } },
    { title: { contains: '亚麻' } },
  ],
  black_classic: [
    { title: { contains: '小黑裙' } },
    { title: { contains: '赫本' } },
    { title: { contains: '黑白' } },
  ],
};

const ACTION_CATEGORY_OR: Record<string, PrismaOrClause[]> = {
  jewelry: [
    { tags: { contains: '首饰' } },
    { tags: { contains: '珠宝' } },
    { tags: { contains: '耳环' } },
    { tags: { contains: '项链' } },
    { tags: { contains: '手镯' } },
    { tags: { contains: '戒指' } },
    { tags: { contains: '发簪' } },
    { suitableAnatomy: { contains: 'hairpin' } },
    { suitableAnatomy: { contains: 'earring' } },
    { suitableAnatomy: { contains: 'necklace' } },
    { suitableAnatomy: { contains: 'bracelet' } },
    { suitableAnatomy: { contains: 'ring' } },
    { title: { contains: '首饰' } },
    { title: { contains: '耳' } },
    { title: { contains: '发簪' } },
    { title: { contains: '手镯' } },
    { title: { contains: '项链' } },
    { title: { contains: '戒指' } },
    { action: { contains: '耳' } },
    { action: { contains: '发簪' } },
    { action: { contains: '项链' } },
    { action: { contains: '手镯' } },
    { action: { contains: '戒指' } },
  ],
  apparel: [
    { tags: { contains: '服饰' } },
    { tags: { contains: '穿搭' } },
    { tags: { contains: '衣服' } },
    { tags: { contains: '裙' } },
    { tags: { contains: '外套' } },
    { tags: { contains: '衬衫' } },
    { suitableAnatomy: { contains: 'apparel' } },
    { suitableAnatomy: { contains: 'clothing' } },
    { title: { contains: '服饰' } },
    { title: { contains: '穿搭' } },
    { title: { contains: '衣' } },
    { title: { contains: '裙' } },
    { title: { contains: '半身' } },
    { title: { contains: '全身' } },
    { action: { contains: '衣' } },
    { action: { contains: '裙' } },
    { action: { contains: '摆' } },
    { action: { contains: '领' } },
    { action: { contains: '袖' } },
    { shotType: 'half_body' },
    { shotType: 'full_body' },
    { shotType: 'lifestyle_interaction' },
  ],
  bag: [
    { tags: { contains: '包' } },
    { tags: { contains: '箱包' } },
    { tags: { contains: '手袋' } },
    { suitableAnatomy: { contains: 'bag' } },
    { title: { contains: '包' } },
    { title: { contains: '手袋' } },
    { action: { contains: '包' } },
    { action: { contains: '拎' } },
    { action: { contains: '挎' } },
    { action: { contains: '背' } },
    { action: { contains: '握' } },
  ],
  shoes: [
    { tags: { contains: '鞋' } },
    { tags: { contains: '靴' } },
    { suitableAnatomy: { contains: 'shoes' } },
    { title: { contains: '鞋' } },
    { title: { contains: '靴' } },
    { title: { contains: '足' } },
    { action: { contains: '鞋' } },
    { action: { contains: '靴' } },
    { action: { contains: '足' } },
    { action: { contains: '步' } },
    { action: { contains: '踏' } },
    { shotType: 'low_angle_three_quarter_body' },
    { shotType: 'full_body' },
  ],
  beauty: [
    { tags: { contains: '美妆' } },
    { tags: { contains: '妆容' } },
    { tags: { contains: '口红' } },
    { tags: { contains: '护肤' } },
    { suitableAnatomy: { contains: 'beauty' } },
    { title: { contains: '妆' } },
    { title: { contains: '脸' } },
    { title: { contains: '唇' } },
    { title: { contains: '眼' } },
    { action: { contains: '妆' } },
    { action: { contains: '唇' } },
    { action: { contains: '脸' } },
    { action: { contains: '腮' } },
    { shotType: 'extreme_macro_detail' },
    { shotType: 'profile_45' },
  ],
  eyewear: [
    { tags: { contains: '眼镜' } },
    { tags: { contains: '墨镜' } },
    { tags: { contains: '太阳镜' } },
    { suitableAnatomy: { contains: 'eyewear' } },
    { title: { contains: '镜' } },
    { action: { contains: '镜' } },
    { shotType: 'profile_45' },
  ],
  macro_detail: [
    { shotType: 'extreme_macro_detail' },
    { shotType: 'macro_detail' },
    { title: { contains: '微距' } },
    { title: { contains: '特写' } },
  ],
  universal: [
    { shotType: 'close_up' },
    { shotType: 'profile_45' },
    { title: { contains: '侧颜' } },
    { title: { contains: '回眸' } },
    { title: { contains: '近景' } },
    { title: { contains: '特写' } },
  ],
  medium_interactive: [
    { shotType: 'profile_half_body' },
    { shotType: 'medium_full_body' },
    { title: { contains: '半身' } },
    { title: { contains: '托腮' } },
    { title: { contains: '互动' } },
    { title: { contains: '笑' } },
    { title: { contains: '比心' } },
  ],
  full_body: [
    { shotType: 'low_angle_three_quarter_body' },
    { title: { contains: '全身' } },
    { title: { contains: '漫步' } },
    { title: { contains: '站姿' } },
    { title: { contains: '立姿' } },
    { title: { contains: '跃' } },
    { title: { contains: '跑' } },
  ],
  seated_candid: [
    { shotType: 'high_angle_seated_full_body' },
    { title: { contains: '坐' } },
    { title: { contains: '倚' } },
    { title: { contains: '靠' } },
    { title: { contains: '躺' } },
  ],
};

const PERSONA_CATEGORY_OR: Record<string, PrismaOrClause[]> = {
  style_gentle: [
    { name: { contains: '清纯' } },
    { name: { contains: '甜' } },
    { description: { contains: '小鹿眼' } },
    { description: { contains: '甜美' } },
  ],
  style_classic: [
    { name: { contains: '古典' } },
    { name: { contains: '名媛' } },
    { description: { contains: '盘发' } },
    { description: { contains: '端庄' } },
  ],
  style_chic: [
    { name: { contains: '都会' } },
    { name: { contains: '时髦' } },
    { name: { contains: '职场' } },
    { description: { contains: '骨相' } },
    { description: { contains: '立体' } },
  ],
  hair_wavy: [
    { name: { contains: '卷' } },
    { description: { contains: '卷发' } },
    { description: { contains: '波浪' } },
  ],
  hair_updo: [
    { name: { contains: '盘发' } },
    { description: { contains: '低盘发' } },
    { description: { contains: '发髻' } },
  ],
  hair_straight: [
    { name: { contains: '黑长直' } },
    { description: { contains: '黑长直' } },
    { description: { contains: '直发' } },
  ],
  color_gold: [
    { name: { contains: '金' } },
    { name: { contains: '橘' } },
    { description: { contains: '金' } },
    { description: { contains: '橙' } },
    { description: { contains: '棕' } },
  ],
};

function defaultCategoryOr(
  category: string,
  fields: string[]
): PrismaOrClause[] {
  const clauses: PrismaOrClause[] = [{ category }];
  for (const field of fields) {
    clauses.push({ [field]: { contains: category } });
  }
  return clauses;
}

/** 构建资产库 Prisma category 过滤 OR 子句 */
export function buildAssetCategoryWhere(
  assetType: string,
  category: string
): PrismaOrClause[] | null {
  if (!category || category === 'all') return null;

  if (assetType === 'scene' || assetType === 'scene_bundle') {
    return (
      SCENE_CATEGORY_OR[category] ??
      defaultCategoryOr(category, ['tags', 'title', 'description', 'reversePrompt'])
    );
  }

  if (assetType === 'outfit') {
    return (
      OUTFIT_CATEGORY_OR[category] ??
      defaultCategoryOr(category, ['tags', 'title', 'top', 'bottom', 'reversePrompt'])
    );
  }

  if (assetType === 'action') {
    const filterKey = category.trim();
    return (
      ACTION_CATEGORY_OR[filterKey] ?? [
        { shotType: filterKey },
        { category: filterKey },
        { tags: { contains: filterKey } },
      ]
    );
  }

  if (assetType === 'persona') {
    return (
      PERSONA_CATEGORY_OR[category] ??
      defaultCategoryOr(category, ['tags', 'name', 'description', 'reversePrompt'])
    );
  }

  if (assetType === 'full_prompt') {
    return defaultCategoryOr(category, [
      'albumName',
      'tags',
      'title',
      'reversePromptZh',
    ]);
  }

  return defaultCategoryOr(category, ['tags', 'title']);
}
