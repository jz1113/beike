export const DEPTH_VIDEO_MODEL_ID = 'video-depth-anything' as const;
export const DEPTH_IMAGE_MODEL_ID = 'image-depth-anything' as const;

export const DEPTH_VIDEO_LIMITS = {
  maxDurationSec: 30,
  maxWidthPx: 1280,
  maxDataUrlBytes: 35 * 1024 * 1024,
} as const;

export const DEPTH_IMAGE_LIMITS = {
  maxBytes: 20 * 1024 * 1024,
} as const;

export const DEPTH_ALL_STYLES = ['mocap', 'turbo', 'raw'] as const;
export const DEPTH_VIDEO_STYLES = ['mocap'] as const;
export type DepthVideoStyle = (typeof DEPTH_ALL_STYLES)[number];

/** @deprecated use DepthVideoStyle */
export const DEPTH_VIDEO_COLORMAPS = ['gray', 'turbo'] as const;
export type DepthVideoColormap = (typeof DEPTH_VIDEO_COLORMAPS)[number];

export function isDepthVideoStyle(value: unknown): value is DepthVideoStyle {
  return typeof value === 'string' && (DEPTH_ALL_STYLES as readonly string[]).includes(value);
}

export function isDepthVideoColormap(value: unknown): value is DepthVideoColormap {
  return typeof value === 'string' && (DEPTH_VIDEO_COLORMAPS as readonly string[]).includes(value);
}

export function resolveDepthVideoStyle(input: {
  style?: unknown;
  colormap?: unknown;
}): DepthVideoStyle {
  if (isDepthVideoStyle(input.style)) return input.style;
  if (input.colormap === 'turbo') return 'turbo';
  return 'mocap';
}

export function formatDepthVideoProgress(frame: number, total: number): string {
  if (!total || total <= 0) return '5%';
  const pct = Math.min(99, Math.max(5, Math.round((frame / total) * 90) + 5));
  return `${pct}%`;
}

export const DEPTH_MODEL_SETUP_COMMAND = 'npm run setup:depth-model';

export type QuickGenMode = 'image' | 'video' | 'depth-image' | 'depth-video' | 'agent' | 'audio';

export function isDepthGenMode(m: QuickGenMode): m is 'depth-image' | 'depth-video' {
  return m === 'depth-image' || m === 'depth-video';
}

export const DEPTH_STYLE_LABELS: Record<DepthVideoStyle, string> = {
  mocap: '动作捕捉',
  turbo: '伪彩色深度',
  raw: '原始深度灰度',
};

export const DEPTH_QUALITY_TIERS = ['fast', 'standard', 'high'] as const;
export type DepthQuality = (typeof DEPTH_QUALITY_TIERS)[number];

export const DEPTH_QUALITY_LABELS: Record<DepthQuality, string> = {
  fast: '快速',
  standard: '标准',
  high: '高清',
};

export interface DepthPostProcessProfile {
  bilateralD: number;
  bilateralSigma: number;
  sharpen: boolean;
  sharpenRadius: number;
  sharpenAmount: number;
  temporalWindow: number;
  gamma: number;
  stretchLo: number;
  stretchHi: number;
}

export interface DepthQualityProfile {
  modelId: string;
  inferenceSizePx: number;
  inferenceSizePxCuda: number;
  inferenceSizePxMps: number;
  maxWidthPx: number;
  videoCrf: number;
  videoPreset: string;
  postProcess: DepthPostProcessProfile;
}

export const DEPTH_QUALITY_PROFILES: Record<DepthQuality, DepthQualityProfile> = {
  fast: {
    modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
    inferenceSizePx: 518,
    inferenceSizePxCuda: 518,
    inferenceSizePxMps: 518,
    maxWidthPx: 960,
    videoCrf: 23,
    videoPreset: 'medium',
    postProcess: {
      bilateralD: 5,
      bilateralSigma: 12,
      sharpen: false,
      sharpenRadius: 1.0,
      sharpenAmount: 0.6,
      temporalWindow: 3,
      gamma: 0.62,
      stretchLo: 1,
      stretchHi: 99,
    },
  },
  standard: {
    modelId: 'depth-anything/Depth-Anything-V2-Base-hf',
    inferenceSizePx: 518,
    inferenceSizePxCuda: 518,
    inferenceSizePxMps: 518,
    maxWidthPx: 1280,
    videoCrf: 20,
    videoPreset: 'medium',
    postProcess: {
      bilateralD: 5,
      bilateralSigma: 12,
      sharpen: false,
      sharpenRadius: 1.0,
      sharpenAmount: 0.6,
      temporalWindow: 3,
      gamma: 0.62,
      stretchLo: 1,
      stretchHi: 99,
    },
  },
  high: {
    modelId: 'depth-anything/Depth-Anything-V2-Large-hf',
    inferenceSizePx: 768,
    inferenceSizePxCuda: 1024,
    inferenceSizePxMps: 768,
    maxWidthPx: 2560,
    videoCrf: 15,
    videoPreset: 'slow',
    postProcess: {
      bilateralD: 0,
      bilateralSigma: 6,
      sharpen: true,
      sharpenRadius: 1.5,
      sharpenAmount: 1.0,
      temporalWindow: 1,
      gamma: 0.78,
      stretchLo: 2,
      stretchHi: 98,
    },
  },
};

export interface DepthInferenceMeta {
  modelId: string;
  inferenceSizePx: number;
  device: string;
  quality?: DepthQuality;
}

export function isDepthQuality(value: unknown): value is DepthQuality {
  return typeof value === 'string' && (DEPTH_QUALITY_TIERS as readonly string[]).includes(value);
}

export function resolveDepthQuality(value: unknown): DepthQuality {
  if (isDepthQuality(value)) return value;
  return 'standard';
}

export function getDepthQualityProfile(quality: unknown): DepthQualityProfile {
  return DEPTH_QUALITY_PROFILES[resolveDepthQuality(quality)];
}
