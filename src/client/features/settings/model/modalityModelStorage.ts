import type { ModalityGlobalConfig, ModalityKind, ModalityModelItem } from './modalityModelTypes';
import { DEFAULT_MODALITY_MODELS } from '@shared/domain/models/modalityDefaults';
import { inferVendorFromModelId, normalizeModelVendor } from './modalityMeta';
import {
  MODALITY_STORAGE_KEY_PREFIX,
  clearDismissedDefaultIds,
  noteRemovedDefaultModels,
  readEffectiveModalityModels,
  readStoredModalityModels,
  type StoredModalityModelItem,
} from '@shared/domain/models/modalityStorage';

const STORAGE_KEY_PREFIX = MODALITY_STORAGE_KEY_PREFIX;
const GLOBAL_CONFIG_KEY = 'beike_modality_global_config_v1';
const GLOBAL_CONFIG_MANUAL_OVERRIDE_KEY = 'beike_modality_global_config_manual_override_v1';

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

/**
 * Global credentials predate provider propagation and have no source metadata.
 * Keep a small side marker so a user-edited global value can be distinguished
 * from that legacy inherited value during the one-time provider migration.
 */
export function markModalityGlobalConfigManualOverride(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(GLOBAL_CONFIG_MANUAL_OVERRIDE_KEY, 'true'); } catch { /* Ignore storage failures. */ }
}

export function hasModalityGlobalConfigManualOverride(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(GLOBAL_CONFIG_MANUAL_OVERRIDE_KEY) === 'true'; } catch { return false; }
}

const LEGACY_PLACEHOLDER_IDS = new Set([
  'chat_bytedance',
  'chat_xiaomi',
  'img_meta',
  'img_bytedance',
  '3d_tripo',
]);

export function isInvalidPlaceholderModel(item: ModalityModelItem): boolean {
  if (item.isCustom) return false;
  return LEGACY_PLACEHOLDER_IDS.has(item.id);
}

function toSettingsModel(kind: ModalityKind, item: StoredModalityModelItem): ModalityModelItem {
  return normalizeModelVendor(kind, {
    ...item,
    name: item.name || item.modelId,
    modality: kind,
    vendor: item.vendor || 'custom',
  });
}

export function loadStoredModalityModels(kind: ModalityKind): ModalityModelItem[] {
  const read = readEffectiveModalityModels(kind);
  if (read.persist && typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${kind}`, JSON.stringify(read.persist.map((item) => toSettingsModel(kind, item))));
    } catch {
      // 忽略存储异常
    }
  }
  return read.models.map((item) => toSettingsModel(kind, item));
}

export function resetStoredModalityModels(kind: ModalityKind): ModalityModelItem[] {
  const defaults = (DEFAULT_MODALITY_MODELS[kind] || []).filter((item) => !isInvalidPlaceholderModel(item));
  clearDismissedDefaultIds(kind);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${kind}`, JSON.stringify(defaults));
    } catch {
      // 忽略存储异常
    }
  }
  return defaults;
}

function channelModelKey(channelId: string | undefined, modelId: string): string {
  return `${channelId || ''}::${modelId}`;
}

export function appendImportedModalityModels(
  prev: ModalityModelItem[],
  kind: ModalityKind,
  entries: Array<{ modelId: string; name?: string; vendor?: string }>,
  channelId = '',
  channelName = '',
): { models: ModalityModelItem[]; added: number; skipped: number; firstId: string } {
  const existing = new Set(prev.map((item) => channelModelKey(item.channelId, item.modelId)));
  const otherChannelIds = new Set(
    prev.filter((item) => (item.channelId || '') !== channelId).map((item) => item.modelId),
  );
  const created: ModalityModelItem[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const modelId = entry.modelId.trim();
    const key = channelModelKey(channelId, modelId);
    if (!modelId || existing.has(key)) {
      skipped += 1;
      continue;
    }
    const vendor = (entry.vendor || inferVendorFromModelId(modelId, kind) || 'custom').trim();
    const baseName = entry.name?.trim() || modelId;
    const name = otherChannelIds.has(modelId) && channelName && !baseName.includes(`· ${channelName}`)
      ? `${baseName} · ${channelName}`
      : baseName;
    existing.add(key);
    otherChannelIds.add(modelId);
    created.push({
      id: `${kind}_sync_${Date.now().toString(36)}_${channelId || 'global'}_${created.length}`,
      name,
      modality: kind,
      vendor,
      modelId,
      ...(channelId ? { channelId } : {}),
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

export function planModalityChannelSync(
  prev: ModalityModelItem[],
  kind: ModalityKind,
  channelId: string,
  selectedModelIds: readonly string[],
  candidateEntries: Array<{ modelId: string; vendor?: string; name?: string }>,
  channelName = '',
): { models: ModalityModelItem[]; added: number; removed: number; fallbackDefault?: ModalityModelItem } {
  const selectedSet = new Set(selectedModelIds);
  const candidateSet = new Set(candidateEntries.map((entry) => entry.modelId));
  let removed = 0;
  const remaining = prev.filter((item) => {
    if ((item.channelId || '') !== channelId) return true;
    if (candidateSet.has(item.modelId) && !selectedSet.has(item.modelId)) {
      removed += 1;
      return false;
    }
    return true;
  });
  const toAdd = candidateEntries.filter((entry) => selectedSet.has(entry.modelId));
  const planned = appendImportedModalityModels(remaining, kind, toAdd, channelId, channelName);
  let models = planned.models;
  let fallbackDefault: ModalityModelItem | undefined;
  if (!models.some((item) => item.isDefault) && models.length > 0) {
    fallbackDefault = models.find((item) => !item.isCustom) || models[0];
    models = models.map((item) => ({ ...item, isDefault: item.id === fallbackDefault?.id }));
  }
  return { models, added: planned.added, removed, fallbackDefault };
}

export function saveStoredModalityModels(kind: ModalityKind, models: ModalityModelItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    noteRemovedDefaultModels(kind, readStoredModalityModels(kind), models);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${kind}`, JSON.stringify(models));
  } catch {
    // 忽略存储异常
  }
}
