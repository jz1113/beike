import type { SalesImitationMode } from '@shared/domain/sales';
import { salesDepthVideoLimits } from '../model/salesDepthVideoLimits';
import { prepareSalesDepthVideoClip } from './salesVideoClip';

/** Submit only the reviewed action window, while retaining the original library video. */
export async function prepareSalesProductionVideos(
  input: { imitationMode: SalesImitationMode; sourceUrl?: string; endSec: number; videos: string[]; model: string; durationSec: number },
  signal: AbortSignal,
  onProgress: (text: string) => void,
): Promise<string[]> {
  if (input.imitationMode !== 'depth_imitation' || !input.sourceUrl) return input.videos;
  onProgress(`正在准备 ${input.endSec} 秒的深度动作参考，保留原速度…`);
  const limits = salesDepthVideoLimits(input.model, input.durationSec);
  const clip = await prepareSalesDepthVideoClip({ sourceUrl: input.sourceUrl, endSec: input.endSec,
    ...(Number.isFinite(limits.max) ? { maxDurationSec: limits.max } : {}) }, signal);
  signal.throwIfAborted();
  if (clip.durationSec < limits.min || clip.durationSec > limits.max + 0.001) {
    throw new Error(`动作参考片段实测 ${clip.durationSec} 秒，不符合当前模型的参考时长限制，请调整时长或更换模型后重试。`);
  }
  return input.videos.map((url) => url === input.sourceUrl ? clip.url : url);
}
