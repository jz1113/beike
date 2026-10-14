/**
 * comfly gpt-image 尺寸表（Apifox 官方档位：1K / 2K / 4K）
 * @see https://gpt-best.apifox.cn/api-447261009.md
 */

export type GptImageQualityTier = 'low' | 'medium' | 'high';

const DEFAULT_ASPECT_ID = '3:4';

/** Apifox 三档：low=1K, medium=2K(含2048), high=4K(3840/2160) */
export const GPT_IMAGE_GATEWAY_SAFE_SIZES: Record<string, Record<GptImageQualityTier, string>> = {
  smart: { low: '1024x1024', medium: '2048x2048', high: '3072x4096' },
  '21:9': { low: '1536x640', medium: '2048x864', high: '3840x1632' },
  '16:9': { low: '1536x864', medium: '2048x1152', high: '3840x2160' },
  '3:2': { low: '1536x1024', medium: '2048x1360', high: '3840x2560' },
  '4:3': { low: '1280x960', medium: '2048x1536', high: '4096x3072' },
  '1:1': { low: '1024x1024', medium: '2048x2048', high: '3072x3072' },
  '3:4': { low: '960x1280', medium: '1536x2048', high: '3072x4096' },
  '2:3': { low: '1024x1536', medium: '1360x2048', high: '2160x3240' },
  '9:16': { low: '864x1536', medium: '1152x2048', high: '2160x3840' },
};

/** gpt-image-2-2k 专线：1536 系，避免 2048 触发网关重复追加 -2k */
export const GPT_IMAGE_SUFFIX_2K_SIZES: Record<string, string> = {
  smart: '1536x1536',
  '21:9': '1536x640',
  '16:9': '1536x864',
  '3:2': '1536x1024',
  '4:3': '1536x1152',
  '1:1': '1536x1536',
  '3:4': '1536x2048',
  '2:3': '1024x1536',
  '9:16': '1152x2048',
};

export function isPixelSizeString(size?: string): boolean {
  if (!size) return false;
  return /^\d+\s*x\s*\d+$/i.test(size.trim());
}

export function isKnownAspectId(id?: string): boolean {
  return Boolean(id && id in GPT_IMAGE_GATEWAY_SAFE_SIZES);
}

export function sanitizeGptImageModelIdForSize(modelId: string): string {
  const trimmed = modelId.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'image2-4k') return 'gpt-image-2-4k';
  if (/^gpt-image-2-4k(?:-(?:2k|4k))*$/.test(lower)) return 'gpt-image-2-4k';
  if (/^gpt-image-2-2k(?:-(?:2k|4k))*$/.test(lower)) return 'gpt-image-2-2k';
  return trimmed;
}

export function isDedicated4kModelId(modelId: string): boolean {
  return sanitizeGptImageModelIdForSize(modelId).toLowerCase() === 'gpt-image-2-4k';
}

export function isSuffix2kModelId(modelId: string): boolean {
  return sanitizeGptImageModelIdForSize(modelId).toLowerCase() === 'gpt-image-2-2k';
}

export function resolveGptImageGatewaySize(
  aspectId: string,
  sizeTier: GptImageQualityTier
): string {
  const tier = GPT_IMAGE_GATEWAY_SAFE_SIZES[aspectId] || GPT_IMAGE_GATEWAY_SAFE_SIZES[DEFAULT_ASPECT_ID];
  return tier[sizeTier] || tier.medium;
}

export function resolveSizeTierForModel(
  userModelId: string,
  quality: GptImageQualityTier
): GptImageQualityTier {
  const id = sanitizeGptImageModelIdForSize(userModelId).toLowerCase();
  if (id === 'gpt-image-2-4k') return 'high';
  if (id === 'gpt-image-2-2k') return 'medium';
  return quality;
}

/** 按用户选中的 model id 取 Apifox 对齐像素 size */
export function resolveGptImageSizeForModel(
  aspectId: string,
  userModelId: string,
  quality: GptImageQualityTier
): string {
  const resolvedAspect = isKnownAspectId(aspectId) ? aspectId : DEFAULT_ASPECT_ID;
  const id = sanitizeGptImageModelIdForSize(userModelId).toLowerCase();

  if (id === 'gpt-image-2-2k') {
    return GPT_IMAGE_SUFFIX_2K_SIZES[resolvedAspect] || GPT_IMAGE_SUFFIX_2K_SIZES[DEFAULT_ASPECT_ID];
  }

  const tier = resolveSizeTierForModel(userModelId, quality);
  return resolveGptImageGatewaySize(resolvedAspect, tier);
}

export type GptImagePixelSizeResolution = {
  pixelSize: string;
  aspectId: string;
};

/** aspect id 或像素字符串 → 与 model 档位对齐的像素 size */
export function resolveGptImagePixelSize(
  inputSize: string | undefined,
  userModelId: string,
  quality: GptImageQualityTier,
  aspectHint?: string
): GptImagePixelSizeResolution {
  const trimmed = inputSize?.trim() || '';
  const hint = aspectHint?.trim() || '';
  const tier = resolveSizeTierForModel(userModelId, quality);

  if (isPixelSizeString(trimmed)) {
    const aspectId = isKnownAspectId(hint)
      ? hint
      : isKnownAspectId(trimmed)
        ? trimmed
        : DEFAULT_ASPECT_ID;
    const raw = trimmed.replace(/\s+/g, '');
    const pixelSize = userModelId.toLowerCase().includes('gpt-image-2.5')
      ? clampGptImageOfficialPixelSize(raw)
      : raw;
    return { pixelSize, aspectId };
  }

  const aspectId = isKnownAspectId(trimmed)
    ? trimmed
    : isKnownAspectId(hint)
      ? hint
      : DEFAULT_ASPECT_ID;

  return {
    pixelSize: resolveGptImageSizeForModel(aspectId, userModelId, tier),
    aspectId,
  };
}

export function maxEdgeForGptImageModel(userModelId: string, quality?: GptImageQualityTier): number {
  const id = sanitizeGptImageModelIdForSize(userModelId).toLowerCase();
  if (id === 'gpt-image-2-4k') return 3840;
  if (id === 'gpt-image-2-2k') return 2048;
  if (id.startsWith('gpt-image-2.5')) return 3840;
  if (quality === 'high') return 3840;
  return 2048;
}

/** gpt-image-2.5：边长 ≤3840、必须是 16 的倍数、长短边比 ≤3、像素 655360–8294400 */
export function clampGptImageOfficialPixelSize(pixelSize: string): string {
  const match = /^\s*(\d+)\s*x\s*(\d+)\s*$/i.exec(pixelSize);
  if (!match) return pixelSize;
  let width = Number(match[1]);
  let height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return pixelSize;

  const snap = (value: number) => Math.max(16, Math.round(value / 16) * 16);
  width = snap(Math.min(3840, width));
  height = snap(Math.min(3840, height));

  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (shortEdge > 0 && longEdge / shortEdge > 3) {
    const nextShort = snap(Math.ceil(longEdge / 3));
    if (width >= height) height = nextShort;
    else width = nextShort;
  }

  let pixels = width * height;
  if (pixels < 655_360) {
    const scale = Math.sqrt(655_360 / pixels);
    width = snap(width * scale);
    height = snap(height * scale);
    pixels = width * height;
  }
  if (pixels > 8_294_400) {
    const scale = Math.sqrt(8_294_400 / pixels);
    width = snap(width * scale);
    height = snap(height * scale);
  }

  width = Math.min(3840, width);
  height = Math.min(3840, height);
  return `${width}x${height}`;
}
