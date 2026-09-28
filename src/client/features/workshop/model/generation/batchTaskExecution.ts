import type { ShotPrompt } from '@shared/domain/prompts/vision';
import { enforceLookConsistency, isGenericLook, getAspectRatioFromSize } from '@shared/domain/media/drawing';
import { resolveWorkshopImageSize, verifyWorkshopImageSize } from './workshopImageSize';
import { isActionAllowedForProduct } from '@shared/domain/products/phoneProductPolicy';
import { submitImageGenTaskResult } from '@client/shared/api/generationApi';
import type { BatchProductItem } from '../batchTypes';
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
  outputSize?: string;
  onOutputSizeResolved?: (size: string) => void;
  onTaskSubmitted?: (taskId: string) => void;
  /** Confirmed original-workshop face anchor; sent only for human shots. */
  anchorFaceUrl?: string;
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
  // Keep the chosen front/cover as the stable @图片1 slot, while forwarding a
  // small set of additional views so the model can verify front/back/details.
  // Four views keeps the request bounded and avoids turning a product collage
  // into a noisy reference set.
  const productReferenceCandidates = Array.from(new Set([
    chosenProductImg,
    ...item.selectedProductImages,
  ].filter((img): img is string => Boolean(img)))).slice(0, 4);
  const safeProductImages = await Promise.all(
    productReferenceCandidates.map((img) => compressProductImageIfNeeded(img)),
  );
  const safeProductImg = safeProductImages[0];
  const safeAnchorFaceUrl = !skipFace && anchorFaceUrl
    ? await compressProductImageIfNeeded(anchorFaceUrl)
    : undefined;
  const qualityTier = (config.selectedQuality || 'high') as 'high' | 'medium' | 'low';
  const aspect = config.outputSize ? getAspectRatioFromSize(config.outputSize) : config.selectedAspect;
  const pixelSize = resolveWorkshopImageSize(
    aspect,
    config.selectedImageGenModel,
    qualityTier,
    config.outputSize
  );

  config.onOutputSizeResolved?.(pixelSize);
  const generated = await submitImageGenTaskResult(
    {
      prompt: promptText,
      model: config.selectedImageGenModel,
      size: pixelSize,
      aspectRatio: aspect,
      quality: config.selectedQuality,
      productImageUrl: safeProductImg,
      anchorFaceImageUrl: safeAnchorFaceUrl,
      padSocialRef: false,
      referenceImageUrl: safeProductImg,
      referenceImages: safeProductImages,
      productReferenceImages: safeProductImages,
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
  await verifyWorkshopImageSize(generated.url, pixelSize);
  return generated;
}
