import { getGatewayClientOverrides } from './gatewayClient';
import { credentialGet, credentialSet } from './credentialClient';

function readModelIds(): string[] | null {
  const raw = localStorage.getItem('image_gateway_models');
  if (raw === null) return null; // Preserve existing routing until configuration is saved.
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
  catch { return []; }
}

type Route = { independent: boolean; baseUrl: string };
const memoryRoutes = new Map<string, Route>();
const requestRoutes = new WeakMap<RequestInit, Route>();

/** Store only routing metadata; credentials remain in the credential store. */
export async function rememberImageTaskRoute(init: RequestInit | undefined, response: Response) {
  const route = init && requestRoutes.get(init);
  if (!route || !response.ok) return;
  const data = await response.clone().json().catch(() => null);
  if (typeof data?.taskId === 'string' && data.taskId) {
    memoryRoutes.set(data.taskId, route);
    try { localStorage.setItem(`image_task_route:${data.taskId}`, JSON.stringify(route)); }
    catch { console.warn('[imageGateway] 任务接口仅保存在当前会话，请勿关闭页面直到任务结束'); }
  }
}

/** These two configured entries belong to different providers, despite their display names. */
export function fixedImageModelRoute(model: string): 'independent' | 'comfly' | undefined {
  if (model === 'openai/gpt-image-2') return 'independent';
  if (model === 'gpt-image-2') return 'comfly';
}

function independentModel(model: string, config: ReturnType<typeof readImageGatewayConfig>): boolean {
  const fixed = fixedImageModelRoute(model);
  return fixed ? fixed === 'independent' : (config.modelIds === null ? config.enabled : config.modelIds.includes(model));
}

export function imageModelRouteLabel(model: string): string {
  const config = readImageGatewayConfig();
  return independentModel(model, config) ? '独立接口' : 'Comfly';
}

export function readImageGatewayConfig() {
  return {
    modelIds: readModelIds(),
    enabled: localStorage.getItem('image_gateway_enabled') === 'true',
    baseUrl: localStorage.getItem('image_base_url') || '',
  };
}

export async function saveImageGatewayConfig(enabled: boolean, baseUrl: string, apiKey: string, modelIds?: string[]) {
  const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
  if (enabled) {
    let url: URL;
    try { url = new URL(cleanUrl); } catch { throw new Error('请输入完整的 HTTPS 接口地址'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('接口地址须为 HTTPS Base URL，不包含账号、查询参数或片段');
    }
    if (!apiKey.trim()) throw new Error('请填写独立生图接口的 API Key');
  }
  await credentialSet('image_api_key', apiKey);
  localStorage.setItem('image_base_url', cleanUrl);
  localStorage.setItem('image_gateway_enabled', String(enabled));
  if (modelIds) localStorage.setItem('image_gateway_models', JSON.stringify([...new Set(modelIds)]));
  window.dispatchEvent(new Event('models_updated'));
}

/** Apply only to the image submit/poll endpoint, before HTTP and IPC dispatch. */
export async function applyImageGateway(input: RequestInfo | URL, init?: RequestInit): Promise<RequestInit | undefined> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
  if (url.pathname !== '/api/generate/image') return applyTextGateway(input, init);
  const config = readImageGatewayConfig();
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let body = init?.body;
  if (body === undefined && input instanceof Request && method === 'POST') body = await input.clone().text();
  const parsed = method === 'POST' && typeof body === 'string' && body ? JSON.parse(body) : undefined;
  const main = getGatewayClientOverrides();
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const mainUrl = String(parsed?.customBaseUrl || headers.get('x-custom-base-url') || main.customBaseUrl || '').replace(/\/+$/, '');
  let independent = independentModel(parsed?.model, config);
  if (method === 'POST' && independent && !config.enabled) throw new Error('该生图模型使用独立接口，请先在设置中启用并保存独立网关');
  let baseUrl = independent ? config.baseUrl : mainUrl;
  const taskId = url.searchParams.get('taskId');
  if (taskId) {
    const saved = localStorage.getItem(`image_task_route:${taskId}`);
    const route: Route | undefined = saved ? JSON.parse(saved) : memoryRoutes.get(taskId);
    if (route) {
      independent = route.independent;
      baseUrl = route.baseUrl;
      const currentUrl = independent ? config.baseUrl : mainUrl;
      if (baseUrl !== currentUrl) throw new Error('任务使用的生图接口地址已变更，请恢复原接口配置后查询');
    }
  }
  if (!independent && method !== 'POST') return init;
  const result: RequestInit = { ...init, headers, ...(body !== undefined ? { body } : {}) };
  if (independent) {
    const key = await credentialGet('image_api_key');
    if (!baseUrl || !key) throw new Error('独立生图接口配置不完整，请在设置中填写地址和密钥');
    headers.set('x-image-protocol', 'openai');
    headers.set('x-custom-base-url', baseUrl);
    headers.set('x-custom-api-key', key);
    if (parsed) result.body = JSON.stringify({ ...parsed, customBaseUrl: baseUrl, customApiKey: key });
  }
  if (method === 'POST') {
    const host = baseUrl ? new URL(baseUrl).hostname.toLowerCase() : '';
    if (parsed?.model === 'openai/gpt-image-2' && (host === 'comfly.org' || host.endsWith('.comfly.org'))) {
      throw new Error('openai/gpt-image-2 不能使用 Comfly 地址，请检查独立生图接口地址');
    }
    if (parsed?.model === 'gpt-image-2' && (host === 'gapnet.ai' || host.endsWith('.gapnet.ai'))) {
      throw new Error('gpt-image-2 使用 Comfly，请恢复主网关地址；Gapnet 请使用 openai/gpt-image-2');
    }
    requestRoutes.set(result, { independent, baseUrl });
  }
  return result;
}

/** Separate opt-in from the legacy image wildcard: existing vision/chat routes stay unchanged. */
export function readIndependentTextModels(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem('independent_text_models') || '[]');
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

const TEXT_MODEL_ENDPOINTS = new Set([
  '/api/generate/analyze', '/api/catalog/assets/deconstruct',
  '/api/assistant/turn/start', '/api/assistant/chat', '/api/generate/copywriting',
]);

async function applyTextGateway(input: RequestInfo | URL, init?: RequestInit): Promise<RequestInit | undefined> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (!TEXT_MODEL_ENDPOINTS.has(url.pathname) || method !== 'POST') return init;
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  if (typeof raw !== 'string') return init;
  const body = JSON.parse(raw);
  const ids = readIndependentTextModels();
  const independent = typeof body.model === 'string' && ids.includes(body.model);
  // Fallback candidates must belong to the same gateway as the selected model.
  if (Array.isArray(body.fallbackModels)) {
    body.fallbackModels = body.fallbackModels.filter((id: unknown) => typeof id === 'string' && ids.includes(id) === independent);
  }
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  if (independent) {
    const config = readImageGatewayConfig();
    if (!config.enabled) throw new Error('该模型使用独立网关，请先启用独立网关，不会自动切换到 Comfly');
    const key = await credentialGet('image_api_key');
    if (!config.baseUrl || !key) throw new Error('独立网关配置不完整，请填写地址和密钥');
    body.customBaseUrl = config.baseUrl;
    body.customApiKey = key;
    headers.set('x-custom-base-url', config.baseUrl);
    headers.set('x-custom-api-key', key);
    body.strictModel = true;
  }
  return { ...init, headers, body: JSON.stringify(body) };
}
