/**
 * 珠宝首饰架构与提示词资产库联动辅助函数
 */
import { detectJewelryAnatomy } from '../prompts/prompt-engine/roles';
import {
  JEWELRY_ALL_MASTER_SNIPPET,
  JEWELRY_BRACELET_SNIPPET,
  JEWELRY_NECKLACE_SNIPPET,
  JEWELRY_RING_SNIPPET,
  JEWELRY_EARRING_SNIPPET,
  JEWELRY_HAIRPIN_SNIPPET,
} from '../prompts/masterRecipes';

export const ASSET_LIBRARY_PROVENANCES = ['deconstructed', 'seed', 'manual'] as const;

export const ASSET_PROVENANCE_WHERE = {
  provenance: { in: [...ASSET_LIBRARY_PROVENANCES] },
};

const JEWELRY_SUBTYPE_SNIPPETS: Partial<Record<string, string>> = {
  bracelet: JEWELRY_BRACELET_SNIPPET,
  necklace: JEWELRY_NECKLACE_SNIPPET,
  ring: JEWELRY_RING_SNIPPET,
  earring: JEWELRY_EARRING_SNIPPET,
  hairpin: JEWELRY_HAIRPIN_SNIPPET,
};

const JEWELRY_SUBTYPE_KEYS = new Set(Object.keys(JEWELRY_SUBTYPE_SNIPPETS));

export function isJewelryProductTitle(
  title?: string | null,
  props?: Record<string, string> | null
): boolean {
  const text = `${title || ''} ${JSON.stringify(props || {})}`;
  return /手镯|手链|手串|项链|吊坠|锁骨链|戒指|指环|耳环|耳钉|耳饰|发簪|步摇|簪|珠宝|翡翠|黄金|足金|银饰|首饰|jade|gold|diamond|pearl/i.test(
    text
  );
}

export function inferTargetAnatomyFromTitle(
  title?: string | null,
  props?: Record<string, string> | null
): string {
  const anatomy = detectJewelryAnatomy(title, JSON.stringify(props || {}));
  return JEWELRY_SUBTYPE_KEYS.has(anatomy) ? anatomy : '';
}

export function inferAssetCategoryTags(titleStr: string, targetAnatomy: string): string[] {
  const tags = new Set<string>(['jewelry', 'all']);
  if (targetAnatomy) tags.add(targetAnatomy);
  if (/古法|传承|足金|黄金|18k|24k|k金|au750/i.test(titleStr)) {
    tags.add('ancient_gold');
    tags.add('gold');
  }
  if (/珍珠|pearl/i.test(titleStr)) tags.add('pearl');
  if (/翡翠|jade|玉石|和田玉/i.test(titleStr)) tags.add('jade');
  if (/钻石|diamond/i.test(titleStr)) tags.add('diamond');
  if (/白银|银饰|925|sterling/i.test(titleStr)) tags.add('silver');
  if (/铂金|白金|white.?gold/i.test(titleStr)) tags.add('white_gold');
  if (/国风|新中式|旗袍|汉服|步摇/i.test(titleStr)) tags.add('chinese_style');
  return [...tags];
}

export function buildSuitableCategoriesOr(tags: string[]) {
  return tags.map((tag) => ({ suitableCategories: { contains: tag } }));
}

export function buildJewelryTemplateStyle(
  archName: string,
  baseSnippet: string,
  productTitle?: string | null,
  productProps?: Record<string, string> | null
): string {
  const anatomy = inferTargetAnatomyFromTitle(productTitle, productProps);
  const subtypeSnippet = anatomy ? JEWELRY_SUBTYPE_SNIPPETS[anatomy] : undefined;
  if (!subtypeSnippet) {
    return `${archName}\n${baseSnippet || JEWELRY_ALL_MASTER_SNIPPET}`;
  }
  return `${archName}\n${baseSnippet || JEWELRY_ALL_MASTER_SNIPPET}\n\n## 【本商品子品类专属强化守卫】\n${subtypeSnippet}`;
}

export function shouldAutoSelectJewelryArch(
  productTitle?: string | null,
  props?: Record<string, string> | null
): boolean {
  return isJewelryProductTitle(productTitle, props);
}

export interface TailoredOutfitPreset {
  id: string;
  code?: string;
  title: string;
  top: string;
  bottom: string;
  colorPalette: string;
  styleTag?: string;
  suitableCategories: string;
}

/**
 * 🌟 品类-穿搭智能风格路由器：根据商品类目/材质/调性推荐最贴切的高审美显白私服，杜绝跨商品撞衫
 */
export function getCategoryTailoredOutfits(titleStr: string, targetAnatomy: string): TailoredOutfitPreset[] {
  const text = `${titleStr} ${targetAnatomy}`.toLowerCase();

  // 1. 发簪 / 步摇 / 翡翠玉石 / 新中式
  if (targetAnatomy === 'hairpin' || /发簪|步摇|簪子|发钗|玉石|翡翠|和田玉|国风|新中式|汉服|旗袍/i.test(text)) {
    return [
      {
        id: 'preset-outfit-chinese-1',
        title: '新中式素雅棉麻微落肩立领盘扣开衫配马面长裙',
        top: '浅米色透气棉麻小立领手工盘扣微落肩开衫，内搭吊带素白打底衫',
        bottom: '纯白垂感素面马面褶裙',
        colorPalette: '象牙白、素麻米色、黛青',
        styleTag: 'chinese_style',
        suitableCategories: '["all","jewelry","hairpin","jade","chinese_style"]',
      },
      {
        id: 'preset-outfit-chinese-2',
        title: '轻薄真丝素白衬衫配淡雅灰蓝百褶长裙',
        top: '小立领质感真丝素白衬衫，领口微敞自然显白',
        bottom: '灰蓝色微风细褶层叠半身长裙',
        colorPalette: '珍珠白、月魄灰蓝、素灰',
        styleTag: 'chinese_style',
        suitableCategories: '["all","jewelry","hairpin","jade","chinese_style"]',
      },
      {
        id: 'preset-outfit-chinese-3',
        title: '新中式淡青竹影刺绣软糯针织开衫套裙',
        top: '淡青色软糯圆领微针织开衫，门襟点缀极简珍珠纽扣',
        bottom: '米白色垂感高腰直筒长裙',
        colorPalette: '竹青、米白、素银',
        styleTag: 'chinese_style',
        suitableCategories: '["all","jewelry","hairpin","jade","chinese_style"]',
      },
    ];
  }

  // 2. 黄金 / 足金 / 古法黄金 / 吊坠项链
  if (targetAnatomy === 'necklace' || /黄金|足金|金项链|古法|吊坠|锁骨链|18k|au750/i.test(text)) {
    return [
      {
        id: 'preset-outfit-gold-1',
        title: '法式复古小方领微落肩羊绒针织衫配高腰阔腿裤',
        top: '燕麦色细腻羊绒小方领微落肩针织上衣，端庄展露锁骨颈间',
        bottom: '高腰垂感深炭灰阔腿西装裤',
        colorPalette: '燕麦奶咖、深炭灰、暖金',
        styleTag: 'french_retro',
        suitableCategories: '["all","jewelry","necklace","gold"]',
      },
      {
        id: 'preset-outfit-gold-2',
        title: '软糯奶油白马海毛圆领开衫内搭纯白吊带',
        top: '软糯慵懒奶油白大圆领马海毛针织开衫，内搭极简纯白平口吊带',
        bottom: '复古高腰直筒微喇经典水洗牛仔裤',
        colorPalette: '奶油白、经典复古牛仔蓝',
        styleTag: 'french_retro',
        suitableCategories: '["all","jewelry","necklace","gold"]',
      },
      {
        id: 'preset-outfit-gold-3',
        title: '黑曜平口方领轻薄打底衫配灰调直筒裤',
        top: '极简纯黑小方领微收腰打底衫，极致衬托冷白肤质与黄金闪耀',
        bottom: '浅灰高腰垂感直筒长裤',
        colorPalette: '纯黑、冷灰、亮金',
        styleTag: 'french_retro',
        suitableCategories: '["all","jewelry","necklace","gold"]',
      },
    ];
  }

  // 3. 纯银 / 白银 / 手镯手链 / 戒指
  if (targetAnatomy === 'bracelet' || targetAnatomy === 'ring' || /银镯|银手镯|手链|纯银|925|银饰/i.test(text)) {
    return [
      {
        id: 'preset-outfit-silver-1',
        title: '随性微挺括男友风白衬衫配高腰直筒牛仔裤',
        top: '微挺括质感随性白衬衫，微卷袖口露手腕，手腕佩戴饰品清爽大方',
        bottom: '高腰直筒深色水洗牛仔裤',
        colorPalette: '纯白、经典丹宁蓝、亮银',
        styleTag: 'minimal_chic',
        suitableCategories: '["all","jewelry","bracelet","silver"]',
      },
      {
        id: 'preset-outfit-silver-2',
        title: '酷飒极简浅灰休闲廓形西装内搭纯白重磅T恤',
        top: '浅灰调休闲廓形西装外套，内搭纯白圆领重磅落肩T恤，挽袖露腕',
        bottom: '高腰深黑垂感阔腿长裤',
        colorPalette: '浅麻灰、纯白、深炭黑',
        styleTag: 'minimal_chic',
        suitableCategories: '["all","jewelry","bracelet","silver"]',
      },
      {
        id: 'preset-outfit-silver-3',
        title: '慵懒高级灰色系小圆领羊绒开衫配白色休闲裤',
        top: '软糯高级花灰小圆领针织开衫，微松弛袖口，露腕线条自然修长',
        bottom: '米白色高腰垂坠直筒休闲裤',
        colorPalette: '高级灰、米白、银光',
        styleTag: 'minimal_chic',
        suitableCategories: '["all","jewelry","bracelet","silver"]',
      },
    ];
  }

  // 4. 通用日常珠宝饰品高级私服
  return [
    {
      id: 'preset-outfit-general-1',
      title: '法式慵懒小圆领针织衫配高腰直筒裤',
      top: '法式慵懒浅米色小圆领微落肩针织衫，端庄大方',
      bottom: '高腰直筒深色休闲长裤',
      colorPalette: '浅米黄、深咖、纯白',
      styleTag: 'casual_chic',
      suitableCategories: '["all","jewelry"]',
    },
    {
      id: 'preset-outfit-general-2',
      title: '极简随性质感白衬衫配高腰微喇牛仔裤',
      top: '微挺括质感随性白衬衫，领口微敞自然露锁骨，衣袖微挽',
      bottom: '高腰复古水洗微喇牛仔裤',
      colorPalette: '纯白、经典蓝',
      styleTag: 'casual_chic',
      suitableCategories: '["all","jewelry"]',
    },
  ];
}

export interface TailoredPersonaPreset {
  id: string;
  name: string;
  hair: string;
  face: string;
  skin: string;
  vibe: string;
  description: string;
  suitableCategories: string;
}

/**
 * 🌟 智能博主人设路由器：注入丰富多元的高质量东亚自然生活博主，保证跨商品轮询深厚度
 */
export function getCategoryTailoredPersonas(): TailoredPersonaPreset[] {
  return [
    {
      id: 'preset-persona-1',
      name: '松弛明媚·清透系假日博主',
      hair: '深棕色蓬松中长卷发，发丝柔和自然',
      face: '柔和鹅蛋脸，清澈灵动的眼神带有自然眼神光，嘴角微扬舒展',
      skin: '原生细腻真实自然冷白皮肤质与细微毛孔呼吸感',
      vibe: '真实生活松弛自信与明媚呼吸感',
      description: '主体：松弛明媚·清透系假日博主，真实商业人像摄影，顶级美学度假博主。深棕色蓬松中长卷发，发丝柔和自然。柔和鹅蛋脸，清澈灵动的眼神带有自然眼神光，嘴角微扬舒展，神态松弛自然。原生细腻真实自然冷白皮肤质与细微毛孔呼吸感。',
      suitableCategories: '["all","jewelry"]',
    },
    {
      id: 'preset-persona-2',
      name: '东方古典·温婉名媛博主',
      hair: '乌黑柔顺的饱满温婉古典低盘发髻，碎发微绒毛',
      face: '精致立体微折叠度鹅蛋脸，灵动清澈小鹿眼，野生自然眉与清透裸粉唇色',
      skin: '原生微透光血色感健康肤质与细微自然毛孔',
      vibe: '东方典雅温润从容书卷气',
      description: '主体：东方古典·温婉名媛博主，顶级东方美学人像。乌黑柔顺的饱满温婉古典低盘发髻，碎发微绒毛。精致立体微折叠度鹅蛋脸，灵动清澈小鹿眼，野生自然眉与清透裸粉唇色。原生微透光血色感健康肤质与细微自然毛孔。',
      suitableCategories: '["all","jewelry","hairpin","jade","chinese_style"]',
    },
    {
      id: 'preset-persona-3',
      name: '都会极简·时髦职场博主',
      hair: '黑茶色清爽及肩微层次齐肩短发/微外翻波波头',
      face: '立体微折叠度鹅蛋脸，清秀深邃眼眸，原生骨相立体清晰，神态优雅从容',
      skin: '冷白通透质感原生相机直出肤质，呼吸感毛孔',
      vibe: '都市极简高智时髦从容感',
      description: '主体：都会极简·时髦职场博主，现代都会时尚大片。黑茶色清爽及肩微层次齐肩短发/微外翻波波头。立体微折叠度鹅蛋脸，清秀深邃眼眸，原生骨相立体清晰，神态优雅从容。冷白通透质感原生相机直出肤质，呼吸感毛孔。',
      suitableCategories: '["all","jewelry","gold","diamond","silver"]',
    },
    {
      id: 'preset-persona-4',
      name: '法式慵懒·文艺复古少女',
      hair: '暖金棕色空气刘海半扎丸子头，随性碎发微乱蓬松',
      face: '清秀微幼态小脸，眼神灵动俏皮，自然微笑露齿',
      skin: '原生微透光呼吸感肤质，自然血色感',
      vibe: '慵懒治愈法式小清新随拍感',
      description: '主体：法式慵懒·文艺复古少女，小红书高赞随拍。暖金棕色空气刘海半扎丸子头，随性碎发微乱蓬松。清秀微幼态小脸，眼神灵动俏皮，自然微笑露齿。原生微透光呼吸感肤质，自然血色感。',
      suitableCategories: '["all","jewelry","french_retro"]',
    },
    {
      id: 'preset-persona-5',
      name: '阳光明媚·灵动邻家女孩',
      hair: '高颅顶蓬松高马尾，发际线自然绒毛与灵动碎发',
      face: '自然清纯甜美面容，笑眼弯弯充满感染力',
      skin: '真实健康自然冷白肤色与微小皮肤纹理',
      vibe: '元气减龄活力生活感',
      description: '主体：阳光明媚·灵动邻家女孩，生活抓拍感。高颅顶蓬松高马尾，发际线自然绒毛与灵动碎发。自然清纯甜美面容，笑眼弯弯充满感染力。真实健康自然冷白肤色与微小皮肤纹理。',
      suitableCategories: '["all","jewelry"]',
    },
  ];
}


