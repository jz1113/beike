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

export function imageCapabilities(model = '', protocol?: string, baseUrl?: string): ImageCapability {
  const id = model.toLowerCase();
  if (id.includes('grok')) return { resolutions: [], strength: 'none', sendsQuality: false };
  if (protocol === 'template') return { resolutions: ALL_RESOLUTIONS, strength: 'none', sendsQuality: false };
  const dashscope = protocol === 'dashscope' || isDashScopeBase(baseUrl);
  if (!dashscope) return { resolutions: ALL_RESOLUTIONS, strength: 'quality', sendsQuality: true };
  if (id.includes('wan2.7-image-pro')) return { resolutions: ALL_RESOLUTIONS, strength: 'prompt-extend', sendsQuality: false };
  if (id.includes('wan2.7-image')) return { resolutions: ['1K', '2K'], strength: 'prompt-extend', sendsQuality: false };
  if (id.includes('wan2.6')) return { resolutions: ['1K'], strength: 'prompt-extend', sendsQuality: false };
  return { resolutions: ['1K', '2K'], strength: 'prompt-extend', sendsQuality: false };
}
