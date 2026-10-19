export type ImageCapabilityResolution = '1K' | '2K' | '4K';

export interface ImageCapability {
  resolutions: ImageCapabilityResolution[];
  strength: 'quality' | 'prompt-extend' | 'none';
  sendsQuality: boolean;
}

const ALL_RESOLUTIONS: ImageCapabilityResolution[] = ['1K', '2K', '4K'];

/** 千问和 DashScope 域名走原生生图，即使服务商协议仍保存为 OpenAI 兼容。 */
export function isDashScopeBase(baseUrl?: string): boolean {
  const raw = baseUrl?.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'qianwenaiapi.com' || host === 'maas.qianwenaiapi.com' || host.endsWith('.qianwenaiapi.com')) return true;
    return host.includes('dashscope') && (host === 'aliyuncs.com' || host.endsWith('.aliyuncs.com'));
  } catch {
    return /qianwenaiapi\.com|dashscope[\w.-]*\.aliyuncs\.com/i.test(raw);
  }
}

/** 带版本号的千问图像模型和万相 2.6/2.7 只走原生生图。qwen-image、qwen-image-edit、qwen-image-max 仍走聚合网关。 */
export function isNativeDashscopeImageModel(model = ''): boolean {
  const id = model.toLowerCase();
  if (!id) return false;
  if (id.includes('qwen-image-3') || id.includes('qwen-image-2.0') || id.includes('qwen-image-2.1') || id.includes('qwen-image-2-0') || id.includes('qwen-image-2-1')) return true;
  return id.includes('wan2.7-image') || id.includes('wan2.6-image') || id.includes('wan2.6-t2i');
}

export function imageCapabilities(model = '', protocol?: string, baseUrl?: string): ImageCapability {
  const id = model.toLowerCase();
  if (id.includes('grok')) return { resolutions: [], strength: 'none', sendsQuality: false };
  if (id.includes('gpt-image-2-4k')) return { resolutions: ['4K'], strength: 'none', sendsQuality: false };
  if (id.includes('gpt-image-2-2k')) return { resolutions: ['2K'], strength: 'none', sendsQuality: false };
  if (id.includes('gpt-image')) return { resolutions: ALL_RESOLUTIONS, strength: 'quality', sendsQuality: true };
  if (id.includes('seedream-v5-pro')) return { resolutions: ['1K', '2K'], strength: 'none', sendsQuality: false };
  if (protocol === 'template') return { resolutions: ALL_RESOLUTIONS, strength: 'none', sendsQuality: false };
  const dashscope = protocol === 'dashscope' || isDashScopeBase(baseUrl) || isNativeDashscopeImageModel(model);
  if (!dashscope) return { resolutions: ALL_RESOLUTIONS, strength: 'none', sendsQuality: false };
  if (id.includes('wan2.7-image-pro')) return { resolutions: ALL_RESOLUTIONS, strength: 'prompt-extend', sendsQuality: false };
  if (id.includes('wan2.7-image')) return { resolutions: ['1K', '2K'], strength: 'prompt-extend', sendsQuality: false };
  if (id.includes('wan2.6')) return { resolutions: ['1K'], strength: 'prompt-extend', sendsQuality: false };
  return { resolutions: ['1K', '2K'], strength: 'prompt-extend', sendsQuality: false };
}
