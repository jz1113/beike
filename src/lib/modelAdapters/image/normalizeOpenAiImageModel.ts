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
  return modelId.toLowerCase().includes('gpt-image');
}

/** 清理混合/重复后缀：gpt-image-2-4k-2k → gpt-image-2-4k */
export function sanitizeGptImageModelId(modelId: string): string {
  const trimmed = modelId.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'image2-4k') return 'gpt-image-2-4k';
  if (!lower.startsWith('gpt-image-2')) return trimmed;

  if (/-4k-/i.test(lower) || lower.endsWith('-4k-4k')) return 'gpt-image-2-4k';
  if (lower.endsWith('-4k')) return 'gpt-image-2-4k';
  if (/-2k-/i.test(lower) || lower.endsWith('-2k-2k')) return 'gpt-image-2-2k';
  if (lower.endsWith('-2k')) return 'gpt-image-2-2k';
  if (lower === 'gpt-image-2-all') return 'gpt-image-2-all';
  if (lower === 'gpt-image-2') return 'gpt-image-2';
  return trimmed;
}

export function isDedicated4kUserModel(userModelId: string): boolean {
  return sanitizeGptImageModelId(userModelId).toLowerCase() === 'gpt-image-2-4k';
}

export function isSuffix2kUserModel(userModelId: string): boolean {
  return sanitizeGptImageModelId(userModelId).toLowerCase() === 'gpt-image-2-2k';
}

export function normalizeQualityTier(quality?: string): GptImageQualityTier {
  const q = (quality || 'medium').toLowerCase();
  if (q === 'low' || q === '1k') return 'low';
  if (q === 'high' || q === '4k') return 'high';
  if (q === 'medium' || q === '2k') return 'medium';
  return 'medium';
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
  const finalSize = scaleSizeToMaxEdge(pixelSize, maxEdge);

  return {
    modelId,
    quality: omitQuality ? undefined : sizeTier,
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

/** @deprecated 使用 normalizeOpenAiImageRequest */
export function normalizeOpenAiImageModel(
  modelId: string,
  quality?: string,
  size?: string
): { modelId: string; quality?: string; omitQuality?: boolean; size?: string } {
  const r = normalizeOpenAiImageRequest(modelId, size, quality);
  return {
    modelId: r.modelId,
    quality: r.quality,
    omitQuality: r.omitQuality,
    size: r.size,
  };
}
