/** 视觉 / 多模态 API 超时与 token 上限（前后端共用） */

export const VISION_ANALYZE_TIMEOUT_OVERRIDE_MS =
  typeof process !== 'undefined' && process.env
    ? Number(process.env.VISION_ANALYZE_TIMEOUT_MS) || 0
    : 0;

export const VISION_TIMEOUT_THINKING_MS = 180_000;
export const VISION_TIMEOUT_STANDARD_MS = 150_000;
export const VISION_TIMEOUT_FLASH_MS = 90_000;
export const VISION_TIMEOUT_FALLBACK_MS = 120_000;

export const VISION_EXTRACT_SHARD_TIMEOUT_MS = 120_000;
export const VISION_EXTRACT_MASTER_TIMEOUT_MS = 180_000;

function isFlashModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.includes('flash');
}

export function isThinkingVisionModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.includes('thinking') || id.includes('luna') || id.includes('terra') || id.includes('pro-preview');
}

/** 按模型类型分级等待时长；主模型可经 VISION_ANALYZE_TIMEOUT_MS 环境变量覆盖 */
export function resolveVisionTimeoutMs(modelId: string, isPrimary = true): number {
  if (isPrimary && VISION_ANALYZE_TIMEOUT_OVERRIDE_MS > 0) {
    return VISION_ANALYZE_TIMEOUT_OVERRIDE_MS;
  }
  if (!isPrimary) {
    return VISION_TIMEOUT_FALLBACK_MS;
  }
  if (isThinkingVisionModel(modelId)) {
    return VISION_TIMEOUT_THINKING_MS;
  }
  if (isFlashModel(modelId)) {
    return VISION_TIMEOUT_FLASH_MS;
  }
  return VISION_TIMEOUT_STANDARD_MS;
}

/** 分镜分析 completion token 上限：4 镜约 3600，上限 8192 */
export function resolveVisionAnalyzeMaxTokens(shotCount: number): number {
  const n = Math.max(1, Math.min(12, Math.floor(shotCount) || 4));
  return Math.min(8192, Math.max(2048, n * 900));
}

import { formatUserError } from '@/lib/upstreamErrors';

export function formatVisionAnalyzeError(err: unknown): string {
  const formatted = formatUserError(err, '视觉大模型分析失败，请重试');
  if (formatted === '请求超时，请稍后重试') {
    return '视觉模型响应超时（已等待约 3 分钟），请稍后重试或换用 Flash 极速模型';
  }
  return formatted;
}
