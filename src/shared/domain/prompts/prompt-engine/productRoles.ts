/**
 * 原创角色与商品角色（Product Role）主次约束与一致性清洗模块
 */

export type OriginalProductRole =
  | 'worn_apparel'
  | 'worn_accessory'
  | 'held_object'
  | 'placed_object';

export const ORIGINAL_PRODUCT_ROLES: OriginalProductRole[] = [
  'worn_apparel',
  'worn_accessory',
  'held_object',
  'placed_object',
];

export type JewelryAnatomyType =
  | 'hairpin'      // 发簪 / 步摇 / 发饰 / 发夹 / 抓夹 / 发圈 / 发冠 / 头饰
  | 'earring'      // 耳环 / 耳钉 / 耳圈 / 耳坠 / 耳饰
  | 'necklace'     // 项链 / 锁骨链 / 吊坠 / 项圈 / 颈链
  | 'bracelet'     // 手镯 / 手链 / 手串 / 腕表 / 手表
  | 'ring'         // 戒指 / 指环 / 对戒
  | 'brooch'       // 胸针 / 领针
  | 'bag'          // 包袋 / 手提包 / 单肩包 / 斜挎包
  | 'shoes'        // 鞋履 / 高跟鞋 / 单鞋 / 凉鞋 / 靴子
  | 'eyewear'      // 眼镜 / 墨镜 / 太阳镜
  | 'hat'          // 帽子 / 贝雷帽 / 渔夫帽 / 草帽
  | 'scarf'        // 丝巾 / 围巾 / 披肩
  | 'apparel'      // 服装 / 裙子 / 上衣
  | 'held'         // 手持数码 / 杯子
  | 'placed'       // 摆件 / 静物
  | 'general_acc'; // 通用配饰

export function detectJewelryAnatomy(raw?: string | null, fingerprint?: string | null): JewelryAnatomyType {
  const text = `${raw || ''} ${fingerprint || ''}`.toLowerCase();
  if (/发簪|簪子|步摇|发饰|发夹|抓夹|发卡|发圈|发带|发绳|发冠|头饰|头花|抹额|hairpin|hair\s*stick|hair\s*clip|hair\s*accessory/.test(text)) {
    return 'hairpin';
  }
  if (/耳环|耳钉|耳圈|耳坠|耳饰|earring|earrings|ear\s*stud/.test(text)) {
    return 'earring';
  }
  if (/项链|锁骨链|吊坠|项圈|颈链|颈圈|necklace|pendant|choker/.test(text)) {
    return 'necklace';
  }
  if (/手镯|手链|手串|镯子|手绳|手排|手环|腕表|手表|bracelet|bangle|wrist\s*watch/.test(text)) {
    return 'bracelet';
  }
  if (/戒指|指环|对戒|钻戒|ring/.test(text)) {
    return 'ring';
  }
  if (/胸针|领针|brooch/.test(text)) {
    return 'brooch';
  }
  if (/包|女包|斜挎包|单肩包|手提包|手拿包|托特包|双肩包|小方包|水桶包|皮包|bag|handbag|crossbody/.test(text)) {
    return 'bag';
  }
  if (/鞋|高跟鞋|单鞋|凉鞋|运动鞋|短靴|长靴|马丁靴|靴子|平底鞋|乐福鞋|shoes|boots|heels/.test(text)) {
    return 'shoes';
  }
  if (/眼镜|墨镜|太阳镜|防蓝光眼镜|镜框|glasses|sunglasses|eyewear/.test(text)) {
    return 'eyewear';
  }
  if (/帽子|草帽|渔夫帽|贝雷帽|鸭舌帽|棒球帽|针织帽|宽檐帽|hat|cap|beret/.test(text)) {
    return 'hat';
  }
  if (/围巾|丝巾|披肩|领巾|方巾|scarf|shawl/.test(text)) {
    return 'scarf';
  }
  if (/服饰|服装|上衣|衬衫|衬衣|外套|大衣|风衣|卫衣|毛衣|针织|裙|裤|牛仔|t\s*恤|apparel|dress/.test(text)) {
    return 'apparel';
  }
  if (/静物|摆件|陈设|placed/.test(text)) {
    return 'placed';
  }
  if (/手机|水杯|保温杯|数码|held/.test(text)) {
    return 'held';
  }
  return 'general_acc';
}

export function getJewelryAnatomyStatement(anatomy: JewelryAnatomyType): string {
  switch (anatomy) {
    case 'hairpin':
      return '插戴于秀美发髻（长发挽成温婉低盘发髻，@图片1 所示发簪长杆纤细穿插固定于发髻内部，簪首雕花镶嵌在发髻侧上方，流苏步摇自然垂直垂落，手腕光洁无手镯）';
    case 'earring':
      return '佩戴于双耳耳垂（小巧精致贴耳小耳饰，与耳垂比例协调，手腕与脖颈光洁无多余首饰）';
    case 'necklace':
      return '颈间锁骨正中佩戴（项链吊坠自然垂坠贴合领口锁骨正中，吊坠小巧精致，手腕光洁无手镯手链）';
    case 'bracelet':
      return '统一佩戴于单侧左手手腕（整套图严格统一佩戴在左手手腕，手腕置于显著受光处清晰呈现 @图片1 手镯拉丝光泽与雕花细节，脖颈与双耳保持光洁无项链耳环）';
    case 'ring':
      return '统一佩戴于左手无名指（整套图严格锁定仅在左手无名指佩戴1枚 @图片1 戒指，贴合指节比例精致，右手与手腕光洁无多余饰品）';
    case 'brooch':
      return '胸前衣领佩戴（佩戴于胸前衣领上）';
    case 'bag':
      return '自然手提或单肩佩戴（手提或斜挎 @图片1 所示包袋，外观 100% 以 @图片1 为准）';
    case 'shoes':
      return '穿着于双足（脚穿 @图片1 所示鞋履，展现鞋履版型与材质质感）';
    case 'eyewear':
      return '佩戴于面部鼻梁（面部佩戴 @图片1 所示眼镜/墨镜，与五官自然契合）';
    case 'hat':
      return '佩戴于头顶发间（头戴 @图片1 所示帽子，与蓬松发型自然搭配）';
    case 'scarf':
      return '优雅系于颈间（@图片1 所示丝巾/围巾优雅环绕颈肩）';
    case 'apparel':
      return '穿着于身上（服装版型材质100%以 @图片1 为准）';
    default:
      return '佩戴/使用于对应标准部位';
  }
}

export function normalizeOriginalProductRole(
  raw?: string | null,
  fingerprint?: string | null
): OriginalProductRole {
  const v = (raw || '').trim().toLowerCase();
  if (ORIGINAL_PRODUCT_ROLES.includes(v as OriginalProductRole)) {
    return v as OriginalProductRole;
  }
  const fp = `${raw || ''} ${fingerprint || ''}`.toLowerCase();
  if (
    /服饰|服装|上衣|衬衫|衬衣|外套|大衣|风衣|卫衣|毛衣|针织|裙|裤|牛仔|t\s*恤|tee|hoodie|jacket|coat|dress|apparel|fashion/.test(
      fp
    )
  ) {
    return 'worn_apparel';
  }
  if (
    /项链|手链|耳环|耳钉|戒指|手表|腕表|围巾|帽子|包|腰带|鞋|靴|饰品|配饰|jewelry|necklace|earring|bag|shoes/.test(
      fp
    )
  ) {
    return 'worn_accessory';
  }
  if (/静物|陈设|摆拍|桌面|placed/.test(fp)) {
    return 'placed_object';
  }
  return 'held_object';
}


export interface OriginalLookParts {
  top?: string;
  bottom?: string;
  shoes?: string;
  accessory?: string;
  /** 合并摘要（兼容旧 look_bible 字符串） */
  summary?: string;
}

export interface OriginalGroupBible {
  identityBible?: string;
  lookBible?: string;
  lookParts?: OriginalLookParts;
  masterScene?: string;
  styleBible?: string;
  /** 商品角色：穿在身上 / 佩戴 / 手持 / 静物 */
  productRole?: OriginalProductRole;
  /** 商品指纹摘要，注入守卫辅助跟品 */
  productFingerprint?: string;
}

export interface OriginalShotFields {
  shot_no?: number;
  expression?: string;
  action?: string;
  prop?: string;
  camera_focal_length?: string;
  angle?: string;
  optics?: string;
  lighting_type?: string;
  scene?: string;
  title?: string;
  has_human?: boolean;
  /** 模型原文，仅作 fallback */
  promptFallback?: string;
}

