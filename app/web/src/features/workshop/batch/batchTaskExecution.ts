import type { ShotPrompt } from '@beike/domain/vision';
import {
  assembleGrid2x2Prompt,
  assembleReplicationGrid2x2Prompt,
  enforceLookConsistency,
  extractCanonicalOutfitFromPrompts,
  isGenericLook,
} from '@beike/domain/drawing';
import { sliceGridImage2x2 } from '@/lib/imageGridSlicer';
import { resolveGptImageSizeForModel } from '@beike/domain/modelAdapters/image/gptImageSafeSizes';
import type { BatchProductItem } from './batchTypes';
import { compressProductImageIfNeeded, submitImageGenTask } from './batchImageTasks';
import { ensureItemPromptsPad } from './batchPromptPadding';

export interface TaskExecutionConfig {
  batchMode: 'original' | 'replication';
  hasHumanPersona: boolean;
  selectedQuality: 'high' | 'medium' | 'low';
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  selectedImageGenModel: string;
  selectedShotCount: number;
  lockedSceneId?: string;
  availableScenes?: any[];
  isAborted: () => boolean;
}

export async function executeSingleImageTask(
  item: BatchProductItem,
  shot: ShotPrompt,
  anchorFaceUrl: string | undefined,
  config: TaskExecutionConfig
): Promise<string> {
  const isSocialMode = config.batchMode === 'replication';
  const chosenProductImg =
    shot.productImageUrl || item.selectedProductImages[0] || item.coverImage;
  let promptText = (shot.prompt || '').trim();
  if (item.lookParts?.top && !isGenericLook(item.lookParts.top) && shot.has_human !== false) {
    promptText = enforceLookConsistency(
      promptText,
      item.lookParts,
      item.productRole,
      item.productFingerprint || item.title
    );
  }

  if (!promptText) {
    throw new Error('提示词不能为空，请先完成视觉分析或补全分镜提示词');
  }
  if (!chosenProductImg) {
    throw new Error('缺少商品垫图，请先在选图步骤勾选商品图');
  }

  const safeProductImg = await compressProductImageIfNeeded(chosenProductImg);
  const qualityTier = (config.selectedQuality || 'high') as 'high' | 'medium' | 'low';
  const pixelSize = resolveGptImageSizeForModel(
    config.selectedAspect,
    config.selectedImageGenModel,
    qualityTier
  );

  return await submitImageGenTask(
    {
      prompt: promptText,
      model: config.selectedImageGenModel,
      size: pixelSize,
      aspectRatio: config.selectedAspect,
      quality: config.selectedQuality,
      productImageUrl: safeProductImg,
      anchorFaceImageUrl: anchorFaceUrl || undefined,
      padSocialRef: false,
      referenceImageUrl: safeProductImg,
      useReferenceImage: true,
      has_human: shot.has_human !== undefined ? shot.has_human : config.hasHumanPersona,
      shot_type: shot.shot_type,
      shot_no: shot.shot_no,
      productTitle: item.title || '电商商品',
      productFingerprint: item.productFingerprint || item.title || undefined,
      productRole: item.productRole || undefined,
      workshopMode: isSocialMode ? 'social_face_product_swap' : 'storyboard_generate',
    },
    {
      isAborted: config.isAborted,
    }
  );
}

export async function executeGridImageTask(
  item: BatchProductItem,
  config: TaskExecutionConfig
): Promise<string> {
  const isSocialMode = config.batchMode === 'replication';
  let gridPrompt = (item.gridPrompt || '').trim();
  if (!gridPrompt) {
    if (!item.prompts || item.prompts.length === 0) {
      throw new Error(
        `【生产安全阻断】：商品「${item.title || item.id}」尚未经过 AI 视觉分析生成分镜提示词，严禁使用兜底词生图！请先在步骤3完成 AI 分析`
      );
    }
    const paddedPrompts = ensureItemPromptsPad(
      item,
      {
        batchMode: config.batchMode,
        hasHumanPersona: config.hasHumanPersona,
        lockedSceneId: config.lockedSceneId,
        availableScenes: config.availableScenes || [],
        selectedShotCount: config.selectedShotCount,
      }
    );
    const effectivePrompts = (paddedPrompts.length > 0 ? paddedPrompts : item.prompts).filter(
      (shot) => shot.selected !== false
    );
    const canonicalOutfit =
      effectivePrompts && effectivePrompts.length > 0
        ? extractCanonicalOutfitFromPrompts(effectivePrompts, item.productFingerprint || item.title)
        : null;
    const effectiveLookParts =
      canonicalOutfit?.top && !isGenericLook(canonicalOutfit.top)
        ? canonicalOutfit
        : item.lookParts || undefined;
    const effectiveLookBible =
      canonicalOutfit?.top && !isGenericLook(canonicalOutfit.top)
        ? `身穿${canonicalOutfit.top}${canonicalOutfit.bottom ? `，搭配${canonicalOutfit.bottom}` : ''}`
        : item.lookBible || '质感显白私服穿搭';
    const gridBible = {
      identityBible: item.identityBible || (config.hasHumanPersona ? '' : '纯商品静物，无人物'),
      lookBible: effectiveLookBible,
      lookParts: effectiveLookParts,
      masterScene: item.masterScene || '真实买家秀生活场景',
      styleBible: item.styleBible,
      productRole: item.productRole || undefined,
      productFingerprint: item.productFingerprint || item.title || undefined,
    };
    const gridShots = (
      effectivePrompts.length >= 4 ? effectivePrompts.slice(0, 4) : paddedPrompts.slice(0, 4)
    ).map((p) => ({
      shot_no: p.shot_no,
      title: p.title,
      expression: p.expression,
      action: p.action,
      prop: p.prop,
      optics: p.optics,
      camera_focal_length: p.camera_focal_length,
      angle: p.angle,
      lighting_type: p.lighting_type,
      scene: p.scene,
      has_human: p.has_human,
    }));
    gridPrompt = isSocialMode
      ? assembleReplicationGrid2x2Prompt(gridBible, gridShots, { macroSlotIndex: 0 })
      : assembleGrid2x2Prompt(gridBible, gridShots, { macroSlotIndex: 0 });
  }

  if (!gridPrompt) {
    throw new Error('未能生成有效的四宫格提示词');
  }
  const chosenProductImg = item.selectedProductImages[0] || item.coverImage;
  if (!chosenProductImg) {
    throw new Error('缺少商品垫图，请先在选图步骤勾选商品图');
  }

  const safeProductImg = await compressProductImageIfNeeded(chosenProductImg);
  const qualityTier = (config.selectedQuality || 'high') as 'high' | 'medium' | 'low';
  const pixelSize = resolveGptImageSizeForModel(
    config.selectedAspect,
    config.selectedImageGenModel,
    qualityTier
  );

  return await submitImageGenTask(
    {
      prompt: gridPrompt,
      model: config.selectedImageGenModel,
      size: pixelSize,
      aspectRatio: config.selectedAspect,
      quality: config.selectedQuality,
      isGrid2x2: true,
      productImageUrl: safeProductImg,
      padSocialRef: false,
      referenceImageUrl: safeProductImg,
      useReferenceImage: true,
      has_human: config.hasHumanPersona,
      productTitle: item.title || '电商商品',
      productFingerprint: item.productFingerprint || item.title || undefined,
      productRole: item.productRole || undefined,
      workshopMode: isSocialMode ? 'social_face_product_swap' : 'storyboard_generate',
    },
    {
      isAborted: config.isAborted,
    }
  );
}

export async function generateItemViaGrid(
  currentItem: BatchProductItem,
  currentItemId: string,
  config: TaskExecutionConfig,
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>,
  bumpProgress: (ok: boolean, n?: number) => void
): Promise<void> {
  setItems((prev) =>
    prev.map((p) => {
      if (p.id !== currentItemId) return p;
      return {
        ...p,
        tasks: p.tasks.map((t) => ({ ...t, status: 'IN_PROGRESS' as const, error: undefined })),
      };
    })
  );

  let masterGridUrl: string | undefined;
  let gridError: string | undefined;

  for (let gridAttempt = 0; gridAttempt < 2; gridAttempt++) {
    try {
      masterGridUrl = await executeGridImageTask(currentItem, config);
      if (masterGridUrl) break;
    } catch (err: unknown) {
      gridError = err instanceof Error ? err.message : '四宫格生图失败';
      console.warn(`[generateItemViaGrid] 四宫格第 ${gridAttempt + 1} 次尝试未成功:`, currentItem.title, err);
      if (gridAttempt === 0 && !config.isAborted()) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  if (!masterGridUrl) {
    console.error('[generateItemViaGrid] 四宫格大图未能生成:', currentItem.title, gridError);
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== currentItemId) return p;
        return {
          ...p,
          tasks: p.tasks.map((t) => ({
            ...t,
            status: 'FAILURE' as const,
            error: gridError || '四宫格生图失败，点击可重试',
          })),
        };
      })
    );
    bumpProgress(false, 4);
    return;
  }

  let sliced: [string, string, string, string] | undefined;
  try {
    sliced = await sliceGridImage2x2(masterGridUrl, {
      targetWidth: 1440,
      targetHeight: 1920,
      autoTrimBorders: true,
      quality: 0.96,
    });
  } catch (sliceErr: unknown) {
    const msg = sliceErr instanceof Error ? sliceErr.message : '四宫格切片失败';
    console.error('[generateItemViaGrid] 四宫格切片失败:', currentItem.title, sliceErr);
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== currentItemId) return p;
        return {
          ...p,
          masterGridUrl,
          tasks: p.tasks.map((t) => ({
            ...t,
            status: 'FAILURE' as const,
            error: msg,
          })),
        };
      })
    );
    bumpProgress(false, 4);
    return;
  }

  setItems((prev) =>
    prev.map((p) => {
      if (p.id !== currentItemId) return p;
      return {
        ...p,
        masterGridUrl,
        tasks: p.tasks.map((t, idx) => ({
          ...t,
          status: 'SUCCESS' as const,
          resultUrl: sliced![idx],
          error: undefined,
        })),
      };
    })
  );
  bumpProgress(true, 4);
}
