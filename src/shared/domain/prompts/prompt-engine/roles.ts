/** 商品角色对应的穿搭槽位约束与生成前冲突清洗 */
import { detectJewelryAnatomy, type OriginalLookParts, type OriginalProductRole } from './productRoles';

export {
  ORIGINAL_PRODUCT_ROLES,
  detectJewelryAnatomy,
  getJewelryAnatomyStatement,
  normalizeOriginalProductRole,
  type OriginalProductRole,
  type JewelryAnatomyType,
  type OriginalLookParts,
  type OriginalGroupBible,
  type OriginalShotFields,
} from './productRoles';
export { extractPureActionFromPrompt, stripGarmentsAndLocationsFromAction, stripGarmentsFromAction } from './actionText';
export { isGenericLook, extractOutfitFromPrompt, resolveDiverseDefaultOutfit } from './outfitSelection';
export { preventJewelryGlitches } from './jewelryGuard';
export { enforceLookConsistency, extractCanonicalOutfitFromPrompts } from './lookConsistency';

/** 服饰/配饰商品：清洗自造颜色款式，强制用 @图片1 槽位话术 */
export function sanitizeLookPartsForProductRole(
  parts: OriginalLookParts | null | undefined,
  lookBible: string | undefined,
  role: OriginalProductRole,
  productFingerprint?: string
): OriginalLookParts {
  const summary = (lookBible || parts?.summary || '').trim();
  let top = (parts?.top || '').trim();
  let bottom = (parts?.bottom || '').trim();
  let shoes = (parts?.shoes || '').trim();
  let accessory = (parts?.accessory || '').trim();

  if ((!top || !bottom) && summary) {
    const segs = summary
      .split(/[·;；|/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segs.length >= 4) {
      top = top || segs[0];
      bottom = bottom || segs[1];
      shoes = shoes || segs[2];
      accessory = accessory || segs[3];
    } else if (segs.length === 1) {
      top = top || summary;
    }
  }

  const stripInventedGarment = (s: string) => {
    if (!s) return s;
    if (/@图片\s*1/.test(s)) return s;
    // 去掉易压过垫图的自造颜色/款式描写，保留「下装/鞋履」等非商品位时可再写
    return s
      .replace(
        /(白色|黑色|蓝色|红色|粉色|米色|灰色|绿色|黄色|棕色|卡其|藏青|奶白)?\s*(T恤|t恤|tee|衬衫|衬衣|外套|卫衣|毛衣|针织衫|连衣裙|半身裙|牛仔裤|阔腿裤)/gi,
        ''
      )
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  if (role === 'worn_apparel') {
    top = '穿着 @图片1 所示服装（外观颜色款式材质一律以 @图片1 为准，禁止用文字另写颜色或版型）';
    bottom = bottom
      ? stripInventedGarment(bottom) || '与 @图片1 服装协调的简洁下装（勿抢主体）'
      : '与 @图片1 服装协调的简洁下装（勿抢主体）';
    shoes = shoes || '简约鞋履';
    accessory = accessory && !/脖子佩戴|项链/.test(accessory)
      ? accessory
      : '无抢镜配饰';
    return {
      top,
      bottom,
      shoes,
      accessory,
      summary: `上装=@图片1 所示服装·${bottom}·${shoes}·${accessory}`,
    };
  }

  if (role === 'worn_accessory') {
    const anatomy = detectJewelryAnatomy(productFingerprint || lookBible || summary, productFingerprint);
    let defaultAcc = '佩戴 @图片1 所示商品（外观与材质细节100%以 @图片1 为准）';
    if (anatomy === 'bracelet') {
      defaultAcc = '单侧手腕佩戴 @图片1 所示手镯（手腕显著前置受光展示，脖颈保持绝对纯净光洁，无任何项链吊坠，双耳无耳环，手指无戒指，全图全员仅单侧手腕佩戴 @图片1 所示手镯实物）';
    } else if (anatomy === 'ring') {
      defaultAcc = '左手无名指佩戴 @图片1 所示戒指（手部前置受光展示，手腕光洁无手镯，脖颈光洁无项链）';
    } else if (anatomy === 'necklace') {
      defaultAcc = '颈间锁骨正中佩戴 @图片1 所示项链（项链自然垂坠受光，手腕光洁无手镯手链，手指无戒指）';
    } else if (anatomy === 'earring') {
      defaultAcc = '双耳耳垂小巧佩戴 @图片1 所示耳饰（脖颈光洁无项链，手腕光洁无手镯）';
    } else if (anatomy === 'hairpin') {
      defaultAcc = '温婉饱满低发髻横插 @图片1 所示发簪（脖颈光洁无项链，手腕光洁无手镯）';
    }
    const acc = accessory && /@图片\s*1/.test(accessory) ? accessory : defaultAcc;
    top = top || '与商品调性匹配的简洁上装';
    bottom = bottom || '干净利落的下装';
    shoes = shoes || '简约鞋履';
    return {
      top,
      bottom,
      shoes,
      accessory: acc,
      summary: summary || `${top}·${bottom}·${shoes}·${acc}`,
    };
  }

  if (role === 'placed_object') {
    return {
      top: '',
      bottom: '',
      shoes: '',
      accessory: '',
      summary: summary || '商品陈设以 @图片1 为准',
    };
  }

  // held_object：服饰可自拟，但禁止把商品写成脖子佩戴；商品仅 @图片1
  if (accessory && /脖子佩戴|项链/.test(accessory) && !/@图片\s*1/.test(accessory)) {
    accessory = '无抢镜配饰';
  }
  return {
    top: top || '与商品调性匹配的简洁上装',
    bottom: bottom || '干净利落的下装',
    shoes: shoes || '简约鞋履',
    accessory: accessory || '无抢镜配饰',
    summary:
      summary ||
      `${top || '简洁上装'}·${bottom || '简洁下装'}·${shoes || '简约鞋履'}·手持 @图片1 所示商品`,
  };
}

export function joinLookSummary(
  parts?: OriginalLookParts,
  lookBible?: string,
  role: OriginalProductRole = 'held_object'
): {
  top: string;
  bottom: string;
  shoes: string;
  accessory: string;
  summary: string;
} {
  const sanitized = sanitizeLookPartsForProductRole(parts, lookBible, role);
  return {
    top: sanitized.top || '',
    bottom: sanitized.bottom || '',
    shoes: sanitized.shoes || '',
    accessory: sanitized.accessory || '',
    summary: sanitized.summary || '',
  };
}

/**
 * 生图前冲突清洗：去掉易压过 @图片1 的自造服饰颜色句，并强制补商品槽声明
 * 注意：不处理【…守卫】块，避免误伤 productFingerprint（如「蓝色牛津衬衫」）
 */
export function scrubOriginalPromptProductConflicts(
  prompt: string,
  role: OriginalProductRole
): string {
  if (!prompt) return prompt;
  // 拆出守卫块，只清洗正文
  const guards: string[] = [];
  let text = prompt.replace(/【[^】]+】[^【]*/g, (m) => {
    guards.push(m.trim());
    return ' ';
  });
  if (role === 'worn_apparel') {
    text = text.replace(
      /(?![^；;]*@图片\s*1)[^；;]*(白色|黑色|蓝色|红色|粉色|米色|灰色)[^；;]*(T恤|t恤|衬衫|衬衣|外套|卫衣|毛衣)[^；;]*/gi,
      '穿着 @图片1 所示服装'
    );
  } else if (role === 'worn_accessory') {
    // 彻底杜绝全品类珠宝首饰「戴着又额外手拿」的穿帮
    text = text.replace(
      /(手持|手拿|手中拿着|双手捧着|双手捧|拿着|手握|手提)\s*(@图片\s*1|商品|手镯|手链|首饰|饰品|玉镯|手串|手表|项链|锁骨链|吊坠|戒指|耳环|耳钉)/g,
      '自然互动展露佩戴的 @图片1'
    );
    text = text.replace(/坐姿捧物置于膝上/g, '坐姿双手自然交叠搭在膝头展露佩戴的 @图片1');
    text = text.replace(/一手轻托商品靠近胸口/g, '一手自然轻抚锁骨或手腕佩戴的 @图片1');
    text = text.replace(
      /(?![^；;]*@图片\s*1)[^；;]*(手链|手镯|项链|戒指|耳环|包包|腕表|鞋)[^；;]*/gi,
      '佩戴 @图片1 所示商品'
    );
  }
  if (!/@图片\s*1/.test(text)) {
    if (role === 'worn_apparel') {
      text = `穿着 @图片1 所示服装；${text}`;
    } else if (role === 'worn_accessory') {
      text = `佩戴/使用 @图片1 所示商品；${text}`;
    } else if (role === 'held_object') {
      text = `手持 @图片1 所示商品；${text}`;
    }
  }
  text = `${text} ${guards.join(' ')}`;
  return text.replace(/\s{2,}/g, ' ').trim();
}
