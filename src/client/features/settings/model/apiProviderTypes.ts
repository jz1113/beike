export type ApiProviderProtocol = 'gemini' | 'openai' | 'anthropic' | 'custom';

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
    label: 'Gemini (中转/兼容)',
    formatHint: 'Gemini · /v1/chat/completions 或兼容中转路由',
    defaultCatalog: '/v1/models',
  },
  {
    id: 'anthropic',
    label: 'Claude / Anthropic (中转/兼容)',
    formatHint: 'Claude · /v1/chat/completions 或兼容中转路由',
    defaultCatalog: '/v1/models',
  },
  {
    id: 'custom',
    label: '自定义 HTTP 网关',
    formatHint: '自定义端点 · 标准 REST 请求',
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
  {
    id: 'gpt_best_gateway',
    name: 'gpt-best 网关',
    providerType: 'openai',
    baseUrl: 'https://api.gpt-best.com',
    apiKey: '',
    enabled: true,
    catalogPath: '/v1/models',
    isRemovable: true,
    websiteUrl: 'https://gpt-best.com',
    serviceId: 'gpt_best_gateway',
    iconType: 'comfly',
    description: '全模态大模型聚合网关 (gpt-best.apifox.cn)',
  },
  {
    id: 'openai_official',
    name: 'OpenAI',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    enabled: true,
    catalogPath: '/v1/models',
    isRemovable: true,
    websiteUrl: 'https://platform.openai.com',
    serviceId: 'openai_official',
    iconType: 'openai',
    description: 'OpenAI 官方与 Responses API',
  },
  {
    id: 'deepseek_official',
    name: 'DeepSeek',
    providerType: 'openai',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    enabled: true,
    catalogPath: '/v1/models',
    isRemovable: true,
    websiteUrl: 'https://platform.deepseek.com',
    serviceId: 'deepseek_official',
    iconType: 'deepseek',
    description: 'DeepSeek 官方推理与图像理解',
  },
  {
    id: 'lianchi_images',
    name: '联池图像接口',
    providerType: 'openai',
    baseUrl: 'https://api.gapnet.ai/endpoint',
    apiKey: '',
    enabled: true,
    isRemovable: true,
    serviceId: 'lianchi_images',
    iconType: 'lianchi',
    description: '文生图与图像编辑接口',
  },
];

export const API_PROVIDERS_STORAGE_KEY = 'beike_api_providers_v2';
export const API_REMOVED_PROVIDERS_KEY = 'beike_api_removed_providers_v2';
const DEPRECATED_PROVIDER_IDS = new Set(['mita', 'soonstudio', 'google']);

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

    // 合并内置预设，保持新增字段同步并清洗废弃项
    const idMap = new Map<string, ApiProvider>();
    for (const item of saved) {
      if (DEPRECATED_PROVIDER_IDS.has(item.id)) continue;
      if (!removedIds.includes(item.id)) {
        if (item.id === 'comfly_gateway' || item.id === 'gpt_best_gateway' || item.id === 'openai_official' || item.id === 'deepseek_official') {
          item.providerType = 'openai';
        }
        idMap.set(item.id, item);
      }
    }
    for (const def of DEFAULT_PROVIDERS) {
      if (!removedIds.includes(def.id) && !DEPRECATED_PROVIDER_IDS.has(def.id) && !idMap.has(def.id)) {
        idMap.set(def.id, def);
      }
    }
    const result = Array.from(idMap.values());
    if (saved.some(item => DEPRECATED_PROVIDER_IDS.has(item.id))) {
      saveStoredProviders(result);
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
