import type { DepthQuality, DepthVideoStyle } from '@shared/domain/media/depthVideo';

export interface DepthSubmitPayload {
  file: File;
  style: DepthVideoStyle;
  quality: DepthQuality;
  mode: 'depth-image' | 'depth-video';
}

const registry = new Map<string, DepthSubmitPayload>();

export function depthSubmitMap(): Map<string, DepthSubmitPayload> {
  return registry;
}
