import type {
  ImageAdapterInput,
  ImageAdapterResult,
  ImageModelAdapter,
  VideoAdapterInput,
  VideoAdapterResult,
  VideoModelAdapter,
} from './types';
import {
  defaultImageAdapter,
  fluxImageAdapter,
  geminiImageAdapter,
  grokImageAdapter,
  midjourneyImageAdapter,
  openaiImageAdapter,
  qwenEditImageAdapter,
  seedreamImageAdapter,
} from './image/adapters';
import {
  defaultVideoAdapter,
  grokVideoAdapter,
  klingVideoAdapter,
  lumaVideoAdapter,
  minimaxVideoAdapter,
  normalizeVideoModelId,
  runwayVideoAdapter,
  seedanceVideoAdapter,
  soraVideoAdapter,
  veoVideoAdapter,
  viduVideoAdapter,
  wanVideoAdapter,
} from './video/adapters';

/** 生图适配器注册表（顺序即匹配优先级） */
export const IMAGE_ADAPTERS: ImageModelAdapter[] = [
  midjourneyImageAdapter,
  grokImageAdapter,
  seedreamImageAdapter,
  fluxImageAdapter,
  geminiImageAdapter,
  openaiImageAdapter,
  qwenEditImageAdapter,
  defaultImageAdapter,
];

/** 视频适配器注册表（顺序即匹配优先级） */
export const VIDEO_ADAPTERS: VideoModelAdapter[] = [
  seedanceVideoAdapter,
  veoVideoAdapter,
  wanVideoAdapter,
  minimaxVideoAdapter,
  soraVideoAdapter,
  klingVideoAdapter,
  runwayVideoAdapter,
  lumaVideoAdapter,
  viduVideoAdapter,
  grokVideoAdapter,
  defaultVideoAdapter,
];

export function resolveImageAdapter(modelId: string): ImageModelAdapter {
  const m = (modelId || '').toLowerCase();
  return IMAGE_ADAPTERS.find((a) => a.match(m)) || defaultImageAdapter;
}

export function resolveVideoAdapter(modelId: string): VideoModelAdapter {
  const m = (modelId || '').toLowerCase();
  return VIDEO_ADAPTERS.find((a) => a.match(m)) || defaultVideoAdapter;
}

export function buildImageRequest(input: ImageAdapterInput): ImageAdapterResult {
  return resolveImageAdapter(input.model).build(input);
}

export function buildVideoRequest(input: VideoAdapterInput): VideoAdapterResult {
  return resolveVideoAdapter(input.model).build(input);
}

export type {
  ImageAdapterInput,
  ImageAdapterResult,
  VideoAdapterInput,
  VideoAdapterResult,
};

export { normalizeVideoModelId };
