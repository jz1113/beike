import { normalizeGatewayBaseUrl } from '@beike/shared/gatewayUrl';
import { clampVideoDuration } from '@beike/shared/video';
import type { GatewayEndpoints, VideoAdapterInput, VideoModelAdapter } from '../types';

function normalizeVideoModelId(model: string): string {
  if (!model) return 'doubao-seedance-2.5';
  // Model catalogue IDs are opaque. Only exact historical UI aliases are mapped.
  const aliases: Record<string, string> = {
    'h3': 'MiniMax-H3', 'minimax-h3': 'MiniMax-H3',
    'hailuo-2.3': 'MiniMax-Hailuo-2.3', 'hailuo-02': 'MiniMax-Hailuo-2.3',
    'hailuo-01': 'minimax-video-01', 'video-01': 'minimax-video-01',
    'seedance-2.5': 'doubao-seedance-2.5', 'seedance-2.0-mini': 'doubao-seedance-2.0-mini',
    'seedance-2.0': 'doubao-seedance-2-0-260128', 'seedance-2.0-fast': 'doubao-seedance-2-0-fast-260128',
    'seedance-1.5-pro': 'doubao-seedance-1-5-pro-251215',
    'veo-3.1': 'veo3.1', 'veo-3-1': 'veo3.1', 'veo-3': 'veo3', 'veo-2': 'veo2',
    'sora-vip': 'sora-2-vip', 'sora-pro': 'sora-2-pro',
    'kling-2-pro': 'kling-v2-pro', 'kling-1.6': 'kling-v1-6', 'kling-1-6': 'kling-v1-6', 'kling-1.5': 'kling-v1-5',
    'wan3-prime': 'wan3.0-video-prime', 'wan3.0-prime': 'wan3.0-video-prime', 'wan3.0': 'wan3.0-video',
    'wan-2.6-i2v': 'wan2.6-i2v', 'wan-2.6': 'wan2.6-t2v', 'wan2.6': 'wan2.6-t2v',
    'wan2.5': 'wan2.5-t2v-preview', 'wan2.2': 'wan2.2-s2v', 'wan2.1': 'wan2.1-t2v',
    'vidu-2': 'vidu-v2',
  };
  return aliases[model.trim().toLowerCase()] || model.trim();
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
  if (rUpper.includes('720')) return '720p';
  if (rUpper.includes('1080')) return '1080p';
  if (rUpper.includes('4K')) return '4k';
  return '720p';
}

function unifiedVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = normalizeGatewayBaseUrl(baseUrl);
  return {
    submit: [
      `${root}/v2/videos/generations`,
      `${root}/v1/videos`,
      `${root}/v1/video/generations`,
    ],
    query: [
      `${root}/v2/videos/generations/{taskId}`,
      `${root}/v1/videos/{taskId}`,
      `${root}/v1/video/generations/{taskId}`,
      `${root}/v1/query/video_generation?task_id={taskId}`,
    ],
  };
}

function v1PreferVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = normalizeGatewayBaseUrl(baseUrl);
  return {
    submit: [
      `${root}/v2/videos/generations`,
      `${root}/v1/videos`,
      `${root}/v1/video/generations`,
      `${root}/xai/v1/videos/generations`,
    ],
    query: [
      `${root}/v2/videos/generations/{taskId}`,
      `${root}/v1/videos/{taskId}`,
      `${root}/v1/video/generations/{taskId}`,
      `${root}/xai/v1/videos/generations/{taskId}`,
    ],
  };
}

function baseVideoPayload(input: VideoAdapterInput, modelId: string): Record<string, unknown> {
  const normRatio = input.aspectRatio || '16:9';
  const safeResolution = normalizeResolution(input.resolution);
  const safeDuration = clampVideoDuration(modelId, Number(input.duration) || 5);
  const rawImages = input.images || [];
  const refMode = input.refMode || 'omni';

  // 严格保留用户选择的标准宽高比，禁止盲目被 adaptive 覆盖
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

  // 🌟 核心：上游统一网关根据是否存在 images 字段判定是否为“图生视频”
  if (rawImages.length > 0 || input.firstFrame) {
    const effectiveImgs = [...rawImages];
    if (input.firstFrame && !effectiveImgs.includes(input.firstFrame)) {
      effectiveImgs.unshift(input.firstFrame);
    }
    if (input.lastFrame && !effectiveImgs.includes(input.lastFrame)) {
      effectiveImgs.push(input.lastFrame);
    }

    // 必填的 images 数组（确保上游网关识别为图生视频模式）
    payload.images = effectiveImgs;
    payload.image_urls = effectiveImgs;
    payload.image = effectiveImgs[0];
    payload.image_url = effectiveImgs[0];

    // 仅在明确是首尾帧模式时注入首尾帧特定字段
    if (refMode === 'first_last_frame') {
      payload.first_frame_image = input.firstFrame || effectiveImgs[0];
      const last = input.lastFrame || effectiveImgs[effectiveImgs.length - 1];
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

function seedanceOfficialEndpoints(baseUrl: string): GatewayEndpoints {
  const root = normalizeGatewayBaseUrl(baseUrl);
  return {
    submit: [
      `${root}/seedance/v3/contents/generations/tasks`,
      `${root}/v2/videos/generations`,
    ],
    query: [
      `${root}/seedance/v3/contents/generations/tasks/{taskId}`,
      `${root}/v2/videos/generations/{taskId}`,
    ],
  };
}

function buildSeedanceOfficialPayload(input: VideoAdapterInput, modelId: string): Record<string, unknown> {
  const safeResolution = normalizeResolution(input.resolution);
  const safeDuration = clampVideoDuration(modelId, Number(input.duration) || 5);
  const rawImages = input.images || [];
  const refMode = input.refMode || 'omni';

  const content: Array<Record<string, unknown>> = [];

  // 1. 文本提示词
  if (input.prompt && input.prompt.trim()) {
    content.push({
      type: 'text',
      text: input.prompt.trim(),
    });
  }

  // 2. 图片处理与角色映射 (first_frame / last_frame / reference_image)
  const isFirstLastMode = refMode === 'first_last_frame' || Boolean(input.firstFrame && input.lastFrame);

  if (isFirstLastMode) {
    const first = input.firstFrame || rawImages[0];
    const last = input.lastFrame || (rawImages.length > 1 ? rawImages[rawImages.length - 1] : rawImages[0]);
    if (first) {
      content.push({
        type: 'image_url',
        image_url: { url: first },
        role: 'first_frame',
      });
    }
    if (last) {
      content.push({
        type: 'image_url',
        image_url: { url: last },
        role: 'last_frame',
      });
    }
  } else if (input.firstFrame || rawImages.length === 1) {
    const first = input.firstFrame || rawImages[0];
    if (first) {
      content.push({
        type: 'image_url',
        image_url: { url: first },
        role: 'first_frame',
      });
    }
  } else if (rawImages.length > 1) {
    for (const imgUrl of rawImages) {
      if (imgUrl && typeof imgUrl === 'string') {
        content.push({
          type: 'image_url',
          image_url: { url: imgUrl },
          role: 'reference_image',
        });
      }
    }
  }

  // 3. 参考视频处理
  if (Array.isArray(input.videos)) {
    for (const videoUrl of input.videos) {
      if (videoUrl && typeof videoUrl === 'string') {
        content.push({
          type: 'video_url',
          video_url: { url: videoUrl },
          role: 'reference_video',
        });
      }
    }
  }

  // 4. 宽高比 ratio：Seedance 2.5 在图生首帧或首尾帧时仅支持 adaptive，其余场景使用用户选择
  const isSeedance25 = modelId.includes('seedance-2.5') || modelId.includes('2.5');
  const hasImageInputs = content.some((c) => c.type === 'image_url');
  let ratio = input.aspectRatio || '16:9';
  if (isSeedance25 && hasImageInputs) {
    ratio = 'adaptive';
  }

  const payload: Record<string, unknown> = {
    model: modelId,
    content,
    duration: safeDuration,
    ratio,
    resolution: safeResolution,
  };

  if (input.audio !== undefined) {
    payload.generate_audio = Boolean(input.audio);
  } else {
    payload.generate_audio = true;
  }

  if (input.watermark !== undefined) {
    payload.watermark = Boolean(input.watermark);
  }

  if (input.seed !== undefined && input.seed !== null) {
    const s = Number(input.seed);
    if (!Number.isNaN(s)) {
      payload.seed = s;
    }
  }

  return payload;
}

export const seedanceVideoAdapter: VideoModelAdapter = {
  id: 'seedance',
  match: (modelId) => modelId.toLowerCase().includes('seedance') || modelId.toLowerCase().includes('doubao-seedance'),
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = buildSeedanceOfficialPayload(input, modelId);
    return {
      family: 'seedance',
      modelId,
      payload,
      endpoints: seedanceOfficialEndpoints,
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

function wanOfficialEndpoints(baseUrl: string): GatewayEndpoints {
  const root = normalizeGatewayBaseUrl(baseUrl);
  return {
    submit: [
      `${root}/qwen/api/v1/services/aigc/video-generation/video-synthesis`,
      `${root}/api/v1/services/aigc/video-generation/video-synthesis`,
    ],
    query: [
      `${root}/qwen/api/v1/tasks/{taskId}`,
      `${root}/api/v1/tasks/{taskId}`,
    ],
  };
}

function normalizeWanResolution(resolution?: string): '1080P' | '720P' | '480P' {
  const rUpper = (resolution || '1080P').toString().toUpperCase();
  if (rUpper.includes('480')) return '480P';
  if (rUpper.includes('720')) return '720P';
  return '1080P';
}

function normalizeWanRatio(ratio?: string, hasMedia?: boolean): string {
  const validRatios = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'];
  if (ratio && validRatios.includes(ratio)) {
    return ratio;
  }
  return hasMedia ? 'adaptive' : '16:9';
}

function buildWanOfficialPayload(input: VideoAdapterInput, modelId: string): Record<string, unknown> {
  const rawImages = input.images || [];
  const rawVideos = input.videos || [];
  const refMode = input.refMode || 'omni';
  const prompt = (input.prompt || '').trim();

  // 1. 构建 input 对象中的 media 素材数组 (严格遵守官方组合与互斥规则)
  const media: Array<{ type: string; url: string }> = [];

  const isFirstLastMode = refMode === 'first_last_frame' || Boolean(input.firstFrame && input.lastFrame);

  if (isFirstLastMode) {
    // 首尾帧模式：仅限 1 张首帧 + 1 张尾帧，严格不可与 reference_* 混用
    const first = input.firstFrame || rawImages[0];
    const last = input.lastFrame || (rawImages.length > 1 ? rawImages[rawImages.length - 1] : rawImages[0]);
    if (first) {
      media.push({ type: 'first_frame', url: first });
    }
    if (last) {
      media.push({ type: 'last_frame', url: last });
    }
  } else if (rawVideos.length > 0) {
    // 视频延长 / 视频编辑 / 参考视频生视频模式：传入 reference_video (最多 5 段)
    for (const vUrl of rawVideos.slice(0, 5)) {
      if (vUrl && typeof vUrl === 'string' && vUrl.trim()) {
        media.push({ type: 'reference_video', url: vUrl.trim() });
      }
    }
    // 官方规范：reference_image 与 reference_video 可自由组合
    for (const imgUrl of rawImages.slice(0, 10)) {
      if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim()) {
        media.push({ type: 'reference_image', url: imgUrl.trim() });
      }
    }
  } else if (input.firstFrame || (rawImages.length === 1 && refMode !== 'reference_image')) {
    // 单图首帧生视频模式：严格指定首帧
    const first = input.firstFrame || rawImages[0];
    if (first) {
      media.push({ type: 'first_frame', url: first });
    }
  } else if (rawImages.length > 0) {
    // 多参考图模式：最多 10 张
    for (const imgUrl of rawImages.slice(0, 10)) {
      if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim()) {
        media.push({ type: 'reference_image', url: imgUrl.trim() });
      }
    }
  }

  const inputObj: Record<string, unknown> = {
    prompt,
  };
  // 🌟 官方关键规则：纯文生视频时严禁传入 media 属性，否则上游直接抛出 InvalidParameter
  if (media.length > 0) {
    inputObj.media = media;
  }

  // 2. 构建 parameters 视频生成参数
  const safeResolution = normalizeWanResolution(input.resolution);
  const safeRatio = normalizeWanRatio(input.aspectRatio, media.length > 0);

  let safeDuration = 5;
  if (input.duration !== undefined && input.duration !== null) {
    const d = Number(input.duration);
    if (d === -1) {
      safeDuration = -1; // 智能时长模式
    } else if (!Number.isNaN(d)) {
      safeDuration = Math.min(Math.max(Math.round(d), 2), 30);
    }
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
    if (!Number.isNaN(s) && s >= 0) {
      parametersObj.seed = Math.min(s, 2147483647);
    }
  }

  return {
    model: modelId,
    input: inputObj,
    parameters: parametersObj,
  };
}

export const wanVideoAdapter: VideoModelAdapter = {
  id: 'wan',
  match: (modelId) => {
    const m = modelId.toLowerCase();
    return m.includes('wan') || m.includes('wanx');
  },
  build: (input) => {
    const modelId = normalizeVideoModelId(input.model);
    const payload = buildWanOfficialPayload(input, modelId);
    return {
      family: 'wan',
      modelId,
      payload,
      endpoints: wanOfficialEndpoints,
      headers: {
        'X-DashScope-Async': 'enable',
      },
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
    if (images.length > 0 && (!input.aspectRatio || input.aspectRatio === 'adaptive')) {
      payload.aspect_ratio = 'adaptive';
      payload.ratio = 'adaptive';
    }
    if (images.length > 0) payload.imageUrls = images;
    if (input.audio === false && typeof payload.prompt === 'string') {
      const p = payload.prompt.trim();
      if (!p.includes('silent') && !p.includes('无声') && !p.includes('静音')) {
        payload.prompt = `${p} (silent video, no sound)`;
      }
    }
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
    const payload = baseVideoPayload(input, modelId);
    if (input.audio === false && typeof payload.prompt === 'string') {
      const p = payload.prompt.trim();
      if (!p.includes('silent') && !p.includes('无声') && !p.includes('静音')) {
        payload.prompt = `${p} (silent video, mute, no sound)`;
      }
    }
    return {
      family: 'sora',
      modelId,
      payload,
      endpoints: v1PreferVideoEndpoints,
    };
  },
};

function klingVideoEndpoints(baseUrl: string): GatewayEndpoints {
  const root = normalizeGatewayBaseUrl(baseUrl);
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
