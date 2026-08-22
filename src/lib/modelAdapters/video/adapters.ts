import { clampVideoDuration } from '@/lib/video';
import type { GatewayEndpoints, VideoAdapterInput, VideoAdapterResult, VideoModelAdapter } from '../types';

function normalizeVideoModelId(model: string): string {
  if (!model) return 'doubao-seedance-2.5';
  const m = model.toLowerCase().trim();

  if (m === 'minimax-h3' || m === 'h3' || m.includes('minimax-h3')) return 'MiniMax-H3';
  if (m.includes('hailuo-2.3') || m.includes('hailuo-02') || m.includes('hailuo-2')) return 'MiniMax-Hailuo-2.3';
  if (m.includes('hailuo-01') || m.includes('video-01') || m.includes('minimax-video')) return 'minimax-video-01';
  if (m.includes('hailuo') || m.includes('minimax')) return 'MiniMax-H3';

  if (m === 'doubao-seedance-2.5' || m === 'seedance-2.5' || m.includes('seedance-2.5')) return 'doubao-seedance-2.5';
  if (m === 'doubao-seedance-2.0-mini' || m === 'seedance-2.0-mini' || (m.includes('seedance') && m.includes('mini'))) {
    return 'doubao-seedance-2.0-mini';
  }
  if (m.includes('seedance') && m.includes('fast')) return 'doubao-seedance-2-0-fast-260128';
  if (m.includes('seedance') && (m.includes('vip') || m.includes('2.0') || m.includes('2-0'))) return 'doubao-seedance-2-0-260128';
  if (m.includes('seedance') && (m.includes('1.5') || m.includes('1-5') || m.includes('pro'))) return 'doubao-seedance-1-5-pro-251215';

  if (m.includes('veo3.1') || m.includes('veo-3.1') || m.includes('veo-3-1')) return 'veo3.1';
  if (m.includes('veo3') || m.includes('veo-3')) return 'veo3';
  if (m.includes('fast-frames') || m.includes('veo2-fast')) return 'veo2-fast-frames';
  if (m.includes('veo2') || m.includes('veo-2')) return 'veo2';
  if (m.includes('veo')) return 'veo3.1';

  if (m.includes('sora-vip') || m.includes('sora-2-vip')) return 'sora-2-vip';
  if (m.includes('sora-pro') || m.includes('sora-2-pro')) return 'sora-2-pro';
  if (m.includes('sora')) return 'sora-2';

  if (m.includes('kling-omni') || m.includes('omni-video')) return 'kling-omni';
  if (m.includes('kling-v2-pro') || m.includes('kling-2-pro')) return 'kling-v2-pro';
  if (m.includes('kling-v2') || m.includes('kling-2')) return 'kling-v2-pro';
  if (m.includes('kling-v1-6') || m.includes('kling-1.6') || m.includes('kling-1-6')) return 'kling-v1-6';
  if (m.includes('kling-v1-5') || m.includes('kling-1.5')) return 'kling-v1-5';
  if (m.includes('kling') || m.includes('keling') || m.includes('t2v-01')) return 'kling-v2-pro';

  if (m.includes('runway')) return 'runway-gen3-alpha-turbo';
  if (m.includes('luma') || m.includes('dream-machine')) return 'luma-dream-machine-v2';

  if (m.includes('wan2.6-i2v') || m.includes('wan-2.6-i2v')) return 'wan2.6-i2v';
  if (m.includes('wan2.6') || m.includes('wan-2.6')) return 'wan2.6-t2v';
  if (m.includes('wan2.5') || m.includes('wan-2.5')) return 'wan2.5-t2v-preview';
  if (m.includes('wan2.2') || m.includes('s2v')) return 'wan2.2-s2v';
  if (m.includes('wan2.1') || m.includes('wan-2.1')) return 'wan2.1-t2v';
  if (m.includes('wanx') || m.startsWith('wan') || m.includes('wan-') || m.includes('wan2')) return 'wan2.6-t2v';

  if (m.includes('vidu-v2') || m.includes('vidu-2')) return 'vidu-v2';
  if (m.includes('vidu')) return 'vidu-v2';
  if (m.includes('grok-imagine-video') || m.includes('grok-video') || (m.includes('grok') && m.includes('video'))) {
    return 'grok-imagine-video-1.5';
  }

  return model;
}

function calcVideoSize(aspectRatio: string, resolution: string): string {
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

function normalizeResolution(resolution?: string): string {
  const rUpper = (resolution || '720P').toString().toUpperCase();
  if (rUpper.includes('480')) return '480p';
  if (rUpper.includes('1080')) return '1080p';
  if (rUpper.includes('4K')) return '1080p';
  return '720p';
}

function unifiedVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    submit: [
      `${root}/v2/videos/generations`,
      `${root}/v1/video/generations`,
      `${root}/v1/videos`,
    ],
    query: [
      `${root}/v2/videos/generations/{taskId}`,
      `${root}/v1/video/generations/{taskId}`,
      `${root}/v1/videos/{taskId}`,
      `${root}/v1/query/video_generation?task_id={taskId}`,
    ],
  };
}

function v1PreferVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    submit: [
      `${root}/v1/videos`,
      `${root}/v2/videos/generations`,
      `${root}/v1/video/generations`,
      `${root}/xai/v1/videos/generations`,
    ],
    query: [
      `${root}/v1/videos/{taskId}`,
      `${root}/v2/videos/generations/{taskId}`,
      `${root}/v1/video/generations/{taskId}`,
      `${root}/xai/v1/videos/generations/{taskId}`,
    ],
  };
}

function baseVideoPayload(input: VideoAdapterInput, modelId: string): Record<string, unknown> {
  const normRatio = input.aspectRatio || '16:9';
  const safeResolution = normalizeResolution(input.resolution);
  const safeDuration = clampVideoDuration(modelId, Number(input.duration) || 5);
  const images = input.images || [];
  const hasImageInput = images.length > 0 || Boolean(input.firstFrame);
  const effectiveRatio = hasImageInput ? 'adaptive' : normRatio;

  const payload: Record<string, unknown> = {
    model: modelId,
    prompt: input.prompt,
    duration: safeDuration,
    ratio: effectiveRatio,
    aspect_ratio: effectiveRatio,
    resolution: safeResolution,
    watermark: Boolean(input.watermark),
    fps: Number(input.fps) || 24,
    size: calcVideoSize(normRatio, safeResolution),
  };

  if (input.audio !== undefined) {
    payload.audio = input.audio;
    payload.generate_audio = Boolean(input.audio);
  }
  if (input.seed !== undefined && input.seed !== null) {
    payload.seed = Number(input.seed);
  }
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

  if (images.length > 0 || input.firstFrame) {
    const imgs = [...images];
    if (input.firstFrame && !imgs.includes(input.firstFrame)) imgs.unshift(input.firstFrame);
    if (input.lastFrame && !imgs.includes(input.lastFrame)) imgs.push(input.lastFrame);
    payload.images = imgs;
    payload.image = imgs[0];
    payload.first_frame_image = input.firstFrame || imgs[0];
    payload.image_url = imgs[0];
    if (input.lastFrame || imgs.length >= 2) {
      const last = input.lastFrame || imgs[imgs.length - 1];
      payload.last_frame_image = last;
      payload.end_frame_image = last;
    }
  }

  if (input.videos && input.videos.length > 0) {
    payload.videos = input.videos;
    payload.video = input.videos[0];
    payload.video_url = input.videos[0];
  }

  return payload;
}

export const seedanceVideoAdapter: VideoModelAdapter = {
  id: 'seedance',
  match: (modelId) => modelId.toLowerCase().includes('seedance') || modelId.toLowerCase().includes('doubao-seedance'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    return {
      family: 'seedance',
      modelId,
      payload: baseVideoPayload(input, modelId),
      endpoints: unifiedVideoEndpoints,
    };
  },
};

export const veoVideoAdapter: VideoModelAdapter = {
  id: 'veo',
  match: (modelId) => modelId.toLowerCase().includes('veo'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    return {
      family: 'veo',
      modelId,
      payload: baseVideoPayload(input, modelId),
      endpoints: unifiedVideoEndpoints,
    };
  },
};

export const wanVideoAdapter: VideoModelAdapter = {
  id: 'wan',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('wan') || m.includes('wanx');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = baseVideoPayload(input, modelId);
    // 万相常开音频字段
    if (input.audio === undefined) {
      payload.generate_audio = true;
      payload.audio = true;
    }
    return {
      family: 'wan',
      modelId,
      payload,
      endpoints: unifiedVideoEndpoints,
    };
  },
};

export const minimaxVideoAdapter: VideoModelAdapter = {
  id: 'minimax',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('minimax') || m.includes('hailuo') || m === 'h3';
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = baseVideoPayload(input, modelId);
    const images = (payload.images as string[] | undefined) || [];
    payload.mode = images.length > 1 ? 'multimodal-to-video' : images.length === 1 ? 'image-to-video' : 'text-to-video';
    payload.resolution = payload.resolution === '1080p' ? '2k' : '768P';
    payload.aspect_ratio = images.length > 0 ? 'adaptive' : (input.aspectRatio || '16:9');
    if (images.length > 0) payload.imageUrls = images;
    return {
      family: 'minimax',
      modelId,
      payload,
      endpoints: v1PreferVideoEndpoints,
    };
  },
};

export const soraVideoAdapter: VideoModelAdapter = {
  id: 'sora',
  match: (modelId) => modelId.toLowerCase().includes('sora'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    return {
      family: 'sora',
      modelId,
      payload: baseVideoPayload(input, modelId),
      endpoints: v1PreferVideoEndpoints,
    };
  },
};

function klingVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    submit: [
      `${root}/v2/videos/generations`,
      `${root}/kling/v1/videos/text2video`,
      `${root}/kling/v1/videos/image2video`,
      `${root}/v1/video/generations`,
    ],
    query: [
      `${root}/v2/videos/generations/{taskId}`,
      `${root}/kling/v1/videos/{taskId}`,
      `${root}/v1/video/generations/{taskId}`,
      `${root}/v1/videos/{taskId}`,
    ],
  };
}

export const klingVideoAdapter: VideoModelAdapter = {
  id: 'kling',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('kling') || m.includes('keling') || m.includes('t2v-01');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = baseVideoPayload(input, modelId);
    const images = (payload.images as string[] | undefined) || [];
    payload.mode = images.length > 1 ? 'multi-image2video' : images.length === 1 ? 'image2video' : 'text2video';
    payload.cfg_scale = 0.5;
    return {
      family: 'kling',
      modelId,
      payload,
      endpoints: klingVideoEndpoints,
    };
  },
};

export const runwayVideoAdapter: VideoModelAdapter = {
  id: 'runway',
  match: (modelId) => modelId.toLowerCase().includes('runway'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    return {
      family: 'runway',
      modelId,
      payload: baseVideoPayload(input, modelId),
      endpoints: unifiedVideoEndpoints,
    };
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
    return {
      family: 'luma',
      modelId,
      payload: baseVideoPayload(input, modelId),
      endpoints: unifiedVideoEndpoints,
    };
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
    return {
      family: 'vidu',
      modelId,
      payload,
      endpoints: unifiedVideoEndpoints,
    };
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
    return {
      family: 'grok-video',
      modelId,
      payload: baseVideoPayload(input, modelId),
      endpoints: v1PreferVideoEndpoints,
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
