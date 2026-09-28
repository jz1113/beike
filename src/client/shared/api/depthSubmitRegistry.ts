import type { DepthQuality, DepthVideoStyle } from '@shared/domain/media/depthVideo';

export interface DepthSubmitPayload {
  file: File;
  style: DepthVideoStyle;
  quality: DepthQuality;
  mode: 'depth-image' | 'depth-video';
}

const registry = new Map<string, DepthSubmitPayload>();
let lastDepthVideo: DepthSubmitPayload | undefined;
let lastDepthImage: DepthSubmitPayload | undefined;

export function depthSubmitMap(): Map<string, DepthSubmitPayload> {
  return registry;
}

export function setLastDepthSubmit(payload: DepthSubmitPayload): void {
  if (payload.mode === 'depth-video') lastDepthVideo = payload;
  else lastDepthImage = payload;
}

export function getLastDepthSubmit(mode: DepthSubmitPayload['mode']): DepthSubmitPayload | undefined {
  return mode === 'depth-video' ? lastDepthVideo : lastDepthImage;
}
