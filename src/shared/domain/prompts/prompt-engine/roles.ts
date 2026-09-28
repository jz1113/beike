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

/**
 * 判断穿搭描述是否为无效/泛化占位词或非服装名词
 */
export function isGenericLook(text?: string | null): boolean {
  if (!text) return true;
  const s = text.trim();
  if (s.length === 0) return true;
  if (/^(?:与商品调性匹配的简洁上装|协调上装|简洁上装|简约上装|协调下装|干净利落的下装|简约下装|简洁下装|简约鞋履|无抢镜配饰|商品陈设以\s*@图片\s*1\s*为准|佩戴\/使用\s*@图片\s*1\s*所示商品)$/.test(s)) return true;
  // 非具体服装词或抽象摄影/形态词拦截（杜绝提取出“轮廓”、“面向”等）
  if (/^(?:轮廓|面向|姿态|全身|半身|神态|镜头|画面|构图|比例|光影|视角|衣服|服装|穿搭|服饰|造型|搭配|外貌|细节)$/.test(s)) return true;
  if (/^(?:高级显白质感私服穿搭|质感私服穿搭|显白穿搭|私服穿搭|日常穿搭|质感穿搭)$/.test(s)) return true;
  return false;
}

/**
 * 从可能包含九段式反推标签的提示词中，精准提炼纯粹的肢体动作/姿态段落
 * 彻底剔除【主体】【穿搭或物体细节】【场景结构】【光影】【构图镜头】【材质与真实感】【画质与限制】
 */
export function extractPureActionFromPrompt(rawText?: string | null): string {
  if (!rawText) return '';
  const text = rawText.trim();
  if (!text) return '';

  // 1. 如果包含明确的【动作或摆放】/【肢体动作】/【姿态动作】/【动作】标签
  const match = text.match(/【(?:动作或摆放|肢体动作|姿态动作|姿势动作|动作)】\s*([^【】]+)/);
  if (match && match[1]?.trim()) {
    let actionSeg = match[1].trim();
    // 清洗动作段落末尾可能被模型误带入的背景/环境描述
    actionSeg = actionSeg.replace(/(?:背景|后方|后景|前方|地面|脚下|墙面|门前|室内|室外)[^，。；;\n]*(?:外墙|檐板|木板|门|窗|地板|路面|街道|石阶|柱|树|花|玻璃门|窗帘)[^。；;\n]*[。；;]?/gi, '');
    return actionSeg.trim();
  }

  // 2. 如果包含其他九段式标签但未命中动作标签，去除所有【...】段落
  if (/【(?:主体|发型与面部|穿搭或物体细节|场景结构|光影|构图镜头|材质与真实感|画质与限制)】/.test(text)) {
    const stripped = text
      .replace(/【(?:主体|发型与面部|穿搭或物体细节|场景结构|光影|构图镜头|材质与真实感|画质与限制)】[^【】]*/g, '')
      .replace(/【[^】]+】/g, '')
      .trim();
    if (stripped.length >= 4) {
      return stripped;
    }
  }

  return text;
}

/**
 * 纯净化动作描述：从动作文本中彻底剥离夹带的具体服饰私货与孤立地点词
 * （如“彩条背心百褶裙”、“亮片花朵薄纱裤套装”、“白色镂空雕花短裤套”、“在石柱旁”、“在咖啡馆”）
 * 保证 Action 资产仅关注机位、景别、肢体姿态与商品互动，将服装完全交由 Outfit 规范接管，空间交由 Scene 接管
 */
export function stripGarmentsAndLocationsFromAction(actionText: string, fallbackIdx = 0): string {
  if (!actionText) return '人物身体自然放松，神态松弛真实，目光柔和注视镜头';
  
  const FALLBACK_POSTURES = [
    '人物身体自然放松，一手轻托下颌，神态恬静温和，目光自然注视镜头',
    '身体自然侧坐，微微侧身回眸微笑，发丝自然垂落，神态松弛灵动',
    '双手自然交叠置于身前，姿态优雅端庄，眼神清澈与镜头交流',
    '一手自然微挽耳畔发丝，身体微微前倾，面带柔和浅笑，神态生活感十足',
    '身体自然倚坐，一手随意搭在桌畔，姿态慵懒松弛，神态温婉自然',
  ];

  // 优先从九段式或多标签结构中提纯动作正文
  let text = extractPureActionFromPrompt(actionText);

  text = text
    // 0. 去除常见开头模特声明（东亚模特，/年轻女性，/模特）
    .replace(/^(?:东亚模特|中国模特|年轻女性|模特|女性|人物)[，,\s]*/gi, '')
    // 1. 剔除混入动作的独立背景环境从句（如木屋檐板、拉毛墙面、做旧实木地板等）
    .replace(/(?:背景上方为|背景为|后方衬以|后方立着|右侧立着|左侧立着|复古田园风木屋门前|脚下为|地面为|墙面镶嵌)[^。；;\n]*[。；;]?/gi, '')
    // 2. 常见穿搭声明（身穿/搭配/内搭/下穿/着装等）
    .replace(/(?:身着|身穿|穿着|穿搭|搭配|套着|裹着|内搭|外搭|下穿|下着|上身穿|上着)(?:一件|一套|一条|身)?[^，。；;\n]*(?:夹克|大衣|风衣|外套|西装|开衫|衬衫|卫衣|T恤|针织衫|毛衣|马甲|背心|吊带|连衣裙|长裙|短裙|百褶裙|蓬蓬裙|马面裙|短裤|长裤|牛仔裤|阔腿裤|套装|裙装|裤装|运动鞋|单鞋|皮鞋|乐福鞋|围巾|丝巾|披肩|发带|头巾|堆堆袜|袜子)[^，。；;\n]*/gi, '')
    // 3. 具体衣物款式词与修饰短语
    .replace(/(?:彩条|条纹|印花|碎花|花朵|亮片|镂空|雕花|蕾丝|真丝|雪纺|薄纱|棉麻|针织|软糯|透气|挂脖|无袖|微落肩|落肩|小立领|盘扣|吊带|短袖|长袖|高腰|直筒|细褶|百褶|层叠|拼接|花边|纯色)?\s*(?:背心|马甲|衬衫|开衫|上衣|短外套|长外套|风衣|羽绒服|卫衣|T恤|连衣裙|长裙|短裙|百褶裙|蓬蓬裙|马面裙|短裤|长裤|牛仔裤|阔腿裤|薄纱裤|短裤套|裤装套|短裤装|短裤|套装|裙装|裤装|纱巾|披肩|发带|头巾|衣物|服饰|装套|套)/gi, '')
    // 4. 伴随性独立包袋/配饰从句
    .replace(/(?:系有|系着|系|围着|手持|手握|手拿|手提|肩挎|单肩挂|挂有|背着|挎着|拿着|搭配)[^，。；;\n]*(?:围巾|薄荷绿围巾|浅绿围巾|绿色围巾|薄纱围巾|丝巾|披肩|头巾|发带|包|绿包|手袋|皮包|手提包|小包|背包|肩带|耳环|贝壳耳环|耳饰|包带|布包)/gi, '')
    .replace(/(?:绿包|手袋|皮包|手提包|小包|背包|肩带|贝壳耳环|大耳环|布包|单肩包)[，,\s]*/gi, '')
    // 5. 首饰私货词（防止动作夹带旧首饰）
    .replace(/(?:胸前挂|颈部佩戴|颈间佩戴|手戴|手腕戴|佩戴|戴有|戴着)[^，。；;\n]*(?:项链|锁骨链|吊坠|手链|手串|手镯|手圈|戒指|耳环|耳饰|耳钉|发饰|串珠颈圈)/gi, '')
    // 6. 独立色彩+衣物名词
    .replace(/(?:深蓝|浅蓝|藏青|黑色|白色|纯白|米白|素白|浅米|灰色|灰蓝|薄荷绿|黄色|亮黄|墨绿|浅绿|淡青|竹青|黛青|粉色|紫调|红调|暖白)\s*(?:短夹克|夹克|外套|棉质外套|蕾丝裙|蓬蓬裙|短裙|长裙|白裙|围巾|薄荷绿围巾|浅绿围巾|运动鞋|黄色运动鞋|单鞋|堆堆袜|套装|开衫|衬衫|花边套|短裤套|裙装|裤装|上衣|鞋履)/gi, '')
    // 7. 残留修饰词清理
    .replace(/服饰为内搭[。；;]?/g, '')
    .replace(/下穿灰色堆堆袜与[。；;]?/g, '')
    .replace(/下穿[^，。；;\n]*/g, '')
    .replace(/采用上下双画面叙事[^，。；;\n]*/g, '')
    // 8. 消除断头括号与语法畸变
    .replace(/（[，,\s]*/g, '（')
    .replace(/[，,\s]*）/g, '）')
    .replace(/（\s*）/g, '')
    .replace(/[，,]{2,}/g, '，')
    .replace(/^[，,。.；;\s]+/, '')
    .replace(/[，,。.；;\s]+$/, '')
    .trim();

  // 若清洗后剩余文本太短，采用优雅生活姿态兜底
  const hasPostureVerb = /(?:坐|站|倚|靠|走|眸|手|发|笑|看|望|头|身|姿|神|步|捧|抚|挽|抬|侧|凝|立|探|搭|托|撑|躺|卧|回|动|跑|行|提|拿|握|插|屈|迈)/.test(text);
  if (!text || text.length < 4 || (text.length < 15 && !hasPostureVerb) || /^(?:倚柱|斜坐|侧行|站姿|坐姿)$/.test(text)) {
    return FALLBACK_POSTURES[Math.abs(fallbackIdx) % FALLBACK_POSTURES.length];
  }

  return text;
}

export const stripGarmentsFromAction = stripGarmentsAndLocationsFromAction;

/**
 * 从提示词文本中智能提炼具体穿搭（提取上装、下装或全身裙装）
 */
export function extractOutfitFromPrompt(prompt: string): { top?: string; bottom?: string; full?: string } | null {
  if (!prompt) return null;
  const segments = prompt.split(/[；;]/).map(s => s.trim()).filter(Boolean);
  // 必须是具体的穿搭声明，排除“呈现服装轮廓”、“服饰质感”等非穿搭句
  const garmentRe = /(?:身着|身穿|穿着|穿搭|上身搭配|上身穿|服饰搭配|服装穿搭)[：:\s]*([^；;]+)/i;
  const nonGarmentHeadRe = /^(?:轮廓|面向|姿态|神态|全身|半身|镜头|画面|构图|比例|角度|透视|细节|光线|阴影|氛围)/;

  for (const seg of segments) {
    if (/@图片\s*1/.test(seg)) continue; // 跳过包含商品的槽位声明
    const m = seg.match(garmentRe);
    if (m && m[1]) {
      const outfitStr = m[1].replace(/^(?:一件|一套|一条|身)/, '').trim();
      if (nonGarmentHeadRe.test(outfitStr)) continue;
      if (!isGenericLook(outfitStr) && outfitStr.length >= 4) {
        // 尝试拆分上装与下装
        const subParts = outfitStr
          .split(/(?:[，,、\s]*(?:搭配|下穿|下着|下身穿|下身搭配)[，,、\s]*|[，,、\s]+配[，,、\s]*|[，,、\s]+)/)
          .map(s => s.trim())
          .filter(Boolean);
        if (subParts.length >= 2) {
          if (isGenericLook(subParts[0]) || nonGarmentHeadRe.test(subParts[0])) continue;
          if (isGenericLook(subParts[1]) || nonGarmentHeadRe.test(subParts[1])) {
            return {
              top: subParts[0],
              full: outfitStr,
            };
          }
          return {
            top: subParts[0],
            bottom: subParts[1],
            full: outfitStr,
          };
        }
        if (!isGenericLook(outfitStr) && !nonGarmentHeadRe.test(outfitStr)) {
          return {
            top: outfitStr,
            full: outfitStr,
          };
        }
      }
    }
  }
  return null;
}

/**
 * 珠宝配饰/项链防穿帮与物理防悬空校验：
 * 1. 项链/锁骨链/吊坠：强制正前方/45°侧前方并露出锁骨，严禁后背/越肩露背角度导致项链悬空画在后背；
 * 2. 彻底清除服饰上的胸针、相机/眼睛徽章、浮空贴纸等截屏/多模态残留穿帮工件。
 */
export function preventJewelryGlitches(prompt: string, productFingerprint?: string): string {
  if (!prompt) return prompt;
  let text = prompt;

  const fp = (productFingerprint || '').toLowerCase();
  const isHairpin = /发簪|步摇|簪|发饰|头饰|头花|hairpin/i.test(fp) || (!fp && /发簪|步摇|簪子|hairpin/i.test(prompt));
  const isNecklace = (/项链|锁骨链|吊坠|项圈|颈链|necklace|choker|pendant/i.test(fp) || (!fp && /项链|锁骨链|吊坠|necklace/i.test(prompt))) && !isHairpin;
  const isEarring = (/耳钉|耳环|耳饰|耳坠|earring/i.test(fp) || (!fp && /耳钉|耳环|耳饰|earring/i.test(prompt))) && !isHairpin && !isNecklace;
  const isBracelet = (/手镯|手链|手串|手绳|手表|腕表|bracelet|bangle/i.test(fp) || (!fp && /手镯|手链|手串|bracelet/i.test(prompt))) && !isHairpin && !isNecklace && !isEarring;
  const isRing = (/戒指|指环|对戒|钻戒|ring/i.test(fp) || (!fp && /戒指|指环|对戒|ring/i.test(prompt))) && !isHairpin && !isNecklace && !isEarring && !isBracelet;

  if (isHairpin) {
    // 🚨 发簪类：彻底清除脑补的脖子项链、耳环与手镯，清除披发直发，严格保证古典盘发与发间单一主体
    text = text
      .replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁无手镯，')
      .replace(/佩戴[^\s，；]*项链[，；]?/g, '')
      .replace(/佩戴[^\s，；]*吊坠[，；]?/g, '')
      .replace(/(?:锁骨项链|黄金项链|珍珠项链|颈间项链|细链条)/g, '')
      .replace(/(?:披散的长发|散落的直发|披肩长发|披肩发|披发|散发|直发)/g, '整洁挽起的饱满盘发发髻');
    if (!text.includes('古典饱满低盘发髻')) {
      text = `${text}；模特长发整齐盘起梳成温婉古典饱满低盘发髻/发包（严禁散乱披发，严禁直发垂发），@图片1 所示发簪长杆横向紧密插在盘好的发髻发包内部，簪首雕花镶嵌与垂坠流苏从发髻侧上方优雅探出并自然垂落，发簪在发丝间有真实的物理穿插固定受力与接触阴影，绝非悬浮或贴在直发表面；脖子与颈间彻底光洁（绝无任何项链/锁骨链/吊坠），双耳光洁（无耳饰），手腕光洁（无任何手镯/手链），全身严格仅此 1 件发间商品实物`;
    }
  } else if (isNecklace) {
    // 🚨 项链类：严禁项链出现在后背/越肩大露背视角，防止项链悬空画在背上
    text = text
      .replace(/(?:越肩(?:大)?露背|露背(?:后颈)?|后背视角|背部特写|后背特写|大露背|后颈抓拍|背影抓拍|背影|美背)/g, '正面微侧45°自然展露端庄领口与颈间项链')
      .replace(/从模特背后拍摄/g, '平视微仰角捕捉模特端庄优雅领口')
      .replace(/背对镜头/g, '微侧身面朝自然光')
      .replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁，')
      .replace(/手腕佩戴[^\s，；]*手镯[，；]?/g, '');

    // 强化项链自然垂坠与重力贴合规范（全面脱敏敏感词，用端庄领口正中替代胸前锁骨）
    if (!text.includes('符合人体工学重力') && !text.includes('项链自然贴合') && !text.includes('纯静物') && !text.includes('无人物')) {
      text = text.replace(
        /(@图片\s*1[^；;]*)/,
        '$1，项链吊坠自然垂坠贴合端庄领口正中（符合人体工学重力，绝无悬空或反向错位）'
      );
    }
    if (!text.includes('手腕光洁无手镯') && !text.includes('手腕光洁')) {
      text = `${text}；颈间佩戴 @图片1 所示项链，手腕光洁无手镯/手链，发间无发饰，耳垂无大耳环，全身严格仅此 1 条颈间项链吊坠实物`;
    }
  } else if (isEarring) {
    text = text
      .replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁，')
      .replace(/佩戴[^\s，；]*项链[，；]?/g, '');
    if (!text.includes('小巧贴耳') && !text.includes('贴耳')) {
      text = text.replace(/耳垂/g, '耳垂（小巧精致贴耳佩戴比例）');
    }
    if (!text.includes('脖子光洁无项链')) {
      text = `${text}；双耳耳垂佩戴 @图片1 所示耳饰（小巧精致贴耳比例），脖子光洁无项链，手腕光洁无手镯，发间无发饰，全身严格仅此 1 对耳饰实物`;
    }
  } else if (isBracelet) {
    text = text.replace(/佩戴[^\s，；]*项链[，；]?/g, '');
    text = text.replace(/(?:戴在右手|右手戴|右手手腕)/g, '左手手腕');
    if (!text.includes('左手手腕')) {
      text = `${text}；整套分镜严格统一佩戴在左手手腕（手链吊坠与串珠呈现1~1.5cm真实小巧物理尺寸，严禁夸张巨大化变形，严禁戴在右手），右手手腕光洁，脖子光洁无项链，耳垂无大耳环，全身严格仅此 1 条手链/手镯实物`;
    }
  } else if (isRing) {
    text = text.replace(/佩戴[^\s，；]*项链[，；]?/g, '');
    text = text.replace(/(?:大拇指|拇指|食指|小拇指|尾戒|右手戒指|戴在右手)/g, '左手无名指');
    text = text.replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁无手镯，');
    if (!text.includes('左手无名指')) {
      text = `${text}；整套分镜严格统一佩戴在左手无名指（真实1.6~1.8cm纤细戒圈尺寸，精巧贴合指节，严禁跨手指或左右手切换，严禁巨大化指虎），双手同框时右手手部光洁，手腕光洁无手镯，脖子光洁无项链，全身严格仅此 1 枚戒指实物`;
    }
  }

  // 🚨 彻底消灭胸口相机/眼睛图标、胸针徽章、标签贴纸残留
  text = text
    .replace(/(?:胸前|胸口|肩带|领口)(?:佩戴|带有|印有|装饰有)(?:相机|镜头|眼睛|徽章|胸针|图标|标签|贴纸|水印|Logo|logo)[^；;，,]*/g, '')
    .replace(/(?:带有|印有|装饰有)(?:相机徽章|眼睛图标|徽章|胸针|图案贴纸|水印|Logo|logo)[^；;，,]*/g, '')
    .replace(/胸前佩戴相机徽章与眼睛图标/g, '')
    .replace(/胸前装饰/g, '')
    .replace(/衣服上的图案/g, '纯色极简面料');

  return text.replace(/[；;]{2,}/g, '；').replace(/\s{2,}/g, ' ').trim();
}

/**
 * 小红书博主多元时尚穿搭智能推断库（根据人群受众、商品风格与场景上下文有机匹配，绝不使用单一固定模板）
 */
export function resolveDiverseDefaultOutfit(productFingerprint = '', contextText = ''): { top: string; bottom: string } {
  const text = `${productFingerprint} ${contextText}`.toLowerCase();

  // 1. 男士品类
  if (/男士|男款|男表|男戒|男装|扳指|皮带|打火机|men/i.test(text)) {
    const menOutfits = [
      { top: '极简深灰重磅落肩纯棉T恤', bottom: '垂感黑色直筒休闲西裤' },
      { top: '随性微敞领口深蓝亚麻衬衫', bottom: '浅卡其直筒休闲裤' },
      { top: '质感酷飒炭灰色休闲西装内搭白T', bottom: '深色修身牛仔裤' },
      { top: '极简黑白拼色运动卫衣', bottom: '黑色束脚运动休闲裤' },
    ];
    const idx = Math.abs(hashCode(text)) % menOutfits.length;
    return menOutfits[idx];
  }

  // 2. 宝宝/儿童/母婴品类
  if (/宝宝|儿童|婴儿|小童|新生儿|长命锁|童镯|婴儿手绳|母婴|baby|kid/i.test(text)) {
    const babyOutfits = [
      { top: '纯棉软糯米白连体爬服', bottom: '柔软纯棉连体裤脚' },
      { top: '温柔鹅黄色婴儿纯棉小哈衣', bottom: '纯棉小短裤' },
      { top: '淡雅浅蓝纯棉透气婴儿服', bottom: '纯棉婴儿裤' },
      { top: '喜庆红色中式刺绣小肚兜与纯棉小衫', bottom: '纯棉红短裤' },
    ];
    const idx = Math.abs(hashCode(text)) % babyOutfits.length;
    return babyOutfits[idx];
  }

  // 3. 旅行度假/海滨/户外风格（端庄防走光、得体显白）
  if (/海边|沙滩|海岛|度假|旅行|露营|草坪|户外|湖畔|雪山|栈道|travel|resort|vacation/i.test(text)) {
    const travelOutfits = [
      { top: '法式小方领浅米色透气亚麻长裙', bottom: '飘逸垂坠长裙摆' },
      { top: '慵懒轻薄棉麻白衬衫（微敞第一颗纽扣自然展露锁骨）', bottom: '浅蓝高腰直筒牛仔裤' },
      { top: '温柔落日色优雅小方领长裙', bottom: '浪漫飘逸裙身' },
      { top: '户外随性工装风短袖衬衫内搭纯白圆领T恤', bottom: '卡其色宽松工装休闲裤' },
    ];
    const idx = Math.abs(hashCode(text)) % travelOutfits.length;
    return travelOutfits[idx];
  }
  
  // 4. 黄金/古法/玉石类（优雅端庄、质感显白）
  if (/黄金|足金|金镯|古法|金条|金手镯|玉镯|翡翠|和田玉|南红|玛瑙/i.test(text)) {
    const goldOutfits = [
      { top: '软糯慵懒奶油白圆领马海毛开衫', bottom: '复古高腰直筒微喇牛仔裤' },
      { top: '法式复古小方领微落肩针织上衣', bottom: '垂感高腰黑色阔腿裤' },
      { top: '极简黑色正肩圆领打底衫外搭轻薄开衫', bottom: '垂坠黑色直筒长裤' },
      { top: '温柔燕麦色小圆领羊绒针织衫', bottom: '浅卡其直筒休闲西裤' },
    ];
    const idx = Math.abs(hashCode(text)) % goldOutfits.length;
    return goldOutfits[idx];
  }

  // 5. 珍珠/仙气/细链类（清透温婉、端庄防走光）
  if (/珍珠|淡水珠|澳白|大溪地|母贝|碎银|仙气|锁骨链|吊坠/i.test(text)) {
    const pearlOutfits = [
      { top: '慵懒宽松男友风微挺括白衬衫（端庄露出锁骨正中）', bottom: '浅蓝高腰直筒牛仔裤' },
      { top: '法式优雅复古小方领平口长裙', bottom: '垂感雪纺半身长裙' },
      { top: '温柔鹅黄色小圆领针织开衫', bottom: '白色直筒牛仔裤' },
      { top: '优雅小方领泡泡袖法式小衫', bottom: '深色高腰阔腿西裤' },
    ];
    const idx = Math.abs(hashCode(text)) % pearlOutfits.length;
    return pearlOutfits[idx];
  }

  // 6. 钻石/彩宝/高奢珠宝类（端庄高级、名媛质感）
  if (/钻石|莫桑|彩宝|红宝石|蓝宝石|祖母绿|高奢|宴会/i.test(text)) {
    const luxuryOutfits = [
      { top: '高级质感小方领丝绒小黑裙', bottom: '修身垂坠长裙摆' },
      { top: '轻奢小香风粗花呢外套内搭极简纯白圆领打底衫', bottom: '高腰黑色西装长裤' },
      { top: '极简黑白拼色法式端庄长裙', bottom: '优雅修身裙身' },
      { top: '优雅缎面正肩微立领衬衫（自然展露锁骨项链）', bottom: '高腰垂感西装长裤' },
    ];
    const idx = Math.abs(hashCode(text)) % luxuryOutfits.length;
    return luxuryOutfits[idx];
  }

  // 7. 现代极简/中性/日常配饰
  const casualChicOutfits = [
    { top: '酷飒 Oversized 灰调休闲西装内搭纯白圆领T恤', bottom: '高腰直筒牛仔裤' },
    { top: '随性轻薄男友风白衬衫（领口自然展露锁骨项链）', bottom: '黑色垂感阔腿裤' },
    { top: '法式慵懒黑白条纹小圆领针织衫', bottom: '深蓝色高腰直筒牛仔裤' },
    { top: '极简修身纯黑小方领打底衫', bottom: '高腰浅灰直筒西裤' },
  ];
  const idx = Math.abs(hashCode(text || 'default')) % casualChicOutfits.length;
  return casualChicOutfits[idx];
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * 组内穿搭强一致性强制执行：
 * 保证同一套人物组图中的所有分镜，服饰（款型、材质、配色）完全严格锁定为首镜或规范 lookParts，
 * 绝不允许各分镜自由发挥导致中途换衣服（如分镜1穿条纹针织衫，分镜3突变米色衬衫）。
 */
export function enforceLookConsistency(
  prompt: string,
  canonicalLook?: { top?: string; bottom?: string; shoes?: string; summary?: string } | string | null,
  role: OriginalProductRole = 'worn_accessory',
  productFingerprint?: string
): string {
  if (!prompt) return prompt;
  if (role === 'placed_object') return prompt;

  const lookObj = typeof canonicalLook === 'string' ? { summary: canonicalLook, top: canonicalLook } : canonicalLook;
  let standardTop = (lookObj?.top || lookObj?.summary || '').trim();
  let standardBottom = (lookObj?.bottom || '').trim();

  // 若传入的 canonicalLook 缺失或为泛化占位符，先尝试从 prompt 原文中提取丰富自拟穿搭
  if (!standardTop || isGenericLook(standardTop)) {
    const existing = extractOutfitFromPrompt(prompt);
    if (existing?.top && !isGenericLook(existing.top)) {
      standardTop = existing.top;
      standardBottom = existing.bottom || '高腰直筒深色牛仔裤';
    } else {
      const dynamicOutfit = resolveDiverseDefaultOutfit(productFingerprint, prompt);
      standardTop = dynamicOutfit.top;
      standardBottom = dynamicOutfit.bottom;
    }
  }

  // 构造标准穿搭短句
  const standardLookPhrase = standardBottom
    ? `身穿${standardTop}，搭配${standardBottom}`
    : `身穿${standardTop}`;

  // 拆分分号段落，查找并替换掉描写服装/穿搭的段落
  const segments = prompt.split(/[；;]/).map(s => s.trim()).filter(Boolean);
  let lookReplaced = false;

  const garmentKeywordRe = /(?:身着|身穿|穿着|穿搭|上身搭配|上身穿|下身穿|搭配|上衣|下装|上装|针织衫|背心|衬衫|衬衣|西装|外套|卫衣|毛衣|马甲|海魂衫|开衫|短袖|T恤|牛仔裤|西裤|阔腿裤|百褶裙|半身裙|伞裙|连衣裙|吊带|抹胸|背带裤)/i;

  const updatedSegments = segments.map(seg => {
    // 若包含商品 @图片1 且为 worn_apparel，保留服装槽位声明
    if (/@图片\s*1/.test(seg) && role === 'worn_apparel') {
      return seg;
    }
    // 若包含配饰 @图片1，不作为普通服装段替换
    if (/@图片\s*1/.test(seg) && role === 'worn_accessory') {
      return seg;
    }
    // 若命中服装穿搭段，统一替换为标准穿搭；多余的零碎服装段直接清除，杜绝冲突残留
    if (garmentKeywordRe.test(seg)) {
      if (!lookReplaced) {
        lookReplaced = true;
        return standardLookPhrase;
      }
      // 多余服装段直接剥离
      return '';
    }
    // 即使该段是动作段（如“肢体动作：...”），也必须剥离其中夹带的私货衣服，防止动作段覆盖主穿搭
    if (seg.includes('动作') || seg.includes('姿态') || seg.includes('奔跑') || seg.includes('走廊') || seg.includes('漫步')) {
      return stripGarmentsFromAction(seg);
    }
    return seg;
  }).filter(Boolean);

  // 如果原本没有单独的服装段，且人物出镜，则安全补入
  if (!lookReplaced && standardTop) {
    // 插入在人物主体之后或开头
    const insertIdx = updatedSegments.findIndex(s => s.includes('东亚女性') || s.includes('女生') || s.includes('模特') || s.includes('人物') || s.includes('博主'));
    if (insertIdx >= 0) {
      updatedSegments.splice(insertIdx + 1, 0, standardLookPhrase);
    } else {
      updatedSegments.push(standardLookPhrase);
    }
  }

  return preventJewelryGlitches(updatedSegments.join('；'), productFingerprint);
}

/** 从一组 prompts 中提取首镜权威穿搭 */
export function extractCanonicalOutfitFromPrompts(
  prompts: Array<{ prompt?: string; has_human?: boolean }>,
  productFingerprint?: string
) {
  const firstHuman = prompts.find(p => p.has_human !== false && p.prompt);
  if (firstHuman?.prompt) {
    const extracted = extractOutfitFromPrompt(firstHuman.prompt);
    if (extracted?.top && !isGenericLook(extracted.top)) {
      return {
        top: extracted.top,
        bottom: extracted.bottom || '高腰直筒深色牛仔裤',
        shoes: '黑色复古乐福鞋',
        accessory: '佩戴 @图片1 所示商品'
      };
    }
  }
  return resolveDiverseDefaultOutfit(productFingerprint);
}
