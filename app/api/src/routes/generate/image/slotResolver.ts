import {
  finalizeImagePrompt,
  normalizeReferenceMentions,
  resolveReferenceMentionNames,
  normalizeLegacyMultiAnglePrompt,
} from '@beike/domain/drawing';
import { createImageConvertCache } from '@beike/domain/latencyAudit';
import { emphasizeIdentityFacePlate, obfuscateCompositionFaces } from '@beike/server-kit/faceObfuscate';
import { fetchImageAsSafeDataUrl } from '../../../services/imageHelpers';

export interface ImageSlotResolutionResult {
  isHumanShot: boolean;
  socialMode: boolean;
  isWorkshopOriginal: boolean;
  isPlainMode: boolean;
  targetProductUrl: string | null;
  safeSocialRef?: string;
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

export async function resolveImageSlotsAndPrompt(
  body: any,
  options: {
    finalSize: string;
    effectiveAspect: string;
    effectiveQuality: string;
  }
): Promise<ImageSlotResolutionResult> {
  const {
    prompt,
    model = 'gpt-image-2',
    productImageUrl,
    referenceImageUrl,
    socialReferenceImageUrl,
    referenceImages,
    images,
    anchorFaceImageUrl,
    sceneAnchorImageUrl,
    has_human,
    hasHuman,
    shot_type,
    shotType,
    useReferenceImage = false,
    productTitle,
    workshopMode,
    productRole,
    productFingerprint,
    expression,
    source,
    padSocialRef,
    referenceMentionNames,
  } = body;

  const finalHasHuman = has_human !== undefined ? has_human : (hasHuman !== undefined ? hasHuman : undefined);
  const finalShotType = shot_type || shotType;
  const isHumanShot =
    finalHasHuman === true ||
    (finalHasHuman !== false && finalShotType === 'model_shot');
  const isExplicitSocialWorkshop = workshopMode === 'social_face_product_swap';
  const wantDualSocialPads = padSocialRef === true;
  const socialMode = isExplicitSocialWorkshop;
  /** 两段式复刻（默认）：只垫商品图，人物靠提示词生成 */
  const replicationTextOnlyPads = isExplicitSocialWorkshop && !wantDualSocialPads;
  const isWorkshopOriginal = workshopMode === 'storyboard_generate';
  const isPlainMode = source === 'hub' || source === 'home' || (!socialMode && !isWorkshopOriginal);

  const finalizePromptOptions = {
    workshopMode: isWorkshopOriginal
      ? ('storyboard_generate' as const)
      : socialMode
        ? ('social_face_product_swap' as const)
        : isPlainMode
          ? ('hub' as const)
          : ('plain' as const),
    hasHuman: isHumanShot,
    hasFace: Boolean(anchorFaceImageUrl) && isHumanShot,
    hasSceneAnchor: Boolean(sceneAnchorImageUrl),
    productRole,
    productFingerprint: productFingerprint || productTitle || undefined,
    replicationTextOnly: replicationTextOnlyPads,
    socialMode,
    expression: typeof expression === 'string' ? expression : undefined,
  };

  let convertCacheHits = 0;
  const convertOnce = createImageConvertCache(fetchImageAsSafeDataUrl);
  const seenKeys = new Set<string>();
  const convertTracked = (raw?: string | null) => {
    if (raw && typeof raw === 'string' && raw.trim()) {
      const k = raw.trim();
      if (seenKeys.has(k)) convertCacheHits += 1;
      else seenKeys.add(k);
    }
    return convertOnce(raw);
  };

  const tConvert0 = Date.now();
  const [targetProductUrl, rawFaceUrl, cleanSceneAnchorUrl, rawSocialRefUrl, cleanRefUrl] =
    await Promise.all([
      convertTracked(productImageUrl),
      convertTracked(anchorFaceImageUrl),
      convertTracked(sceneAnchorImageUrl),
      // 仅双垫模式才加载构图参考；两段式忽略误传的 social URL
      convertTracked(wantDualSocialPads ? socialReferenceImageUrl : undefined),
      convertTracked(referenceImageUrl),
    ]);

  // 有专属正脸 + 人物镜 + 双垫：模糊构图图人脸，强化正脸垫图，避免原模特脸压过 ID
  let cleanFaceUrl = rawFaceUrl;
  let cleanSocialRefUrl = rawSocialRefUrl;
  if (wantDualSocialPads && rawFaceUrl && rawSocialRefUrl && isHumanShot) {
    const [obfuscatedSocial, emphasizedFace] = await Promise.all([
      obfuscateCompositionFaces(rawSocialRefUrl),
      emphasizeIdentityFacePlate(rawFaceUrl),
    ]);
    cleanSocialRefUrl = obfuscatedSocial || rawSocialRefUrl;
    cleanFaceUrl = emphasizedFace || rawFaceUrl;
  } else if (rawFaceUrl && isHumanShot) {
    // 两段式可选正脸：仍强化 ID 板
    const emphasizedFace = await emphasizeIdentityFacePlate(rawFaceUrl);
    cleanFaceUrl = emphasizedFace || rawFaceUrl;
  }

  // 纯商品 / 挂拍镜：绝不附带正脸板，避免静物被强塞人脸
  const faceForSlots = isHumanShot ? cleanFaceUrl || undefined : undefined;

  // 爆款复刻：双垫时才保留社媒构图图；正脸仅作 ID，不替代构图
  const safeSocialRef = wantDualSocialPads ? cleanSocialRefUrl || undefined : undefined;
  const safeRef = cleanRefUrl || (referenceImageUrl && typeof referenceImageUrl === 'string' ? referenceImageUrl.trim() : undefined);

  // 人物镜：两段式只要求商品图；双垫才要求构图参考
  if (socialMode && isHumanShot) {
    if (!targetProductUrl) {
      return {
        isHumanShot,
        socialMode,
        isWorkshopOriginal,
        isPlainMode,
        targetProductUrl: targetProductUrl || null,
        orderedSlotImages: [],
        multiImages: [],
        editsImageUrls: [],
        cleanedPrompt: '',
        identityLockedSlots: null,
        convertMs: Date.now() - tConvert0,
        imageCount: 0,
        convertCacheHits,
        error: '人物镜缺少垫图槽位：@图片1 商品。请确认商品图已就绪后再生成。',
      };
    }
    if (wantDualSocialPads && !safeSocialRef) {
      const hasSocialUrl =
        typeof socialReferenceImageUrl === 'string' && socialReferenceImageUrl.trim().length > 0;
      return {
        isHumanShot,
        socialMode,
        isWorkshopOriginal,
        isPlainMode,
        targetProductUrl,
        orderedSlotImages: [],
        multiImages: [],
        editsImageUrls: [],
        cleanedPrompt: '',
        identityLockedSlots: null,
        convertMs: Date.now() - tConvert0,
        imageCount: 0,
        convertCacheHits,
        error: hasSocialUrl
          ? '构图参考图（@图片2）无法加载，请换一张社媒参考图后重试。'
          : '已开启双垫模式但未提供构图参考图（@图片2）。请传入社媒参考图，或关闭 padSocialRef 改用提示词生成人物。',
      };
    }
  }

  // 原创工坊：外观锁开启时商品图硬失败（Hub plain 模式不校验）
  if (isWorkshopOriginal && !socialMode && useReferenceImage && !targetProductUrl) {
    return {
      isHumanShot,
      socialMode,
      isWorkshopOriginal,
      isPlainMode,
      targetProductUrl: targetProductUrl || null,
      orderedSlotImages: [],
      multiImages: [],
      editsImageUrls: [],
      cleanedPrompt: '',
      identityLockedSlots: null,
      convertMs: Date.now() - tConvert0,
      imageCount: 0,
      convertCacheHits,
      error: '原创生图缺少商品垫图（@图片1）。请在素材步选好商品图并开启「强制跟商品图」。',
    };
  }

  // 两段式复刻：@图片1 商品（+ 可选正脸）；旧双垫：商品+构图(+正脸)
  const replicationProductSlots =
    replicationTextOnlyPads && targetProductUrl
      ? ([targetProductUrl, ...(faceForSlots ? [faceForSlots] : [])] as string[])
      : null;

  // 人物+正脸：严格三槽；正脸板再追加一次提升 ID 注意力（提示词仍只认 @图片3）
  const identityLockedSlots =
    wantDualSocialPads && socialMode && isHumanShot && faceForSlots && safeSocialRef && targetProductUrl
      ? ([targetProductUrl, safeSocialRef, faceForSlots, faceForSlots] as string[])
      : null;

  // 爆款复刻无正脸（首图定脸阶段）：两槽（@图片1 商品 + @图片2 构图参考）
  const socialTwoSlots =
    wantDualSocialPads && socialMode && !faceForSlots && safeSocialRef && targetProductUrl
      ? ([targetProductUrl, safeSocialRef] as string[])
      : null;

  // 原创工坊有序槽位：@图片1 商品 → @图片2 正脸(可选) → 末槽 场景定桩(可选)
  const originalOrderedSlots =
    isWorkshopOriginal && !socialMode
      ? ([
          targetProductUrl,
          ...(faceForSlots ? [faceForSlots] : []),
          ...(cleanSceneAnchorUrl ? [cleanSceneAnchorUrl] : []),
        ].filter(Boolean) as string[])
      : null;

  // 有序槽位：两段式商品单垫 / 旧爆款双垫 / 原创 / 基础参考图回退
  const orderedSlotImages = replicationProductSlots
    ? replicationProductSlots
    : identityLockedSlots
      ? [targetProductUrl!, safeSocialRef!, faceForSlots!]
      : socialTwoSlots
        ? socialTwoSlots
        : originalOrderedSlots && originalOrderedSlots.length > 0
          ? originalOrderedSlots
          : Array.from(
              new Set(
                [targetProductUrl, safeSocialRef, safeRef, faceForSlots, cleanSceneAnchorUrl].filter(
                  Boolean
                ) as string[]
              )
            );

  const primaryImgUrl =
    orderedSlotImages[0] ||
    safeRef ||
    (Array.isArray(images) ? images[0] : Array.isArray(referenceImages) ? referenceImages[0] : undefined);

  const rawPassedImages =
    Array.isArray(images) && images.length > 0
      ? images
      : Array.isArray(referenceImages) && referenceImages.length > 0
        ? referenceImages
        : safeRef
          ? [safeRef]
          : [];

  const safePassedImages = await Promise.all(
    rawPassedImages.map(async (img: string) => {
      const converted = await convertTracked(img);
      return converted || (typeof img === 'string' && img.trim() ? img.trim() : undefined);
    })
  );
  const convertMs = Date.now() - tConvert0;

  // 身份锁定 / 两段式 / 原创固定槽：只用处理后的有序槽；否则才合并客户端 images / safeRef
  const prioritizedImages = replicationProductSlots
    ? replicationProductSlots
    : identityLockedSlots
      ? identityLockedSlots
      : originalOrderedSlots && originalOrderedSlots.length > 0
        ? originalOrderedSlots
        : safePassedImages.filter(Boolean).length > 0
          ? Array.from(
              new Set([
                ...(targetProductUrl ? [targetProductUrl] : []),
                ...(safeRef ? [safeRef] : []),
                ...safePassedImages.filter(
                  (img): img is string => Boolean(img) && img !== targetProductUrl
                ),
              ])
            )
          : orderedSlotImages.length > 0
            ? orderedSlotImages
            : safeRef
              ? [safeRef]
              : [];

  const multiImages =
    prioritizedImages.length > 0
      ? prioritizedImages
      : orderedSlotImages.length > 0
        ? orderedSlotImages
        : safeRef
          ? [safeRef]
          : [];
  const imageCount = multiImages.length;

  const isGptImageModel = String(model).toLowerCase().includes('gpt-image');
  let promptForFinalize = normalizeLegacyMultiAnglePrompt(prompt);
  if (isGptImageModel && multiImages.length > 0) {
    const mentionNames = resolveReferenceMentionNames(
      promptForFinalize,
      multiImages.length,
      referenceMentionNames
    );
    promptForFinalize = normalizeReferenceMentions(promptForFinalize, mentionNames);
  }

  // 🌟 核心保护：普通生图或无参考图的文生图，绝对保留用户原始提示词，绝不擅自注入商品实物或槽位模板
  const cleanedPrompt =
    isPlainMode || multiImages.length === 0
      ? promptForFinalize
      : finalizeImagePrompt(promptForFinalize, finalizePromptOptions);

  const editsImageUrls = replicationProductSlots
    ? replicationProductSlots
    : identityLockedSlots
      ? identityLockedSlots
      : socialTwoSlots
        ? socialTwoSlots
        : originalOrderedSlots && originalOrderedSlots.length > 0
          ? originalOrderedSlots
          : Array.from(
              new Set(
                [
                  targetProductUrl,
                  safeSocialRef,
                  faceForSlots,
                  ...multiImages.filter(
                    (u) => u !== targetProductUrl && u !== safeSocialRef && u !== faceForSlots
                  ),
                ].filter(Boolean) as string[]
              )
            );

  return {
    isHumanShot,
    socialMode,
    isWorkshopOriginal,
    isPlainMode,
    targetProductUrl: targetProductUrl || null,
    safeSocialRef,
    safeRef,
    faceForSlots,
    cleanSceneAnchorUrl,
    orderedSlotImages,
    multiImages,
    primaryImgUrl,
    editsImageUrls,
    cleanedPrompt,
    identityLockedSlots,
    convertMs,
    imageCount,
    convertCacheHits,
  };
}
