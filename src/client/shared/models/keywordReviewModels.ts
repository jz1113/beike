import { DEEPSEEK_BASE_URL } from '@shared/domain/models/deepseek';
import { listApprovedModels } from '@shared/domain/models/modelCatalog';
import {
  modalityPickerSelections,
  readEffectiveModalityModels,
  readStoredApiProviders,
  resolveModalityModelRoute,
  type StoredModalityModelItem,
} from '@shared/domain/models/modalityStorage';
import { configuredTextProtocol, resolveTextProtocol, type ResolvedTextProtocol, type TextProtocol } from '@shared/domain/models/textProtocol';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import {
  getEnabledMultimodalModelsFromSettings,
  readWorkflowModelsFromStorage,
  workflowModelRouteId,
  type WorkflowCapability,
} from '@shared/domain/models/workflowModels';

export interface KeywordReviewModelOption {
  value: string;
  /** Modality entry id or workflow route id used to recover credentials. */
  routeId: string;
  /** Upstream model id sent to the review API. */
  model: string;
  name: string;
  label: string;
  channel?: string;
  provider: 'deepseek' | 'gateway';
  source: 'official' | 'modality' | 'workflow';
}

export interface KeywordReviewRoute {
  provider: 'deepseek' | 'gateway';
  model: string;
  baseUrl: string;
  apiKey: string;
  textProtocol?: ResolvedTextProtocol;
  /** Where to read a key when this route does not already carry one. */
  keySource: 'deepseek' | 'channel' | 'gateway';
}

export const DEFAULT_KEYWORD_REVIEW_MODEL = 'deepseek:deepseek-flash';
export const KEYWORD_REVIEW_MODEL_STORAGE_KEY = 'keyword_review_model';

export function isOfficialDeepSeekBase(url: string | undefined): boolean {
  const trimmed = (url || '').trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
  return trimmed.toLowerCase() === DEEPSEEK_BASE_URL;
}

function officialOption(): KeywordReviewModelOption {
  return {
    value: DEFAULT_KEYWORD_REVIEW_MODEL,
    routeId: DEFAULT_KEYWORD_REVIEW_MODEL,
    model: 'deepseek-flash',
    name: 'DeepSeek Flash · 官方',
    label: 'DeepSeek Flash · 官方',
    channel: '官方',
    provider: 'deepseek',
    source: 'official',
  };
}

function modalityOwnCredentials(item: StoredModalityModelItem | undefined): { baseUrl: string; apiKey: string } {
  if (!item) return { baseUrl: '', apiKey: '' };
  const provider = item.channelId ? readStoredApiProviders().find((candidate) => candidate.id === item.channelId) : undefined;
  return {
    baseUrl: item.baseUrl?.trim() || provider?.baseUrl?.trim() || '',
    apiKey: item.apiKey?.trim() || provider?.apiKey?.trim() || '',
  };
}

function modalityOptions(): KeywordReviewModelOption[] | null {
  const synced = modalityPickerSelections('chat');
  if (!synced) return null;
  const read = readEffectiveModalityModels('chat');
  return synced.map((selection) => {
    const item = read.models.find((candidate) => candidate.id === selection.entryId);
    const own = modalityOwnCredentials(item);
    const route = resolveModalityModelRoute('chat', selection.entryId);
    const provider = isOfficialDeepSeekBase(own.baseUrl || route.baseUrl) ? 'deepseek' as const : 'gateway' as const;
    return {
      value: selection.id,
      routeId: selection.entryId,
      model: selection.modelId,
      name: selection.name,
      label: selection.name,
      channel: selection.provider,
      provider,
      source: 'modality' as const,
    };
  });
}

function findWorkflowModel(routeId: string): WorkflowCapability | undefined {
  return readWorkflowModelsFromStorage().find((model) => (
    workflowModelRouteId(model) === routeId || model.routeId === routeId || model.id === routeId
  ));
}

function workflowCredentials(routeId: string): { baseUrl: string; apiKey: string; textProtocol?: TextProtocol; modelId: string } {
  const stored = findWorkflowModel(routeId);
  const provider = stored?.providerId
    ? readStoredApiProviders().find((item) => item.id === stored.providerId)
    : undefined;
  const modelId = selectedTextModel(routeId).modelId || stored?.id || routeId;
  return {
    baseUrl: stored?.customBaseUrl?.trim() || provider?.baseUrl?.trim() || '',
    apiKey: stored?.customApiKey?.trim() || provider?.apiKey?.trim() || '',
    textProtocol: stored ? configuredTextProtocol(stored) : undefined,
    modelId,
  };
}

function workflowOptions(): KeywordReviewModelOption[] {
  const configured = getEnabledMultimodalModelsFromSettings()
    .filter((model) => model.channel !== 'openai' && model.channel !== 'deepseek');
  if (configured.length > 0) {
    return configured.map((model) => {
      const owned = workflowCredentials(model.id);
      const name = model.name || model.shortName || owned.modelId;
      return {
        value: `gateway:${model.id}`,
        routeId: model.id,
        model: owned.modelId,
        name,
        label: name,
        channel: model.provider || model.channel,
        provider: isOfficialDeepSeekBase(owned.baseUrl) ? 'deepseek' as const : 'gateway' as const,
        source: 'workflow' as const,
      };
    });
  }
  return listApprovedModels('multimodal').map((model) => ({
    value: `gateway:${model.id}`,
    routeId: model.id,
    model: model.id,
    name: model.shortName || model.name || model.id,
    label: model.shortName || model.name || model.id,
    channel: '模型网关',
    provider: 'gateway' as const,
    source: 'workflow' as const,
  }));
}

/** Chat models already synced for the homepage agent, otherwise the previous workflow list. */
export function loadKeywordReviewModels(): KeywordReviewModelOption[] {
  const models = modalityOptions() ?? workflowOptions();
  if (!models.some((option) => option.model === 'deepseek-flash' && option.provider === 'deepseek')) {
    models.unshift(officialOption());
  }
  return models;
}

export function resolveStoredKeywordReviewModel(stored: string, options: readonly KeywordReviewModelOption[]): string {
  const exact = options.find((option) => option.value === stored || option.routeId === stored);
  if (exact) return exact.value;
  const legacyModel = stored.replace(/^gateway:/, '').replace(/^deepseek:/, '');
  const byIdentity = options.find((option) => (
    option.routeId === legacyModel || option.model === stored || option.model === legacyModel
  ));
  return byIdentity?.value || options[0]?.value || DEFAULT_KEYWORD_REVIEW_MODEL;
}

export function resolveKeywordReviewRoute(option: KeywordReviewModelOption): KeywordReviewRoute {
  if (option.source === 'official') {
    return {
      provider: 'deepseek',
      model: 'deepseek-flash',
      baseUrl: DEEPSEEK_BASE_URL,
      apiKey: '',
      textProtocol: resolveTextProtocol('deepseek-flash'),
      keySource: 'deepseek',
    };
  }
  if (option.source === 'modality') {
    const read = readEffectiveModalityModels('chat');
    const item = read.models.find((candidate) => candidate.id === option.routeId);
    if (item?.channelId && !readStoredApiProviders().some((provider) => provider.id === item.channelId)) {
      throw new Error('所选模型的渠道已移除，请重新选择');
    }
    const own = modalityOwnCredentials(item);
    const route = resolveModalityModelRoute('chat', option.routeId);
    const modelId = route.modelId || option.model;
    const textProtocol = resolveTextProtocol(modelId, route.textProtocol);
    const official = isOfficialDeepSeekBase(own.baseUrl || route.baseUrl);
    if (official) {
      return {
        provider: 'deepseek',
        model: modelId,
        baseUrl: DEEPSEEK_BASE_URL,
        apiKey: own.apiKey,
        textProtocol,
        keySource: own.apiKey ? 'channel' : 'deepseek',
      };
    }
    const owned = Boolean(own.baseUrl || own.apiKey);
    return {
      provider: 'gateway',
      model: modelId,
      baseUrl: owned ? (own.baseUrl || route.baseUrl) : route.baseUrl,
      apiKey: owned ? own.apiKey : (route.apiKey || ''),
      textProtocol,
      keySource: owned ? 'channel' : 'gateway',
    };
  }
  const owned = workflowCredentials(option.routeId);
  const official = isOfficialDeepSeekBase(owned.baseUrl);
  const hasOwn = Boolean(owned.baseUrl || owned.apiKey);
  return {
    provider: official ? 'deepseek' : 'gateway',
    model: owned.modelId || option.model,
    baseUrl: official ? DEEPSEEK_BASE_URL : owned.baseUrl,
    apiKey: owned.apiKey,
    textProtocol: resolveTextProtocol(owned.modelId || option.model, owned.textProtocol),
    keySource: official ? 'deepseek' : hasOwn ? 'channel' : 'gateway',
  };
}
