import type { VideoSalesShot } from './types';

const CONTENT_KEYS = ['description', 'voiceover', 'speechMode', 'duration', 'imageIndex', 'prompt', 'camera', 'finalPrompt'] as const;

export function editSalesShot(shot: VideoSalesShot, patch: Partial<VideoSalesShot>): VideoSalesShot {
  const changed = CONTENT_KEYS.some((key) => patch[key] !== undefined && patch[key] !== shot[key]);
  const next = { ...shot, ...patch };
  if (!changed) return next;
  return {
    ...next,
    promptStale: true,
    assetUrl: undefined,
    status: 'pending',
    taskId: undefined,
    failReason: undefined,
    modelDuration: undefined,
  };
}
