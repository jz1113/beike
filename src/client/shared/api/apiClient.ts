import { isDeepSeekRoute, deepSeekModel, parseTextProtocol } from '@shared/domain/models/deepseek';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayCreds';
import { getEnabledMultimodalModelsFromSettings, type WorkflowCapability } from '@shared/domain/models/workflowModels';
import { selectedTextModel, selectedTextProtocol } from '@shared/domain/models/workflowModelStorage';
import { normalizeMultimodalFallbackOrder } from '@shared/domain/models/modelCatalog';
import { getGatewayClientHeaders, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { getClientAccessToken, syncAppTokenCookie } from '@client/shared/api/apiToken';
import { getWorkspaceSecret, syncWorkspaceCookie } from '@client/shared/api/workspaceClient';

export { getClientAccessToken, setClientAccessToken, syncAppTokenCookie } from '@client/shared/api/apiToken';

const modelRouteEndpoints = new Set([
  '/api/system/config', '/api/assistant/turn/start', '/api/generate/analyze', '/api/generate/copywriting',
  '/api/catalog/assets/deconstruct', '/api/catalog/styles/extract',
  '/api/generate/headline-design', '/api/generate/headline-title', '/api/generate/headline-deconstruct',
  '/api/generate/canvas-text',
]);

export function withModelRoute(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (typeof input !== 'string' || !modelRouteEndpoints.has(input.split('?')[0]) || init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') return init;
  let body;
  try { body = JSON.parse(init.body); } catch { return init; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return init;
  if (input.split('?')[0] === '/api/system/config') {
    if (body.type && body.type !== 'ai') return init;
    const preference = parseTextProtocol(body.textProtocol);
    const selection = typeof body.model === 'string' ? body.model : '';
    return { ...init, body: JSON.stringify({ ...body,
      ...(selection ? { model: selectedTextModel(selection).modelId } : {}),
      textProtocol: selection ? selectedTextProtocol(selection, preference) : preference || 'auto',
    }) };
  }
  if (typeof body.model !== 'string') return init;
  const selected = body.model;
  const model = selectedTextModel(selected).modelId;
  if (isDeepSeekRoute(selected) && input.startsWith('/api/assistant/') && !deepSeekModel(selected)?.vision && Array.isArray(body.messages)
    && body.messages.some((message: { attachments?: Array<{ type?: string }> }) => message.attachments?.some(attachment => attachment.type === 'image' || attachment.type === 'video'))) {
    throw new Error('DeepSeek V4 Pro 仅支持文本，请切换到 DeepSeek Flash 处理图片或视频附件');
  }
  // A caller that already resolved credentials must also send its selected protocol; never replace explicit wire options.
  const headers = new Headers(init.headers);
  const hasCredentials = body.customBaseUrl || body.customApiKey || headers.get('x-custom-base-url') || headers.get('x-custom-api-key');
  const credentials = hasCredentials ? {} : getMultimodalClientOverrides(selected);
  const textProtocol = selectedTextProtocol(selected, parseTextProtocol(body.textProtocol)
    || (body.apiFormat === 'openai-responses' ? 'openai' : credentials.textProtocol));
  const base = body.customBaseUrl || credentials.customBaseUrl;
  if (typeof base === 'string' && base.trim()) headers.set('x-custom-base-url', base);
  return { ...init, headers, body: JSON.stringify({ ...credentials, ...body,
    model: isDeepSeekRoute(selected) ? selected : model, textProtocol,
    ...(credentials.customBaseUrl || credentials.customApiKey || hasCredentials ? { fallbackModels: [], fallbackOrder: [] } : {}),
  }) };
}

/** 开发或反代场景下的 API 基址；同源部署时为空。 */
const apiBase = import.meta.env.VITE_API_BASE?.trim() || '';

function getApiBase(): string {
  return apiBase;
}

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  const base = getApiBase();
  if (!base) return input;

  if (typeof input === 'string') {
    if (input.startsWith('/api') || input.startsWith('/storage')) return `${base}${input}`;
    return input;
  }

  if (input instanceof URL && (input.pathname.startsWith('/api') || input.pathname.startsWith('/storage'))) {
    return new URL(`${base}${input.pathname}${input.search}`);
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      const urlObj = new URL(input.url);
      if (urlObj.pathname.startsWith('/api') || urlObj.pathname.startsWith('/storage')) {
        return new Request(new URL(`${base}${urlObj.pathname}${urlObj.search}`), input);
      }
    } catch {
      /* ignore invalid URL */
    }
  }

  return input;
}

const FALLBACK_ORDER_KEY = 'multimodal_fallback_order_v1';

function readFallbackOrder(): string[] | undefined {
  try { return normalizeMultimodalFallbackOrder(JSON.parse(localStorage.getItem(FALLBACK_ORDER_KEY) || 'null')); }
  catch { return undefined; }
}

function resolveFallbackOrder(models: WorkflowCapability[], saved = readFallbackOrder()): string[] {
  const eligible = getEnabledMultimodalModelsFromSettings(models)
    .filter(model => (model.channel ?? 'comfly') === 'comfly' && !model.id.startsWith('openai-responses:'));
  const ids = Array.from(new Set(eligible.map(model => model.id)));
  const allowed = new Set(ids);
  return [...(saved ?? []).filter(id => allowed.has(id)), ...ids.filter(id => !saved?.includes(id))];
}

function readEffectiveFallbackOrder(): string[] | undefined {
  try {
    const models = JSON.parse(localStorage.getItem('custom_models') || 'null');
    return Array.isArray(models) ? resolveFallbackOrder(models) : undefined;
  } catch { return undefined; }
}

const supportedFallbackEndpoints = new Set(['/api/generate/analyze', '/api/generate/copywriting', '/api/catalog/assets/deconstruct', '/api/catalog/styles/extract', '/api/assistant/turn/start']);

function withFallbackOrder(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (typeof input !== 'string' || !supportedFallbackEndpoints.has(input.split('?')[0]) || init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') return init;
  const order = readEffectiveFallbackOrder();
  if (!order) return init;
  try {
    const body = JSON.parse(init.body);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return init;
    return { ...init, body: JSON.stringify({ ...body, fallbackOrder: order }) };
  } catch { return init; }
}

let mediaSession: { exp: number; sig: string } | null = null;
const mediaSessionListeners = new Set<() => void>();
export function hasMediaSession() {
  return Boolean(mediaSession);
}
export function subscribeMediaSession(listener: () => void) {
  mediaSessionListeners.add(listener);
  return () => { mediaSessionListeners.delete(listener); };
}
export function setMediaSession(value: { exp: number; sig: string } | undefined) {
  if (value) {
    mediaSession = value;
    mediaSessionListeners.forEach((listener) => listener());
  }
}

/**
 * 为无法自定义 Header 的媒体标签生成代理 URL。
 * 优先依赖已同步的 app_token Cookie；不再附加长期 access token query。
 */
export function proxyMediaUrl(
  rawUrl?: string | null,
  opts?: { asVideo?: boolean; asAudio?: boolean; thumb?: boolean; width?: number }
): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('//')) rawUrl = `https:${rawUrl}`;
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return rawUrl;
  }
  if (rawUrl.startsWith('/storage')) {
    const base = getApiBase();
    return base ? `${base}${rawUrl}` : rawUrl;
  }
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    try {
      const parsed = new URL(rawUrl);
      const base = getApiBase();
      const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const apiOrigin = base ? new URL(base, origin).origin : origin;
      const localMediaPath = parsed.pathname.startsWith('/storage/') ||
        ['/api/system/proxy-image', '/api/system/proxy-video'].includes(parsed.pathname);
      if ((parsed.origin === origin || parsed.origin === apiOrigin) && localMediaPath) {
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        return base ? `${base}${path}` : path;
      }
    } catch {}
  }
  if (rawUrl.startsWith('/')) {
    return rawUrl;
  }
  syncAppTokenCookie();
  syncWorkspaceCookie();
  const mediaFlag = opts?.asVideo ? '&as=video' : opts?.asAudio ? '&as=audio' : '';
  const thumbFlag = opts?.thumb ? '&thumb=1' : '';
  const widthFlag = opts?.width ? `&w=${opts.width}` : '';
  const signed = mediaSession ? `&exp=${mediaSession.exp}&sig=${mediaSession.sig}` : '';
  const path = `/api/system/proxy-image?url=${encodeURIComponent(rawUrl)}${mediaFlag}${thumbFlag}${widthFlag}${signed}`;
  const base = resolveApiUrl(path);
  return typeof base === 'string' ? base : path;
}

export function apiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  if (!headers.has('x-app-token')) {
    headers.set('x-app-token', getClientAccessToken());
  }
  if (!headers.has('x-workspace-token')) {
    const workspace = getWorkspaceSecret();
    if (workspace) headers.set('x-workspace-token', workspace);
  }
  const storage = getGatewayClientHeaders();
  const selectedBase = headers.get('x-custom-base-url');
  const foreignBase = selectedBase && normalizeGatewayBaseUrl(selectedBase) !== normalizeGatewayBaseUrl(storage['x-custom-base-url']);
  Object.entries(storage).forEach(([k, v]) => {
    if (!headers.has(k) && !(foreignBase && k === 'x-custom-api-key')) headers.set(k, v);
  });
  return headers;
}

/** 统一带鉴权的浏览器 fetch。 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  init?.signal?.throwIfAborted();
  const target = resolveApiUrl(input);
  const origin = typeof window !== 'undefined' && window.location?.origin || 'http://localhost';
  const apiOrigin = new URL(getApiBase() || origin, origin).origin;
  const url = new URL(typeof target === 'string' ? target : target instanceof URL ? target.href : target.url, origin);
  if (url.protocol === 'blob:' || url.protocol === 'data:') return fetch(target, init);
  if (url.origin !== origin && url.origin !== apiOrigin) throw new Error('不能向外部地址发送应用凭证');
  syncAppTokenCookie();
  syncWorkspaceCookie();

  const routed = withModelRoute(input, withFallbackOrder(input, init));
  const headers = apiHeaders(routed?.headers);
  if ((init?.body instanceof FormData || routed?.body instanceof FormData) && headers.has('Content-Type')) {
    headers.delete('Content-Type');
  }
  return fetch(target, { ...routed, headers });
}

export interface ClientStorageConfig {
  enabled: boolean;
  persistResults: boolean;
  provider: 'oss' | 'qiniu' | 'cloudinary' | 'cos' | 'r2' | 's3' | 'minio' | 'supabase';
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
  apiPrefix?: string;
  materialsPrefix?: string;
  cloudName?: string;
  zone?: string;
}

/** 读取设置页保存在本机的对象存储配置。storage_enabled 表示全局素材与成品上传。 */
export function readClientStorageConfig(): ClientStorageConfig {
  const read = (key: string, fallback = '') => {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  };
  const provider = read('storage_provider');
  const providers: readonly ClientStorageConfig['provider'][] = [
    'oss', 'qiniu', 'cloudinary', 'cos', 'r2', 's3', 'minio', 'supabase',
  ];
  return {
    enabled: true,
    persistResults: read('storage_enabled') === 'true',
    provider: providers.includes(provider as ClientStorageConfig['provider']) ? (provider as ClientStorageConfig['provider']) : 'oss',
    accountId: read('storage_account_id'),
    endpoint: read('storage_endpoint'),
    accessKeyId: read('storage_access_key_id'),
    secretAccessKey: read('storage_secret_access_key'),
    bucketName: read('storage_bucket_name'),
    publicDomain: read('storage_public_domain'),
    apiPrefix: read('storage_api_prefix', 'seedance/'),
    materialsPrefix: read('storage_materials_prefix', 'canvas-materials/'),
    cloudName: read('storage_cloud_name'),
    zone: read('storage_zone', 'z2'),
  };
}

export function storageConfigHeaders(): Record<string, string> {
  // HTTP headers must stay in the byte range; JSON escapes preserve Unicode prefixes.
  const config = JSON.stringify(readClientStorageConfig()).replace(/[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return { 'x-storage-config': config };
}
