import { API_PROVIDERS_STORAGE_KEY } from '@shared/domain/models/modalityStorage';
import type { ImageRequestTemplate } from '@shared/contracts/imageRequestTemplate';

export { API_PROVIDERS_STORAGE_KEY };

export type ApiProviderProtocol = 'gemini' | 'openai' | 'anthropic' | 'custom' | 'dashscope' | 'template';

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
    defaultCatalog: '/v1/models',
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

export const API_REMOVED_PROVIDERS_KEY = 'beike_api_removed_providers_v2';
const DEPRECATED_PROVIDER_IDS = new Set(['mita', 'soonstudio', 'google']);

/** 不再默认展示。密钥为空且地址仍是原默认值时，从已存列表清掉。 */
const RETIRED_BUILTIN_BASE_URLS: Record<string, string> = {
  gpt_best_gateway: 'https://api.gpt-best.com',
  openai_official: 'https://api.openai.com',
  deepseek_official: 'https://api.deepseek.com',
  qianwen_platform: 'https://maas.qianwenaiapi.com',
  lianchi_images: 'https://api.gapnet.ai/endpoint',
};

function normalizeProviderBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
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
      saveStoredProviders(result);
      for (const id of droppedRetired) recordRemovedProvider(id);
    }
    return result;
  } catch {
    return DEFAULT_PROVIDERS;
  }
}

export function saveStoredProviders(providers: ApiProvider[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(API_PROVIDERS_STORAGE_KEY, JSON.stringify(providers));
  } catch {
    // 忽略存储失败
  }
}

export function recordRemovedProvider(providerId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(API_REMOVED_PROVIDERS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(providerId)) {
      list.push(providerId);
      localStorage.setItem(API_REMOVED_PROVIDERS_KEY, JSON.stringify(list));
    }
  } catch {
    // 忽略存储失败
  }
}
