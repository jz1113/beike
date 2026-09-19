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
  baseVideoPayload,
  buildSeedanceOfficialPayload,
  buildWan26Payload,
  buildWanOfficialPayload,
  collectVideoImages,
  isWan26,
  normalizeVideoModelId,
} from './payloads';

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
    return m.includes('veo') || m.includes('omni_flash') || m.includes('omni-flash');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = baseVideoPayload(input, modelId);
    payload.enable_upsample = true;
    delete payload.duration;
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
    const payload = baseVideoPayload(input, modelId);
    const images = (payload.images as string[] | undefined) || [];
    payload.mode = images.length > 1 ? 'multimodal-to-video' : images.length === 1 ? 'image-to-video' : 'text-to-video';
    payload.resolution = payload.resolution === '1080p' ? '2k' : '768P';
    if (images.length > 0 && (!input.aspectRatio || input.aspectRatio === 'adaptive')) {
      payload.aspect_ratio = 'adaptive';
      payload.ratio = 'adaptive';
    }
    if (images.length > 0) payload.imageUrls = images;
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
  if (input.firstFrame && input.lastFrame) return 'image2video';
  const images = collectVideoImages(input);
  if (images.length >= 2) return 'multi-image2video';
  if (images.length === 1) return 'image2video';
  return 'text2video';
}

export const klingVideoAdapter: VideoModelAdapter = {
  id: 'kling',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('kling') || m.includes('keling');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = baseVideoPayload(input, modelId);
    const images = collectVideoImages(input);
    const mode = klingRequestMode(input, modelId);
    payload.mode = mode;
    payload.cfg_scale = 0.5;
    if (mode === 'omni-video') {
      payload.model_name = modelId;
      payload.image_list = images;
    } else if (input.firstFrame && input.lastFrame) {
      payload.image = input.firstFrame;
      payload.image_tail = input.lastFrame;
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

export const viduVideoAdapter: VideoModelAdapter = {
  id: 'vidu',
  match: (modelId) => modelId.toLowerCase().includes('vidu'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = baseVideoPayload(input, modelId);
    const images = (payload.images as string[] | undefined) || [];
    if (images.length >= 2) payload.mode = 'start-end';
    else if (images.length === 1) payload.mode = 'img2video';
    else payload.mode = 'text2video';
    return { family: 'vidu', modelId, payload, endpoints: (baseUrl) => viduVideoEndpoints(baseUrl, String(payload.mode || 'text2video')) };
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
    const payload = baseVideoPayload(input, modelId);
    const imagine = modelId.toLowerCase().includes('grok-imagine');
    if (imagine) {
      const url = typeof payload.image === 'string' ? payload.image : undefined;
      delete payload.images;
      delete payload.image_urls;
      delete payload.image_url;
      if (url) payload.image = { url };
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
