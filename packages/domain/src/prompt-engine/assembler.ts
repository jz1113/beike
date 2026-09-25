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
import { cleanPromptText, harmonizeOriginalPrompt } from './guards';
import { sanitizeScenePrompt } from '../assetDeconstruct/sanitize';
import { resolveJewelryShotOptics } from './jewelryFraming';
import { buildGridCollagePrompt, type Grid2x2Options } from './gridPanels';
import { appendFidelityGuidance } from './fidelity';

export type { Grid2x2Options };

/**
 * 拼装单个原创分镜提示词（支持大模型反推生成的完整 8 段式提示词，维护真实摄影风格）
 */
export function assembleOriginalShotPrompt(
  bible: OriginalGroupBible,
  shot: OriginalShotFields,
  options?: { hasFace?: boolean; hasSceneAnchor?: boolean; preserveComposition?: boolean; skipRichPrompt?: boolean }
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

  if (hasRichPrompt && !options?.skipRichPrompt) {
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

  let identityPart = (bible.identityBible || '').trim() || '一位普通年轻东亚女性，五官自然且保留轻微左右不对称，发型有自然散落发丝，肤色与皮肤纹理真实，表情放松，不刻意摆拍';
  if (anatomy === 'hairpin' && !options?.preserveComposition) {
    identityPart = `${identityPart}，长发整齐挽起梳成优雅饱满的温婉古典低盘发髻/发包（严禁散乱披发，@图片1 发簪长杆横向紧密穿插在盘好的发髻内部）`;
  }

  let actionText = (shot.action || '').trim() || diversity.action;
  if (!options?.preserveComposition) {
    actionText = stripGarmentsFromAction(actionText, shotNo - 1);
    const harmonizedAction = harmonizeOriginalPrompt(actionText, {
      productFingerprint: bible.productFingerprint,
      action: actionText,
      angle: shot.angle,
      scene: cleanScene,
    });
    actionText = harmonizedAction.action;
  }

  const framed = resolveJewelryShotOptics({
    shotNo,
    anatomy,
    actionText,
    cameraText: (shot.camera_focal_length || '').trim(),
    angleText: (shot.angle || '').trim(),
    preserveComposition: options?.preserveComposition,
  });
  const cameraText = framed.cameraText;
  const angleText = framed.angleText;

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
  const stylePart = (bible.styleBible || '').trim() || '手机后置主摄生活抓拍，自然环境光与真实接触阴影，保留皮肤、头发、衣料和商品材质纹理，曝光与白平衡稳定；不过度磨皮、锐化、HDR 或商业棚拍';
  segments.push(`摄影画质：${stylePart}`);
  segments.push('画面构图铁律：单张独立全画幅完整摄影（Single cohesive photograph, full-bleed），严禁拼图、严禁双格对比、严禁四宫格、严禁多面板（Strictly NO collage, NO multi-panel, NO split screen），主体完整饱满');
  if (hasHuman) {
    segments.push('人体结构解剖学铁律：严格遵循真实人类生理骨骼解剖学，严格仅有正常两只手臂与双手（Strictly anatomically correct, exactly two arms, natural realistic limbs, NO extra arms, NO three arms, NO mutated hands, NO disconnected limbs），双臂动作自然舒展，绝无第三只手臂与悬空多余肢体');
  }

  let fullPrompt = segments.join('；');
  if (!options?.preserveComposition) {
    fullPrompt = preventJewelryGlitches(fullPrompt, bible.productFingerprint);
  }
  fullPrompt = enforceLookConsistency(fullPrompt, bible.lookBible, productRole, bible.productFingerprint);

  const finalPrompt = options?.preserveComposition
    ? fullPrompt
    : harmonizeOriginalPrompt(fullPrompt, {
        productFingerprint: bible.productFingerprint,
        action: actionText,
        angle: shot.angle,
        scene: cleanScene,
      }).prompt;

  return ensureOriginalPromptSlots(finalPrompt, {
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
    hasSupplementaryProductViews?: boolean;
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
    if (isMacroShot && !text.includes('超清微距对焦') && !/2x2|四宫格/.test(text)) {
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

  // 冲突清洗与多余分号规范化（动作段含商品名时不得整段替换）
  const actionHolders: string[] = [];
  text = text.replace(/动作姿态：[^；;]*/g, (m) => {
    actionHolders.push(m);
    return `__KEEP_ACTION_${actionHolders.length - 1}__`;
  });
  text = scrubOriginalPromptProductConflicts(text, role);
  text = text.replace(/__KEEP_ACTION_(\d+)__/g, (_, i) => actionHolders[Number(i)]);

  text = text
    .replace(/；+/g, '；')
    .replace(/^；+|；+$/g, '')
    .trim();
  return appendFidelityGuidance(text, {
    productRole: role,
    productFingerprint: options?.productFingerprint,
    hasHuman,
    hasSupplementaryProductViews: options?.hasSupplementaryProductViews,
  });
}

/** 提示词分段展示辅助函数 */
export function formatPromptParagraphs(prompt?: string): string[] {
  if (!prompt) return [];
  return prompt
    .split(/[；\n]/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

export function assembleGrid2x2Prompt(
  bible: OriginalGroupBible,
  shots: OriginalShotFields[],
  options?: Grid2x2Options
): string {
  const hasHuman = bible.identityBible !== '纯商品静物，无人物';
  const role = normalizeOriginalProductRole(bible.productRole, bible.productFingerprint);
  const look = joinLookSummary(bible.lookParts, bible.lookBible, role);
  return ensureOriginalPromptSlots(buildGridCollagePrompt(bible, shots, options), {
    hasHuman,
    hasFace: Boolean(options?.hasFace),
    masterScene: bible.masterScene,
    identityBible: bible.identityBible,
    lookBible: look.summary,
    productRole: role,
    productFingerprint: bible.productFingerprint,
  });
}
