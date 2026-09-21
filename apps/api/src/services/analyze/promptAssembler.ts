import { prisma } from '../../repositories/db';
import {
  assembleOriginalShotPrompt,
  cleanPromptText,
  enforceOriginalShotDiversity,
  enforceLookConsistency,
  extractOutfitFromPrompt,
  isGenericLook,
  preventJewelryGlitches,
  normalizeOriginalProductRole,
  sanitizeLookPartsForProductRole,
  harmonizeOriginalPrompt,
  stripGarmentsFromAction,
} from '@beike/domain/drawing';
import { buildActionDigestFromShots } from '@beike/domain/vision';
import { getShotLightingVariation } from '@beike/domain/assetSampling';
import {
  parseResponseJson,
  padMissingOriginalShots,
} from '../analyzeVisionCall';
import {
  inferProductCategoryAndAnatomy,
  buildCategoryCloseUpOptics,
} from '@beike/domain/productCategory';
import { resolveAssetShotSubject } from '@beike/domain/workshopShotSubject';

// 🌟 辅助工具：提取或绑定标准资产编号 (如 [#P-01], [#S-01], [#O-01], [#A-01])
function formatAssetWithCode(
  val: string | undefined,
  list: any[] | undefined,
  prefix: string,
  fallbackIdx = 0
): string | undefined {
  if (!val && (!list || list.length === 0)) return undefined;
  const raw = (val || list?.[fallbackIdx]?.title || list?.[fallbackIdx]?.name || '').trim();
  if (!raw) return undefined;
  if (/^\[?#[PSOA]-[\w-]+\]?/i.test(raw)) {
    const matchedPrefix = raw.match(/^\[?#?([PSOA]-[\w-]+)\]?\s*(.*)$/i);
    if (matchedPrefix) {
      return `[#${matchedPrefix[1].toUpperCase()}] ${matchedPrefix[2]}`.trim();
    }
    return raw;
  }
  const matched = list?.find(item =>
    (item.title && (raw.includes(item.title) || item.title.includes(raw))) ||
    (item.name && (raw.includes(item.name) || item.name.includes(raw)))
  );
  if (matched?.code) {
    return `[#${matched.code.replace(/^#/, '')}] ${raw.replace(/^\[?#[PSOA]-[\w-]+\]?\s*/i, '')}`;
  }
  const fallbackCode = list?.[fallbackIdx]?.code || `${prefix}-${String(fallbackIdx + 1).padStart(2, '0')}`;
  return `[#${fallbackCode.replace(/^#/, '')}] ${raw.replace(/^\[?#[PSOA]-[\w-]+\]?\s*/i, '')}`;
}

/** Remove portrait-only directions when an asset explicitly calls for a pure product frame. */
function toPureProductPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/(?:人物|模特|女生|女性|人像|面容|人脸|五官|发型|表情|穿搭|服装|侧颜)[^；;。\n]*/g, '')
    .replace(/(?:手持|双手|手部)[^；;。\n]*/g, '')
    .replace(/[；;]\s*[；;]/g, '；')
    .trim();
  return `${cleaned}；画面仅呈现 @图片1 所示商品实物，禁止人物、模特、人脸、肢体与手部出镜`;
}

export interface AssembleStoryboardParams {
  rawOutput: string;
  shotCount: number;
  productTitle?: string;
  productProps?: any;
  isNoModel: boolean;
  hasAnchorFace: boolean;
  productIndex: number;
  assetLibraryData: any;
  lockedAssets?: any;
  assetPickTrace?: any;
  actionItems?: any[];
  actualModelUsed: string;
  triedModels: string[];
  visionUsage: any;
}

export async function assembleStoryboardShots(params: AssembleStoryboardParams) {
  const {
    rawOutput,
    shotCount,
    productTitle,
    productProps,
    isNoModel,
    hasAnchorFace,
    productIndex,
    assetLibraryData,
    lockedAssets,
    assetPickTrace,
    actionItems,
    actualModelUsed,
    triedModels,
    visionUsage,
  } = params;

  const parsedResult = parseResponseJson(rawOutput);

  // 🌟 原创生成：严格保证返回分镜数量 100% 等于用户指定的 shotCount (如4分镜)
  const targetCount = Math.max(1, Math.min(12, Number(shotCount) || 4));
  let rawPrompts = parsedResult.prompts || [];
  rawPrompts = padMissingOriginalShots(rawPrompts, targetCount, {
    productTitle,
    isNoModel,
    masterScene: parsedResult.master_scene,
    lookBible: (parsedResult as any).look_bible,
    identityBible: (parsedResult as any).identity_bible,
  });

  const lookBible = (parsedResult as any).look_bible || '';
  const lookParts = (parsedResult as any).look_parts || undefined;
  const styleBible = (parsedResult as any).style_bible || '';
  const identityBible =
    (parsedResult as any).identity_bible ||
    parsedResult.model_anchor_features ||
    '';
  const masterScene = parsedResult.master_scene || '';
  const productFingerprintRaw = parsedResult.product_fingerprint || '';
  const productRole = normalizeOriginalProductRole(
    (parsedResult as any).product_role || (parsedResult as any).productRole,
    productFingerprintRaw
  );

  const sanitizedLookParts =
    lookParts && typeof lookParts === 'object'
      ? sanitizeLookPartsForProductRole(
          {
            top: lookParts.top,
            bottom: lookParts.bottom,
            shoes: lookParts.shoes,
            accessory: lookParts.accessory,
            summary: lookBible,
          },
          lookBible,
          productRole || 'held_object',
          productFingerprintRaw
        )
      : undefined;

  const draftPrompts = rawPrompts.map((p: any, idx: number) => {
    const promptText = (p.prompt || p.description || (typeof p === 'string' ? p : '')).toString();
    const hasHumanExplicit = p.has_human !== undefined ? Boolean(p.has_human) : undefined;
    const isPureStillLife =
      promptText.includes('无人物') ||
      promptText.includes('无模特') ||
      promptText.includes('纯静物') ||
      promptText.includes('纯商品');
    const mentionsModelFace =
      !isPureStillLife &&
      (promptText.includes('模特') ||
        promptText.includes('女生') ||
        promptText.includes('女性') ||
        promptText.includes('面容') ||
        promptText.includes('人脸') ||
        promptText.includes('五官') ||
        promptText.includes('自拍') ||
        promptText.includes('穿搭买家秀') ||
        promptText.includes('OOTD'));
    const isHandHeldOnly =
      !mentionsModelFace &&
      (promptText.includes('手持') ||
        promptText.includes('手部操作') ||
        promptText.includes('双手'));

    const inferredHasHuman =
      hasHumanExplicit !== undefined
        ? hasHumanExplicit
        : isPureStillLife
        ? false
        : true;
    const derivedSubject = resolveAssetShotSubject(assetLibraryData?.actions?.[idx] || {});
    const finalHasHuman = derivedSubject?.has_human ?? inferredHasHuman;

    const finalShotType =
      derivedSubject?.shot_type ||
      p.shot_type ||
      (finalHasHuman ? 'model_shot' : isHandHeldOnly ? 'hand_held_only' : 'pure_product');

    return {
      shot_no: p.shot_no || idx + 1,
      title: p.title || `分镜 ${idx + 1}`,
      scene: p.scene || masterScene || '',
      expression: p.expression || '',
      action: p.action || '',
      prop: p.prop || '',
      optics: p.optics || '',
      camera_focal_length: p.camera_focal_length || '',
      angle: p.angle || '',
      lighting_type: p.lighting_type || styleBible || '',
      has_human: finalHasHuman,
      shot_type: finalShotType,
      promptFallback: cleanPromptText(promptText),
      selected: true,
    };
  });

  const groupHasHuman = draftPrompts.some((p: any) => p.has_human !== false);
  const diversified = enforceOriginalShotDiversity(draftPrompts, groupHasHuman);

  const appliedPersonaName = formatAssetWithCode(
    (parsedResult as any).applied_persona || lockedAssets?.personaName,
    assetLibraryData?.personas,
    'P',
    0
  );

  const appliedSceneTitle = formatAssetWithCode(
    (parsedResult as any).applied_scene || lockedAssets?.sceneTitle,
    assetLibraryData?.scenes,
    'S',
    0
  );

  const appliedOutfitTitle = formatAssetWithCode(
    (parsedResult as any).applied_outfit || lockedAssets?.outfitTitle,
    assetLibraryData?.outfits,
    'O',
    0
  );

  const selectedSceneAsset =
    assetLibraryData?.scenes?.find(
      (s: any) => s.code && appliedSceneTitle?.includes(s.code)
    ) || assetLibraryData?.scenes?.[0];

  const selectedOutfitAsset =
    assetLibraryData?.outfits?.find(
      (o: any) => o.code && appliedOutfitTitle?.includes(o.code)
    ) || assetLibraryData?.outfits?.[0];

  const selectedPersonaAsset =
    assetLibraryData?.personas?.find(
      (p: any) => p.code && appliedPersonaName?.includes(p.code)
    ) || assetLibraryData?.personas?.[0];

  const ambientLightingVariations = [
    '清晨斜射自然晨光（5500K 色温，空气清新通透，真实物理轮廓阴影）',
    '午后温暖侧射阳光（微暖调，自然斑驳树影与窗棂透光微光斑）',
    '黄昏黄金时刻柔和暖金天光（Golden Hour，温暖恬静，柔和环境漫反射）',
    '明亮室内大面积自然天光漫射（极简纯粹，无明显硬阴影，温润高显色）',
  ];
  const baseLightVariation =
    ambientLightingVariations[productIndex % ambientLightingVariations.length];

  const baseScene = selectedSceneAsset?.description
    ? `${selectedSceneAsset.title}，${selectedSceneAsset.description}`
    : masterScene || '干净有质感的真实生活空间';
  const effectiveMasterScene =
    baseScene.includes('环境光') ||
    baseScene.includes('光线') ||
    baseScene.includes('晨光') ||
    baseScene.includes('阳光')
      ? baseScene
      : `${baseScene}（采光氛围：${baseLightVariation}）`;

  const effectiveLookBible = selectedOutfitAsset
    ? `上装「${selectedOutfitAsset.top}」，下装「${selectedOutfitAsset.bottom}」${
        selectedOutfitAsset.colorPalette ? `，配色「${selectedOutfitAsset.colorPalette}」` : ''
      }`
    : lookBible || '时髦显白生活私服';

  const effectiveLookParts = selectedOutfitAsset
    ? {
        top: selectedOutfitAsset.top,
        bottom: selectedOutfitAsset.bottom,
        shoes: selectedOutfitAsset.shoes || '百搭时髦鞋履',
        accessory: '佩戴 @图片1 所示商品',
        summary: effectiveLookBible,
      }
    : sanitizedLookParts;

  const effectiveIdentityBible = selectedPersonaAsset?.description
    ? `${selectedPersonaAsset.name}，${selectedPersonaAsset.description}`
    : identityBible ||
      '高颅顶蓬松法式微卷发、灵动小鹿眼与极富感染力自然笑颜的年轻东亚时尚博主，原生健康透光肤质，细微毛孔呼吸感与自然透光血色，原生野生眉与清透自然唇色，发际线有细碎微绒毛，神态松弛自信，极具生活温度';

  const effectiveStyleBible = selectedSceneAsset?.lighting
    ? `${selectedSceneAsset.lighting}，Shot on iPhone 16 Pro 原相机实拍，小红书真实博主生活随拍质感，无滤镜生图直出，真实自然环境漫射光与清晰物理接触阴影`
    : styleBible || '真实自然环境漫射光，立体通透';

  const formattedPrompts = diversified.map((p: any, pIdx: number) => {
    const availableActionAssets = assetLibraryData?.actions || [];
    const selectedActionAsset = availableActionAssets[pIdx];
    const assetSubject = resolveAssetShotSubject(selectedActionAsset || {});
    const hasHuman = assetSubject?.has_human ?? p.has_human;
    const shotType = assetSubject?.shot_type || p.shot_type;

    const shotAppliedAction = selectedActionAsset?.code
      ? `[#${selectedActionAsset.code.replace(/^#/, '')}] ${selectedActionAsset.title || ''}`
      : selectedActionAsset
        ? formatAssetWithCode(p.applied_action, availableActionAssets, 'A', pIdx)
        : undefined;

    let effectiveAction =
      selectedActionAsset?.action || p.action || '自然随性生活抓拍姿态，展现佩戴细节';
    let effectiveCamera =
      selectedActionAsset?.camera || p.camera_focal_length || 'iPhone 85mm 人像中近景镜头';
    let effectiveAngle =
      selectedActionAsset?.title ||
      p.angle ||
      (pIdx === 0
        ? '手腕/佩戴部位超清微距特写'
        : pIdx === 1
        ? '45° 侧颜中近景'
        : pIdx === 2
        ? '手部依托台面中近景'
        : '生活氛围中近景抓拍');

    const isJewelry =
      productRole === 'worn_accessory' ||
      /珠宝|首饰|配饰|发簪|耳饰|项链|手镯|戒指/.test(
        `${productFingerprintRaw} ${productRole || ''}`
      );
    if (isJewelry) {
      effectiveAngle = effectiveAngle
        .replace(/(全景|远景|全身站立|全身照|全身|长廊)+/g, '胸部以上中近景')
        .replace(/门廊前远景全景/g, '门廊前半身近镜头');
      effectiveAction = effectiveAction.replace(
        /(在[^\s，；;]*大步奔跑|大步快跑|跳跃奔跑|全速奔跑|跑动|路边蹲姿|坐在石阶|微模糊的复古跑动|门廊前远景全景展示)[^，；;]*/g,
        '桌前优雅倚靠，手部自然依托台面，半身近镜头展露佩戴首饰'
      );
      if (
        (effectiveCamera.includes('广角') ||
          effectiveCamera.includes('全景') ||
          effectiveCamera.includes('24mm') ||
          effectiveCamera.includes('35mm')) &&
        !effectiveCamera.includes('微距')
      ) {
        effectiveCamera = 'iPhone 85mm 人像中近景镜头';
      }
    }

    effectiveAction = stripGarmentsFromAction(effectiveAction, pIdx);

    const shotLighting = getShotLightingVariation(productIndex, pIdx);
    const effectiveShotLighting = selectedSceneAsset?.lighting
      ? `${selectedSceneAsset.lighting}；本镜采光：${shotLighting}`
      : shotLighting;

    const effectiveSceneConcept = `${effectiveMasterScene}，本镜机位：${effectiveAngle}`;
    const effectiveProp = p.prop || '随身手袋与生活小道具';

    const isMacroShot =
      /微距|超清微距|局部特写|手腕特写|锁骨特写|手指特写|耳际特写|局部近景|细节特写|试色特写/i.test(
        `${effectiveAngle} ${effectiveAction} ${effectiveCamera}`
      );
    const effectiveOptics = isMacroShot
      ? buildCategoryCloseUpOptics(
          inferProductCategoryAndAnatomy(productTitle, productProps).primaryCategory,
          inferProductCategoryAndAnatomy(productTitle, productProps).targetAnatomy,
          effectiveCamera,
          effectiveAngle
        )
      : isJewelry
      ? `${effectiveCamera}，${effectiveAngle}，Shot on iPhone 16 Pro 原相机实拍（Unedited RAW photo），f/1.8 自然光学浅景深，胸部以上中近景生活抓拍构图（Tight Bust-Up Frame），佩戴首饰的手部/部位自然置于前景显著受光处清晰展现（占据画面 35%~50% 面积），生动展露博主自然生活神态、私服穿搭氛围与清晰首饰细节，严禁退后到全身远景，微弱自然传感器胶片微颗粒感`
      : `${effectiveCamera}，${effectiveAngle}，Shot on iPhone 16 Pro 原相机实拍，自然手持或使用生活机位`;

    const assembled = assembleOriginalShotPrompt(
      {
        identityBible: effectiveIdentityBible,
        lookBible: effectiveLookBible,
        lookParts: effectiveLookParts,
        masterScene: effectiveMasterScene,
        styleBible: effectiveStyleBible,
        productRole,
        productFingerprint: productFingerprintRaw,
      },
      {
        shot_no: p.shot_no,
        expression: hasHuman === false ? '无（静物）' : (p.expression || '神态自然从容，眼神清澈灵动'),
        action: effectiveAction,
        prop: effectiveProp,
        optics: effectiveOptics,
        camera_focal_length: effectiveCamera,
        angle: effectiveAngle,
        lighting_type: effectiveShotLighting,
        scene: effectiveSceneConcept,
        title: selectedActionAsset?.title || p.title || effectiveAngle,
        has_human: hasHuman,
        promptFallback: hasHuman === false ? toPureProductPrompt((p.prompt || '').trim()) : (p.prompt || '').trim(),
      },
      { hasFace: hasAnchorFace && hasHuman !== false }
    );

    const harmonized = harmonizeOriginalPrompt(assembled, {
      scene: effectiveSceneConcept,
      action: effectiveAction,
      angle: effectiveAngle,
      camera: effectiveCamera,
      productRole,
      productFingerprint: productFingerprintRaw,
      hasHuman,
      appliedScene: hasHuman === false ? undefined : appliedSceneTitle,
      appliedOutfit: hasHuman === false ? undefined : appliedOutfitTitle,
      appliedPersona: hasHuman === false ? undefined : appliedPersonaName,
      appliedAction: shotAppliedAction,
    });

    return {
      shot_no: p.shot_no,
      title: selectedActionAsset?.title || p.title || effectiveAngle,
      scene: effectiveSceneConcept,
      expression: hasHuman === false ? '无（静物）' : (p.expression || '神态自然从容，眼神清澈灵动'),
      action: harmonized.action,
      prop: effectiveProp,
      optics: effectiveOptics,
      camera_focal_length: effectiveCamera,
      angle: harmonized.angle,
      lighting_type: effectiveShotLighting,
      has_human: hasHuman,
      shot_type: shotType,
      prompt: harmonized.prompt,
      applied_scene: hasHuman === false ? undefined : appliedSceneTitle,
      applied_outfit: hasHuman === false ? undefined : appliedOutfitTitle,
      applied_persona: hasHuman === false ? undefined : appliedPersonaName,
      applied_action: shotAppliedAction,
      appliedActionId: selectedActionAsset?.id,
    };
  });

  // 🚨 组内穿搭与防穿帮后置强同步
  let finalCanonicalOutfit = sanitizedLookParts;
  let finalLookBible = lookBible;
  if (groupHasHuman) {
    if (!finalCanonicalOutfit?.top || isGenericLook(finalCanonicalOutfit.top)) {
      const firstHuman = formattedPrompts.find((p: any) => p.has_human !== false);
      if (firstHuman) {
        const extracted = extractOutfitFromPrompt(firstHuman.prompt);
        if (extracted?.top && !isGenericLook(extracted.top)) {
          finalCanonicalOutfit = {
            top: extracted.top,
            bottom: extracted.bottom || '高腰直筒深色牛仔裤',
            shoes: '黑色复古乐福鞋',
            accessory: '佩戴 @图片1 所示商品',
          };
        }
      }
    }
    if (finalCanonicalOutfit?.top && !isGenericLook(finalCanonicalOutfit.top)) {
      finalLookBible = `身穿${finalCanonicalOutfit.top}${
        finalCanonicalOutfit.bottom ? `，搭配${finalCanonicalOutfit.bottom}` : ''
      }`;
    }
    formattedPrompts.forEach((p: any) => {
      if (p.has_human !== false) {
        p.prompt = enforceLookConsistency(
          p.prompt,
          finalCanonicalOutfit,
          productRole,
          productFingerprintRaw
        );
      } else {
        p.prompt = preventJewelryGlitches(p.prompt, productFingerprintRaw);
      }
    });
  }

  const actionDigest = buildActionDigestFromShots(formattedPrompts);

  // 递增资产使用频次
  try {
    const incrementOps: Promise<unknown>[] = [];
    if (selectedSceneAsset?.id) {
      incrementOps.push(
        prisma.sceneAsset.update({
          where: { id: selectedSceneAsset.id },
          data: { usageCount: { increment: 1 } },
        })
      );
    }
    if (selectedOutfitAsset?.id) {
      incrementOps.push(
        prisma.outfitAsset.update({
          where: { id: selectedOutfitAsset.id },
          data: { usageCount: { increment: 1 } },
        })
      );
    }
    if (selectedPersonaAsset?.id) {
      incrementOps.push(
        prisma.personaAsset.update({
          where: { id: selectedPersonaAsset.id },
          data: { usageCount: { increment: 1 } },
        })
      );
    }
    for (const actionId of (assetLibraryData?.actions || []).map((a: { id?: string }) => a.id).filter(Boolean)) {
      incrementOps.push(
        prisma.actionAsset.update({
          where: { id: actionId },
          data: { usageCount: { increment: 1 } },
        })
      );
    }
    if (incrementOps.length > 0) {
      await Promise.allSettled(incrementOps);
    }
  } catch (usageErr) {
    console.warn('[Analyze API] 资产 usageCount 递增忽略:', usageErr);
  }

  return {
    productFingerprintRaw,
    productRole: productRole || null,
    effectiveMasterScene: effectiveMasterScene || masterScene,
    masterScene,
    appliedSceneTitle,
    selectedSceneAssetId: selectedSceneAsset?.id || (assetPickTrace?.sceneId as string) || null,
    selectedOutfitAssetId: selectedOutfitAsset?.id || (assetPickTrace?.outfitId as string) || null,
    selectedPersonaAssetId: selectedPersonaAsset?.id || (assetPickTrace?.personaId as string) || null,
    appliedOutfitTitle,
    appliedPersonaName,
    finalLookBible: finalLookBible || lookBible,
    lookBible,
    finalCanonicalOutfit: finalCanonicalOutfit || sanitizedLookParts || lookParts || null,
    sanitizedLookParts,
    lookParts,
    styleBible,
    identityBible,
    actionDigest,
    groupSignature: (effectiveMasterScene || masterScene)
      ? { scene: effectiveMasterScene || masterScene, actionDigest }
      : null,
    prompts: formattedPrompts,
    actualModelUsed,
    triedModels,
    rawOutput,
    visionUsage,
    usedActionIds: (assetLibraryData?.actions || actionItems || []).map((a: any) => a.id).filter(Boolean),
    assetTrace: assetPickTrace || null,
  };
}
