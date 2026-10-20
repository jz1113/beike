import type { VideoSalesShot } from './types';

const CONTENT_KEYS = ['description', 'voiceover', 'duration', 'imageIndex', 'prompt', 'camera', 'finalPrompt'] as const;

export function editSalesShot(shot: VideoSalesShot, patch: Partial<VideoSalesShot>): VideoSalesShot {
  const changed = CONTENT_KEYS.some((key) => patch[key] !== undefined && patch[key] !== shot[key]);
  const imageChanged = patch.imagePrompt !== undefined && patch.imagePrompt !== shot.imagePrompt;
  const next = { ...shot, ...patch };
  if (!changed && !imageChanged) return next;
  return {
    ...next,
    ...(changed ? { promptStale: true, audioUrl: undefined } : {}),
    assetUrl: undefined,
    referenceFrameUrl: undefined,
    status: 'pending',
    taskId: undefined,
    failReason: undefined,
    modelDuration: undefined,
  };
}

export function applyFinalPrompts(shots: VideoSalesShot[], prompts: Array<{ shotId: number; prompt: string; imagePrompt?: string }>): VideoSalesShot[] {
  const byShot = new Map(prompts.map((item) => [item.shotId, item]));
  return shots.map((shot) => {
    const item = byShot.get(shot.shotId);
    const prompt = item?.prompt.trim() || '';
    if (!prompt) throw new Error(`镜头 ${shot.shotId} 没有最终提示词`);
    const imagePrompt = shot.visualSource === 'ai_generate' ? item?.imagePrompt?.trim() || '' : '';
    if (shot.visualSource === 'ai_generate' && !imagePrompt) throw new Error(`镜头 ${shot.shotId} 没有绘图提示词`);
    return { ...shot, prompt, finalPrompt: prompt, imagePrompt: imagePrompt || undefined, promptStale: false };
  });
}

export function salesPlanRevision(shots: VideoSalesShot[]): string {
  const text = shots.map((shot) => [shot.shotId, shot.imageIndex, shot.duration, shot.prompt, shot.description, shot.voiceover, shot.camera].join('|')).join('\n');
  let hash = 0;
  for (const char of text) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}
