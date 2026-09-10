/** 视觉 / 多模态 API 超时与 token 上限（前后端共用） */

export const VISION_ANALYZE_TIMEOUT_OVERRIDE_MS =
  typeof process !== 'undefined' && process.env
    ? Number(process.env.VISION_ANALYZE_TIMEOUT_MS) || 0
    : 0;

export const VISION_TIMEOUT_THINKING_MS = 360_000;
export const VISION_TIMEOUT_STANDARD_MS = 300_000;
export const VISION_TIMEOUT_FLASH_MS = 180_000;
export const VISION_TIMEOUT_FALLBACK_MS = 300_000;

export const VISION_EXTRACT_SHARD_TIMEOUT_MS = 180_000;
export const VISION_EXTRACT_MASTER_TIMEOUT_MS = 240_000;

function isFlashModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.includes('flash');
}

export function isThinkingVisionModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    id.includes('thinking') ||
    id.includes('luna') ||
    id.includes('terra') ||
    id.includes('pro-preview') ||
    id.includes('qwen') ||
    id.includes('max') ||
    id.includes('deepseek') ||
    id.includes('r1') ||
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('sonnet')
  );
}

/** 按模型类型分级等待时长；主模型可经 VISION_ANALYZE_TIMEOUT_MS 环境变量覆盖 */
export function resolveVisionTimeoutMs(modelId: string, isPrimary = true): number {
  if (isPrimary && VISION_ANALYZE_TIMEOUT_OVERRIDE_MS > 0) {
    return VISION_ANALYZE_TIMEOUT_OVERRIDE_MS;
  }
  if (isThinkingVisionModel(modelId)) {
    return VISION_TIMEOUT_THINKING_MS;
  }
  if (isFlashModel(modelId)) {
    return isPrimary ? VISION_TIMEOUT_FLASH_MS : VISION_TIMEOUT_STANDARD_MS;
  }
  return isPrimary ? VISION_TIMEOUT_STANDARD_MS : VISION_TIMEOUT_FALLBACK_MS;
}

/** 分镜分析 completion token 上限：4 镜约 1500，上限 2400，收敛大模型生成长度，极大缩短推理用时 */
export function resolveVisionAnalyzeMaxTokens(shotCount: number): number {
  const n = Math.max(1, Math.min(12, Math.floor(shotCount) || 4));
  return Math.min(2400, Math.max(1200, n * 380));
}

import { formatUserError } from '@beike/shared/upstreamErrors';

export function formatVisionAnalyzeError(err: unknown): string {
  const formatted = formatUserError(err, '视觉大模型分析失败，请重试');
  // callVisionModel 已带具体秒数与计费提示时原样返回，避免写死「约 N 分钟」冲掉细节
  if (formatted.includes('视觉模型响应超时')) {
    return formatted;
  }
  if (formatted === '请求超时，请稍后重试' || formatted.includes('超时')) {
    const mins = Math.max(1, Math.round(VISION_TIMEOUT_THINKING_MS / 60_000));
    return `视觉模型响应超时（已等待约 ${mins} 分钟），请稍后重试或换用 Flash 极速模型。上游可能仍会计费，请勿立刻重复提交`;
  }
  return formatted;
}
