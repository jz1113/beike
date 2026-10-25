import type { ModalityKind, ModalityModelItem } from './modalityModelTypes';
import {
  loadStoredModalityGlobalConfig,
  loadStoredModalityModels,
  saveStoredModalityGlobalConfig,
  saveStoredModalityModels,
} from './modalityModelStorage';
import { loadCustomModels, persistCustomModels } from './customModelsStorage';

export const PROVIDER_CREDENTIALS_CHANGED_EVENT = 'beike:provider-credentials-changed';
const SAVED_PROVIDER_CREDENTIALS_KEY = 'beike_api_provider_saved_credentials_v1';

const MODALITY_KINDS: ModalityKind[] = ['chat', 'image', 'video', 'three_d', 'music', 'voice', 'avatar'];

export interface ProviderCredentials {
  baseUrl: string;
  apiKey: string;
}

const PROVIDER_ID_ALIASES: Record<string, string> = {
  comfly: 'comfly_gateway',
  openai: 'openai_official',
  deepseek: 'deepseek_official',
  lianchi: 'lianchi_images',
};

export function canonicalProviderId(providerId: string): string {
  return PROVIDER_ID_ALIASES[providerId] || providerId;
}

export function isComflyProviderId(providerId: string): boolean {
  return canonicalProviderId(providerId) === 'comfly_gateway';
}

export function loadSavedProviderCredentialSnapshots(): Record<string, ProviderCredentials> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_PROVIDER_CREDENTIALS_KEY) || '{}') as Record<string, Partial<ProviderCredentials>>;
    return Object.fromEntries(Object.entries(parsed).map(([id, value]) => [id, {
      baseUrl: typeof value?.baseUrl === 'string' ? value.baseUrl : '',
      apiKey: typeof value?.apiKey === 'string' ? value.apiKey : '',
    }]));
  } catch {
    return {};
  }
}

export function rememberSavedProviderCredentials(providerId: string, credentials: ProviderCredentials): void {
  if (typeof window === 'undefined') return;
  try {
    const snapshots = loadSavedProviderCredentialSnapshots();
    snapshots[providerId] = { baseUrl: credentials.baseUrl.trim(), apiKey: credentials.apiKey.trim() };
    localStorage.setItem(SAVED_PROVIDER_CREDENTIALS_KEY, JSON.stringify(snapshots));
  } catch {
    // Ignore unavailable browser storage; the in-memory snapshot still protects this session.
  }
}

function cleanKey(value: string | undefined): string {
  return (value || '').trim();
}

function normalizedBaseUrl(value: string | undefined): string {
  return (value || '').trim().replace(/\/+$/, '').toLowerCase();
}

function canReplaceValue(current: string | undefined, previous: string, normalize: (value: string | undefined) => string): boolean {
  const normalizedCurrent = normalize(current);
  return !normalizedCurrent || normalizedCurrent === normalize(previous);
}

function changedValue(previous: string, next: string, normalize: (value: string | undefined) => string): boolean {
  return Boolean(previous) && normalize(previous) !== normalize(next);
}

function isProviderModel(item: ModalityModelItem, providerId: string): boolean {
  const canonicalId = canonicalProviderId(providerId);
  return (!item.channelId && canonicalId === 'comfly_gateway')
    || canonicalProviderId(item.channelId || '') === canonicalId;
}

function isCustomModelForProvider(model: { providerId?: string; channel?: string }, providerId: string): boolean {
  const canonicalId = canonicalProviderId(providerId);
  if (canonicalProviderId(model.providerId || '') === canonicalId || canonicalProviderId(model.channel || '') === canonicalId) return true;
  const legacyChannel = canonicalId === 'comfly_gateway'
    ? 'comfly'
    : canonicalId === 'openai_official'
      ? 'openai'
      : canonicalId === 'deepseek_official'
        ? 'deepseek'
        : canonicalId === 'lianchi_images'
          ? 'lianchi'
          : '';
  return Boolean(legacyChannel && model.channel === legacyChannel);
}

export function propagateProviderCredentials(
  providerId: string,
  previous: ProviderCredentials,
  next: ProviderCredentials,
): { updated: number } {
  const previousKey = cleanKey(previous.apiKey);
  const nextKey = cleanKey(next.apiKey);
  const previousBaseUrl = (previous.baseUrl || '').trim();
  const nextBaseUrl = (next.baseUrl || '').trim();
  const keyChanged = changedValue(previousKey, nextKey, value => cleanKey(value));
  const baseUrlChanged = changedValue(previousBaseUrl, nextBaseUrl, normalizedBaseUrl);
  let updated = 0;

  if (isComflyProviderId(providerId)) {
    const global = loadStoredModalityGlobalConfig();
    let globalChanged = false;
    const globalNext = { ...global };
    if (canReplaceValue(global.apiKey, previousKey, value => cleanKey(value)) && global.apiKey !== nextKey) {
      globalNext.apiKey = nextKey;
      globalChanged = true;
    }
    if (canReplaceValue(global.baseUrl, previousBaseUrl, normalizedBaseUrl)
      && normalizedBaseUrl(global.baseUrl) !== normalizedBaseUrl(nextBaseUrl)) {
      globalNext.baseUrl = nextBaseUrl;
      globalChanged = true;
    }
    if (globalChanged) {
      saveStoredModalityGlobalConfig({
        ...globalNext,
        apiKeyHistory: nextKey ? Array.from(new Set([nextKey, ...global.apiKeyHistory])) : global.apiKeyHistory,
        baseUrlHistory: nextBaseUrl ? Array.from(new Set([nextBaseUrl, ...global.baseUrlHistory])) : global.baseUrlHistory,
      });
      updated += 1;
    }
  }

  // A changed previous credential is needed before replacing model-level
  // snapshots; empty previous values are intentionally left untouched.
  if (keyChanged || baseUrlChanged) {
    const custom = loadCustomModels([]);
    if (!custom.invalid) {
      let customChanged = 0;
      const models = custom.models.map(model => {
        const belongsToProvider = isCustomModelForProvider(model, providerId);
        if (!belongsToProvider) return model;
        let changed = false;
        const nextModel = { ...model };
        if (keyChanged && cleanKey(model.customApiKey) === previousKey) {
          if (nextKey) nextModel.customApiKey = nextKey;
          else delete nextModel.customApiKey;
          changed = true;
        }
        if (baseUrlChanged && normalizedBaseUrl(model.customBaseUrl) === normalizedBaseUrl(previousBaseUrl)) {
          if (nextBaseUrl) nextModel.customBaseUrl = nextBaseUrl;
          else delete nextModel.customBaseUrl;
          changed = true;
        }
        if (changed) customChanged += 1;
        return changed ? nextModel : model;
      });
      if (customChanged > 0 && persistCustomModels(models)) updated += customChanged;
    }

    for (const kind of MODALITY_KINDS) {
      const models = loadStoredModalityModels(kind);
      let modelChanged = 0;
      const nextModels = models.map(model => {
        if (!isProviderModel(model, providerId)) return model;
        let changed = false;
        const nextModel = { ...model };
        if (keyChanged && cleanKey(model.apiKey) === previousKey) {
          delete nextModel.apiKey;
          changed = true;
        }
        if (baseUrlChanged && normalizedBaseUrl(model.baseUrl) === normalizedBaseUrl(previousBaseUrl)) {
          delete nextModel.baseUrl;
          changed = true;
        }
        if (changed) modelChanged += 1;
        return changed ? nextModel : model;
      });
      if (modelChanged > 0) {
        saveStoredModalityModels(kind, nextModels);
        updated += modelChanged;
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROVIDER_CREDENTIALS_CHANGED_EVENT, { detail: { providerId } }));
  }
  return { updated };
}
