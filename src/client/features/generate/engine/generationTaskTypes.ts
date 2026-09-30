import type { GenerationTask } from '@client/store';
import { isDepthImageTask, isDepthVideoTask, isGenerationVideoTask } from '@client/shared/media/generationTaskMedia';
import { getGatewayClientOverrides } from '@client/shared/api/gatewayClient';

export const SLOW_POLL_HINT = '生成较慢，后台继续等待…';

export { isDepthImageTask, isDepthVideoTask };

export function isVideoTask(t: GenerationTask): boolean {
  return isGenerationVideoTask(t);
}

export function getMaxPollCount(t: GenerationTask): number {
  if (isDepthVideoTask(t)) return 300;
  if (isVideoTask(t)) return 300;
  const q = (t.quality || '').toLowerCase();
  const size = (t.size || '').toLowerCase();
  const model = (t.model || '').toLowerCase();
  const is4K =
    q === 'high' ||
    model.includes('4k') ||
    /4k|2448|3264|4096|3840|2160/.test(size);
  if (is4K) return 450;
  if (q === 'medium' || /2k|1632|2048/.test(size)) return 300;
  return 180;
}

export function getGatewayBaseUrl(): string | undefined {
  return getGatewayClientOverrides().customBaseUrl;
}

export type TaskUpdater = (
  id: string,
  updates: Partial<GenerationTask>,
  opts?: { persist?: boolean },
) => void;
