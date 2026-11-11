import {
  GEMINI_MAX_REFERENCE_IMAGES,
  geminiSupports512px,
  geminiSupportedAspectRatios,
  geminiSupportedResolutions,
  isGeminiImageModel,
} from '@shared/domain/models/model-adapters/image/geminiImageSizes';

export type ImageCapabilityResolution = '512px' | '1K' | '2K' | '4K';
/** Legacy storage uses quality names for pixel tiers; output quality is a separate field. */
export type ImageOutputTier = '512px' | 'low' | 'medium' | 'high';
export type ImageCapabilityQuality = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ImageCapability {
  resolutions: ImageCapabilityResolution[];
  strength: 'quality' | 'prompt-extend' | 'none';
  sendsQuality: boolean;
  qualities?: ImageCapabilityQuality[];
  aspectRatios?: string[];
  maxReferenceImages?: number;
}

const ALL_RESOLUTIONS: ImageCapabilityResolution[] = ['1K', '2K', '4K'];
const SEEDREAM_GATEWAY_PRO_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
const SEEDREAM_RATIOS = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'];
const OUTPUT_RESOLUTIONS = { '512px': '512px', low: '1K', medium: '2K', high: '4K' } as const;

export function imageOutputResolution(tier: string): ImageCapabilityResolution {
  return OUTPUT_RESOLUTIONS[tier as ImageOutputTier] ?? '4K';
}

export function imageOutputTier(resolution: ImageCapabilityResolution): ImageOutputTier {
  return resolution === '512px' ? '512px' : resolution === '1K' ? 'low' : resolution === '2K' ? 'medium' : 'high';
}

export function resolveImageOutputTier(tier: ImageOutputTier, caps: ImageCapability): ImageOutputTier {
  if (!caps.resolutions.length || caps.resolutions.includes(imageOutputResolution(tier))) return tier;
  return imageOutputTier(caps.resolutions.includes('2K') ? '2K' : caps.resolutions.at(-1)!);
}

export function resolveImageAspect(aspect: string, caps: ImageCapability): string {
  const ratios = caps.aspectRatios;
  const id = aspect === 'auto' ? 'smart' : aspect;
  if (!ratios?.length || ratios.includes(id)) return id;
  return ratios.includes('3:4') ? '3:4' : ratios[0];
}

export function resolveImageGenerationQuality(quality: string | undefined, caps: ImageCapability) {
  if (caps.strength !== 'quality') return undefined;
  return caps.qualities?.find(value => value === quality) ?? 'high';
}

function isFalQwenImage3(model = ''): boolean {
  return /^(?:alibaba\/)?qwen-image-3(?:\/(?:text-to-image|edit))?$/i.test(model.trim());
}

export function resolveProviderImageSize(model: string, ratio: string, tier: string): string | undefined {
  const id = model.toLowerCase();
  const isQwen = isFalQwenImage3(id);
  const isGatewayPro = id === 'seedream-v5-pro';
  if (!isQwen && !isGatewayPro && !/^doubao-seedream-(?:4-[05]|5-0)-/.test(id)) return;
  const liteOr45 = /seedream-(?:5-0-(?:lite-)?260128|4-5-)/.test(id);
  const smallMaximum = isQwen || /seedream-5-0-(?:pro|flash)-/.test(id);
  const [w, h] = (/^\d+:\d+$/.test(ratio) ? ratio : '3:4').split(':').map(Number);
  if (w <= 0 || h <= 0) return;
  if (isGatewayPro) {
    const minimum = Math.ceil(1024 / Math.min(w, h));
    const maximum = Math.floor(2048 / Math.max(w, h));
    if (minimum > maximum) return;
    const multiple = tier === 'low' ? minimum : maximum;
    return `${w * multiple}x${h * multiple}`;
  }
  const edge = tier === 'high' && !smallMaximum ? 4096 : tier === 'low' && !liteOr45 ? 1024 : 2048;
  const multiple = Math.max(1, Math.floor(edge / Math.sqrt(w * h)));
  return `${w * multiple}x${h * multiple}`;
}

/** 千问和 DashScope 域名走原生生图，即使服务商协议仍保存为 OpenAI 兼容。 */
export function isDashScopeBase(baseUrl?: string): boolean {
  const raw = baseUrl?.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'qianwenaiapi.com' || host.endsWith('.qianwenaiapi.com') || host.endsWith('.maas.aliyuncs.com')) return true;
    return host.includes('dashscope') && (host === 'aliyuncs.com' || host.endsWith('.aliyuncs.com'));
  } catch {
    return /qianwenaiapi\.com|dashscope[\w.-]*\.aliyuncs\.com/i.test(raw);
  }
}

/** 带版本号的千问图像模型和万相 2.6/2.7 只走原生生图。qwen-image、qwen-image-edit、qwen-image-max 仍走聚合网关。 */
export function isNativeDashscopeImageModel(model = ''): boolean {
  const id = model.toLowerCase();
  if (!id) return false;
  if (id.includes('qwen-image-3.0') || id.includes('qwen-image-2.0') || id.includes('qwen-image-2.1') || id.includes('qwen-image-2-0') || id.includes('qwen-image-2-1')) return true;
  return id.includes('wan2.7-image') || id.includes('wan2.6-image') || id.includes('wan2.6-t2i');
}

function baseImageCapabilities(model = '', protocol?: string, baseUrl?: string): ImageCapability {
  const id = model.toLowerCase();
  if (isFalQwenImage3(id)) return { resolutions: ['1K', '2K'], strength: 'none', sendsQuality: false, aspectRatios: SEEDREAM_GATEWAY_PRO_RATIOS, maxReferenceImages: 3 };
  if (/seedream-(?:5-0-(?:lite-)?260128|4-5-)/.test(id)) return { resolutions: ['2K', '4K'], strength: 'none', sendsQuality: false, aspectRatios: SEEDREAM_RATIOS, maxReferenceImages: 14 };
  if (/seedream-5-0-(?:pro|flash)-/.test(id)) return { resolutions: ['1K', '2K'], strength: 'none', sendsQuality: false, aspectRatios: SEEDREAM_RATIOS, maxReferenceImages: 10 };
  if (id.includes('grok')) return { resolutions: [], strength: 'none', sendsQuality: false, ...(id === 'grok-imagine-image-2.0' ? { maxReferenceImages: 5 } : {}) };
  if (id.includes('gpt-image-2-4k')) return { resolutions: ['4K'], strength: 'none', sendsQuality: false, maxReferenceImages: 16 };
  if (id.includes('gpt-image-2-2k')) return { resolutions: ['2K'], strength: 'none', sendsQuality: false, maxReferenceImages: 16 };
  if (id.includes('gpt-image-2.5')) {
    return {
      resolutions: ALL_RESOLUTIONS,
      strength: 'quality',
      sendsQuality: true,
      qualities: ['low', 'medium', 'high', 'xhigh', 'max'],
      maxReferenceImages: 16,
    };
  }
  if (id.includes('gpt-image')) {
    return {
      resolutions: ALL_RESOLUTIONS,
      strength: 'quality',
      sendsQuality: true,
      qualities: ['low', 'medium', 'high'],
      maxReferenceImages: 16,
    };
  }
  if (id === 'seedream-v5-pro') return { resolutions: ['1K', '2K'], strength: 'none', sendsQuality: false, aspectRatios: SEEDREAM_GATEWAY_PRO_RATIOS };
  if (isGeminiImageModel(id)) {
    const resolutions: ImageCapabilityResolution[] = geminiSupportedResolutions(id);
    return {
      resolutions: geminiSupports512px(id) && resolutions.length > 1 ? ['512px', ...resolutions] : resolutions,
      strength: 'none',
      sendsQuality: false,
      aspectRatios: ['smart', ...geminiSupportedAspectRatios(id)],
      maxReferenceImages: id.includes('2.5-flash-image') ? 3 : GEMINI_MAX_REFERENCE_IMAGES,
    };
  }
  if (protocol === 'template') return { resolutions: ALL_RESOLUTIONS, strength: 'none', sendsQuality: false };
  const dashscope = protocol === 'dashscope' || isDashScopeBase(baseUrl) || isNativeDashscopeImageModel(model);
  if (!dashscope) return { resolutions: ALL_RESOLUTIONS, strength: 'none', sendsQuality: false };
  if (id.includes('wan2.7-image-pro')) return { resolutions: ALL_RESOLUTIONS, strength: 'prompt-extend', sendsQuality: false };
  if (id.includes('wan2.7-image')) return { resolutions: ['1K', '2K'], strength: 'prompt-extend', sendsQuality: false };
  if (id.includes('wan2.6')) return { resolutions: ['1K'], strength: 'prompt-extend', sendsQuality: false };
  return { resolutions: ['1K', '2K'], strength: 'prompt-extend', sendsQuality: false };
}

export function imageCapabilities(model = '', protocol?: string, baseUrl?: string): ImageCapability {
  const capability = baseImageCapabilities(model, protocol, baseUrl);
  const id = model.toLowerCase();
  if (id.includes('qwen-image') && capability.maxReferenceImages === undefined) capability.maxReferenceImages = id === 'qwen-image-edit' ? 1 : /qwen-image-2[.-]1/.test(id) ? 10 : 3;
  return capability;
}
