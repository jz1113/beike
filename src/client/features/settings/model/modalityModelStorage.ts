import type { ModalityGlobalConfig, ModalityKind, ModalityModelItem } from './modalityModelTypes';
import { DEFAULT_MODALITY_MODELS } from './modalityModelDefaults';
import { inferVendorFromModelId, normalizeModelVendor } from './modalityMeta';

const STORAGE_KEY_PREFIX = 'beike_modality_models_v1_';
const GLOBAL_CONFIG_KEY = 'beike_modality_global_config_v1';

export const DEFAULT_BASE_URL_RECOMMENDATIONS = [
  'https://ai.comfly.org',
  'https://ai.comfly.chat',
  'https://shop.comfly.chat',
  'https://api.siliconflow.cn/v1',
  'https://api.openai.com/v1',
  'https://api.deepseek.com/v1',
  'https://dashscope.aliyuncs.com/compatible-mode/v1',
];

export function loadStoredModalityGlobalConfig(): ModalityGlobalConfig {
  const defaultBaseUrl = typeof window !== 'undefined' ? (localStorage.getItem('ai_custom_base_url') || 'https://ai.comfly.org') : 'https://ai.comfly.org';
  const defaultApiKey = typeof window !== 'undefined' ? (localStorage.getItem('ai_custom_api_key') || '') : '';

  const fallback: ModalityGlobalConfig = {
    baseUrl: defaultBaseUrl,
    apiKey: defaultApiKey,
    baseUrlHistory: Array.from(new Set([defaultBaseUrl, ...DEFAULT_BASE_URL_RECOMMENDATIONS])).filter(Boolean),
    apiKeyHistory: defaultApiKey ? [defaultApiKey] : [],
  };

  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(GLOBAL_CONFIG_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ModalityGlobalConfig> & { presets?: Array<{ baseUrl: string; apiKey: string }> };

    // 兼容历史 presets 迁移到 baseUrlHistory 与 apiKeyHistory
    const historyUrls = new Set<string>(parsed.baseUrlHistory || []);
    const historyKeys = new Set<string>(parsed.apiKeyHistory || []);
    if (parsed.presets && Array.isArray(parsed.presets)) {
      for (const p of parsed.presets) {
        if (p.baseUrl) historyUrls.add(p.baseUrl);
        if (p.apiKey) historyKeys.add(p.apiKey);
      }
    }
    for (const rec of DEFAULT_BASE_URL_RECOMMENDATIONS) {
      historyUrls.add(rec);
    }
    const currentBaseUrl = parsed.baseUrl || fallback.baseUrl;
    if (currentBaseUrl) historyUrls.add(currentBaseUrl);
    const currentApiKey = parsed.apiKey || fallback.apiKey;
    if (currentApiKey) historyKeys.add(currentApiKey);

    return {
      baseUrl: currentBaseUrl,
      apiKey: currentApiKey,
      baseUrlHistory: Array.from(historyUrls).filter(Boolean),
      apiKeyHistory: Array.from(historyKeys).filter(Boolean),
    };
  } catch {
    return fallback;
  }
}

export function saveStoredModalityGlobalConfig(config: ModalityGlobalConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify(config));
    if (config.baseUrl) localStorage.setItem('ai_custom_base_url', config.baseUrl);
    if (config.apiKey) localStorage.setItem('ai_custom_api_key', config.apiKey);
  } catch {
    // 忽略存储异常
  }
}

export function loadStoredModalityModels(kind: ModalityKind): ModalityModelItem[] {
  const defaults = DEFAULT_MODALITY_MODELS[kind] || [];
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${kind}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaults;

    // 保障字段完整并保留新增默认模型
    const itemMap = new Map<string, ModalityModelItem>();
    for (const item of parsed) {
      if (item && item.id) {
        itemMap.set(item.id, item);
      }
    }
    const knownModelIds = new Set(Array.from(itemMap.values()).map((item) => item.modelId));
    for (const def of defaults) {
      if (!itemMap.has(def.id) && !knownModelIds.has(def.modelId)) {
        itemMap.set(def.id, def);
      }
    }
    return Array.from(itemMap.values()).map((item) => normalizeModelVendor(kind, item));
  } catch {
    return defaults;
  }
}

export function appendImportedModalityModels(
  prev: ModalityModelItem[],
  kind: ModalityKind,
  entries: Array<{ modelId: string; name?: string; vendor?: string }>,
): { models: ModalityModelItem[]; added: number; skipped: number; firstId: string } {
  const existing = new Set(prev.map((item) => item.modelId));
  const created: ModalityModelItem[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const modelId = entry.modelId.trim();
    if (!modelId || existing.has(modelId)) continue;
    const vendor = (entry.vendor || inferVendorFromModelId(modelId, kind) || 'custom').trim();
    existing.add(modelId);
    created.push({
      id: `${kind}_sync_${Date.now().toString(36)}_${created.length}`,
      name: entry.name?.trim() || modelId,
      modality: kind,
      vendor,
      modelId,
      isCustom: true,
      isInfrequent: false,
    });
  }
  return {
    models: created.length ? [...created, ...prev] : prev,
    added: created.length,
    skipped,
    firstId: created[0]?.id || '',
  };
}

export function saveStoredModalityModels(kind: ModalityKind, models: ModalityModelItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${kind}`, JSON.stringify(models));
  } catch {
    // 忽略存储异常
  }
}
