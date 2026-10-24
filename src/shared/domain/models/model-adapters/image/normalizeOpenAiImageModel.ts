/**
 * comfly gpt-image：按用户选中的 model id 固定参数，禁止 quality→suffix 自动改 model。
 */

import {
  maxEdgeForGptImageModel,
  resolveGptImagePixelSize,
  type GptImageQualityTier,
} from './gptImageSafeSizes';

export type { GptImageQualityTier };

export const GPT_IMAGE_GATEWAY_MAX_EDGE = 2048;
export const GPT_IMAGE_4K_MAX_EDGE = 3840;

const DEFAULT_GPT_IMAGE_SIZE = '1536x2048';

export function isGptImageFamily(modelId: string): boolean {
  const m = modelId.toLowerCase();
  return m.includes('gpt-image') || m.includes('gpt image');
}

/** 清理混合/重复后缀与中文展示名映射：
 * 例如 "GPT Image 2 (标准)" -> "gpt-image-2"
 * "GPT Image 2 (4K超清)" -> "gpt-image-2-4k"
 * "gpt-image-2-4k-2k" -> "gpt-image-2-4k"
 */
export function sanitizeGptImageModelId(modelId: string): string {
  const trimmed = modelId.trim();
  const lower = trimmed.toLowerCase();

  // Only known display aliases and legacy duplicate suffixes may rewrite IDs.
  // Provider IDs (including new versions such as gpt-image-2.5-flare) are opaque.
  if (/^gpt image 2(?:\s|$|[（(])/i.test(trimmed)) {
    if (lower.includes('4k')) return 'gpt-image-2-4k';
    if (lower.includes('2k')) return 'gpt-image-2-2k';
    if (lower.includes('all') || lower.includes('全能')) return 'gpt-image-2-all';
    return 'gpt-image-2';
  }
  if (lower === 'image2-4k') return 'gpt-image-2-4k';
  const legacy = /^gpt-image-2-(4k|2k)(?:-(?:4k|2k))*$/i.exec(trimmed);
  if (legacy) return `gpt-image-2-${legacy[1].toLowerCase()}`;
  return trimmed;
}

export function isDedicated4kUserModel(userModelId: string): boolean {
  return sanitizeGptImageModelId(userModelId).toLowerCase() === 'gpt-image-2-4k';
}

export function isSuffix2kUserModel(userModelId: string): boolean {
  return sanitizeGptImageModelId(userModelId).toLowerCase() === 'gpt-image-2-2k';
}

export function isGptImage25Model(modelId: string): boolean {
  return modelId.trim().toLowerCase().includes('gpt-image-2.5');
}

export function normalizeQualityTier(quality?: string): GptImageQualityTier {
  const q = (quality || 'medium').toLowerCase();
  if (q === 'low' || q === '1k') return 'low';
  if (q === 'high' || q === 'xhigh' || q === 'max' || q === '4k') return 'high';
  if (q === 'medium' || q === '2k') return 'medium';
  return 'medium';
}

export function normalizeGptImageWireQuality(modelId: string, quality?: string): string {
  const q = (quality || 'medium').trim().toLowerCase();
  if ((q === 'xhigh' || q === 'max') && isGptImage25Model(modelId)) {
    return q;
  }
  return normalizeQualityTier(quality);
}

export type GptImageProfile = {
  modelId: string;
  quality?: string;
  size: string;
  sizeTier: GptImageQualityTier;
  omitQuality: boolean;
};

/** 一模型一套参数：不改 model id，仅 suffix 模型 omit quality */
export function resolveGptImageProfile(
  userModelId: string,
  quality?: string,
  size?: string,
  aspectHint?: string
): GptImageProfile {
  const modelId = sanitizeGptImageModelId(userModelId);
  const sizeTier = normalizeQualityTier(quality);
  const lower = modelId.toLowerCase();
  const omitQuality = lower === 'gpt-image-2-2k' || lower === 'gpt-image-2-4k';

  const { pixelSize } = resolveGptImagePixelSize(size, modelId, sizeTier, aspectHint);
  const maxEdge = maxEdgeForGptImageModel(modelId, sizeTier);
  let finalSize = scaleSizeToMaxEdge(pixelSize, maxEdge);
  // GPT Image 2 docs and observed 2.5 flare/sunburst gateway validation share pixel bounds.
  if (/^gpt-image-(?:2|2\.5-(?:flare|sunburst))(?:-(?:2k|4k|all))?$/.test(lower)) {
    const pixels = parsePixelSize(finalSize)!;
    const maxPixels = 8_294_400;
    const minPixels = 655_360;
    if (pixels.w * pixels.h > maxPixels) {
      const scale = Math.sqrt(maxPixels / (pixels.w * pixels.h));
      finalSize = `${Math.floor(pixels.w * scale / 16) * 16}x${Math.floor(pixels.h * scale / 16) * 16}`;
    } else if (pixels.w * pixels.h < minPixels) {
      const scale = Math.sqrt(minPixels / (pixels.w * pixels.h));
      finalSize = `${Math.ceil(pixels.w * scale / 16) * 16}x${Math.ceil(pixels.h * scale / 16) * 16}`;
    }
  }

  return {
    modelId,
    quality: omitQuality ? undefined : normalizeGptImageWireQuality(modelId, quality),
    size: finalSize,
    sizeTier: lower === 'gpt-image-2-4k' ? 'high' : lower === 'gpt-image-2-2k' ? 'medium' : sizeTier,
    omitQuality,
  };
}

export function parsePixelSize(size?: string): { w: number; h: number } | null {
  if (!size || typeof size !== 'string') return null;
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(size.trim());
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { w, h };
}

export function maxEdgeFromSize(size?: string): number {
  const parsed = parsePixelSize(size);
  if (!parsed) return 0;
  return Math.max(parsed.w, parsed.h);
}

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

/** 等比缩放至长边不超过 maxEdge，宽高取 16 的倍数 */
export function scaleSizeToMaxEdge(size: string, maxEdge: number = GPT_IMAGE_GATEWAY_MAX_EDGE): string {
  const parsed = parsePixelSize(size);
  if (!parsed) return DEFAULT_GPT_IMAGE_SIZE;
  const { w, h } = parsed;
  const edge = Math.max(w, h);
  if (edge <= maxEdge) {
    return `${roundToMultiple(w, 16)}x${roundToMultiple(h, 16)}`;
  }
  const scale = maxEdge / edge;
  return `${roundToMultiple(w * scale, 16)}x${roundToMultiple(h * scale, 16)}`;
}

export type NormalizedOpenAiImageRequest = {
  userModelId: string;
  modelId: string;
  size: string;
  sizeTier?: GptImageQualityTier;
  quality?: string;
  omitQuality?: boolean;
};

export function normalizeOpenAiImageRequest(
  modelId: string,
  size?: string,
  quality?: string,
  aspectHint?: string
): NormalizedOpenAiImageRequest {
  const sanitized = sanitizeGptImageModelId(modelId);

  if (!isGptImageFamily(sanitized)) {
    return {
      userModelId: modelId,
      modelId: sanitized,
      size: size?.trim() || DEFAULT_GPT_IMAGE_SIZE,
      quality,
      omitQuality: false,
    };
  }

  const profile = resolveGptImageProfile(sanitized, quality, size, aspectHint);

  return {
    userModelId: modelId,
    modelId: profile.modelId,
    size: profile.size,
    sizeTier: profile.sizeTier,
    quality: profile.quality,
    omitQuality: profile.omitQuality,
  };
}
