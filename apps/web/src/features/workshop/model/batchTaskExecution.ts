import type { ShotPrompt } from '@beike/domain/vision';
import { enforceLookConsistency, isGenericLook } from '@beike/domain/drawing';
import { resolveGptImageSizeForModel } from '@beike/domain/modelAdapters/image/gptImageSafeSizes';
import { isActionAllowedForProduct } from '@beike/domain/phoneProductPolicy';
import { submitImageGenTaskResult } from '@/shared/api/generationApi';
import type { BatchProductItem } from './batchTypes';
import { compressProductImageIfNeeded } from './batchImageTasks';

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
  onTaskSubmitted?: (taskId: string) => void;
}

export async function executeSingleImageTask(
  item: BatchProductItem,
  shot: ShotPrompt,
  anchorFaceUrl: string | undefined,
  config: TaskExecutionConfig
): Promise<{ url: string; temporary: boolean }> {
  const chosenProductImg =
    item.selectedProductImages[0] || item.coverImage || shot.productImageUrl;
  let promptText = (shot.prompt || '').trim();
  if (shot.assembly_source !== 'group_skeleton' && item.lookParts?.top && !isGenericLook(item.lookParts.top) && shot.has_human !== false) {
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
  const qualityTier = (config.selectedQuality || 'high') as 'high' | 'medium' | 'low';
  const pixelSize = resolveGptImageSizeForModel(
    config.selectedAspect,
    config.selectedImageGenModel,
    qualityTier
  );

  return await submitImageGenTaskResult(
    {
      prompt: promptText,
      model: config.selectedImageGenModel,
      size: pixelSize,
      aspectRatio: config.selectedAspect,
      quality: config.selectedQuality,
      productImageUrl: safeProductImg,
      anchorFaceImageUrl: skipFace ? undefined : anchorFaceUrl || undefined,
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
      onTaskSubmitted: config.onTaskSubmitted,
    }
  );
}
