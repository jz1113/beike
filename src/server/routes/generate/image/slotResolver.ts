import {
  finalizeImagePrompt,
  normalizeReferenceMentions,
  resolveReferenceMentionNames,
  normalizeLegacyMultiAnglePrompt,
} from '@shared/domain/media/drawing';
import { createImageConvertCache } from '@shared/domain/core/latencyAudit';
import { emphasizeIdentityFacePlate } from '@server/infrastructure/media/faceObfuscate';
import { fetchImageAsSafeDataUrl } from '../../../services/models/gatewayCredentials';

export interface ImageSlotResolutionResult {
  isHumanShot: boolean;
  isWorkshopOriginal: boolean;
  isPlainMode: boolean;
  targetProductUrl: string | null;
  safeRef?: string;
  faceForSlots?: string;
  cleanSceneAnchorUrl?: string | null;
  orderedSlotImages: string[];
  multiImages: string[];
  primaryImgUrl?: string;
  editsImageUrls: string[];
  cleanedPrompt: string;
  identityLockedSlots: string[] | null;
  convertMs: number;
  imageCount: number;
  convertCacheHits: number;
  error?: string;
}

export async function resolveImageSlotsAndPrompt(body: any): Promise<ImageSlotResolutionResult> {
  const {
    prompt,
    model = 'gpt-image-2',
    productImageUrl,
    referenceImageUrl,
    referenceImages,
    productReferenceImages,
    images,
    anchorFaceImageUrl,
    sceneAnchorImageUrl,
    has_human,
    hasHuman,
    shot_type,
    shotType,
    productTitle,
    workshopMode,
    productRole,
    productFingerprint,
    source,
    referenceMentionNames,
  } = body;

  const finalHasHuman = has_human !== undefined ? has_human : hasHuman;
  const finalShotType = shot_type || shotType;
  const isHumanShot = finalHasHuman === true || (finalHasHuman !== false && finalShotType === 'model_shot');
  const isWorkshopOriginal = workshopMode === 'storyboard_generate';
  const isPlainMode = source === 'hub' || source === 'home' || !isWorkshopOriginal;
  const rawProductReferenceImages = Array.isArray(productReferenceImages)
    ? productReferenceImages.filter((img: unknown): img is string => typeof img === 'string' && Boolean(img.trim())).slice(0, 4)
    : [];
  const finalizePromptOptions = {
    workshopMode: isWorkshopOriginal ? ('storyboard_generate' as const) : ('hub' as const),
    hasHuman: isHumanShot,
    hasFace: Boolean(anchorFaceImageUrl) && isHumanShot,
    hasSceneAnchor: Boolean(sceneAnchorImageUrl),
    hasSupplementaryProductViews: rawProductReferenceImages.length > 1,
    productRole,
    productFingerprint: productFingerprint || productTitle || undefined,
  };

  let convertCacheHits = 0;
  const convertOnce = createImageConvertCache(fetchImageAsSafeDataUrl);
  const seenKeys = new Set<string>();
  const convertTracked = (raw?: string | null) => {
    if (raw?.trim()) {
      if (seenKeys.has(raw.trim())) convertCacheHits += 1;
      else seenKeys.add(raw.trim());
    }
    return convertOnce(raw);
  };

  const tConvert0 = Date.now();
  const [targetProductUrl, rawFaceUrl, cleanSceneAnchorUrl, cleanRefUrl, convertedProductRefs] = await Promise.all([
    convertTracked(productImageUrl),
    convertTracked(anchorFaceImageUrl),
    convertTracked(sceneAnchorImageUrl),
    convertTracked(referenceImageUrl),
    Promise.all(rawProductReferenceImages.map((img) => convertTracked(img))),
  ]);
  const cleanFaceUrl = rawFaceUrl && isHumanShot
    ? (await emphasizeIdentityFacePlate(rawFaceUrl)) || rawFaceUrl
    : rawFaceUrl;
  const faceForSlots = isHumanShot ? cleanFaceUrl || undefined : undefined;
  const safeRef = cleanRefUrl || (typeof referenceImageUrl === 'string' ? referenceImageUrl.trim() : undefined);
  const safeProductReferences = Array.from(new Set([
    targetProductUrl,
    ...convertedProductRefs,
  ].filter((img): img is string => Boolean(img))));

  if (isWorkshopOriginal && !targetProductUrl) {
    return {
      isHumanShot, isWorkshopOriginal, isPlainMode, targetProductUrl: null,
      orderedSlotImages: [], multiImages: [], editsImageUrls: [], cleanedPrompt: '', identityLockedSlots: null,
      convertMs: Date.now() - tConvert0, imageCount: 0, convertCacheHits,
      error: '原创生图缺少商品垫图（@图片1）。请在素材步选好商品图并开启「强制跟商品图」。',
    };
  }

  const originalOrderedSlots = isWorkshopOriginal
    ? ([
        targetProductUrl,
        ...(faceForSlots ? [faceForSlots] : []),
        ...(cleanSceneAnchorUrl ? [cleanSceneAnchorUrl] : []),
        ...safeProductReferences.filter((img) => img !== targetProductUrl),
      ].filter(Boolean) as string[])
    : [];
  const rawPassedImages = Array.isArray(images) && images.length > 0
    ? images
    : Array.isArray(referenceImages) && referenceImages.length > 0
      ? referenceImages
      : safeRef ? [safeRef] : [];
  const safePassedImages = (await Promise.all(rawPassedImages.map(async (img: string) => {
    const converted = await convertTracked(img);
    return converted || (typeof img === 'string' && img.trim() ? img.trim() : undefined);
  }))).filter((img): img is string => Boolean(img));
  const orderedSlotImages = originalOrderedSlots.length > 0
    ? Array.from(new Set([...originalOrderedSlots, ...safePassedImages]))
    : Array.from(new Set([targetProductUrl, safeRef, faceForSlots, cleanSceneAnchorUrl, ...safePassedImages].filter(Boolean) as string[]));
  const multiImages = orderedSlotImages.length > 0 ? orderedSlotImages : safePassedImages;
  const primaryImgUrl = multiImages[0];

  let promptForFinalize = normalizeLegacyMultiAnglePrompt(prompt);
  if (String(model).toLowerCase().includes('gpt-image') && multiImages.length > 0) {
    promptForFinalize = normalizeReferenceMentions(
      promptForFinalize,
      resolveReferenceMentionNames(promptForFinalize, multiImages.length, referenceMentionNames),
    );
  }
  const cleanedPrompt = isPlainMode || multiImages.length === 0
    ? promptForFinalize
    : finalizeImagePrompt(promptForFinalize, finalizePromptOptions);

  return {
    isHumanShot,
    isWorkshopOriginal,
    isPlainMode,
    targetProductUrl: targetProductUrl || null,
    safeRef,
    faceForSlots,
    cleanSceneAnchorUrl,
    orderedSlotImages,
    multiImages,
    primaryImgUrl,
    editsImageUrls: multiImages,
    cleanedPrompt,
    identityLockedSlots: null,
    convertMs: Date.now() - tConvert0,
    imageCount: multiImages.length,
    convertCacheHits,
  };
}
