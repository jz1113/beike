import { finishStoryboardAssembly } from './promptAssemblerFinish';
import {
  cleanPromptText,
  enforceOriginalShotDiversity,
  normalizeOriginalProductRole,
  sanitizeLookPartsForProductRole,
} from '@shared/domain/media/drawing';
import {
  parseResponseJson,
} from './analyzeVisionCall';
import { prepareProductSentenceShots } from './productSentenceResponse';
import { resolveAssetShotSubject } from '@shared/domain/workshop/workshopShotSubject';
import type { AssembleSlotsResult } from '@shared/domain/workshop/workshopPipeline';
import { formatAssetWithCode } from './promptAssemblerFormat';

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
  filledSlots?: AssembleSlotsResult;
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
    filledSlots,
  } = params;

  const parsedResult = parseResponseJson(rawOutput);

  // 🌟 原创生成：严格保证返回分镜数量 100% 等于用户指定的 shotCount (如4分镜)
  const targetCount = Math.max(1, Math.min(12, Number(shotCount) || 4));
  const { prompts: rawPrompts, parsedCount } = prepareProductSentenceShots(parsedResult.prompts, targetCount, {
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
  // 商品身份以用户选定商品为准，不能让视觉模型返回的泛品类词覆盖品牌/型号。
  const productFingerprintRaw = String(productTitle || '').trim() || parsedResult.product_fingerprint || '';
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

  const groupHasHuman = filledSlots?.shots?.length
    ? filledSlots.shots.some((shot) => shot.hasHuman)
    : draftPrompts.some((p: any) => p.has_human !== false);
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

  const baseScene = filledSlots?.shots?.[0]?.scene
    || (selectedSceneAsset?.description
      ? `${selectedSceneAsset.title}，${selectedSceneAsset.description}`
      : masterScene || '干净有质感的真实生活空间');
  const groupLocked = filledSlots?.source === 'group_skeleton';
  const effectiveMasterScene = groupLocked ? baseScene :
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

  const finished = await finishStoryboardAssembly({
    diversified,
    filledSlots,
    assetLibraryData,
    productRole,
    productFingerprintRaw,
    productIndex,
    productTitle,
    productProps,
    effectiveMasterScene,
    effectiveIdentityBible,
    effectiveLookBible,
    effectiveLookParts,
    effectiveStyleBible,
    appliedSceneTitle,
    appliedOutfitTitle,
    appliedPersonaName,
    hasAnchorFace,
    lockedAssets,
    sanitizedLookParts,
    lookBible,
    groupHasHuman,
    selectedSceneAsset,
    selectedOutfitAsset,
    selectedPersonaAsset,
    actionItems,
    assetPickTrace,
    actualModelUsed,
    triedModels,
    rawOutput,
    visionUsage,
    masterScene,
    styleBible,
    identityBible,
    lookParts
  });
  const {
    formattedPrompts,
    finalLookBible,
    finalCanonicalOutfit,
    actionDigest,
  } = finished;

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
    paddedCount: Math.max(0, targetCount - parsedCount),
    actualModelUsed,
    triedModels,
    rawOutput,
    visionUsage,
    usedActionIds: (assetLibraryData?.actions || actionItems || []).map((a: any) => a.id).filter(Boolean),
    assetTrace: assetPickTrace || null,
    usedAssetLibrary: filledSlots?.usedAssetLibrary,
    assemblySource: filledSlots?.source,
  };
}
