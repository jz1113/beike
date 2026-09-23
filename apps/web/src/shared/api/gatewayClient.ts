import { isOpenAIModelRouteId } from '@beike/domain/workflowModels';

// 三态缓存：undefined=未显式设置（允许初始兼容加载），null=显式清空（严格禁止回退 localStorage），string=有效密钥
let cachedApiKey: string | null | undefined = undefined;
let cachedBaseUrl: string | undefined = undefined;

/** 更新客户端运行时 API Key 内存缓存，确保后续请求立即使用新凭证 */
export function setClientGatewayApiKey(key: string | undefined | null) {
  if (typeof key === 'string') {
    const trimmed = key.trim();
    cachedApiKey = trimmed ? trimmed : null; // 空字符串表示显式清空
  } else if (key === null) {
    cachedApiKey = null; // 显式清空
  } else {
    cachedApiKey = undefined;
  }
}

/** 更新客户端运行时 Base URL 内存缓存 */
export function setClientGatewayBaseUrl(url: string | undefined | null) {
  cachedBaseUrl = typeof url === 'string' && url.trim() ? url.trim() : undefined;
}

/** 客户端网关与服务接口配置（Base URL、API Key 与 万邦电商采集凭证） */
export function getGatewayClientOverrides(): {
  customBaseUrl?: string;
  customApiKey?: string;
  customWanbangKey?: string;
  customWanbangSecret?: string;
} {
  if (typeof window === 'undefined') return {};
  const url = cachedBaseUrl || localStorage.getItem('ai_base_url')?.trim();
  // 核心安全逻辑：如果用户已显式清空（cachedApiKey === null），绝对禁止回退读取 localStorage 的旧值
  let key: string | undefined;
  if (cachedApiKey === null) {
    key = undefined;
  } else if (typeof cachedApiKey === 'string' && cachedApiKey.length > 0) {
    key = cachedApiKey;
  } else {
    key = localStorage.getItem('ai_api_key')?.trim() || undefined;
  }

  const wbKey = localStorage.getItem('wanbang_api_key')?.trim();
  const wbSec = localStorage.getItem('wanbang_api_secret')?.trim();
  return {
    customBaseUrl: url || undefined,
    customApiKey: key,
    customWanbangKey: wbKey || undefined,
    customWanbangSecret: wbSec || undefined,
  };
}

/** Visual requests follow the selected model route, never the vendor name or bare model ID. */
export function getMultimodalClientOverrides(modelId: string): {
  customBaseUrl?: string;
  customApiKey?: string;
  apiFormat?: 'openai-responses';
  allowInsecureHttp?: boolean;
} {
  const primary = getGatewayClientOverrides();
  if (!isOpenAIModelRouteId(modelId)) return primary;
  if (typeof localStorage === 'undefined' || localStorage.getItem('openai_responses_enabled') !== 'true') {
    throw new Error('请先在 OpenAI 服务设置中启用 Responses 接口');
  }
  const key = localStorage.getItem('openai_api_key')?.trim();
  if (!key) throw new Error('请先配置 OpenAI 渠道 API Key');
  const baseUrl = localStorage.getItem('openai_base_url')?.trim() || 'https://api.openai.com';
  const consentUrl = localStorage.getItem('openai_insecure_http_consent_url')?.trim() || '';
  const allowInsecureHttp = /^http:\/\//i.test(baseUrl) && baseUrl.replace(/\/+$/, '') === consentUrl;
  return {
    customBaseUrl: baseUrl,
    customApiKey: key,
    apiFormat: 'openai-responses',
    ...(allowInsecureHttp ? { allowInsecureHttp: true } : {}),
  };
}

export function getGatewayClientHeaders(): Record<string, string> {
  const { customBaseUrl, customApiKey, customWanbangKey, customWanbangSecret } = getGatewayClientOverrides();
  const headers: Record<string, string> = {};
  if (customBaseUrl) headers['x-custom-base-url'] = customBaseUrl;
  if (customApiKey) headers['x-custom-api-key'] = customApiKey;
  const lianchiKey = typeof localStorage !== 'undefined' ? localStorage.getItem('lianchi_api_key')?.trim() : '';
  if (lianchiKey) headers['x-lianchi-api-key'] = lianchiKey;
  if (customWanbangKey) headers['x-wanbang-key'] = customWanbangKey;
  if (customWanbangSecret) headers['x-wanbang-secret'] = customWanbangSecret;
  return headers;
}
