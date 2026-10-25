import type { TextProtocol } from './textProtocol';

export function providerTextProtocol(providerType: string | undefined): TextProtocol | undefined {
  switch (providerType?.trim().toLowerCase()) {
    case 'openai':
    case 'custom':
    case 'dashscope':
    case 'template':
      return 'openai';
    case 'gemini':
      return 'gemini';
    case 'anthropic':
      return 'anthropic';
    default:
      return undefined;
  }
}

function normalizedBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '').toLowerCase();
}

export function protocolForBaseUrl(baseUrl: string | undefined, providers: readonly { baseUrl?: string; providerType?: string; provider?: string }[]): TextProtocol | undefined {
  const normalized = normalizedBaseUrl(baseUrl);
  if (!normalized) return undefined;
  const provider = providers.find((item) => normalizedBaseUrl(item.baseUrl) === normalized);
  const configured = providerTextProtocol(provider?.providerType || provider?.provider);
  if (configured) return configured;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host === 'api.anthropic.com' || path.endsWith('/messages')) return 'anthropic';
    if (host === 'generativelanguage.googleapis.com' || host.endsWith('.googleapis.com') || path.includes('/generatecontent')) return 'gemini';
    if (host === 'api.openai.com'
      || host === 'api.deepseek.com'
      || host === 'api.siliconflow.cn'
      || host === 'ai.comfly.org'
      || host === 'ai.comfly.chat'
      || host === 'shop.comfly.chat'
      || host === 'dashscope.aliyuncs.com'
      || host.endsWith('.qianwenaiapi.com')
      || path.includes('/chat/completions')
      || path.includes('/compatible-mode/')) return 'openai';
  } catch {
    // Keep model-id inference for malformed or non-URL values.
  }
  return undefined;
}
