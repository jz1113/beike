import type { ShotPrompt } from '@beike/domain/vision';
import {
  assembleGrid2x2Prompt,
  enforceLookConsistency,
  extractCanonicalOutfitFromPrompts,
  isGenericLook,
} from '@beike/domain/drawing';
import { sliceGridImage2x2 } from '@/shared/media/imageGridSlicer';
import { resolveGptImageSizeForModel } from '@beike/domain/modelAdapters/image/gptImageSafeSizes';
import { isActionAllowedForProduct } from '@beike/domain/phoneProductPolicy';
import type { BatchProductItem } from './batchTypes';
import { compressProductImageIfNeeded, submitImageGenTask } from './batchImageTasks';
import { ensureItemPromptsPad } from './batchPromptPadding';

export interface TaskExecutionConfig {
  selectedQuality: 'high' | 'medium' | 'low';
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  selectedImageGenModel: string;
  selectedShotCount: number;
  lockedSceneId?: string;
  availableScenes?: any[];
  isAborted: () => boolean;
  isPaused?: () => boolean;
  idempotencyKey?: string;
}

function gridSliceSize(aspect: string): { targetWidth: number; targetHeight: number } {
  if (aspect === '1:1') return { targetWidth: 1440, targetHeight: 1440 };
  if (aspect === '16:9') return { targetWidth: 1920, targetHeight: 1080 };
  if (aspect === '9:16') return { targetWidth: 1080, targetHeight: 1920 };
  return { targetWidth: 1440, targetHeight: 1920 };
}

export async function executeSingleImageTask(
  item: BatchProductItem,
  shot: ShotPrompt,
  anchorFaceUrl: string | undefined,
  config: TaskExecutionConfig
): Promise<string> {
  const chosenProductImg =
    item.selectedProductImages[0] || item.coverImage || shot.productImageUrl;
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
  if (!isActionAllowedForProduct(item.title, { title: shot.title })) {
    throw new Error('该分镜为过期包装机位，请重新分析');
  }

  const skipFace = shot.has_human === false || shot.shot_type === 'pure_product' || shot.shot_type === 'hand_held_only';
  const safeProductImg = await compressProductImageIfNeeded(chosenProductImg);
  const compositionRef = shot.compositionReferenceImageUrl;
  if (compositionRef) {
    promptText += '；原图组参考图只用于复刻构图、机位、景别和动作节奏。人物、穿搭、场景以当前分镜提示词中的设定为准；如与参考图不同，必须替换。严禁复制参考图里的商品品牌、型号、文字或 logo；商品外观和身份必须完全以 @图片1 为准。';
  }
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
      anchorFaceImageUrl: skipFace ? undefined : anchorFaceUrl || undefined,
      sceneAnchorImageUrl: compositionRef,
      padSocialRef: false,
      referenceImageUrl: safeProductImg,
      useReferenceImage: true,
      has_human: shot.has_human !== undefined ? shot.has_human : true,
      shot_type: shot.shot_type,
      shot_no: shot.shot_no,
      productTitle: item.title || '电商商品',
      productFingerprint: item.productFingerprint || item.title || undefined,
      productRole: item.productRole || undefined,
      workshopMode: 'storyboard_generate',
    },
    {
      isAborted: config.isAborted,
      isPaused: config.isPaused,
      idempotencyKey: config.idempotencyKey,
    }
  );
}

export async function executeGridImageTask(
  item: BatchProductItem,
  config: TaskExecutionConfig
): Promise<string> {
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
      identityBible: item.identityBible || (effectivePrompts.every((shot) => shot.has_human === false) ? '纯商品静物，无人物' : ''),
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
      promptFallback: p.prompt,
    }));
    gridPrompt = assembleGrid2x2Prompt(gridBible, gridShots, { macroSlotIndex: 0 });
    const confirmedEdits = gridShots
      .map((shot) => (shot.promptFallback || '').trim())
      .filter((text) => text.length > 0);
    if (confirmedEdits.length > 0) {
      gridPrompt = `${gridPrompt}\n\n【已确认分镜描述】：\n${confirmedEdits.join('\n')}`;
    }
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
      has_human: item.prompts?.some((shot) => shot.has_human !== false) ?? true,
      productTitle: item.title || '电商商品',
      productFingerprint: item.productFingerprint || item.title || undefined,
      productRole: item.productRole || undefined,
      workshopMode: 'storyboard_generate',
    },
    {
      isAborted: config.isAborted,
      isPaused: config.isPaused,
      idempotencyKey: config.idempotencyKey,
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

  try {
    masterGridUrl = await executeGridImageTask(currentItem, config);
  } catch (err: unknown) {
    gridError = err instanceof Error ? err.message : '四宫格生图失败';
    console.warn('[generateItemViaGrid] 四宫格提交结果不确定，停止自动重发:', currentItem.title, err);
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
    const sliceSize = gridSliceSize(config.selectedAspect);
    sliced = await sliceGridImage2x2(masterGridUrl, {
      ...sliceSize,
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
