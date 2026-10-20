import { clampVideoDuration, getVideoModelById } from '@shared/domain/media/video';

export function salesShotTiming(modelId: string | undefined, duration: number): { keepDuration: number; modelDuration: number; adjusted: boolean } {
  const requested = Math.max(1, Math.round(duration || 3));
  const modelDuration = clampVideoDuration(modelId, requested);
  const keepDuration = Math.min(requested, modelDuration);
  return { keepDuration, modelDuration, adjusted: keepDuration !== requested || modelDuration !== requested };
}

export function salesAspectError(modelId: string | undefined, aspectRatio: string): string | null {
  const ratios = getVideoModelById(modelId)?.supportedAspectRatios;
  if (!ratios || ratios.length === 0) return null;
  if (ratios.includes(aspectRatio)) return null;
  return `当前视频模型不支持 ${aspectRatio}，请更换画幅或模型`;
}
