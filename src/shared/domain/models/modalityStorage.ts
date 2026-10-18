import { domainStorage } from '../core/runtime';
import { isAvatarDriverModel } from './avatarDrivers';
import { DEFAULT_MODALITY_MODELS, type ModalityStorageKind, type StoredModalityModelItem } from './modalityDefaults';

export type { ModalityStorageKind, StoredModalityModelItem } from './modalityDefaults';

export const MODALITY_STORAGE_KEY_PREFIX = 'beike_modality_models_v1_';
export const DISMISSED_DEFAULTS_KEY_PREFIX = 'beike_modality_dismissed_defaults_v1_';

export const API_PROVIDERS_STORAGE_KEY = 'beike_api_providers_v2';
export const MODALITY_GLOBAL_CHANNEL_ID = '';

export interface StoredApiProviderCredentials {
  id: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}

export function getModalityStorageKey(kind: string): string {
  return `${MODALITY_STORAGE_KEY_PREFIX}${kind}`;
}

export function getDismissedDefaultsKey(kind: string): string {
  return `${DISMISSED_DEFAULTS_KEY_PREFIX}${kind}`;
}

const LEGACY_INVALID_PLACEHOLDERS = new Set([
  'chat_bytedance',
  'chat_xiaomi',
  'img_meta',
  'img_bytedance',
  '3d_tripo',
]);

export function isInvalidPlaceholderModalityItem(item: StoredModalityModelItem): boolean {
  if (item.isCustom) return false;
  return LEGACY_INVALID_PLACEHOLDERS.has(item.id);
}

function readStorageItem(key: string): string | null {
  try {
    const storage = domainStorage();
    if (storage) return storage.getItem(key);
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(key);
    return null;
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: string): void {
  try {
    const storage = domainStorage();
    if (storage) {
      storage.setItem(key, value);
      return;
    }
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, value);
  } catch {
    // 忽略存储异常
  }
}

function removeStorageItem(key: string): void {
  try {
    const storage = domainStorage();
    if (storage) {
      storage.removeItem(key);
      return;
    }
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key);
  } catch {
    // 忽略存储异常
  }
}

function isStoredModalityModel(item: unknown): item is StoredModalityModelItem {
  if (!item || typeof item !== 'object') return false;
  const row = item as StoredModalityModelItem;
  return Boolean(row.id && row.modelId && !isInvalidPlaceholderModalityItem(row));
}

export function readStoredModalityModels(kind: ModalityStorageKind): StoredModalityModelItem[] {
  try {
    const raw = readStorageItem(getModalityStorageKey(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredModalityModel);
  } catch {
    return [];
  }
}

export interface EffectiveModalityModels {
  /** 存储键已存在。缺失时前台继续使用 custom_models。 */
  configured: boolean;
  /** 设置页和已同步前台应展示的列表。空列表和占位项补回全部官方种子；非空列表只补从未解除的新种子。 */
  models: StoredModalityModelItem[];
  /** 洗掉占位项后需要写回的列表。null 表示不必改存储。 */
  persist: StoredModalityModelItem[] | null;
}

function defaultModalityModels(kind: ModalityStorageKind): StoredModalityModelItem[] {
  return (DEFAULT_MODALITY_MODELS[kind] || []).filter((item) => !isInvalidPlaceholderModalityItem(item));
}

function defaultModelIdSet(kind: ModalityStorageKind): Set<string> {
  return new Set(defaultModalityModels(kind).map((item) => item.id));
}

/** 用户主动解除过的官方种子。非空列表补默认项时跳过这些 id。 */
export function readDismissedDefaultIds(kind: ModalityStorageKind): string[] {
  try {
    const raw = readStorageItem(getDismissedDefaultsKey(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const allowed = defaultModelIdSet(kind);
    return parsed.filter((id): id is string => typeof id === 'string' && allowed.has(id));
  } catch {
    return [];
  }
}

export function dismissDefaultModelIds(kind: ModalityStorageKind, ids: readonly string[]): void {
  const allowed = defaultModelIdSet(kind);
  const next = new Set(readDismissedDefaultIds(kind));
  let changed = false;
  for (const id of ids) {
    if (!allowed.has(id) || next.has(id)) continue;
    next.add(id);
    changed = true;
  }
  if (!changed) return;
  writeStorageItem(getDismissedDefaultsKey(kind), JSON.stringify([...next]));
}

export function clearDismissedDefaultIds(kind: ModalityStorageKind): void {
  removeStorageItem(getDismissedDefaultsKey(kind));
}

/** 对比保存前后的原始列表，把消失的官方种子记为已解除。自定义模型不记。 */
export function noteRemovedDefaultModels(
  kind: ModalityStorageKind,
  previous: readonly { id: string }[],
  next: readonly { id: string }[],
): void {
  const nextIds = new Set(next.map((item) => item.id));
  dismissDefaultModelIds(kind, previous.map((item) => item.id).filter((id) => !nextIds.has(id)));
}

function withShippedDefaults(kind: ModalityStorageKind, cleaned: StoredModalityModelItem[]) {
  const defaults = defaultModalityModels(kind);
  if (cleaned.length === 0) {
    clearDismissedDefaultIds(kind);
    return { models: defaults, merged: defaults.length > 0 };
  }
  const ids = new Set(cleaned.map((item) => item.id));
  const dismissed = new Set(readDismissedDefaultIds(kind));
  const missing = defaults.filter((item) => !ids.has(item.id) && !dismissed.has(item.id));
  if (missing.length === 0) return { models: cleaned, merged: false };
  return { models: [...cleaned, ...missing], merged: true };
}

/** 数字人线路尚未建立时，把视频线路里已经保存的对口型模型搬过去。没有可搬的条目时保持未配置。 */
function migrateVideoDriversToAvatar(): void {
  const avatarKey = getModalityStorageKey('avatar');
  if (readStorageItem(avatarKey) !== null) return;
  const videoKey = getModalityStorageKey('video');
  const raw = readStorageItem(videoKey);
  if (raw === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  const drivers = parsed.filter((item): item is StoredModalityModelItem => (
    isStoredModalityModel(item) && isAvatarDriverModel(item.modelId)
  ));
  if (drivers.length === 0) return;
  const driverIds = new Set(drivers.map((item) => item.id));
  const remaining = parsed.filter((item) => {
    if (!item || typeof item !== 'object') return true;
    const id = (item as { id?: unknown }).id;
    return typeof id !== 'string' || !driverIds.has(id);
  });
  writeStorageItem(avatarKey, JSON.stringify(drivers.map((item) => ({ ...item, modality: 'avatar' }))));
  writeStorageItem(videoKey, JSON.stringify(remaining));
}

/** 键不存在表示还没同步。空列表和只剩占位项时回退全部默认模型并清掉解除记录。非空列表只并入从未被解除的新官方种子。 */
export function readEffectiveModalityModels(kind: ModalityStorageKind): EffectiveModalityModels {
  if (kind === 'avatar') migrateVideoDriversToAvatar();
  const defaults = defaultModalityModels(kind);
  const raw = readStorageItem(getModalityStorageKey(kind));
  if (raw === null) return { configured: false, models: defaults, persist: null };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { configured: true, models: defaults, persist: null };
    const cleaned = parsed.filter(isStoredModalityModel);
    const dropped = parsed.length - cleaned.length;
    const merged = withShippedDefaults(kind, cleaned);
    return {
      configured: true,
      models: merged.models,
      persist: dropped > 0 || merged.merged ? merged.models : null,
    };
  } catch {
    return { configured: true, models: defaults, persist: null };
  }
}

export interface ModalityPickerSelection {
  /** 唯一选项。模型 ID 不重复时等于上游 modelId，重复时用条目 id。 */
  id: string;
  modelId: string;
  name: string;
  entryId: string;
  provider?: string;
}

/** 已同步模态的前台选项。存储键不存在时返回 null，调用方保留 custom_models。 */
export function modalityPickerSelections(kind: ModalityStorageKind): ModalityPickerSelection[] | null {
  const read = readEffectiveModalityModels(kind);
  if (!read.configured) return null;
  const providers = readStoredApiProviders();
  const counts = new Map<string, number>();
  for (const item of read.models) {
    const modelId = item.modelId.trim();
    counts.set(modelId, (counts.get(modelId) || 0) + 1);
  }
  return read.models.map((item) => {
    const modelId = item.modelId.trim();
    const duplicated = (counts.get(modelId) || 0) > 1;
    const channel = item.channelId ? providers.find((provider) => provider.id === item.channelId)?.name || '' : '';
    const storedName = item.name?.trim() || modelId;
    const name = duplicated && channel && !storedName.includes(`· ${channel}`)
      ? `${storedName} · ${channel}`
      : storedName;
    return {
      id: duplicated ? item.id : modelId,
      modelId,
      entryId: item.id,
      name,
      ...(channel ? { provider: channel } : {}),
    };
  });
}

/** 把前台选中的条目 id 或 modelId 还原成上游模型 ID。未同步时原样返回。 */
export function upstreamModalityModelId(kind: ModalityStorageKind, selection: string): string {
  const trimmed = selection.trim();
  if (!trimmed) return '';
  const read = readEffectiveModalityModels(kind);
  if (!read.configured) return trimmed;
  const matched = read.models.find((item) => item.id === trimmed) || read.models.find((item) => item.modelId === trimmed);
  return matched?.modelId || trimmed;
}

const MODALITY_LOOKUP_KINDS: ModalityStorageKind[] = ['chat', 'image', 'video', 'three_d', 'music', 'voice', 'avatar'];

export function findConfiguredModalityModel(value: string): StoredModalityModelItem | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const configured = MODALITY_LOOKUP_KINDS
    .map((kind) => readEffectiveModalityModels(kind))
    .filter((read) => read.configured);
  for (const read of configured) {
    const exact = read.models.find((item) => item.id === trimmed);
    if (exact) return exact;
  }
  for (const read of configured) {
    const byModel = read.models.find((item) => item.modelId === trimmed);
    if (byModel) return byModel;
  }
  return null;
}

export interface StoredModalityGlobalConfig {
  baseUrl: string;
  apiKey: string;
}

export function readStoredModalityGlobalConfig(): StoredModalityGlobalConfig {
  let baseUrl = 'https://ai.comfly.org';
  let apiKey = '';
  try {
    const storage = domainStorage();
    const raw = storage ? storage.getItem('beike_modality_global_config_v1') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.baseUrl) baseUrl = parsed.baseUrl;
      if (parsed.apiKey) apiKey = parsed.apiKey;
    } else if (storage) {
      baseUrl = storage.getItem('ai_custom_base_url') || baseUrl;
      apiKey = storage.getItem('ai_custom_api_key') || apiKey;
    }
  } catch {
    // ignore
  }
  return { baseUrl, apiKey };
}

export const loadStoredModalityGlobalConfig = readStoredModalityGlobalConfig;

export function readStoredApiProviders(): StoredApiProviderCredentials[] {
  try {
    const raw = readStorageItem(API_PROVIDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredApiProviderCredentials => (
      Boolean(item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim())
    ));
  } catch {
    return [];
  }
}

export interface ModalityModelRoute {
  modelId: string;
  baseUrl: string;
  apiKey: string;
}

function providerCredentials(channelId: string | undefined): { baseUrl: string; apiKey: string } | null {
  if (!channelId) return null;
  const provider = readStoredApiProviders().find((item) => item.id === channelId);
  if (!provider) return null;
  return {
    baseUrl: provider.baseUrl?.trim() || '',
    apiKey: provider.apiKey?.trim() || '',
  };
}

export function credentialsForModalityItem(item: StoredModalityModelItem): { baseUrl?: string; apiKey?: string } {
  const ownUrl = item.baseUrl?.trim();
  const ownKey = item.apiKey?.trim();
  if (ownUrl || ownKey) return { baseUrl: ownUrl || undefined, apiKey: ownKey || undefined };
  const channel = providerCredentials(item.channelId);
  if (!channel?.baseUrl && !channel?.apiKey) return {};
  return { baseUrl: channel?.baseUrl || undefined, apiKey: channel?.apiKey || undefined };
}

/** 模型专属地址和 Key 优先，其次是来源渠道，最后回退到全局配置。value 可以是条目 id 或 modelId。 */
export function resolveModalityModelRoute(kind: ModalityStorageKind, value?: string): ModalityModelRoute {
  const read = readEffectiveModalityModels(kind);
  const models = read.configured ? read.models : readStoredModalityModels(kind);
  const globalConfig = readStoredModalityGlobalConfig();
  const trimmed = value?.trim() || '';
  const matched = trimmed
    ? models.find((item) => item.id === trimmed) || models.find((item) => item.modelId === trimmed)
    : models.find((item) => item.isDefault) || models[0];
  const channel = providerCredentials(matched?.channelId);
  return {
    modelId: matched?.modelId || trimmed,
    baseUrl: matched?.baseUrl?.trim() || channel?.baseUrl || globalConfig.baseUrl,
    apiKey: matched?.apiKey?.trim() || channel?.apiKey || globalConfig.apiKey,
  };
}
