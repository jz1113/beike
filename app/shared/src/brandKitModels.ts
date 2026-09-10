/**
 * 品牌资产库与长程记忆数据模型 (Brand Kit & Memory Vault)
 * 
 * 适用于全工作台与 AI 助手系统，锁定专属虚拟模特 DNA、品牌色彩体系与全局避坑规约。
 */

export interface ModelFaceDna {
  gender: 'female' | 'male' | 'unisex';
  ageGroup: string; // e.g. "25岁职场青年"
  ethnicity: string; // e.g. "东亚自然面孔"
  hairStyle: string; // e.g. "黑色微卷锁骨中长发"
  makeupAndOutfit: string; // e.g. "自然清透裸妆，极简浅灰色修身西装内搭纯白T恤"
  avatarUrl?: string; // 模特标准基准肖像图 URL (用于 @图片2 垫图绑定)
}

export interface BrandColorConfig {
  primary?: string; // 主色 HEX (如 #1E293B)
  primaryName?: string; // 主色名称 (如 科技深空灰)
  secondary?: string; // 辅色 HEX (如 #F8FAFC)
  secondaryName?: string; // 辅色名称 (如 极简冷白)
  accent?: string; // 点缀色 HEX (如 #EF4444)
}

export interface BrandKitProfile {
  id: string;
  name: string;
  badge?: string;
  description?: string;
  brandTone: string; // 品牌整体视觉基调 (如: "现代极简，高端科技质感，柔和自然漫反射光")
  colors?: BrandColorConfig;
  modelDna?: ModelFaceDna;
  preferredScenes?: string[]; // 推荐常用场景 (如: ["明亮原木风办公书房", "极简商业摄影棚"])
  negativeRules?: string[]; // 避坑词/负向规约 (如: ["严禁塑料反光假感", "严禁欧美面孔", "严禁杂乱背景"])
  isDefault?: boolean;
  createdAt?: number;
}

/** 官方精选预设品牌资产模版库 */
export const DEFAULT_BRAND_KITS: BrandKitProfile[] = [
  {
    id: 'brand-tech-minimalist',
    name: '数码科技 · 现代极简',
    badge: '3C数码',
    description: '适用于手机、数码配件、桌面好物等高客单 3C 品类，强调金属冷峻质感与高级商务光影。',
    brandTone: '现代极简商务科技风，硬朗细腻光泽，冷暖光影对比，高端克制美学',
    colors: {
      primary: '#0F172A',
      primaryName: '深空深灰',
      secondary: '#F1F5F9',
      secondaryName: '极简银白',
      accent: '#3B82F6'
    },
    modelDna: {
      gender: 'female',
      ageGroup: '25~28岁东亚干练职场人',
      ethnicity: '清秀自然东亚面孔',
      hairStyle: '黑色齐肩利落短发/内扣中发',
      makeupAndOutfit: '清爽通透职场妆容，深色极简修身西装或深灰质感毛衣'
    },
    preferredScenes: [
      '极简现代原木或岩板工作台，带白色百叶窗柔光',
      '高端科技摄影棚，深色背景搭配冷调轮廓光与轻微景深',
      '都市极简采光书房，桌面极简无杂物'
    ],
    negativeRules: [
      '严禁塑料感廉价反光',
      '严禁花哨杂乱背景',
      '严禁手部手指粘连与机身接缝变形'
    ],
    isDefault: true,
    createdAt: 1700000000000
  },
  {
    id: 'brand-beauty-skincare',
    name: '美妆个护 · 水润清透',
    badge: '美妆护肤',
    description: '适用于精华、水乳、面霜等护肤品类，强调通透水光、水润透亮与治愈系柔光。',
    brandTone: '清新温润治愈风，水润通透光感，自然柔和漫反射，高级纯净美学',
    colors: {
      primary: '#FFF7ED',
      primaryName: '暖白奶油',
      secondary: '#F43F5E',
      secondaryName: '清透粉润',
      accent: '#F59E0B'
    },
    modelDna: {
      gender: 'female',
      ageGroup: '22~25岁东亚元气少女',
      ethnicity: '白皙通透东亚面孔',
      hairStyle: '蓬松微卷深棕色长发，自然碎发',
      makeupAndOutfit: '氧气清透裸妆，透亮水光肌，浅色吊带丝绸睡袍或米白棉麻家居服'
    },
    preferredScenes: [
      '阳光明媚的极简原木浴室洗手台，带晨光露珠与玻璃水光折射',
      '清晨明亮卧室梳妆台，柔和漫反射与绿植背景虚化',
      '纯白微距水面波纹倒影场景'
    ],
    negativeRules: [
      '严禁暗角与浓重阴影',
      '严禁过度浓妆假睫毛',
      '严禁瓶身文字歪斜变形'
    ],
    createdAt: 1700000001000
  },
  {
    id: 'brand-fashion-lifestyle',
    name: '服饰穿搭 · 胶片生活',
    badge: '小红书种草',
    description: '适用于服饰、箱包、鞋靴与生活方式好物，强调生活化抓拍、35mm 胶片质感与真实感。',
    brandTone: '35mm 电影胶片生活化抓拍质感，自然随性真实，富有情绪价值与生活松弛感',
    colors: {
      primary: '#78350F',
      primaryName: '复古暖咖',
      secondary: '#FEF3C7',
      secondaryName: '米黄温润',
      accent: '#E11D48'
    },
    modelDna: {
      gender: 'female',
      ageGroup: '23~26岁东亚时尚博主',
      ethnicity: '松弛感自然东亚面孔',
      hairStyle: '自然蓬松波浪卷发，戴复古发夹',
      makeupAndOutfit: '日系氧气感淡妆，复古针织衫或宽松休闲衬衫'
    },
    preferredScenes: [
      '午后阳光街道街角咖啡馆户外原木桌椅',
      '温暖复古暖调客厅沙发，阳光穿透窗纱',
      '绿意盎然的城市公园草坪'
    ],
    negativeRules: [
      '严禁假人模特僵硬站姿',
      '严禁过度数码锐化与假图感',
      '严禁衣服纹理涂抹失真'
    ],
    createdAt: 1700000002000
  }
];

/** 将 Brand Kit 资产转换为注入 System Prompt 的强约束上下文 */
export function buildBrandKitSystemPrompt(brandKit?: BrandKitProfile | null): string {
  if (!brandKit) return '';

  const sections: string[] = [
    `【🏢 品牌资产库强约束 (Active Brand Kit: ${brandKit.name})】：`
  ];

  if (brandKit.brandTone) {
    sections.push(`- 🎨 品牌视觉基调: ${brandKit.brandTone}`);
  }

  if (brandKit.colors) {
    const c = brandKit.colors;
    const colorParts: string[] = [];
    if (c.primary) colorParts.push(`主色[${c.primaryName || c.primary}]`);
    if (c.secondary) colorParts.push(`辅色[${c.secondaryName || c.secondary}]`);
    if (c.accent) colorParts.push(`点缀色[${c.accent}]`);
    if (colorParts.length > 0) {
      sections.push(`- 🌈 品牌色彩体系: ${colorParts.join('、')}（画面背景与光影色彩应优先融入此色系）`);
    }
  }

  if (brandKit.modelDna) {
    const m = brandKit.modelDna;
    sections.push(`- 👤 锁定专属模特 DNA (100% 保持模特一致性):
  • 人物特征: ${m.ageGroup}，${m.ethnicity}
  • 发型细节: ${m.hairStyle}
  • 妆容穿搭: ${m.makeupAndOutfit}
  • 多图指代: 当涉及人物入画时，提示词中请固定锁定此模特特征，并以 @图片2 指代基准模特`);
  }

  if (brandKit.preferredScenes && brandKit.preferredScenes.length > 0) {
    sections.push(`- 🏞️ 推荐空间场景: ${brandKit.preferredScenes.join(' | ')}`);
  }

  if (brandKit.negativeRules && brandKit.negativeRules.length > 0) {
    sections.push(`- 🚫 全局避坑规约: ${brandKit.negativeRules.join('、')}`);
  }

  sections.push(`请确保规划的所有生图提示词与文案严格遵循上述品牌调性与人物/场景 DNA！`);

  return sections.join('\n');
}
