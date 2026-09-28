import { isAppearanceRotation, parseAppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import {
  assembleStoryboardSlots,
  buildProductOnlyVisionPrompt,
  extractProductSentences,
  fillProductSentences,
  expandGroupShotSkeleton,
} from '@shared/domain/workshop/workshopPipeline';
import { evaluateStoryboardQuality } from '@shared/domain/prompts/promptAsset';
import {
  prepareAnalyzeImages,
  callVisionModel,
  buildVisionContent,
  parseResponseJson,
} from './analyzeVisionCall';
import { assembleStoryboardShots } from './promptAssembler';
import { rotateAppearance } from './appearanceRotation';
import { audiencesCompatible } from '@shared/domain/assets/appearanceAudience';
import { resolveBoundGroupAppearance } from '@shared/domain/workshop/workshopPipeline/boundGroupPrompt';
import { loadLockedGroupSkeleton, loadStoryboardLibrary } from './storyboardRecall';

export interface ExecuteStoryboardParams {
  productTitle?: string;
  productProps?: any;
  imageUrls: string[];
  anchorFaceImageUrl?: string;
  modelPersona?: string;
  productFingerprint?: string;
  resolvedTemplateStyle: string;
  shotCount: number;
  extraRequirements: string;
  model: string;
  fallbackModels?: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  apiFormat?: 'openai-responses';
  hasAnchorFace: boolean;
  previousMasterScenes?: any[];
  previousGroupSignatures?: any[];
  previousActionIds?: any[];
  previousSceneIds?: any[];
  allocatedAssets?: any;
  lockedAssets?: any;
  productIndex: number;
  useAssetLibrary?: boolean;
  batchId?: string;
  productId?: string;
}

export async function executeStoryboard(params: ExecuteStoryboardParams) {
  const {
    productTitle, productProps, imageUrls = [], anchorFaceImageUrl, modelPersona,
    resolvedTemplateStyle, shotCount, extraRequirements, model, fallbackModels,
    targetBaseUrl, targetApiKey, apiFormat, hasAnchorFace, previousActionIds = [], previousSceneIds = [],
    allocatedAssets, lockedAssets, productIndex, useAssetLibrary, batchId, productId,
  } = params;

  if (!productTitle && imageUrls.length === 0) {
    throw new Error('缺少商品标题或商品图片素材');
  }

  const lockedGroup = await loadLockedGroupSkeleton({
    fullPromptId: lockedAssets?.fullPromptId,
    groupAppearance: modelPersona === 'none' ? 'product'
      : lockedAssets?.groupAppearance === 'human' || lockedAssets?.groupAppearance === 'product'
        ? lockedAssets.groupAppearance : undefined,
    batchId,
    productId,
    productTitle,
    productProps,
    productIndex,
  });
  if (modelPersona === 'none' && lockedGroup.groupAppearance !== 'product') {
    throw new Error('当前批次设置为无人物，但所选母版包含人物或出镜类型未确认，请选择无人物母版');
  }
  const acceptsPeople = modelPersona !== 'none' && lockedGroup.groupAppearance === 'human' && lockedGroup.shots.some(
    (shot) => shot.has_human !== false && shot.shot_type !== 'hand_held_only' && shot.shot_type !== 'pure_product',
  );
  const rotatePersona = acceptsPeople && modelPersona !== 'none' && isAppearanceRotation(lockedAssets?.personaId);
  const rotateOutfit = acceptsPeople && modelPersona !== 'none' && isAppearanceRotation(lockedAssets?.outfitId);
  const effectiveLockedAssets = {
    ...lockedAssets, fullPromptId: lockedGroup.id,
    personaId: acceptsPeople && !rotatePersona ? lockedAssets?.personaId : undefined,
    outfitId: acceptsPeople && !rotateOutfit ? lockedAssets?.outfitId : undefined,
  };

  let assetLibraryData: any;
  let assetPickTrace: Record<string, unknown> | undefined;
  let actionItems: any[] = [];
  if (useAssetLibrary !== false || effectiveLockedAssets.personaId || effectiveLockedAssets.sceneId || effectiveLockedAssets.outfitId) {
    try {
      const loaded = await loadStoryboardLibrary({
        productTitle, productProps, productIndex, previousActionIds, previousSceneIds,
        allocatedAssets, lockedAssets: effectiveLockedAssets, batchId,
      });
      assetLibraryData = loaded.assetLibraryData;
      assetPickTrace = loaded.assetPickTrace;
      actionItems = loaded.actionItems;
    } catch (assetErr) {
      if (lockedAssets?.personaId || lockedAssets?.sceneId || lockedAssets?.outfitId) throw assetErr;
      console.warn('[Analyze API] 读取提示词资产库失败，使用拍摄架构兜底:', assetErr);
    }
  }

  // 沿用图组的场景、人物与穿搭；仅用户明确锁定的槽位才覆盖。
  assetLibraryData ||= { personas: [], scenes: [], outfits: [], actions: [] };
  assetLibraryData.actions = [];
  if (!effectiveLockedAssets.sceneId && lockedGroup.sceneSummary) {
    assetLibraryData.scenes = [{ title: '图组原场景', description: lockedGroup.sceneSummary }];
  }
  if (!effectiveLockedAssets.personaId && lockedGroup.personaSummary && lockedGroup.hasHuman) {
    assetLibraryData.personas = [{ name: '图组原人物', description: lockedGroup.personaSummary }];
  }
  if (!effectiveLockedAssets.outfitId && lockedGroup.outfitSummary && lockedGroup.hasHuman) {
    assetLibraryData.outfits = [{ title: '图组原穿搭', top: lockedGroup.outfitSummary, bottom: '' }];
  }
  if (rotatePersona || rotateOutfit) {
    const selected = await rotateAppearance({
      rotatePersona, rotateOutfit, batchId,
      personaSelection: rotatePersona ? parseAppearanceSelection(lockedAssets.personaId) : undefined,
      outfitSelection: rotateOutfit ? parseAppearanceSelection(lockedAssets.outfitId, true) : undefined,
      persona: assetLibraryData.personas[0] || {}, outfit: assetLibraryData.outfits[0] || {},
    });
    assetLibraryData.personas = [selected.persona];
    assetLibraryData.outfits = [selected.outfit];
    if (rotatePersona) effectiveLockedAssets.personaId = selected.persona.id;
    if (rotateOutfit) effectiveLockedAssets.outfitId = selected.outfit.id;
    assetPickTrace = { ...assetPickTrace, personaId: selected.persona.id, outfitId: selected.outfit.id };
  }
  const personaMode = modelPersona === 'none' || lockedGroup?.hasHuman === false ? 'none' : 'asset_driven';
  const assembledSlots = assembleStoryboardSlots({
    shotCount,
    assets: assetLibraryData,
    replaceScene: Boolean(effectiveLockedAssets.sceneId),
    lockedGroupShots: expandGroupShotSkeleton(lockedGroup.shots, shotCount)
      .map((shot) => effectiveLockedAssets.sceneId ? { ...shot, scene: '', lighting_type: '' } : shot),
    personaMode,
  });
  if (acceptsPeople && (effectiveLockedAssets.personaId || effectiveLockedAssets.outfitId)) {
    for (const slot of assembledSlots.shots) {
      if (!slot.hasHuman || slot.shotType === 'hand_held_only' || slot.shotType === 'pure_product') continue;
      const appearance = resolveBoundGroupAppearance(slot);
      if (!audiencesCompatible({ ...assetLibraryData.personas[0], description: appearance.persona }, { ...assetLibraryData.outfits[0], reversePrompt: appearance.outfit })) {
        throw new Error('人物与穿搭的性别、年龄段不匹配或尚未分类，请选择兼容组合，或将人物和穿搭同时设为自动轮换。男性人物不会配用女装。');
      }
    }
  }
  let filledSlots = {
    ...assembledSlots,
    usedAssetLibrary: true,
    shots: assembledSlots.shots.map((shot) => ({ ...shot, usedAssetLibrary: true })),
  };

  const assetDrivenNoModel = filledSlots.shots.length > 0 && filledSlots.shots.every((shot) => shot.hasHuman === false);
  let systemPrompt = buildProductOnlyVisionPrompt({
    productTitle,
    productProps,
    shotCount: filledSlots.shotCount,
    templateStyle: resolvedTemplateStyle !== 'auto' ? resolvedTemplateStyle : undefined,
    slots: filledSlots.shots,
  });
  if (extraRequirements) systemPrompt += `\n${extraRequirements}`;
  const imagesToInspect = [
    ...(Array.isArray(imageUrls) ? imageUrls : []).slice(0, 3),
    ...(hasAnchorFace && !assetDrivenNoModel ? [anchorFaceImageUrl] : []),
  ].filter(Boolean) as string[];
  if (hasAnchorFace && !assetDrivenNoModel) {
    systemPrompt += `\n【传入图片顺序】：商品图 @图片1；最后一张为正脸 ID。`;
  }

  const preparedImages = await prepareAnalyzeImages(imagesToInspect);
  const visionResult = await callVisionModel(
    model, buildVisionContent(systemPrompt, preparedImages), targetBaseUrl, targetApiKey, fallbackModels, false, apiFormat,
  );
  if (!visionResult.rawText) {
    throw new Error(`视觉模型 [${visionResult.actualModel}] 未返回任何内容，请检查模型可用性或切换其他模型`);
  }

  filledSlots = fillProductSentences(filledSlots, extractProductSentences(parseResponseJson(visionResult.rawText)));
  const assembled = await assembleStoryboardShots({
    rawOutput: visionResult.rawText,
    shotCount: filledSlots.shotCount,
    productTitle, productProps, isNoModel: assetDrivenNoModel, hasAnchorFace, productIndex,
    assetLibraryData, lockedAssets: effectiveLockedAssets, assetPickTrace, actionItems,
    actualModelUsed: visionResult.actualModel, triedModels: visionResult.triedModels,
    visionUsage: visionResult.usage ? { ...visionResult.usage } : null,
    filledSlots,
  });
  const qualityChecks = evaluateStoryboardQuality({
    productTitle,
    productFingerprint: assembled.productFingerprintRaw || params.productFingerprint,
    personaMode,
    shots: (assembled.prompts || []).map((prompt: any, index: number) => ({
      shotNo: prompt.shot_no || index + 1,
      prompt: String(prompt.prompt || ''),
      actionId: prompt.appliedActionId,
      shotType: prompt.shot_type,
      hasHuman: prompt.has_human,
      personaId: assembled.selectedPersonaAssetId,
      sceneId: assembled.selectedSceneAssetId,
      outfitId: assembled.selectedOutfitAssetId,
      camera: prompt.camera_focal_length,
      expectedCamera: filledSlots.shots[index]?.camera,
      cameraFromAsset: filledSlots.shots[index]?.cameraFromAsset,
    })),
  });
  return {
    ...assembled,
    assetTrace: {
      ...assembled.assetTrace,
      fullPromptId: lockedGroup.id,
      fullPromptTitle: lockedGroup.title,
      fullPromptSelectionMode: lockedGroup.selectionMode,
      fullPromptAppearance: lockedGroup.groupAppearance,
    },
    qualityChecks,
    usedAssetLibrary: filledSlots.usedAssetLibrary,
    assemblySource: filledSlots.source,
  };
}
