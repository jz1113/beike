/**
 * comfly 网关 gpt-image Hub 尺寸（Apifox 三档，按 model id 固定参数）
 */

import type { GptImageQualityTier } from '@/lib/modelAdapters/image/gptImageSafeSizes';
import { isDedicated4kUserModel } from '@/lib/modelAdapters/image/normalizeOpenAiImageModel';
import {
  GPT_IMAGE_GATEWAY_SAFE_SIZES,
  resolveGptImageGatewaySize,
  resolveGptImageSizeForModel,
} from '@/lib/modelAdapters/image/gptImageSafeSizes';

export type { GptImageQualityTier };
export { GPT_IMAGE_GATEWAY_SAFE_SIZES, resolveGptImageGatewaySize };

export function isGptImageModelId(modelId?: string): boolean {
  return Boolean(modelId && modelId.toLowerCase().includes('gpt-image'));
}

/** Hub：按用户选中的 model + 画质档取 Apifox 对齐像素 size */
export function resolveGptImageHubSize(
  aspectId: string,
  userModelId: string,
  quality: GptImageQualityTier
): string {
  return resolveGptImageSizeForModel(aspectId, userModelId, quality);
}

export { isDedicated4kUserModel };
