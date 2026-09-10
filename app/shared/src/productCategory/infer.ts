/**
 * 电商多品类与解剖学部位推断与光学提示词构建
 */
import { isJewelryProductTitle } from '../jewelryArchHelpers';
import { detectJewelryAnatomy } from '../prompt-engine/roles';

export interface ProductCategoryInfo {
  primaryCategory: 'jewelry' | 'apparel' | 'bag' | 'shoes' | 'beauty' | 'eyewear' | 'hat_accessory' | 'digital' | 'all';
  targetAnatomy: string;
  categoryTags: string[];
  subType?: string;
}

/**
 * 从商品标题和规格属性智能推断商品大类与关键穿戴部位
 */
export function inferProductCategoryAndAnatomy(
  title?: string | null,
  props?: Record<string, any> | null
): ProductCategoryInfo {
  const text = `${title || ''} ${JSON.stringify(props || {})}`.toLowerCase();

  // 1. 珠宝首饰 (Jewelry)
  if (isJewelryProductTitle(title, props as Record<string, string> | null)) {
    const targetAnatomy = detectJewelryAnatomy(title, JSON.stringify(props || {}));
    const categoryTags = ['jewelry', targetAnatomy, 'all'];
    return {
      primaryCategory: 'jewelry',
      targetAnatomy,
      categoryTags,
      subType: targetAnatomy,
    };
  }

  // 2. 箱包皮具 (Bag)
  if (/包|手袋|托特包|单肩包|斜挎包|双肩包|手提包|水桶包|链条包|胸包|腰包|钱包|卡包|bag|tote|backpack|crossbody/i.test(text)) {
    return {
      primaryCategory: 'bag',
      targetAnatomy: 'hand',
      categoryTags: ['bag', 'hand', 'shoulder', 'all'],
      subType: 'bag',
    };
  }

  // 3. 鞋靴类目 (Shoes)
  if (/鞋|靴|高跟鞋|马丁靴|运动鞋|球鞋|板鞋|乐福鞋|单鞋|凉鞋|拖鞋|短靴|长靴|切尔西|shoes|boots|sneakers|heels/i.test(text)) {
    return {
      primaryCategory: 'shoes',
      targetAnatomy: 'feet',
      categoryTags: ['shoes', 'feet', 'ankle', 'all'],
      subType: 'shoes',
    };
  }

  // 4. 眼镜配饰 (Eyewear)
  if (/眼镜|墨镜|太阳镜|镜框|镜架|防蓝光|近视镜|glasses|sunglasses|eyewear/i.test(text)) {
    return {
      primaryCategory: 'eyewear',
      targetAnatomy: 'face',
      categoryTags: ['eyewear', 'face', 'eyes', 'all'],
      subType: 'eyewear',
    };
  }

  // 5. 美妆香水护肤 (Beauty)
  if (/口红|唇膏|唇釉|香水|粉底|气垫|遮瑕|腮红|眼影|眼线|睫毛膏|精华|面霜|乳液|水光|美甲|lipstick|perfume|cosmetics|beauty/i.test(text)) {
    let targetAnatomy = 'face';
    if (/口红|唇膏|唇釉/i.test(text)) targetAnatomy = 'lips';
    else if (/香水/i.test(text)) targetAnatomy = 'wrist';
    return {
      primaryCategory: 'beauty',
      targetAnatomy,
      categoryTags: ['beauty', targetAnatomy, 'all'],
      subType: 'beauty',
    };
  }

  // 6. 帽子头饰配件 (Hat & Accessories)
  if (/帽|贝雷帽|鸭舌帽|棒球帽|渔夫帽|草帽|毛线帽|围巾|丝巾|披肩|腰带|皮带|hat|cap|scarf|belt/i.test(text)) {
    return {
      primaryCategory: 'hat_accessory',
      targetAnatomy: 'head',
      categoryTags: ['hat_accessory', 'head', 'neck', 'all'],
      subType: 'hat_accessory',
    };
  }

  // 7. 3C数码生活 (Digital & Lifestyle)
  if (/手机壳|耳机|蓝牙耳机|头戴式|数码|保温杯|咖啡杯|水杯|phonecase|headphones|mug/i.test(text)) {
    return {
      primaryCategory: 'digital',
      targetAnatomy: 'hand',
      categoryTags: ['digital', 'hand', 'ears', 'all'],
      subType: 'digital',
    };
  }

  // 8. 服饰穿搭 (Apparel)
  if (/大衣|羽绒服|外套|西装|风衣|夹克|毛衣|针织衫|衬衫|t恤|卫衣|马甲|连衣裙|半身裙|短裙|长裙|裤|牛仔裤|休闲裤|西裤|短裤|旗袍|汉服|dress|coat|jacket|shirt|pants|skirt|suit/i.test(text)) {
    return {
      primaryCategory: 'apparel',
      targetAnatomy: 'full_body',
      categoryTags: ['apparel', 'full_body', 'upper_body', 'all'],
      subType: 'apparel',
    };
  }

  // 9. 通用百搭 (Universal)
  return {
    primaryCategory: 'all',
    targetAnatomy: 'all',
    categoryTags: ['all'],
    subType: 'general',
  };
}

/**
 * 根据商品类目与穿戴部位构建专属超清近景/微距光学提示词（手腕/领口/侧颜/发髻/指间）
 */
export function buildCategoryCloseUpOptics(
  primaryCategory: string,
  targetAnatomy: string,
  camera: string,
  angle: string
): string {
  const baseCamera = camera || 'iPhone 85mm-100mm 超清特写镜头';

  if (primaryCategory === 'jewelry') {
    if (targetAnatomy === 'bracelet') {
      return `iPhone 100mm f/2.8 极近距离手腕超清微距镜头（Extreme Close-Up Macro Frame），${angle || '平视或微俯角手腕局部特写'}，单侧手腕自然置于画面视觉中心，100mm超清微距大光圈浅景深对焦手腕，绝对焦点锁定在 @图片1 所示手镯/手链实物，手镯清晰占据画面 55%~75% 核心视觉中心，像素级高精呈现贵金属拉丝抛光光泽、立体精细雕花与材质温润通透质感，手部姿态放松自然作为依托，背景自然柔和虚化，严禁全身/远景/大空景`;
    }
    if (targetAnatomy === 'necklace') {
      return `iPhone 100mm f/2.8 极近距离锁骨项链超清近景大特写（Tight Bust-Up Portrait），${angle || '胸部以上端庄领口与锁骨抓拍'}，绝对焦点锁定在颈间锁骨正中 @图片1 所示项链吊坠实物，项链位于画面核心视觉中心（50%~70% 面积），高清呈现金属高光反光、链条精细编织与宝石微观切面细节，背景生活化柔美虚化，严禁全身/远景`;
    }
    if (targetAnatomy === 'hairpin') {
      return `iPhone 100mm f/2.8 侧后方发髻超清微距镜头（Hairpin Macro Frame），${angle || '45°侧颜与低发髻微距特写'}，绝对焦点锁定在秀美发髻上横向穿插固定的 @图片1 所示发簪实物，清晰呈现簪首精美雕花镶嵌与流苏垂直摇曳质感，发簪占据画面 55%~75% 视觉中心，背景自然柔和虚化，严禁正面被头部遮挡，严禁全身景别`;
    }
    if (targetAnatomy === 'earring') {
      return `iPhone 100mm f/2.8 侧颜耳际超清微距特写镜头（Earring Macro Frame），${angle || '45°侧颜耳部局部特写'}，镜头极近距离聚焦耳垂上佩戴的 @图片1 所示耳饰实物，耳饰位于画面核心焦点（45%~65% 面积），耳垂与侧颜线条清晰，金属/珍珠光泽细腻，背景柔和虚化，严禁全身`;
    }
    if (targetAnatomy === 'ring') {
      return `iPhone 100mm f/2.8 手指超清微距特写镜头（Ring Macro Frame），${angle || '手部自然舒展搭在桌畔或轻抚脸颊'}，焦点绝对锁定在左手无名指佩戴的 @图片1 所示戒指实物，戒指占据画面 55%~75% 核心视觉焦点，呈现金属戒圈精雕做工与主石微观折射反光，背景自然虚化`;
    }
    return `${baseCamera}，${angle || '极近距离局部微距特写构图（Extreme Close-Up Macro Frame）'}，机位极近距离贴近佩戴部位，Shot on iPhone 16 Pro 原相机实拍（Unedited RAW photo），100mm f/2.8 超清微距大光圈浅景深对焦，绝对焦点锁定在 @图片1 所示首饰商品，商品清晰占据画面显著绝对视觉中心（55%~75% 面积），100% 像素级高精度呈现实物精美雕刻纹理、金属反光与宝石材质细节，背景自然柔和虚化，严禁全身/远景`;
  }

  if (primaryCategory === 'apparel') {
    return `iPhone 85mm-100mm 人像细节特写镜头，${angle}，面料与版型局部近景特写构图（Tight Detail Close-Up Frame），镜头近距离聚焦衣服上身版型、领口剪裁与高档面料微观细腻纹理（如羊绒/羊毛微绒感、真丝缎面光泽、精湛缝线与质感纽扣），f/2.0 大光圈浅景深对焦，商品实物清晰占据画面显著中心（55%~75% 面积），真实材质光泽，背景自然虚化`;
  }

  if (primaryCategory === 'bag') {
    return `iPhone 85mm-100mm 质感特写镜头，${angle}，包袋局部近景特写构图（Tight Close-Up Frame），镜头近距离超清对焦单手提拿或搭在身侧的包袋实物，100% 呈现高级真皮天然荔枝纹理/细腻皮质光泽与精美五金锁扣刻字反光，手部自然依托，商品占据画面显著中心（50%~75% 面积），背景自然虚化`;
  }

  if (primaryCategory === 'shoes') {
    return `iPhone 85mm 鞋履特写镜头，${angle}，足部与鞋型局部近景特写构图（Tight Close-Up Frame），低机位近距离对焦上脚展示的鞋靴，清晰呈现鞋头线条、皮质光泽、精细车缝线与鞋跟质感，脚踝姿态自然舒展，商品占据画面显著中心（50%~75% 面积），地面有扎实真实的阴影接触，背景自然柔和虚化`;
  }

  if (primaryCategory === 'beauty') {
    return `iPhone 100mm 微距人像镜头，${angle}，妆容与产品质感局部超清微距特写（Macro Beauty Frame），极近距离大光圈浅景深对焦，呈现产品真实细腻质地（如唇膏水光玻璃感/丝绒哑光感、香水瓶身剔透水晶折射、通透水光底妆肌理），画面细腻高级，背景柔美虚化`;
  }

  if (primaryCategory === 'eyewear') {
    return `iPhone 85mm-100mm 侧颜特写镜头，${angle}，面部与镜框局部近景特写构图（Tight Close-Up Frame），中近距离超清对焦佩戴的眼镜/墨镜实物，呈现镜框板材细腻光泽与镜片通透反光，侧颜线条优美，商品占据面部视觉中心（45%~65% 面积），背景自然柔和虚化`;
  }

  // 默认通用近景
  return `${baseCamera}，${angle || '极近距离局部近景特写构图（Tight Close-Up Frame）'}，机位极近距离贴近佩戴或使用部位，Shot on iPhone 16 Pro 原相机实拍（Unedited RAW photo），大光圈浅景深对焦，绝对焦点锁定在 @图片1 所示商品，商品清晰占据画面显著视觉中心（50%~70% 面积），100% 像素级高精度呈现实物质感与细节，背景自然柔和虚化，严禁全身/远景`;
}
