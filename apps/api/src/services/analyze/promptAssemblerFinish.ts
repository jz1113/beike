import { db } from '../../repositories/access';
import {
  assembleOriginalShotPrompt,
  enforceLookConsistency,
  extractOutfitFromPrompt,
  isGenericLook,
  preventJewelryGlitches,
  harmonizeOriginalPrompt,
  stripGarmentsFromAction,
} from '@beike/domain/drawing';
import { buildActionDigestFromShots } from '@beike/domain/vision';
import { getShotLightingVariation } from '@beike/domain/assetSampling';
import {
  inferProductCategoryAndAnatomy,
  buildCategoryCloseUpOptics,
} from '@beike/domain/productCategory';
import { resolveAssetShotSubject } from '@beike/domain/workshopShotSubject';
import { buildBoundGroupPrompt, buildTransferableGroupDetails, maybeApplyJewelryCameraFallback } from '@beike/domain/workshopPipeline';
import { formatAssetWithCode, toPureProductPrompt } from './promptAssemblerFormat';
import { boundGroupAssetLabels } from './boundGroupAssetLabels';

export async function finishStoryboardAssembly(input: Record<string, any>) {
  const { diversified, filledSlots, assetLibraryData, productRole, productFingerprintRaw, productIndex, productTitle, productProps, effectiveMasterScene, effectiveIdentityBible, effectiveLookBible, effectiveLookParts, effectiveStyleBible, appliedSceneTitle, appliedOutfitTitle, appliedPersonaName, hasAnchorFace, lockedAssets, sanitizedLookParts, lookBible, groupHasHuman, selectedSceneAsset, selectedOutfitAsset, selectedPersonaAsset, actionItems, assetPickTrace, actualModelUsed, triedModels, rawOutput, visionUsage, masterScene, styleBible, identityBible, lookParts } = input;
const formattedPrompts = diversified.map((p: any, pIdx: number) => {
  const slot = filledSlots?.shots?.[pIdx];
  const availableActionAssets = assetLibraryData?.actions || [];
  const selectedActionAsset = slot?.actionAsset || availableActionAssets[pIdx];
  const assetSubject = resolveAssetShotSubject(selectedActionAsset || {});
  const hasHuman = slot?.hasHuman ?? assetSubject?.has_human ?? p.has_human;
  const shotType = slot?.shotType || assetSubject?.shot_type || p.shot_type;

  if (slot?.source === 'group_skeleton') {
    return {
      shot_no: slot.shotNo, title: slot.title, scene: slot.scene,
      action: slot.action, expression: '', prop: '', optics: slot.optics,
      camera_focal_length: slot.camera, angle: slot.angle, lighting_type: slot.lighting,
      has_human: slot.hasHuman, shot_type: slot.shotType || (slot.hasHuman ? 'model_shot' : 'pure_product'),
      prompt: buildBoundGroupPrompt(slot, productFingerprintRaw || productTitle),
      ...boundGroupAssetLabels(slot),
      used_asset_library: true, assembly_source: 'group_skeleton',
    };
  }

  const shotAppliedAction = selectedActionAsset?.code
    ? `[#${selectedActionAsset.code.replace(/^#/, '')}] ${selectedActionAsset.title || ''}`
    : selectedActionAsset
      ? formatAssetWithCode(p.applied_action, availableActionAssets, 'A', pIdx)
      : undefined;

  const isJewelry = productRole === 'worn_accessory' || /珠宝|首饰|配饰|发簪|耳饰|项链|手镯|戒指/.test(`${productFingerprintRaw} ${productRole || ''}`);
  const framed = maybeApplyJewelryCameraFallback({
    isJewelry,
    cameraFromAsset: Boolean(slot?.cameraFromAsset || selectedActionAsset?.camera || selectedActionAsset?.shotType),
    action: slot?.action || selectedActionAsset?.action || p.action || '自然随性生活抓拍姿态，展现佩戴细节',
    camera: slot?.camera || selectedActionAsset?.camera || p.camera_focal_length || 'iPhone 85mm 人像中近景镜头',
    angle: slot?.angle || selectedActionAsset?.title || p.angle || (pIdx === 0 ? '手腕/佩戴部位超清微距特写' : pIdx === 1 ? '45° 侧颜中近景' : pIdx === 2 ? '手部依托台面中近景' : '生活氛围中近景抓拍'),
  });
  if (slot) slot.cameraRewritten = framed.rewritten;
  const effectiveAction = stripGarmentsFromAction(framed.action, pIdx);
  const effectiveCamera = framed.camera;
  const effectiveAngle = framed.angle;

  const shotLighting = getShotLightingVariation(productIndex, pIdx);
  const effectiveShotLighting = slot?.source === 'group_skeleton' && slot.lighting
    ? slot.lighting
    : selectedSceneAsset?.lighting
    ? `${selectedSceneAsset.lighting}；本镜采光：${shotLighting}`
    : shotLighting;

  const effectiveSceneConcept = `${effectiveMasterScene}，本镜机位：${effectiveAngle}`;
  const effectiveProp = p.prop || (slot?.source === 'group_skeleton' ? '' : '随身手袋与生活小道具');

  const isMacroShot =
    /微距|超清微距|局部特写|手腕特写|锁骨特写|手指特写|耳际特写|局部近景|细节特写|试色特写/i.test(
      `${effectiveAngle} ${effectiveAction} ${effectiveCamera}`
    );
  const effectiveOptics = slot?.source === 'group_skeleton' && slot.optics
    ? slot.optics
    : isMacroShot
    ? buildCategoryCloseUpOptics(
        inferProductCategoryAndAnatomy(productTitle, productProps).primaryCategory,
        inferProductCategoryAndAnatomy(productTitle, productProps).targetAnatomy,
        effectiveCamera,
        effectiveAngle
      )
    : isJewelry && !slot?.cameraFromAsset
    ? `${effectiveCamera}，${effectiveAngle}，手机后置主摄自然生活抓拍，胸部以上中近景构图，佩戴首饰的手部/部位自然置于前景清晰展现（占据画面 35%~50% 面积），保留真实皮肤、衣料和首饰材质，不磨皮、不做商业棚拍，严禁退后到全身远景`
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
      promptFallback: hasHuman === false
        ? toPureProductPrompt((slot?.productSentence || p.prompt || '').trim())
        : (slot?.productSentence || (filledSlots ? '' : (p.prompt || '').trim())),
    },
    { hasFace: hasAnchorFace && hasHuman !== false, preserveComposition: Boolean(slot?.cameraFromAsset), skipRichPrompt: Boolean(filledSlots) },
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
  const sourceDetails = slot?.source === 'group_skeleton'
    ? buildTransferableGroupDetails(slot.sourcePrompt, Boolean(lockedAssets?.sceneId), slot.shotNo > 4)
    : '';
  const finalPrompt = sourceDetails
    ? `${harmonized.prompt}；【母本反推的可迁移镜头细节】${sourceDetails}；母本中的商品颜色、外观、品牌、型号和文字仅属于旧商品，全部以 @图片1 所示实物替换；人物、穿搭与场景以当前选定资产为准。`
    : harmonized.prompt;

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
    prompt: finalPrompt,
    applied_scene: hasHuman === false ? undefined : appliedSceneTitle,
    applied_outfit: hasHuman === false ? undefined : appliedOutfitTitle,
    applied_persona: hasHuman === false ? undefined : appliedPersonaName,
    applied_action: shotAppliedAction,
    appliedActionId: selectedActionAsset?.id,
    used_asset_library: slot ? slot.usedAssetLibrary : undefined,
    assembly_source: slot?.source,
  };
});

// 🚨 组内穿搭与防穿帮后置强同步
const boundGroup = filledSlots?.source === 'group_skeleton';
let finalCanonicalOutfit = boundGroup ? effectiveLookParts : sanitizedLookParts;
let finalLookBible = boundGroup && groupHasHuman ? effectiveLookBible : lookBible;
if (groupHasHuman && !boundGroup) {
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
      db.sceneAsset.update({
        where: { id: selectedSceneAsset.id },
        data: { usageCount: { increment: 1 } },
      })
    );
  }
  if (selectedOutfitAsset?.id) {
    incrementOps.push(
      db.outfitAsset.update({
        where: { id: selectedOutfitAsset.id },
        data: { usageCount: { increment: 1 } },
      })
    );
  }
  if (selectedPersonaAsset?.id) {
    incrementOps.push(
      db.personaAsset.update({
        where: { id: selectedPersonaAsset.id },
        data: { usageCount: { increment: 1 } },
      })
    );
  }
  for (const actionId of (assetLibraryData?.actions || []).map((a: { id?: string }) => a.id).filter(Boolean)) {
    incrementOps.push(
      db.actionAsset.update({
        where: { id: actionId },
        data: { usageCount: { increment: 1 } },
      })
    );
  }
  if (incrementOps.length > 0) {
    await Promise.allSettled(incrementOps);
  }
  const { recordAssetUsageEvents } = await import('../promptAsset/usage');
  await recordAssetUsageEvents({
    batchId: 'analyze',
    sceneId: selectedSceneAsset?.id,
    outfitId: selectedOutfitAsset?.id,
    personaId: selectedPersonaAsset?.id,
    actionIds: (assetLibraryData?.actions || []).map((item: { id?: string }) => item.id),
    eventType: 'analysis_used',
  });
} catch (usageErr) {
  console.warn('[Analyze API] 资产 usageCount 递增忽略:', usageErr);
}


  return {
    formattedPrompts,
    finalLookBible,
    finalCanonicalOutfit,
    actionDigest,
    productFingerprintRaw,
    productRole,
    effectiveMasterScene,
    masterScene,
    appliedSceneTitle,
    selectedSceneAsset,
    selectedOutfitAsset,
    selectedPersonaAsset,
    appliedOutfitTitle,
    appliedPersonaName,
    lookBible,
    sanitizedLookParts,
    lookParts,
    styleBible,
    identityBible,
    actualModelUsed,
    triedModels,
    rawOutput,
    visionUsage,
    assetLibraryData,
    actionItems,
    assetPickTrace,
    filledSlots,
  };
}
