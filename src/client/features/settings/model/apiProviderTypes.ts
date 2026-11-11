import { repairWorkflowModelsForSettings } from '@shared/domain/models/workflowModels';
import { reconcileStoredWorkflowDefaults } from '@shared/domain/models/workflowModelDefaults';
import type { WorkflowModel } from './modelManagement';
import { apiFetch } from '@client/shared/api/apiClient';
import { clearCredentialMemoryCache, writeLocalConfig } from '@client/shared/api/credentialClient';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '@client/shared/api/gatewayClient';
import { isPublicHttpGatewayIpUrl } from '@shared/domain/models/gatewayCreds';
import { API_PROVIDERS_STORAGE_KEY, API_REMOVED_PROVIDERS_KEY } from '@shared/domain/models/modalityStorage';
import type { ImageRequestTemplate } from '@shared/contracts/generate';
import {
  canonicalProviderId, loadSavedProviderCredentialSnapshots, notifyProviderCommit,
  providerCredentialChanges, SAVED_PROVIDER_CREDENTIALS_KEY, type ProviderCredentials,
} from './providerCredentialSync';

export { API_PROVIDERS_STORAGE_KEY, API_REMOVED_PROVIDERS_KEY };

export type ApiProviderProtocol = 'gemini' | 'openai' | 'anthropic' | 'custom' | 'dashscope' | 'fal' | 'template';

export interface ApiProvider {
  id: string;
  name: string;
  providerType: ApiProviderProtocol;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  catalogPath?: string;
  isRemovable: boolean;
  isCustom?: boolean;
  isPromoted?: boolean;
  promoBadge?: string;
  websiteUrl?: string;
  serviceId?: string;
  description?: string;
  iconType?: string;
  requestTemplate?: ImageRequestTemplate;
}

export const PROTOCOL_OPTIONS: { id: ApiProviderProtocol; label: string; formatHint: string; defaultCatalog: string }[] = [
  {
    id: 'openai',
    label: 'OpenAI 兼容协议 (支持 Comfly、OneAPI、硅基流动等所有平台)',
    formatHint: 'OpenAI · /v1/chat/completions (生图 /v1/images/generations)',
    defaultCatalog: '/v1/models',
  },
  {
    id: 'gemini',
    label: 'Gemini 原生文本协议',
    formatHint: '文本 / 图片理解 · Gemini generateContent（模型可显式覆盖）',
    defaultCatalog: '/v1beta/models',
  },
  {
    id: 'anthropic',
    label: 'Claude / Anthropic 原生文本协议',
    formatHint: '文本 / 图片理解 · Anthropic /v1/messages（模型可显式覆盖）',
    defaultCatalog: '/v1/models',
  },
  {
    id: 'custom',
    label: '自定义 HTTP 网关',
    formatHint: '自定义端点 · 标准 REST 请求',
    defaultCatalog: '/v1/models',
  },
  {
    id: 'dashscope',
    label: '千问 / DashScope 原生',
    formatHint: '生图走 DashScope 原生接口，对话走 /compatible-mode/v1',
    defaultCatalog: '/compatible-mode/v1/models',
  },
  {
    id: 'fal',
    label: 'fal 队列协议',
    formatHint: 'Gemini Omni Flash 1.2 · 视频生成、编辑与延长',
    defaultCatalog: '/v1/models',
  },
  {
    id: 'template',
    label: '自定义请求模板',
    formatHint: '按粘贴的 curl 发送生图请求',
    defaultCatalog: '/v1/models',
  },
];

export const DEFAULT_PROVIDERS: ApiProvider[] = [
  {
    id: 'comfly_gateway',
    name: 'Comfly 网关',
    providerType: 'openai',
    baseUrl: 'https://ai.comfly.org',
    apiKey: '',
    enabled: true,
    catalogPath: '/v1/models',
    isRemovable: true,
    websiteUrl: 'https://ai.comfly.org',
    serviceId: 'comfly_gateway',
    iconType: 'comfly',
    description: '企业级大模型聚合网关',
  },
];

const DEPRECATED_PROVIDER_IDS = new Set(['mita', 'soonstudio', 'google', 'lianchi_images']);

/** 不再默认展示。密钥为空且地址仍是原默认值时，从已存列表清掉。 */
const RETIRED_BUILTIN_BASE_URLS: Record<string, string> = {
  gpt_best_gateway: 'https://api.gpt-best.com',
  openai_official: 'https://api.openai.com',
  deepseek_official: 'https://api.deepseek.com',
  qianwen_platform: 'https://maas.qianwenaiapi.com',
};

function normalizeProviderBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

/** 两个账户或两套协议可以共享域名，只有请求配置一致时才复用。 */
export function sameProviderRoute(a: ApiProvider, b: Omit<ApiProvider, 'id' | 'isRemovable'>) {
  const root = (url: string) => a.providerType === 'openai' ? normalizeProviderBaseUrl(url).replace(/\/v1$/i, '') : normalizeProviderBaseUrl(url);
  return a.providerType === b.providerType && root(a.baseUrl) === root(b.baseUrl)
    && (a.apiKey || '').trim() === (b.apiKey || '').trim() && a.catalogPath === b.catalogPath
    && JSON.stringify(a.requestTemplate) === JSON.stringify(b.requestTemplate);
}

function isUntouchedRetiredProvider(item: ApiProvider): boolean {
  const defaultBase = RETIRED_BUILTIN_BASE_URLS[item.id];
  if (!defaultBase) return false;
  return !(item.apiKey || '').trim()
    && normalizeProviderBaseUrl(item.baseUrl) === normalizeProviderBaseUrl(defaultBase);
}

export function loadStoredProviders(): ApiProvider[] {
  if (typeof window === 'undefined') return DEFAULT_PROVIDERS;
  try {
    const removedRaw = localStorage.getItem(API_REMOVED_PROVIDERS_KEY);
    const removedIds: string[] = removedRaw ? JSON.parse(removedRaw) : [];
    const savedRaw = localStorage.getItem(API_PROVIDERS_STORAGE_KEY);
    if (!savedRaw) {
      return DEFAULT_PROVIDERS.filter(p => !removedIds.includes(p.id) && !DEPRECATED_PROVIDER_IDS.has(p.id));
    }
    const saved: ApiProvider[] = JSON.parse(savedRaw);
    if (!Array.isArray(saved)) return DEFAULT_PROVIDERS.filter(p => !removedIds.includes(p.id) && !DEPRECATED_PROVIDER_IDS.has(p.id));

    // 合并内置预设，清掉废弃项和未配置的旧默认服务商
    const idMap = new Map<string, ApiProvider>();
    const droppedRetired: string[] = [];
    let droppedDeprecated = false;
    for (const item of saved) {
      if (DEPRECATED_PROVIDER_IDS.has(item.id)) {
        droppedDeprecated = true;
        continue;
      }
      if (removedIds.includes(item.id)) continue;
      if (isUntouchedRetiredProvider(item)) {
        droppedRetired.push(item.id);
        continue;
      }
      if (item.id === 'comfly_gateway' || item.id === 'gpt_best_gateway' || item.id === 'openai_official' || item.id === 'deepseek_official') {
        item.providerType = 'openai';
      }
      idMap.set(item.id, item);
    }
    for (const def of DEFAULT_PROVIDERS) {
      if (!removedIds.includes(def.id) && !DEPRECATED_PROVIDER_IDS.has(def.id) && !idMap.has(def.id)) {
        idMap.set(def.id, def);
      }
    }
    const result = Array.from(idMap.values());
    if (droppedDeprecated || droppedRetired.length > 0) {
      try {
        saveStoredProviders(result);
        for (const id of droppedRetired) recordRemovedProvider(id);
      } catch { /* Keep the readable configuration when migration cannot be persisted. */ }
    }
    return result;
  } catch {
    return DEFAULT_PROVIDERS;
  }
}

export function saveStoredProviders(providers: ApiProvider[]): void {
  writeLocalConfig({ [API_PROVIDERS_STORAGE_KEY]: JSON.stringify(providers) });
}

export function removeStoredProvider(providerId: string): void {
  const raw = localStorage.getItem(API_REMOVED_PROVIDERS_KEY);
  const removed: string[] = raw ? JSON.parse(raw) : [];
  const providers = loadStoredProviders().filter(provider => provider.id !== providerId);
  const values: Record<string, string | null> = {
    [API_PROVIDERS_STORAGE_KEY]: JSON.stringify(providers),
    [API_REMOVED_PROVIDERS_KEY]: JSON.stringify([...new Set([...removed, providerId])]),
  };
  const rawModels = localStorage.getItem('custom_models');
  if (rawModels) {
    const parsed: unknown = JSON.parse(rawModels);
    if (!Array.isArray(parsed)) throw new Error('模型配置格式异常，请恢复后重试');
    const remaining = (parsed as WorkflowModel[]).filter(model => model?.channel !== providerId && model?.providerId !== providerId);
    const models = repairWorkflowModelsForSettings(remaining);
    values.custom_models = JSON.stringify(models);
    // Plan default repairs in memory; publish all writes together below.
    reconcileStoredWorkflowDefaults(models, {
      getItem: key => key in values ? values[key] : localStorage.getItem(key),
      setItem: (key, value) => { values[key] = value; },
      removeItem: key => { values[key] = null; },
    });
  }
  writeLocalConfig(values);
}

function recordRemovedProvider(providerId: string): void {
  const raw = localStorage.getItem(API_REMOVED_PROVIDERS_KEY);
  const removed: string[] = raw ? JSON.parse(raw) : [];
  writeLocalConfig({ [API_REMOVED_PROVIDERS_KEY]: JSON.stringify([...new Set([...removed, providerId])]) });
}

export type CatalogProtocol = 'openai' | 'gemini' | 'anthropic';

/** Catalog transport is channel configuration, independent of a selected model's text protocol. */
export function catalogRequestProtocol(providerType: unknown = 'openai', catalogProtocol?: unknown) {
  const type = typeof providerType === 'string' && providerType ? providerType : 'openai';
  const protocol = catalogProtocol === 'openai' || catalogProtocol === 'gemini' || catalogProtocol === 'anthropic'
    ? catalogProtocol : type === 'gemini' || type === 'anthropic' ? type : 'openai';
  return { providerType: type, catalogProtocol: protocol as CatalogProtocol };
}

export interface ConnectionTestOutcome { ok: boolean; message: string }
export interface ConnectionTestRecord extends ConnectionTestOutcome { checkedAt: number }
export interface ServiceStatus {
  state: 'unconfigured' | 'disabled' | 'untested' | 'testing' | 'passed' | 'failed';
  label: string;
  detail: string;
}
export const SERVICE_STATUS_COLORS: Record<ServiceStatus['state'], string> = {
  unconfigured: 'text-slate-400', disabled: 'text-slate-500 dark:text-slate-400', untested: 'text-amber-700',
  testing: 'text-indigo-600', passed: 'text-emerald-700', failed: 'text-rose-600',
};
export function resolveServiceStatus(configured: boolean, enabled = true, testing = false, result?: ConnectionTestRecord): ServiceStatus {
  if (!configured) return { state: 'unconfigured', label: '未配置', detail: '请填写并保存所需凭证' };
  if (!enabled) return { state: 'disabled', label: '已停用', detail: '配置已保留；启用后请重新确认测试结果' };
  if (testing) return { state: 'testing', label: '测试中', detail: '正在检查接口，请稍候' };
  if (!result) return { state: 'untested', label: '已填写 · 未测试', detail: '填写凭证不代表已保存或连接成功；修改配置后需要重新测试' };
  return { state: result.ok ? 'passed' : 'failed', label: result.ok ? '测试通过' : '测试失败',
    detail: `${new Date(result.checkedAt).toLocaleString('zh-CN')} · ${result.message}` };
}
export function sameConnectionInputs(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Directory reachability only: this does not prove generation capability or balance. */
export async function testModelConnection(name: string, body: Record<string, unknown>): Promise<ConnectionTestOutcome> {
  if (!String(body.apiKey || '').trim()) return { ok: false, message: '请先填写 API Key' };
  const start = Date.now();
  const response = await apiFetch('/api/system/models/fetch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, ...catalogRequestProtocol(body.providerType || body.provider, body.catalogProtocol), isPing: true, strict: true }),
  });
  const data = await response.json().catch(() => ({}));
  const ok = Boolean(response.ok && data.success && !data.isFallback);
  if (ok && data.provider === 'fal' && typeof data.warning === 'string') return { ok, message: data.warning };
  return { ok, message: ok
    ? `${name}模型目录测试通过 · ${Date.now() - start}ms；不代表所有模型可生成或余额充足`
    : `${name}测试失败 (${data.gatewayStatus || response.status})：${data.error || data.warning || '请检查地址与密钥'}` };
}

async function testServiceConnection(name: string, body: Record<string, string>): Promise<ConnectionTestOutcome> {
  if (Object.values(body).some(value => !value.trim())) return { ok: false, message: `请先填写${name}所需凭证` };
  const response = await apiFetch('/api/system/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  const ok = Boolean(response.ok && data.success && data.parseOk !== false);
  return { ok, message: ok ? data.message || `${name}测试通过` : data.error || data.message || `${name}测试未通过` };
}

export const testWanbangConnection = (key: string, secret: string) => testServiceConnection('万邦', {
  type: 'wanbang', wanbangKey: key.trim(), wanbangSecret: secret.trim(),
});

export interface ProviderCommitOptions {
  openAI?: { enabled: boolean; allowInsecureHttp: boolean };
}

/** Commit the provider, inherited snapshots and legacy runtime keys as one local group. */
export function commitProviderConfig(draft: ApiProvider, previous: ProviderCredentials, options: ProviderCommitOptions = {}): { provider: ApiProvider; updated: number } {
  const provider = { ...draft, baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey.trim() };
  if (provider.baseUrl) {
    let url: URL;
    try { url = new URL(provider.baseUrl); } catch { throw new Error('请填写完整的 HTTP 或 HTTPS 接口地址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('接口地址须为 HTTP 或 HTTPS Base URL，不包含账号、查询参数或片段');
    }
  }
  const stored = loadStoredProviders();
  if (!stored.some(item => item.id === provider.id)) throw new Error('该服务商已移除，请重新打开设置');
  const { values, updated } = providerCredentialChanges(provider.id, previous, provider);
  values[API_PROVIDERS_STORAGE_KEY] = JSON.stringify(stored.map(item => item.id === provider.id ? provider : item));
  values[SAVED_PROVIDER_CREDENTIALS_KEY] = JSON.stringify({ ...loadSavedProviderCredentialSnapshots(),
    [provider.id]: { baseUrl: provider.baseUrl, apiKey: provider.apiKey } });
  const id = canonicalProviderId(provider.id);
  if (id === 'comfly_gateway') {
    if (!provider.baseUrl) throw new Error('请填写完整的 HTTP 或 HTTPS 接口地址');
    values.ai_base_url = provider.baseUrl;
    values.ai_api_key = provider.apiKey || null;
  } else if (id === 'openai_official') {
    values.openai_base_url = provider.baseUrl || 'https://api.openai.com';
    values.openai_api_key = provider.apiKey || null;
    const enabled = options.openAI?.enabled ?? localStorage.getItem('openai_responses_enabled') === 'true';
    const allowHTTP = options.openAI?.allowInsecureHttp ?? localStorage.getItem('openai_insecure_http_consent_url') === provider.baseUrl;
    if (enabled && !provider.apiKey) throw new Error('启用前请填写 OpenAI API Key');
    if (/^http:\/\//i.test(provider.baseUrl)) {
      if (!allowHTTP) throw new Error('HTTP 网关需先勾选明文传输选项');
      if (!isPublicHttpGatewayIpUrl(provider.baseUrl)) throw new Error('HTTP 网关只支持公网 IPv4 地址，不支持内网地址或域名');
    }
    values.openai_responses_enabled = String(enabled);
    values.openai_channel_split_v1 = 'true';
    values.openai_insecure_http_consent_url = allowHTTP && /^http:\/\//i.test(provider.baseUrl) ? provider.baseUrl.replace(/\/+$/, '') : null;
  } else if (id === 'deepseek_official') values.deepseek_api_key = provider.apiKey || null;
  writeLocalConfig(values);
  // Publish only after every persistent write succeeds. No await between persistence and publication.
  clearCredentialMemoryCache();
  if (id === 'comfly_gateway') {
    setClientGatewayBaseUrl(provider.baseUrl);
    setClientGatewayApiKey(provider.apiKey);
  }
  notifyProviderCommit(provider.id);
  return { provider, updated };
}

export type RemoteModelFetchResult =
  | { ok: true; ids: string[] }
  | { ok: false; message: string };

/** 只接受网关真实返回的目录。官方精选回退和失败响应都不能写进待同步列表。 */
export function parseRemoteModelFetch(payload: unknown): RemoteModelFetchResult {
  const body = payload && typeof payload === 'object' ? payload as {
    success?: boolean;
    isFallback?: boolean;
    error?: unknown;
    warning?: unknown;
    models?: unknown;
  } : {};
  const message = typeof body.error === 'string' && body.error.trim()
    ? body.error
    : typeof body.warning === 'string' && body.warning.trim()
      ? body.warning
      : '远端没有返回模型目录，已保留上次同步的模型';
  if (body.isFallback || body.success === false || !Array.isArray(body.models)) {
    return { ok: false, message };
  }
  const ids: string[] = [];
  for (const model of body.models) {
    if (typeof model === 'string') ids.push(model);
    else if (model && typeof model === 'object' && typeof (model as { id?: unknown }).id === 'string') {
      ids.push((model as { id: string }).id);
    }
  }
  return { ok: true, ids: Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean))) };
}
