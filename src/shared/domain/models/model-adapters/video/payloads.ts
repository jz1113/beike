import { videoInputError } from '@shared/domain/media/videoCapabilities';
import { clampVideoDuration } from '@shared/domain/media/video';
import type { VideoAdapterInput } from '../types';

export function normalizeVideoModelId(model: string): string {
  if (!model) return 'doubao-seedance-2.0-mini';
  const aliases: Record<string, string> = {
    'h3': 'MiniMax-H3', 'minimax-h3': 'MiniMax-H3',
    'seedance-2.5': 'doubao-seedance-2.5', 'seedance-2.0-mini': 'doubao-seedance-2.0-mini',
    'seedance-2.0': 'doubao-seedance-2-0-260128', 'seedance-2.0-fast': 'doubao-seedance-2-0-fast-260128',
    'veo-3.1': 'veo3.1', 'veo-3-1': 'veo3.1', 'veo-3.1-fast': 'veo3.1-fast',
    'sora-pro': 'sora-2-pro',
    'kling-v3': 'kling-video-v3', 'kling-v3-omni': 'kling-video-v3-omni',
    'kling-v2.5-turbo': 'kling-video-v2-5-turbo', 'kling-v2-6': 'kling-video-v2-6',
    'wan3.0': 'wan3.0-video', 'wan3': 'wan3.0-video',
    'vidu-q3': 'viduq3', 'vidu-q3-mix': 'viduq3-mix', 'vidu-q3-turbo': 'viduq3-turbo', 'vidu-q3-pro': 'viduq3-pro',
    'omni-flash-10s': 'omni_flash-10s', 'gemini-omni-1.1-flash': 'omni_flash-10s',
  };
  return aliases[model.trim().toLowerCase()] || model.trim();
}

export function calcVideoSize(aspectRatio: string, resolution: string): string {
  const is4K = resolution.toUpperCase().includes('4K') || resolution.toUpperCase().includes('UHD');
  const is1080 = resolution.toUpperCase().includes('1080') || resolution.toUpperCase().includes('FHD');
  const is480 = resolution.toUpperCase().includes('480') || resolution.toUpperCase().includes('SD');

  if (aspectRatio === '9:16') {
    if (is4K) return '2160x3840';
    if (is1080) return '1080x1920';
    if (is480) return '480x854';
    return '720x1280';
  }
  if (aspectRatio === '1:1') {
    if (is4K) return '2048x2048';
    if (is1080) return '1440x1440';
    if (is480) return '720x720';
    return '1024x1024';
  }
  if (aspectRatio === '4:3') {
    if (is4K) return '2880x2160';
    if (is1080) return '1440x1080';
    if (is480) return '640x480';
    return '960x720';
  }
  if (aspectRatio === '3:4') {
    if (is4K) return '2160x2880';
    if (is1080) return '1080x1440';
    if (is480) return '480x640';
    return '720x960';
  }
  if (aspectRatio === '21:9') {
    if (is4K) return '3840x1645';
    if (is1080) return '2560x1080';
    if (is480) return '1120x480';
    return '1680x720';
  }
  if (is4K) return '3840x2160';
  if (is1080) return '1920x1080';
  if (is480) return '854x480';
  return '1280x720';
}

export function normalizeResolution(resolution?: string): string {
  const rUpper = (resolution || '480P').toString().toUpperCase();
  if (rUpper.includes('480')) return '480p';
  if (rUpper.includes('720')) return '720p';
  if (rUpper.includes('1080')) return '1080p';
  if (rUpper.includes('4K')) return '4k';
  return '720p';
}

const FRAME_FIELD_KEYS = ['images', 'image_urls', 'image', 'image_url', 'first_frame_image', 'last_frame_image', 'end_frame_image', 'image_tail', 'reference_images'];

/** Keep first-frame, first-last-frame, and reference images in separate fields. */
export function applyExclusiveFrameFields(payload: Record<string, unknown>, input: VideoAdapterInput, mode: string) {
  const images = collectVideoImages(input);
  for (const key of FRAME_FIELD_KEYS) delete payload[key];
  if (mode === 'first_frame' && images[0]) {
    payload.image = images[0];
    payload.image_url = images[0];
    payload.first_frame_image = images[0];
    payload.images = [images[0]];
  } else if (mode === 'first_last_frame') {
    const first = input.firstFrame || images[0];
    const last = input.lastFrame || images[1];
    payload.first_frame_image = first;
    payload.last_frame_image = last;
    payload.end_frame_image = last;
    payload.image = first;
    payload.image_url = first;
    payload.image_tail = last;
    payload.images = [first, last].filter(Boolean);
  } else if (mode === 'omni' || mode === 'edit' || mode === 'extend') {
    if (images.length) {
      payload.reference_images = images;
      payload.images = images;
    }
  }
  return images;
}

export function collectVideoImages(input: VideoAdapterInput): string[] {
  const imgs = [...(input.images || [])];
  if (input.firstFrame && !imgs.includes(input.firstFrame)) imgs.unshift(input.firstFrame);
  if (input.lastFrame && !imgs.includes(input.lastFrame)) imgs.push(input.lastFrame);
  return imgs.filter(Boolean);
}

export function isWan26(modelId: string): boolean {
  return /wan2\.6/i.test(modelId);
}

export function adaptWan26ModelId(modelId: string, input: VideoAdapterInput): string {
  if (!isWan26(modelId) || !modelId.toLowerCase().includes('t2v')) return modelId;
  const images = collectVideoImages(input);
  if (images.length >= 2 && (input.refMode === 'first_last_frame' || Boolean(input.lastFrame))) {
    return modelId.replace(/t2v/i, 'r2v');
  }
  if (images.length >= 1) return modelId.replace(/t2v/i, 'i2v');
  return modelId;
}

export function baseVideoPayload(input: VideoAdapterInput, modelId: string): Record<string, unknown> {
  const normRatio = input.aspectRatio || '16:9';
  const safeResolution = normalizeResolution(input.resolution);
  const safeDuration = clampVideoDuration(modelId, Number(input.duration) || 5);
  const rawImages = collectVideoImages(input);
  const refMode = input.refMode || 'omni';

  const payload: Record<string, unknown> = {
    model: modelId,
    prompt: input.prompt,
    duration: safeDuration,
    ratio: normRatio,
    aspect_ratio: normRatio,
    resolution: safeResolution,
    watermark: Boolean(input.watermark),
    fps: Number(input.fps) || 24,
    size: calcVideoSize(normRatio, safeResolution),
  };

  if (input.audio !== undefined) {
    payload.audio = input.audio;
    payload.generate_audio = Boolean(input.audio);
  }
  if (input.seed !== undefined && input.seed !== null) payload.seed = Number(input.seed);
  if (input.cameraMotion) {
    payload.camera_motion = input.cameraMotion;
    payload.camera_control = input.cameraMotion;
  }
  if (input.character) {
    payload.character = input.character;
    payload.character_id = input.character;
  }
  if (input.storyboard) payload.storyboard = input.storyboard;
  if (input.refMode) payload.ref_mode = input.refMode;

  if (rawImages.length > 0) {
    payload.images = rawImages;
    payload.image_urls = rawImages;
    payload.image = rawImages[0];
    payload.image_url = rawImages[0];
    if (refMode === 'first_last_frame') {
      payload.first_frame_image = input.firstFrame || rawImages[0];
      const last = input.lastFrame || rawImages[rawImages.length - 1];
      payload.last_frame_image = last;
      payload.end_frame_image = last;
      payload.image_tail = last;
    }
  }

  if (input.videos && input.videos.length > 0) {
    payload.videos = input.videos;
    payload.video = input.videos[0];
    payload.video_url = input.videos[0];
  }

  return payload;
}

function normalizeWanResolution(resolution?: string): '1080P' | '720P' | '480P' {
  const rUpper = (resolution || '480P').toString().toUpperCase();
  if (rUpper.includes('480')) return '480P';
  if (rUpper.includes('720')) return '720P';
  return '1080P';
}

function normalizeWanRatio(ratio?: string, hasMedia?: boolean): string {
  const validRatios = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'];
  if (ratio && validRatios.includes(ratio)) return ratio;
  return hasMedia ? 'adaptive' : '16:9';
}

export function buildWanOfficialPayload(input: VideoAdapterInput, modelId: string): Record<string, unknown> {
  const rawImages = collectVideoImages(input);
  const rawVideos = input.videos || [];
  const refMode = input.refMode || (input.lastFrame ? 'first_last_frame' : input.firstFrame ? 'first_frame' : 'omni');
  const error = videoInputError({ ...input, model: modelId, images: rawImages, videos: rawVideos, refMode });
  if (error) throw new Error(error);
  const prompt = (input.prompt || '').trim();
  const media: Array<{ type: string; url: string }> = [];
  const isFirstLastMode = refMode === 'first_last_frame';

  if (isFirstLastMode) {
    const first = input.firstFrame || rawImages[0];
    const last = input.lastFrame || (rawImages.length > 1 ? rawImages[rawImages.length - 1] : rawImages[0]);
    if (first) media.push({ type: 'first_frame', url: first });
    if (last) media.push({ type: 'last_frame', url: last });
  } else if (rawVideos.length > 0) {
    for (const vUrl of rawVideos.slice(0, 5)) {
      if (vUrl && typeof vUrl === 'string' && vUrl.trim()) media.push({ type: 'reference_video', url: vUrl.trim() });
    }
    for (const imgUrl of rawImages.slice(0, 10)) {
      if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim()) media.push({ type: 'reference_image', url: imgUrl.trim() });
    }
  } else if (refMode === 'first_frame' || (!input.refMode && input.firstFrame)) {
    const first = input.firstFrame || rawImages[0];
    if (first) media.push({ type: 'first_frame', url: first });
  } else if (rawImages.length > 0) {
    for (const imgUrl of rawImages.slice(0, 10)) {
      if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim()) media.push({ type: 'reference_image', url: imgUrl.trim() });
    }
  }

  const inputObj: Record<string, unknown> = { prompt };
  if (media.length > 0) inputObj.media = media;

  const safeResolution = normalizeWanResolution(input.resolution);
  const safeRatio = normalizeWanRatio(input.aspectRatio, media.length > 0);
  let safeDuration = 5;
  if (input.duration !== undefined && input.duration !== null) {
    const d = Number(input.duration);
    if (d === -1) safeDuration = -1;
    else if (!Number.isNaN(d)) safeDuration = Math.min(Math.max(Math.round(d), 2), 30);
  }

  const parametersObj: Record<string, unknown> = {
    resolution: safeResolution,
    ratio: safeRatio,
    duration: safeDuration,
    audio: input.audio !== undefined ? Boolean(input.audio) : true,
    prompt_extend: true,
    watermark: Boolean(input.watermark),
  };

  if (input.seed !== undefined && input.seed !== null) {
    const s = Number(input.seed);
    if (!Number.isNaN(s) && s >= 0) parametersObj.seed = Math.min(s, 2147483647);
  }

  return { model: modelId, input: inputObj, parameters: parametersObj };
}

export function buildWan26Payload(input: VideoAdapterInput, modelId: string): Record<string, unknown> {
  const ratio = input.aspectRatio || '16:9';
  const size = calcVideoSize(ratio, normalizeResolution(input.resolution)).replace(/x/gi, '*');
  const duration = clampVideoDuration(modelId, Number(input.duration) || 5);
  const images = collectVideoImages(input);
  const payload: Record<string, unknown> = {
    model: modelId,
    input: { prompt: (input.prompt || '').trim() },
    parameters: { size, duration },
    duration,
  };
  if (images.length > 0) payload.first_frame = images[0];
  if (modelId.toLowerCase().includes('r2v') && images.length > 1) {
    payload.last_frame = images[images.length - 1];
  }
  return payload;
}
