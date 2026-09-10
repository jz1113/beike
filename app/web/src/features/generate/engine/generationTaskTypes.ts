import type { GenerationTask } from '@/store/useAppStore';
import { DEPTH_VIDEO_MODEL_ID } from '@beike/shared/depthVideo';
import { getGatewayClientOverrides } from '@/lib/gatewayClient';

export const SLOW_POLL_HINT = '生成较慢，后台继续等待…';

export function isDepthVideoTask(t: GenerationTask): boolean {
  return (
    t.mediaType === 'depth-video' ||
    t.model === DEPTH_VIDEO_MODEL_ID ||
    (t.id || '').startsWith('depth_') ||
    (t.taskId || '').startsWith('depth_')
  );
}

export function isDepthImageTask(t: GenerationTask): boolean {
  return t.mediaType === 'depth-image';
}

export function isVideoTask(t: GenerationTask): boolean {
  if (isDepthVideoTask(t)) return true;
  const m = t.model?.toLowerCase() || '';
  return (
    t.mediaType === 'video' ||
    Boolean(t.resultUrl?.includes('.mp4')) ||
    m.includes('seedance') ||
    m.includes('veo') ||
    m.includes('kling') ||
    m.includes('sora') ||
    m.includes('gen3') ||
    m.includes('minimax') ||
    m.includes('h3') ||
    m.includes('hailuo') ||
    m.includes('wan') ||
    m.includes('vidu') ||
    m.includes('luma') ||
    m.includes('hunyuan')
  );
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
