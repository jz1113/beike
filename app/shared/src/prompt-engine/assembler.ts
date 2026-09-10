/**
 * 原创实拍提示词组装与四大母本分镜级拼装引擎
 */

import {
  type OriginalProductRole,
  type OriginalGroupBible,
  type OriginalShotFields,
  normalizeOriginalProductRole,
  detectJewelryAnatomy,
  getJewelryAnatomyStatement,
  joinLookSummary,
  scrubOriginalPromptProductConflicts,
  enforceLookConsistency,
  stripGarmentsFromAction,
  preventJewelryGlitches,
} from './roles';
import { getOriginalDiversityForShot } from './storyboard';
import { cleanPromptText, ensureReplicationPromptSlots, softenReplicationSafetyWording, harmonizeOriginalPrompt } from './guards';
import { sanitizeScenePrompt } from '../assetDeconstruct/sanitize';

/**
 * 拼装单个原创分镜提示词（支持大模型反推生成的完整 8 段式提示词，维护真实摄影风格）
 */
export function assembleOriginalShotPrompt(
  bible: OriginalGroupBible,
  shot: OriginalShotFields,
  options?: { hasFace?: boolean; hasSceneAnchor?: boolean }
): string {
  const hasHuman = shot.has_human !== false;
  const hasFace = Boolean(options?.hasFace) && hasHuman;
  const shotNo = shot.shot_no || 1;
  const productRole = normalizeOriginalProductRole(
    bible.productRole,
    bible.productFingerprint
  );

  // 1. 优先：如果该分镜已具备大模型生成的完整 8 段式 Prompt，深度保护并透传
  const rawFallback = (shot.promptFallback || '').trim();
  const hasRichPrompt = rawFallback.length >= 50 && (
    rawFallback.includes('；') || 
    rawFallback.includes('mm') || 
    rawFallback.includes('特写') || 
    rawFallback.includes('景深') || 
    rawFallback.includes('光影')
  );

  if (hasRichPrompt) {
    let cleanRichPrompt = cleanPromptText(rawFallback);
    cleanRichPrompt = preventJewelryGlitches(cleanRichPrompt, bible.productFingerprint);
    cleanRichPrompt = enforceLookConsistency(cleanRichPrompt, bible.lookBible);

    const harmonized = harmonizeOriginalPrompt(cleanRichPrompt, {
      productFingerprint: bible.productFingerprint,
      action: shot.action,
      angle: shot.angle,
      scene: bible.masterScene,
    });

    return ensureOriginalPromptSlots(harmonized.prompt, {
      hasHuman,
      hasFace,
      hasSceneAnchor: options?.hasSceneAnchor,
      masterScene: bible.masterScene,
      identityBible: bible.identityBible,
      lookBible: bible.lookBible,
      productRole,
      productFingerprint: bible.productFingerprint,
    });
  }

  // 2. 无预置长提示词时，基于母本架构与分镜字段组装
  const look = joinLookSummary(bible.lookParts, bible.lookBible, productRole);
  const anatomy = detectJewelryAnatomy(productRole, bible.productFingerprint);
  const anatomyStmt = getJewelryAnatomyStatement(anatomy);

  const diversity = getOriginalDiversityForShot(shotNo, productRole, bible.masterScene);

  const scenePart = (bible.masterScene || '').trim() || '高质感真实生活美学空间';
  const cleanScene = sanitizeScenePrompt(scenePart);

  let identityPart = (bible.identityBible || '').trim() || '高颅顶蓬松法式微卷发、清澈灵动眼眸与极富感染力自然笑颜的年轻东亚时尚博主（真实原生皮肤微肌理，细微毛孔呼吸感与自然微红润血色，原生野生眉毛流感清晰，唇色自然清透，发际线有真实微绒毛，神态松弛自然，绝无塑料磨皮与果冻假人感，极具生活温度）';
  if (anatomy === 'hairpin') {
    identityPart = `${identityPart}，长发整齐挽起梳成优雅饱满的温婉古典低盘发髻/发包（严禁散乱披发，@图片1 发簪长杆横向紧密穿插在盘好的发髻内部）`;
  }

  let actionText = (shot.action || '').trim() || diversity.action;
  actionText = stripGarmentsFromAction(actionText, shotNo - 1);

  // 首饰类目动作收敛与消歧
  const harmonizedAction = harmonizeOriginalPrompt(actionText, {
    productFingerprint: bible.productFingerprint,
    action: actionText,
    angle: shot.angle,
    scene: cleanScene,
  });
  actionText = harmonizedAction.action;

  let cameraText = (shot.camera_focal_length || '').trim();
  let angleText = (shot.angle || '').trim();
  const isJewelry = ['bracelet', 'ring', 'necklace', 'earring', 'hairpin', 'jewelry'].includes(anatomy);
  
  if (isJewelry) {
    // 🌟 首饰类目专属近景转换器：第 1 镜强制微距/近景，第 2~4 镜强制 85-100mm 中近景特写，彻底杜绝全身中远景与商品过小
    if (shotNo === 1 || /微距|特写|近景/i.test(actionText) || /微距|特写|近景/i.test(angleText)) {
      if (anatomy === 'bracelet') {
        cameraText = 'iPhone 85mm-100mm f/2.8 手腕特写与中近景镜头（Tight Wrist Close-Up Frame）';
        angleText = '平视或微俯角手腕局部特写，单侧手腕置于黄金分割中心，手镯清晰占据画面 40%~60% 核心面积，严禁全身/远景';
      } else if (anatomy === 'necklace') {
        cameraText = 'iPhone 85mm f/2.2 端庄领口与锁骨近景肖像镜头（Tight Bust-Up Portrait）';
        angleText = '胸部以上端庄领口与锁骨自拍近景，项链吊坠位于画面视觉中心（40%~60% 面积），严禁全身/远景';
      } else if (anatomy === 'hairpin') {
        cameraText = 'iPhone 100mm f/2.8 侧后方发髻超清微距镜头（Hairpin Macro Frame）';
        angleText = '45°侧颜与低发髻微距特写，发簪占据画面 40%~60% 视觉中心，严禁正面遮挡，严禁全身';
      } else if (anatomy === 'earring') {
        cameraText = 'iPhone 100mm f/2.8 侧颜耳际超清微距特写镜头（Earring Macro Frame）';
        angleText = '45°侧颜耳部局部特写，耳饰位于核心焦点（35%~55% 面积），严禁全身';
      } else if (anatomy === 'ring') {
        cameraText = 'iPhone 100mm f/2.8 手指超清微距特写镜头（Ring Macro Frame）';
        angleText = '手部自然舒展搭在桌畔，戒指占据画面 40%~60% 核心视觉焦点，严禁全身';
      } else {
        cameraText = 'iPhone 100mm f/2.8 超清微距特写镜头（Tight Close-Up Frame）';
        angleText = '局部中近景特写，首饰占据画面 40%~60% 核心面积，严禁全身/远景';
      }
    } else {
      // 第 2~4 镜：保留生动生活动作，但强制推近镜头至 85mm 人像中近景/胸部以上肖像/手腕局部
      if (cameraText.includes('超广角') || cameraText.includes('全景镜头') || cameraText.includes('24mm') || cameraText.includes('35mm')) {
        cameraText = 'iPhone 85mm f/2.0 人像中近景镜头（Medium Close-Up Portrait）';
      }
      if (angleText.includes('全景') || angleText.includes('远景') || angleText.includes('全身') || !angleText) {
        if (anatomy === 'bracelet' || anatomy === 'ring') {
          angleText = '中近景半身坐姿抓拍，佩戴首饰的手部/手腕自然抬起或搭在桌面，手部与首饰清晰处于画幅焦点';
        } else if (anatomy === 'necklace') {
          angleText = '胸部以上端庄近景半身肖像，颈间项链居中清晰受光';
        } else {
          angleText = '45°侧颜半身近景抓拍，首饰佩戴部位清晰展示';
        }
      }
    }
  }

  const segments: string[] = [];

  // 主体与商品
  if (hasHuman) {
    segments.push(`主体：${identityPart}`);
    segments.push(`服装穿搭：${look.summary || '高级显白质感私服穿搭'}`);
    segments.push(`商品佩戴与展示：${anatomyStmt} @图片1 所示商品（外观与材质细节100%以 @图片1 为准，画面中仅佩戴1件实物）`);
  } else {
    segments.push(`画面主体：@图片1 所示商品实物，外观与材质细节100%以 @图片1 为准`);
  }

  // 场景与采光
  segments.push(`拍摄场景：${cleanScene}`);

  // 🌟 同套图空间与穿搭强锚定（确保 4 个分镜严格在同一环境、同一套穿搭）
  const cleanSceneTitle = cleanScene.split(/[，,。\s]/)[0] || '生活置景空间';
  const cleanOutfitSummary = (look.summary || '质感显白私服').split(/[，,。\s]/)[0] || '质感私服';
  segments.push(`空间与穿搭连贯性：【同一置景空间连续抓拍】严格保持在【${cleanSceneTitle}】同一真实空间与物理光影下，同一位模特身穿同一套【${cleanOutfitSummary}】，仅机位角度与生活动作变化，物理光线方向严格一致`);

  segments.push(`动作姿态：${actionText}`);

  if (angleText) {
    segments.push(`机位构图：${angleText}`);
  }
  if (cameraText) {
    segments.push(`镜头光圈：${cameraText}`);
  }

  if (shot.expression) {
    segments.push(`神态表情：${shot.expression}`);
  }

  // 🌟 AI 视觉多模态深度分析提炼出的微观实物细节、受光焦点与动作微调
  if (shot.promptFallback && shot.promptFallback.trim().length >= 10) {
    const refinedDetail = cleanPromptText(shot.promptFallback.trim());
    segments.push(`AI视觉实物光影与抓拍精修：${refinedDetail}`);
  }

  // 光学与摄影质感
  const stylePart = (bible.styleBible || '').trim() || 'Shot on iPhone 16 Pro 原相机抓拍（Unedited RAW 35mm photograph, natural candid snapshot），小红书真实博主生活随拍质感，零美颜零滤镜。真实环境漫射采光与自然物理接触阴影（Realistic Ambient Daylight, Soft Contact Shadows），人物皮肤呈现真实微观肌理与微毛孔呼吸感，渐进式真实光学自然景深（Progressive optical depth of field），首饰呈现真实物理金属高光与反光，严格杜绝 3D 渲染感、塑料磨皮与假人CG感（Strictly NO plastic skin, NO airbrushing, NO 3D CGI rendering, NO fake glow）';
  segments.push(`摄影画质：${stylePart}`);
  segments.push('画面构图铁律：单张独立全画幅完整摄影（Single cohesive photograph, full-bleed），严禁拼图、严禁双格对比、严禁四宫格、严禁多面板（Strictly NO collage, NO multi-panel, NO split screen），主体完整饱满');
  if (hasHuman) {
    segments.push('人体结构解剖学铁律：严格遵循真实人类生理骨骼解剖学，严格仅有正常两只手臂与双手（Strictly anatomically correct, exactly two arms, natural realistic limbs, NO extra arms, NO three arms, NO mutated hands, NO disconnected limbs），双臂动作自然舒展，绝无第三只手臂与悬空多余肢体');
  }

  let fullPrompt = segments.join('；');
  fullPrompt = preventJewelryGlitches(fullPrompt, bible.productFingerprint);
  fullPrompt = enforceLookConsistency(fullPrompt, bible.lookBible);

  const finalHarmonized = harmonizeOriginalPrompt(fullPrompt, {
    productFingerprint: bible.productFingerprint,
    action: actionText,
    angle: shot.angle,
    scene: cleanScene,
  });

  return ensureOriginalPromptSlots(finalHarmonized.prompt, {
    hasHuman,
    hasFace,
    hasSceneAnchor: options?.hasSceneAnchor,
    masterScene: bible.masterScene,
    identityBible: bible.identityBible,
    lookBible: bible.lookBible,
    productRole,
    productFingerprint: bible.productFingerprint,
  });
}

/**
 * 确保原创提示词具备标准的槽位声明与防冲突过滤
 */
export function ensureOriginalPromptSlots(
  prompt: string,
  options?: {
    hasHuman?: boolean;
    hasFace?: boolean;
    hasSceneAnchor?: boolean;
    masterScene?: string;
    identityBible?: string;
    lookBible?: string;
    productRole?: OriginalProductRole;
    productFingerprint?: string;
  }
): string {
  if (!prompt) return prompt;

  let text = prompt
    .replace(/【(?:画面|图中|展示|参考|背景|镜头|场景|人物|模特|发型)[^】]*】/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasHuman = options?.hasHuman !== false;
  const hasFace = Boolean(options?.hasFace);
  const role = normalizeOriginalProductRole(options?.productRole, options?.productFingerprint);

  const anatomy = detectJewelryAnatomy(options?.productRole, options?.productFingerprint);
  const isMacroShot = /微距|局部特写|细节特写|近景特写|首饰微距特写|特写近景|放大细节/i.test(text);
  const hasProductContext = Boolean(options?.productRole || options?.productFingerprint);
  if (!/@图片\s*1/.test(text) && hasProductContext) {
    if (role === 'worn_apparel') {
      text = `穿着 @图片1 所示服装，外观100%以 @图片1 为准；${text}`;
    } else if (role === 'worn_accessory') {
      const macroFocus = isMacroShot ? '，100mm f/2.8 极近微距浅景深精准对焦锁定 @图片1 细节，商品占据画面 60%~75% 核心视觉焦点，呈现金属反光与微观做工' : '，佩戴部位显著前置于离镜头最近的第一超清焦平面，呈现材质工艺细节，绝无脱焦虚化';
      const purityRule = anatomy === 'bracelet'
        ? '，脖颈光洁无项链'
        : anatomy === 'necklace'
        ? '，手腕光洁无手镯'
        : anatomy === 'earring'
        ? '，脖颈与手腕光洁'
        : '，严禁多余首饰';
      text = `佩戴 @图片1 所示首饰，外观与材质细节100%以 @图片1 为准${macroFocus}${purityRule}；${text}`;
    } else {
      text = `画面主体为 @图片1 所示商品实物，外观100%以 @图片1 为准；${text}`;
    }
  } else if (role === 'worn_accessory' && hasProductContext) {
    if (isMacroShot && !text.includes('超清微距对焦')) {
      text = text.replace(/(@图片\s*1[^；;]*)/, '$1，超清微距对焦锁定首饰细节与锐利边缘');
    }
  }

  // 确保 @图片2 正脸槽位对齐（仅在有正脸定桩时）
  if (hasHuman && hasFace && !/@图片\s*2/.test(text)) {
    if (isMacroShot) {
      text = `${text}；人物五官特征以 @图片2 为准（若背景露脸）`;
    } else {
      text = `人物五官 ID 以 @图片2 为准；${text}`;
    }
  }

  // 确保场景定桩槽位
  if (options?.hasSceneAnchor) {
    const sceneSlot = hasFace ? '@图片3' : '@图片2';
    if (!new RegExp(sceneSlot.replace('@', '@\\s*')).test(text)) {
      text = `${text}；场景空间以 ${sceneSlot} 定桩`;
    }
  }

  // 冲突清洗与多余分号规范化
  text = scrubOriginalPromptProductConflicts(text, role);

  return text
    .replace(/；+/g, '；')
    .replace(/^；+|；+$/g, '')
    .trim();
}

/** 提示词分段展示辅助函数 */
export function formatPromptParagraphs(prompt?: string): string[] {
  if (!prompt) return [];
  return prompt
    .split(/[；\n]/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * 确定性拼装 2×2 四宫格 Master Collage 提示词（单次推理直出 4 格，100% 锁定同一人脸与同一穿搭）
 * 核心升级：基于解剖学品类（发簪/耳饰/项链/手镯/戒指/服装）动态组装微距与侧颜，彻底杜绝部位错位与硬编码同质化，注入小红书头部博主高级骨相与古典盘发规范
 */
export interface Grid2x2Options {
  hasFace?: boolean;
  hasSceneAnchor?: boolean;
  productIndex?: number;
  macroSlotIndex?: number;
}

/**
 * 确定性拼装 2×2 四宫格 Master Collage 提示词（单次推理直出 4 格，100% 锁定同一人脸与同一穿搭）
 * 核心升级：
 * 1. 局部细节微距图在 4 个分镜中乱序/轮询动态分布（杜绝首图千篇一律为耳朵/手部微距特写，首图呈现明媚博主肖像）；
 * 2. 基于解剖学品类（发簪/耳饰/项链/手镯/戒指/服装）动态组装微距与侧颜，注入小红书头部博主高级骨相与古典盘发规范。
 */
export function assembleGrid2x2Prompt(
  bible: OriginalGroupBible,
  shots: OriginalShotFields[],
  options?: Grid2x2Options
): string {
  const hasHuman = bible.identityBible !== '纯商品静物，无人物';
  const role = normalizeOriginalProductRole(bible.productRole, bible.productFingerprint);
  const look = joinLookSummary(bible.lookParts, bible.lookBible, role);
  const rawMasterScene = (bible.masterScene || '').trim() || '充满生活烟火气的真实美学空间，斜射自然日光';
  const cleanMasterScene = sanitizeScenePrompt(rawMasterScene);
  const styleSeg = (bible.styleBible || '').trim() || 'Shot on iPhone 16 Pro 原相机抓拍（Unedited RAW 35mm photograph, natural candid snapshot），小红书真实博主生活随拍质感，零美颜零滤镜。真实环境漫射采光与自然物理接触阴影（Realistic Ambient Daylight, Soft Contact Shadows），人物皮肤呈现真实微观肌理与微毛孔呼吸感，渐进式真实光学自然景深（Progressive optical depth of field），首饰呈现真实物理金属高光与反光，严格杜绝 3D 渲染感、塑料磨皮与假人CG感（Strictly NO plastic skin, NO airbrushing, NO 3D CGI rendering, NO fake glow）';

  // 解剖学品类与佩戴部位动态判定
  const anatomy = detectJewelryAnatomy(bible.productRole, bible.productFingerprint);
  const anatomyStmt = getJewelryAnatomyStatement(anatomy);

  // 保证 4 个分镜
  const paddedShots = [...shots];
  while (paddedShots.length < 4) {
    paddedShots.push({
      shot_no: paddedShots.length + 1,
      title: `分镜 ${paddedShots.length + 1}`,
      has_human: hasHuman
    });
  }

  // 分镜 1（左上格）固定为微距特写，与 vision 分析「分镜 1 必须为 macro」保持一致
  let macroSlot = 0;
  if (typeof options?.macroSlotIndex === 'number' && options.macroSlotIndex >= 0 && options.macroSlotIndex < 4) {
    macroSlot = options.macroSlotIndex;
  }

  // 依据解剖学品类动态生成 4 种精炼分镜描述（1个超清微距特写 + 3个不同机位的自然肖像与生活随拍）
  let descMacro = '极近距离超清微距特写：100mm f/2.8 大光圈浅景深超清对焦 @图片1 所示商品实物，商品占据画面 60%~75% 核心视觉中心，呈现金属光泽、立体雕花细节与微观质感，背景自然虚化。';
  let descPortrait = '胸部以上正面自然肖像：平视视角，眼神灵动带笑看镜头，双手轻搭身前桌沿，自然展露佩戴的 @图片1 所示商品，胸部以上中近景构图。';
  let descSideAngle = '胸部以上45度侧颜抓拍：微侧身看窗外天光，发丝轻拂，斜射阳光勾勒侧颜下颌线条，佩戴部位清晰置于前景受光处，半身中近景。';
  let descLifestyle = '生活空间氛围随拍：桌前倚靠或手扶包带，神态甜美松弛，佩戴部位与灵动容颜自然同框，胸部以上中近景，展现私服穿搭与生活温度。';

  switch (anatomy) {
    case 'hairpin':
      descMacro = '发髻发簪超清微距特写：100mm f/2.8 大光圈浅景深超清聚焦盘发发髻，清晰呈现发丝纹理与横插在发髻内部的 @图片1 发簪，雕花与垂坠流苏细节纤毫毕现，背景自然柔和虚化。';
      descPortrait = '45度侧颜温婉盘发抓拍：侧身平视视角，长发梳成温婉低盘发髻，斜射阳光清晰展现插戴在发髻中的 @图片1 发簪与发丝层次，手腕光洁无手镯，中近景构图。';
      descSideAngle = '侧后方微回眸盘发抓拍：侧后方45度回眸，聚焦后脑勺与侧颈优美盘发，清晰展现横插于发髻内部的 @图片1 发簪与垂坠流苏微光，中近景人像。';
      descLifestyle = '生活空间盘发温婉随拍：端坐桌前，单手轻抚鬓角碎发，温婉饱满的盘发发髻插戴着 @图片1 发簪，神态恬淡温润，胸部以上半身近景。';
      break;
    case 'earring':
      descMacro = '耳际侧颜超清微距特写：微侧头看光，单手轻挽耳后发丝，100mm f/2.8 大光圈浅景深超清对焦双耳耳垂佩戴的 @图片1 耳饰实物，商品占据画面核心（45%~60% 面积），呈现金属微光与宝石切面，背景柔和虚化。';
      descPortrait = '胸部以上正面自然肖像：平视视角，眼神清澈灵动带笑看镜头，双手轻搭桌沿，清晰展露双耳佩戴的 @图片1 耳饰与优雅气质，胸部以上中近景饱满构图。';
      descSideAngle = '45度侧颜微风中近景抓拍：侧头看阳光天光，微风吹拂发丝，斜射阳光勾勒侧颜下颌线条与耳垂佩戴的 @图片1 耳饰光影，胸部以上中近景。';
      descLifestyle = '生活氛围感中近景随拍：生活空间舒适倚靠，神态甜美松弛，展露耳饰与蓬松发丝层次，胸部以上中近景肖像。';
      break;
    case 'necklace':
      descMacro = '颈间项链超清近景大特写：平视聚焦端庄领口正中，100mm f/2.8 大光圈浅景深超清对焦自然垂坠的 @图片1 项链吊坠实物，项链占据画面核心中心（50%~70% 面积），精细呈现金属反光与微观切面，背景柔美虚化。';
      descPortrait = '胸部以上买家秀展示肖像：平视视角，神态明媚自然，单手捏起颈间佩戴的 @图片1 项链吊坠向镜头展示，端庄领口清晰展露项链做工，胸部以上中近景饱满构图。';
      descSideAngle = '45度侧颜微风中近景抓拍：微侧头看窗外天光，斜射阳光洒在颈间，勾勒侧颜与颈间 @图片1 项链自然微光，胸部以上中近景人像。';
      descLifestyle = '生活氛围感中近景随拍：生活空间舒适倚靠，手部轻扶随身包带，神态甜美松弛，展露颈间项链与私服穿搭，胸部以上中近景。';
      break;
    case 'bracelet':
      descMacro = '手腕局部超清微距大特写：单侧手部自然平放于台面（手部有真实物理支撑），100mm f/2.8 大光圈超清聚焦左手手腕佩戴的 @图片1 手镯实物，手镯占据画面 60%~75% 视觉中心，呈现金属拉丝抛光与立体浮雕做工，背景柔和虚化。';
      descPortrait = '胸部以上45度侧颜手腕前置抓拍：侧身倚靠，左手轻抬至身前显著受光处，手腕佩戴的 @图片1 手镯置于离镜头最近的超清焦平面，与灵动侧颜同框，胸部以上中近景。';
      descSideAngle = '正面托腮买家秀肖像展示：平视机位，单手托腮笑意盈盈直视镜头，托腮的手腕将佩戴的 @图片1 手镯推至脸侧视觉焦点，清晰呈现手镯雕花做工，胸部以上肖像。';
      descLifestyle = '生活空间双手捧杯互动随拍：双手环捧温热水杯置于身前受光处，佩戴手镯的手腕处于第一清晰焦平面，手镯光泽立体锐利，真实生活抓拍感，半身近景。';
      break;
    case 'ring':
      descMacro = '手指戒指超清微距大特写：手部自然平放于木质台面或轻搭书脊边缘（手部有真实物理支撑），100mm f/2.8 大光圈超清聚焦左手无名指佩戴的 @图片1 戒指实物，戒指占据画面 60%~75% 视觉中心，呈现戒圈做工、金属光泽与主石微观折射反光，背景柔和虚化。';
      descPortrait = '胸部以上正面自然肖像：平视视角，左手轻搭身前桌沿展露无名指佩戴的 @图片1 戒指，眼神明媚微笑，胸部以上饱满中近景构图。';
      descSideAngle = '45度侧颜微风中近景抓拍：自然侧身看窗外天光，左手轻搭桌面展露无名指戒指，神态恬淡放松，胸部以上中近景人像。';
      descLifestyle = '生活氛围感中近景随拍：生活空间舒适倚靠，左手轻扶包带，左手无名指戒指与甜美面容自然同框，胸部以上中近景。';
      break;
    case 'bag':
      descMacro = '包袋材质与五金超清微距特写：100mm f/2.8 大光圈浅景深超清对焦 @图片1 包袋细腻皮质纹理与五金搭扣光泽，占据画面 65%~80% 核心面积，细节锐利分明。';
      descPortrait = '正面胸部以上穿搭中近景抓拍：单肩背着或手提 @图片1 包袋，神态从容自然，眼神看镜头浅笑，展现包袋版型与私服搭配，中近景构图。';
      descSideAngle = '45度侧身漫步中近景抓拍：侧身走动，手轻扶 @图片1 包袋肩带，展现包袋皮质光泽与整体生活氛围，半身中近景人像。';
      descLifestyle = '生活氛围随拍：手提包袋置于身侧桌边或椅背，人与包袋自然互动，展现生活温度，中近景构图。';
      break;
    case 'apparel':
      descMacro = '服饰面料与剪裁局部超清微距特写：100mm f/2.8 大光圈浅景深超清聚焦 @图片1 衣服高级面料肌理与精致走线质感，商品实物占据 65%~80% 核心面积，细节锐利清晰。';
      descPortrait = '正面胸部以上穿搭中近景抓拍：神态从容自然，眼神看镜头浅笑，清晰展现穿着的 @图片1 服装领口版型与高级气质，胸部以上中近景。';
      descSideAngle = '45度侧颜微风半身抓拍：侧头回眸，微风吹拂发丝与衣摆，展现 @图片1 衣服立体垂坠感与优雅剪裁，半身中近景人像。';
      descLifestyle = '生活氛围感中近景随拍：生活空间舒适倚靠或街头漫步，双手插兜或手扶包带，展现 @图片1 服装版型与高级氛围，中近景构图。';
      break;
  }

  // 动态将宏观微距细节图分配至 macroSlot，其余格填入优质肖像与生活抓拍
  const nonMacroPool = [descPortrait, descSideAngle, descLifestyle];
  const defaultPanelDescs: string[] = [];
  let nonMacroIdx = 0;
  for (let i = 0; i < 4; i++) {
    if (i === macroSlot) {
      defaultPanelDescs.push(descMacro);
    } else {
      defaultPanelDescs.push(nonMacroPool[nonMacroIdx++ % nonMacroPool.length]);
    }
  }

  const cleanedActions: string[] = [];
  const panelLines: string[] = [];
  const panelLabels = ['【左上格·分镜1】', '【右上格·分镜2】', '【左下格·分镜3】', '【右下格·分镜4】'];

  paddedShots.slice(0, 4).forEach((s, idx) => {
    const label = panelLabels[idx];
    const isMacroSlot = idx === macroSlot;
    let userAction = (s.action || '').trim()
      .replace(/站在走廊|走廊站立/g, '桌前倚靠')
      .replace(/(远景|全景|全身站立|全身)+/g, '胸部以上中近景')
      .replace(/(?:向前伸手|朝镜头伸手|向镜头伸手|伸手抓镜头|伸手靠近镜头|手伸向前|伸手抓拍|手伸向屏幕|比大爱心|比大耶)+/g, '双手自然轻搭在身前桌沿');
    userAction = stripGarmentsFromAction(userAction, idx);
    const userExpr = (s.expression || '').trim();
    let userAngle = (s.angle || '').trim().replace(/(远景|全景|全身站立|全身)+/g, '胸部以上中近景');
    const userProp = (s.prop || '').trim();

    // 过滤掉每格自带的冗长镜头模板与重复构图声明
    let userOptics = (s.optics || '').trim()
      .replace(/Shot on iPhone[^\n，；;]*/gi, '')
      .replace(/Tight Bust-Up Frame/gi, '')
      .replace(/Unedited RAW photo[^\n，；;]*/gi, '')
      .replace(/胸部以上中近景生活抓拍构图[（(]?[^)）]*[)）]?/g, '')
      .replace(/生动展露博主自然生活神态[^\n，；;]*/g, '')
      .replace(/严禁退后到全身远景[^\n，；;]*/g, '')
      .replace(/微弱自然传感器胶片微颗粒感[^\n，；;]*/g, '')
      .replace(/佩戴首饰的手部\/部位自然置于前景显著受光处清晰展现[（(]?[^)）]*[)）]?/g, '首饰自然置于受光处清晰展现')
      .replace(/（[，,\s]*/g, '（')
      .replace(/[，,\s]*）/g, '）')
      .replace(/（\s*）/g, '')
      .replace(/[，,]{2,}/g, '，')
      .replace(/^[，,。.；;\s]+/, '')
      .replace(/[，,。.；;\s]+$/, '')
      .trim();

    // 净化机位景别词中的口吃式重复
    userAngle = userAngle
      .replace(/(?:中近景|半身|特写)*(?:半身中近景|中近景半身像|中近景半身|中近景)+(?:生活抓拍|人像|构图)?/g, '胸部以上中近景')
      .replace(/(?:胸部以上中近景\s*)+/g, '胸部以上中近景');

    // 若机位已声明特定焦段，去重光学里的重复焦段词
    if (userAngle && userOptics && (userAngle.includes('85mm') || userAngle.includes('35mm') || userAngle.includes('50mm') || userAngle.includes('100mm'))) {
      userOptics = userOptics.replace(/(?:约)?(?:85mm|35mm|50mm|100mm|f\/1\.8|浅景深)[^，。；;]*/g, '').trim();
      userOptics = userOptics.replace(/^[，,。.；;\s]+/, '').replace(/[，,。.；;\s]+$/, '');
    }

    // 根据品类清洗误判动作与机位
    if (anatomy === 'hairpin') {
      userAction = userAction.replace(/(手腕|手指|挽袖子|拉手袋拉链|整理手袋|整理包袋)[^，；;]*/g, '侧头温婉盘发优雅展露发间发簪');
      userAction = userAction.replace(/(披肩发|披发|散发|直发)/g, '温婉低盘发髻');
      userAngle = userAngle.replace(/(正面肖像|正面平视|手腕|手指|锁骨)[^，；;]*/g, isMacroSlot ? '发髻发簪部位超清微距特写' : '45度侧颜发髻半身抓拍');
    } else if (anatomy === 'earring') {
      userAction = userAction.replace(/(手腕|手指|挽袖子|拉手袋拉链|整理手袋|整理包袋)[^，；;]*/g, '微侧头发丝随性挽于耳后展露耳饰');
      userAngle = userAngle.replace(/(手腕|手指|锁骨)[^，；;]*/g, isMacroSlot ? '耳际侧颜局部超清微距特写' : '胸部以上中近景');
    } else if (anatomy === 'necklace') {
      userAction = userAction.replace(/(手腕|手指|挽袖子|拉手袋拉链)[^，；;]*/g, '端庄领口自然展露颈间项链');
      userAngle = userAngle.replace(/(手腕|手指|耳际)[^，；;]*/g, isMacroSlot ? '颈间项链锁骨超清近景大特写' : '胸部以上中近景');
    } else if (anatomy === 'bracelet') {
      const braceletDisruptive =
        /(站在走廊|走廊站立|全景奔跑|街头奔跑|大步奔跑|坐在石阶|捂嘴笑|整理手袋|整理包袋|跑步|奔跑|双手抬起|抬手整理发丝|整理头发|摸头|抚发)/;
      if (braceletDisruptive.test(userAction)) {
        userAction = isMacroSlot ? '手部自然平放木质台面超清微距特写' : '左手轻搭身前显著受光展露手镯';
      }
      userAngle = userAngle.replace(/(全景|远景|全身|长廊|耳际|锁骨)[^，；;]*/g, isMacroSlot ? '手腕局部超清微距大特写' : '胸部以上中近景');
    } else if (anatomy === 'ring') {
      userAction = userAction.replace(/(站在走廊|走廊站立|全景奔跑|街头奔跑|大步奔跑|坐在石阶|捂嘴笑|双手抬起|抬手整理发丝|整理头发)[^，；;]*/g, isMacroSlot ? '手指自然轻搭木质台面戒指超清微距特写' : '左手轻搭身前桌沿展露戒指');
      userAngle = userAngle.replace(/(全景|远景|全身|长廊|耳际|锁骨)[^，；;]*/g, isMacroSlot ? '手指局部超清微距大特写' : '胸部以上中近景');
    }

    const isJewelryCategory = ['hairpin', 'earring', 'necklace', 'bracelet', 'ring'].includes(anatomy);
    
    // 检查动作是否与前序格子重复
    const actionKey = userAction.slice(0, 10);
    const isDuplicateAction = cleanedActions.includes(actionKey);
    if (!isDuplicateAction && userAction) {
      cleanedActions.push(actionKey);
    }

    if (isMacroSlot && isJewelryCategory && ((!userAngle.includes('微距') && !userAngle.includes('特写')) || /(奔跑|跑步|漫步|石阶|全身|远景|双手抬起|摸头|抚发)/.test(userAction))) {
      panelLines.push(`${label} ${defaultPanelDescs[idx]}`);
    } else if (isDuplicateAction || (!userAction && !userAngle)) {
      panelLines.push(`${label} ${defaultPanelDescs[idx]}`);
    } else if (userAction || userExpr || userAngle) {
      let resolvedAngle = userAngle;
      if (!isMacroSlot && (resolvedAngle.includes('微距') || resolvedAngle.includes('特写'))) {
        resolvedAngle = '胸部以上中近景';
      }
      const parts = [
        resolvedAngle || (isMacroSlot ? '局部超清微距特写' : '胸部以上45度侧颜中近景'),
        userExpr ? `神态表情：${userExpr}` : '',
        userAction ? `肢体动作：${userAction}` : '',
        userProp ? `道具互动：${userProp}` : '',
        userOptics ? `光学：${userOptics}` : ''
      ].filter(Boolean);
      const lineContent = parts.join('，')
        .replace(/，，/g, '，')
        .replace(/（，/g, '（')
        .replace(/（\s*）/g, '')
        .replace(/[，,；;]+$/, '');
      panelLines.push(`${label} ${lineContent}。`);
    } else {
      panelLines.push(`${label} ${defaultPanelDescs[idx]}`);
    }
  });

  let subjectHeader: string;
  if (hasHuman) {
    let identity = (bible.identityBible || '').trim() || '长相清秀温婉的年轻东亚时尚博主，真实五官比例与自然骨相，原生透气健康冷白肤质，细腻毛孔呼吸感，神态自然松弛';
    if (anatomy === 'hairpin') {
      identity = `${identity}，长发挽成温婉古典低盘发髻（@图片1 发簪长杆穿插固定于发髻内部）`;
    }
    const outfit = look.summary || '高级显白质感私服穿搭';
    subjectHeader = `一张 2x2 四宫格无缝拼接买家秀抓拍大图（Full bleed, borderless 2x2 photo collage），展示同一位长相清秀温婉的年轻东亚时尚博主（${identity}）在同一个真实环境【${cleanMasterScene}】中的4个不同抓拍机位。四图紧密无缝相接，绝无白边与分割线，全员胸部以上中近景与极近距离局部微距特写构图（严禁远景全身）。全图4个格子中，人物五官特征、发型、妆容以及服装穿搭（${outfit}）绝对100%完全相同。${anatomyStmt} @图片1 所示商品（外观与材质细节100%以 @图片1 为准，画面中仅佩戴1件实物）。`;
  } else {
    subjectHeader = `一张 2x2 四宫格无缝拼接商品静物大图（Full bleed, borderless 2x2 photo collage），展示 @图片1 所示商品在同一个【${cleanMasterScene}】中的4个不同陈设与超清特写机位。四图紧密无缝相接，绝无白边与分割线，清晰呈现商品材质与工艺。全图商品外观100%以 @图片1 为准。`;
  }

  const fullCollagePrompt = [
    subjectHeader,
    `【4格互斥机位与分镜动作】：\n` + panelLines.join('\n'),
    `画面摄影与排版约束：${styleSeg}，纯净真实自然日光与物理接触阴影（Contact Shadows），四格画面光影色温与空间肌理高度统一。四图紧密无缝相接，满铺无白边无分割线（Zero margins, no divider lines）；四格肢体动作与机位绝对互斥（${panelLabels[macroSlot]}必为超清微距特写，其余三格为截然不同的胸部以上半身中近景与生活随拍人像）；全员胸部以上中近景与微距构图，严禁远景全身；手部动作均有真实物理依托，手指比例精准自然无畸变。`
  ].join('\n\n');

  return ensureOriginalPromptSlots(fullCollagePrompt, {
    hasHuman,
    hasFace: Boolean(options?.hasFace),
    masterScene: bible.masterScene,
    identityBible: bible.identityBible,
    lookBible: look.summary,
    productRole: role,
    productFingerprint: bible.productFingerprint,
  });
}

/**
 * 确定性拼装复刻 2×2 四宫格 Master Collage 提示词
 */
export function assembleReplicationGrid2x2Prompt(
  bible: OriginalGroupBible,
  shots: OriginalShotFields[],
  options?: Grid2x2Options
): string {
  const collage = assembleGrid2x2Prompt(bible, shots, options);
  return softenReplicationSafetyWording(
    ensureReplicationPromptSlots(collage, {
      hasHuman: bible.identityBible !== '纯商品静物，无人物',
      hasFace: false,
    })
  );
}
