import { videoInputError } from '@shared/domain/media/videoCapabilities';
import { buildSeedanceOfficialPayload } from './seedance';
import type { VideoAdapterInput, VideoModelAdapter } from '../types';
import {
  grokImagineVideoEndpoints,
  klingModeEndpoints,
  lumaVideoEndpoints,
  minimaxVideoEndpoints,
  seedanceOfficialEndpoints,
  unifiedVideoEndpoints,
  v1PreferVideoEndpoints,
  viduVideoEndpoints,
  wanOfficialEndpoints,
} from './endpoints';
import {
  adaptWan26ModelId,
  applyExclusiveFrameFields,
  baseVideoPayload,
  buildWan26Payload,
  buildWanOfficialPayload,
  collectVideoImages,
  isWan26,
  normalizeVideoModelId,
} from './payloads';

function assertVideoInput(input: VideoAdapterInput, modelId: string, mode: string) {
  const error = videoInputError({ ...input, model: modelId, images: collectVideoImages(input), refMode: mode });
  if (error) throw new Error(error);
}

export const seedanceVideoAdapter: VideoModelAdapter = {
  id: 'seedance',
  match: (modelId) => modelId.toLowerCase().includes('seedance') || modelId.toLowerCase().includes('doubao-seedance'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    return {
      family: 'seedance',
      modelId,
      payload: buildSeedanceOfficialPayload(input, modelId),
      endpoints: seedanceOfficialEndpoints,
    };
  },
};

export const veoVideoAdapter: VideoModelAdapter = {
  id: 'veo',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('veo') || m.includes('omni_flash') || m.includes('omni-flash') || m.includes('gemini-omni');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const mode = input.refMode || 'omni';
    assertVideoInput(input, modelId, mode);
    const payload = baseVideoPayload(input, modelId);
    applyExclusiveFrameFields(payload, input, mode);
    if (mode === 'omni' && !/omni[_-]flash|gemini-omni/i.test(modelId)) {
      delete payload.images;
      delete payload.image_urls;
    }
    payload.enable_upsample = true;
    return { family: 'veo', modelId, payload, endpoints: unifiedVideoEndpoints };
  },
};

export const wanVideoAdapter: VideoModelAdapter = {
  id: 'wan',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('wan') || m.includes('wanx');
  },
  build: (input) => {
    const normalized = normalizeVideoModelId(input.model);
    const modelId = isWan26(normalized) ? adaptWan26ModelId(normalized, input) : normalized;
    const payload = isWan26(modelId) ? buildWan26Payload(input, modelId) : buildWanOfficialPayload(input, modelId);
    return {
      family: 'wan',
      modelId,
      payload,
      endpoints: wanOfficialEndpoints,
      headers: { 'X-DashScope-Async': 'enable' },
    };
  },
};

export const minimaxVideoAdapter: VideoModelAdapter = {
  id: 'minimax',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('minimax') || m.includes('hailuo') || m === 'h3' || m.includes('t2v-01');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const resolution = (input.resolution || '').toUpperCase();
    if (/hailuo-2\.3/i.test(modelId) && resolution.includes('1080') && Number(input.duration) === 10) {
      throw new Error('Hailuo 2.3 在 1080P 下仅支持 6 秒');
    }
    const mode = input.refMode || 'omni';
    assertVideoInput(input, modelId, mode);
    const payload = baseVideoPayload(input, modelId);
    const images = applyExclusiveFrameFields(payload, input, mode);
    payload.mode = mode === 'text' ? 'text-to-video' : mode === 'first_frame' ? 'image-to-video' : mode === 'first_last_frame' ? 'first-last-frame' : 'reference-to-video';
    payload.resolution = payload.resolution === '1080p' ? '2k' : '768P';
    if (images.length > 0 && (!input.aspectRatio || input.aspectRatio === 'adaptive')) {
      payload.aspect_ratio = 'adaptive';
      payload.ratio = 'adaptive';
    }
    if (images.length > 0) payload.imageUrls = images;
    else delete payload.imageUrls;
    if (/h3/i.test(modelId)) payload.seconds = payload.duration;
    if (input.audio === false && typeof payload.prompt === 'string') {
      const p = payload.prompt.trim();
      if (!p.includes('silent') && !p.includes('无声') && !p.includes('静音')) {
        payload.prompt = `${p} (silent video, no sound)`;
      }
    }
    return { family: 'minimax', modelId, payload, endpoints: minimaxVideoEndpoints(modelId) };
  },
};

export const soraVideoAdapter: VideoModelAdapter = {
  id: 'sora',
  match: (modelId) => modelId.toLowerCase().includes('sora'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = baseVideoPayload(input, modelId);
    payload.duration = String(payload.duration);
    if (input.audio === false && typeof payload.prompt === 'string') {
      const p = payload.prompt.trim();
      if (!p.includes('silent') && !p.includes('无声') && !p.includes('静音')) {
        payload.prompt = `${p} (silent video, mute, no sound)`;
      }
    }
    return { family: 'sora', modelId, payload, endpoints: v1PreferVideoEndpoints };
  },
};

function klingRequestMode(input: VideoAdapterInput, modelId: string): string {
  if (modelId.toLowerCase().includes('omni')) return 'omni-video';
  const mode = input.refMode || 'text';
  if (mode === 'text') return 'text2video';
  if (mode === 'first_frame' || mode === 'first_last_frame') return 'image2video';
  const images = collectVideoImages(input);
  if (images.length >= 2) return 'multi-image2video';
  if (images.length === 1) return 'image2video';
  return 'text2video';
}

function klingImageList(input: VideoAdapterInput, images: string[]) {
  const mode = input.refMode || '';
  return images.map((image_url, index) => {
    if (mode === 'first_frame' && index === 0) return { image_url, type: 'first_frame' };
    if (mode === 'first_last_frame' && index === 0) return { image_url, type: 'first_frame' };
    if (mode === 'first_last_frame' && index === images.length - 1) return { image_url, type: 'end_frame' };
    return { image_url };
  });
}

export const klingVideoAdapter: VideoModelAdapter = {
  id: 'kling',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('kling') || m.includes('keling');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const refMode = input.refMode || (input.lastFrame ? 'first_last_frame' : input.firstFrame ? 'first_frame' : 'text');
    assertVideoInput(input, modelId, refMode);
    const payload = baseVideoPayload(input, modelId);
    const images = collectVideoImages(input);
    const mode = klingRequestMode({ ...input, refMode }, modelId);
    payload.mode = input.resolution === '4K' ? '4k' : input.resolution === '1080P' ? 'pro' : 'std';
    payload.model_name = modelId.replace('kling-video-v', 'kling-v');
    payload.duration = String(payload.duration);
    if (/v3|v2-6/.test(modelId)) payload.sound = input.audio === false ? 'off' : 'on';
    payload.cfg_scale = 0.5;
    if (mode === 'omni-video') {
      payload.image_list = klingImageList({ ...input, refMode }, images);
      if (refMode === 'omni') {
        delete payload.image;
        delete payload.image_url;
        delete payload.first_frame_image;
        delete payload.last_frame_image;
        delete payload.end_frame_image;
        delete payload.image_tail;
      }
    } else if (refMode === 'first_last_frame') {
      payload.image = input.firstFrame || images[0];
      payload.image_tail = input.lastFrame || images[images.length - 1];
    }
    return { family: 'kling', modelId, payload, endpoints: klingModeEndpoints(mode) };
  },
};

export const runwayVideoAdapter: VideoModelAdapter = {
  id: 'runway',
  match: (modelId) => modelId.toLowerCase().includes('runway'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const images = collectVideoImages(input);
    if (images.length === 0) throw new Error('Runway 图生视频需要提供首帧');
    const payload = baseVideoPayload(input, modelId);
    if (/gen3/i.test(modelId)) payload.model = 'gen3a_turbo';
    payload.promptImage = images[0];
    return { family: 'runway', modelId, payload, endpoints: unifiedVideoEndpoints };
  },
};

export const lumaVideoAdapter: VideoModelAdapter = {
  id: 'luma',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('luma') || m.includes('dream-machine');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    return { family: 'luma', modelId, payload: baseVideoPayload(input, modelId), endpoints: lumaVideoEndpoints };
  },
};

function viduResolution(resolution?: string) {
  const upper = (resolution || '720P').toUpperCase();
  if (upper.includes('540')) return '540p';
  if (upper.includes('1080')) return '1080p';
  if (upper.includes('720')) return '720p';
  if (upper.includes('4K')) return '4K';
  if (upper.includes('2K')) return '2K';
  return '720p';
}

export const viduVideoAdapter: VideoModelAdapter = {
  id: 'vidu',
  match: (modelId) => modelId.toLowerCase().includes('vidu'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const images = collectVideoImages(input);
    const mode = input.refMode || (images.length ? 'omni' : 'text');
    assertVideoInput(input, modelId, mode);
    const endpointMode = mode === 'first_last_frame' ? 'start-end' : mode === 'first_frame' ? 'img2video' : mode === 'text' ? 'text2video' : 'reference';
    const payload: Record<string, unknown> = {
      model: modelId,
      prompt: input.prompt,
      duration: Number(input.duration) || 5,
      resolution: viduResolution(input.resolution),
    };
    if (input.audio !== undefined) payload.audio = Boolean(input.audio);
    if (mode === 'first_frame') payload.images = images.slice(0, 1);
    else if (mode === 'first_last_frame') payload.images = [images[0], images[images.length - 1]];
    else if (mode === 'text') payload.aspect_ratio = input.aspectRatio || '16:9';
    else {
      payload.images = images;
      payload.aspect_ratio = input.aspectRatio || '16:9';
    }
    return { family: 'vidu', modelId, payload, endpoints: (baseUrl) => viduVideoEndpoints(baseUrl, endpointMode) };
  },
};

export const grokVideoAdapter: VideoModelAdapter = {
  id: 'grok-video',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('grok-imagine-video') || m.includes('grok-video') || (m.includes('grok') && m.includes('video'));
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const mode = input.refMode || 'text';
    assertVideoInput(input, modelId, mode);
    const payload = baseVideoPayload(input, modelId);
    const imagine = modelId.toLowerCase().includes('grok-imagine');
    if (imagine) {
      const images = collectVideoImages(input);
      const resolution = String(payload.resolution || '480p');
      if (mode === 'edit' || mode === 'extend') {
        const official: Record<string, unknown> = {
          model: payload.model,
          prompt: payload.prompt,
          video: { url: input.videos?.[0] },
        };
        if (mode === 'extend') official.duration = Number(payload.duration) || 6;
        return { family: 'grok-video', modelId, payload: official, endpoints: (baseUrl) => grokImagineVideoEndpoints(baseUrl, mode) };
      }
      const official: Record<string, unknown> = {
        model: payload.model,
        prompt: payload.prompt,
        duration: payload.duration,
        aspect_ratio: payload.aspect_ratio,
        resolution,
      };
      if (mode === 'first_frame' || mode === 'first_last_frame') {
        const first = images[0];
        if (first) official.image = { url: first };
      }
      if (mode === 'first_last_frame' && images.length > 1) official.last_frame = { url: images[images.length - 1] };
      if (mode === 'omni' && images.length) official.reference_images = images.map((url) => ({ url }));
      return { family: 'grok-video', modelId, payload: official, endpoints: (baseUrl) => grokImagineVideoEndpoints(baseUrl, mode) };
    }
    return {
      family: 'grok-video',
      modelId,
      payload,
      endpoints: imagine ? grokImagineVideoEndpoints : unifiedVideoEndpoints,
    };
  },
};

export const defaultVideoAdapter: VideoModelAdapter = {
  id: 'default-video',
  match: () => true,
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    return {
      family: 'unified-video',
      modelId,
      payload: baseVideoPayload(input, modelId),
      endpoints: unifiedVideoEndpoints,
    };
  },
};

export { normalizeVideoModelId };
