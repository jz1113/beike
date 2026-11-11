import { COMFY_MODEL_PRICING } from '@client/shared/utils/modelPricing.data';
import { compareModelDisplayOrder, getSelectableModel } from '@shared/domain/models/modelCatalog';
import { channelDisplayName, type TextProtocol } from '@shared/domain/models/deepseek';
import { reconcileStoredWorkflowDefaults } from '@shared/domain/models/workflowModelDefaults';
import { isValidWorkflowModelList } from '@shared/domain/models/workflowModelStorage';
import {
  gatewayModelToWorkflowModel,
  inferWorkflowCapabilitiesFromId,
  isMultimodalWorkflowModel,
  openAIModelRouteId,
  repairWorkflowModelId,
  repairWorkflowModelsForSettings,
  workflowModelRouteId,
  type WorkflowCapability,
} from '@shared/domain/models/workflowModels';
import snapshot from './comflyPriceSnapshot.json';

export interface WorkflowModel {
  id: string;
  routeId?: string;
  /** Whether this route is offered in business model selectors; capabilities remain unchanged. */
  enabled?: boolean;
  channel?: 'comfly' | 'openai' | 'deepseek' | (string & {});
  providerId?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  apiTemplate?: string;
  textProtocol?: TextProtocol;
  name: string;
  shortName: string;
  badge?: string;
  desc?: string;
  isMultimodal?: boolean;
  isImage: boolean;
  isVideo: boolean;
  isVision?: boolean;
  isAssistant?: boolean;
  isDistill?: boolean;
  isThinking?: boolean;
  isCustom?: boolean;
}

export type ComflyPriceMap = Record<string, { promptPer1k: number; completionPer1k: number }>;
type SortPriceMap = Record<string, { promptPer1k?: number; completionPer1k?: number }>;

/** 各输入、输出 1K token 的默认分组报价之和；只用于比较同类型对话模型。 */
export function multimodalPriceScore(modelId: string, prices: SortPriceMap = COMFY_MODEL_PRICING): number | null {
  const rule = prices[modelId.toLowerCase()];
  if (rule?.promptPer1k === undefined || rule.completionPer1k === undefined) return null;
  return rule.promptPer1k + rule.completionPer1k;
}

/** Reorder only multimodal slots. Keep image/video placement and unknown-price ties stable. */
export function sortMultimodalModelsByPrice<T extends WorkflowCapability>(models: readonly T[], prices?: SortPriceMap): T[] {
  const priced = models.filter(isMultimodalWorkflowModel).sort((a, b) => {
    const aPrice = a.channel === 'openai' ? null : multimodalPriceScore(a.id, prices);
    const bPrice = b.channel === 'openai' ? null : multimodalPriceScore(b.id, prices);
    if (aPrice === null) return bPrice === null ? 0 : 1;
    if (bPrice === null) return -1;
    return aPrice - bPrice;
  });
  let index = 0;
  return models.map((model) => isMultimodalWorkflowModel(model) ? priced[index++] : model);
}

export type Quotation = { group: string; detail: string; page: number };
export const COMFLY_QUOTATION_DATE = '2026-09-23';
export function comflyQuotations(id: string): Quotation[] {
  return (snapshot as Record<string, Quotation[]>)[id.toLowerCase()] ?? [];
}
export function comflyTokenPrice(id: string, live?: ComflyPriceMap | null) {
  const current = live?.[id.toLowerCase()];
  if (current && Number.isFinite(current.promptPer1k) && Number.isFinite(current.completionPer1k)) return current;
  const detail = comflyQuotations(id).find(row => row.group === '默认分组')?.detail ?? '';
  const input = detail.match(/提示[:：]\s*฿\s*([\d.]+)\/K\s*token/);
  const output = detail.match(/补全[:：]\s*฿\s*([\d.]+)\/K\s*token/);
  return input && output ? { promptPer1k: Number(input[1]), completionPer1k: Number(output[1]) } : undefined;
}
export function quotationSummary(quote: Quotation): string {
  const fixed = quote.detail.match(/固定价格[:：]\s*(.+)/);
  if (fixed) return fixed[1];
  const tokens = quote.detail.split('\n').filter(line => /^(提示|补全)[:：]/.test(line));
  return tokens.length ? tokens.join(' · ') : '按规格计费';
}

export const CUSTOM_MODELS_KEY = 'custom_models';
export const CUSTOM_MODELS_BACKUP_KEY = 'custom_models.bak';

/** Model collection and its business defaults must either both save or retain the previous values. */
export function persistCustomModels(models: WorkflowModel[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  let previous: string | null = null;
  let hasWritten = false;
  try {
    previous = localStorage.getItem(CUSTOM_MODELS_KEY);
    const repaired = repairWorkflowModelsForSettings(models);
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(repaired));
    hasWritten = true;
    reconcileStoredWorkflowDefaults(repaired, localStorage);
    return true;
  } catch {
    if (hasWritten) {
      try { if (previous === null) localStorage.removeItem(CUSTOM_MODELS_KEY); else localStorage.setItem(CUSTOM_MODELS_KEY, previous); } catch { /* Storage may be unavailable. */ }
    }
    return false;
  }
}

function backupCorruptValue(raw: string) {
  try { localStorage.setItem(CUSTOM_MODELS_BACKUP_KEY, raw); } catch { /* Keep original source on quota failure. */ }
}

export function loadCustomModels(previous: WorkflowModel[] = []): {
  models: WorkflowModel[]; recoveredFromBackup: boolean; invalid: boolean;
} {
  if (typeof localStorage === 'undefined') return { models: previous, recoveredFromBackup: false, invalid: false };
  try {
    const saved = localStorage.getItem(CUSTOM_MODELS_KEY);
    if (saved === null) return { models: previous, recoveredFromBackup: false, invalid: false };
    try {
      const parsed: unknown = JSON.parse(saved);
      if (isValidWorkflowModelList(parsed)) return { models: repairWorkflowModelsForSettings(parsed), recoveredFromBackup: false, invalid: false };
      if (Array.isArray(parsed)) {
        const models = repairWorkflowModelsForSettings(parsed);
        backupCorruptValue(saved);
        return { models: models.length ? models : previous, recoveredFromBackup: false, invalid: true };
      }
    } catch { /* Try a previously saved backup before backing up the corrupt source. */ }
    const backup = localStorage.getItem(CUSTOM_MODELS_BACKUP_KEY);
    if (backup && backup !== saved) {
      try {
        const parsedBackup: unknown = JSON.parse(backup);
        if (isValidWorkflowModelList(parsedBackup)) return { models: repairWorkflowModelsForSettings(parsedBackup), recoveredFromBackup: true, invalid: true };
      } catch { /* Preserve current in-memory list. */ }
    }
    backupCorruptValue(saved);
    return { models: previous, recoveredFromBackup: false, invalid: true };
  } catch {
    return { models: previous, recoveredFromBackup: false, invalid: true };
  }
}

export interface GatewayModelItem {
  id: string; name: string; shortName: string;
  category: 'text' | 'image' | 'video' | 'audio' | 'embedding';
  isVision: boolean; isThinking: boolean; isImage: boolean; isVideo: boolean;
  isAudio: boolean; isEmbedding: boolean; isTool: boolean;
  owned_by?: string; isCustom?: boolean; supported?: boolean;
}
export type GatewayChannel = 'comfly' | 'openai';
export type GatewayModelType = 'all' | 'image' | 'multimodal' | 'video';

export function gatewayRouteId(id: string, channel: GatewayChannel): string {
  const canonical = repairWorkflowModelId(id);
  return channel === 'openai' ? openAIModelRouteId(canonical) : canonical;
}

export function isSupportedGatewayModel(id: string): boolean {
  return Boolean(getSelectableModel(id));
}

export function parseGatewayModels(value: unknown): GatewayModelItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: GatewayModelItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) continue;
    const id = item.id.trim();
    if (seen.has(id.toLowerCase()) || !isSupportedGatewayModel(id) || item.supported === false) continue;
    seen.add(id.toLowerCase());
    const caps = inferWorkflowCapabilitiesFromId(id);
    const category = ['text', 'image', 'video', 'audio', 'embedding'].includes(item.category) ? item.category : caps.isImage ? 'image' : caps.isVideo ? 'video' : caps.isEmbedding ? 'embedding' : caps.isAudio ? 'audio' : 'text';
    result.push({ id, name: typeof item.name === 'string' && item.name.trim() ? item.name : id,
      shortName: typeof item.shortName === 'string' && item.shortName.trim() ? item.shortName : id,
      category, isVision: typeof item.isVision === 'boolean' ? item.isVision : caps.isVision,
      isThinking: typeof item.isThinking === 'boolean' ? item.isThinking : caps.isThinking,
      isImage: typeof item.isImage === 'boolean' ? item.isImage : caps.isImage,
      isVideo: typeof item.isVideo === 'boolean' ? item.isVideo : caps.isVideo,
      isAudio: typeof item.isAudio === 'boolean' ? item.isAudio : caps.isAudio,
      isEmbedding: typeof item.isEmbedding === 'boolean' ? item.isEmbedding : caps.isEmbedding,
      isTool: item.isTool === true, supported: true,
      owned_by: typeof item.owned_by === 'string' ? item.owned_by : undefined, isCustom: item.isCustom === true });
  }
  return result;
}

export function matchesGatewayModelType(model: GatewayModelItem, type: GatewayModelType): boolean {
  const caps = inferWorkflowCapabilitiesFromId(model.id);
  return type === 'all' || (type === 'image' ? caps.isImage || model.isImage || model.category === 'image'
    : type === 'video' ? caps.isVideo || model.isVideo || model.category === 'video' : caps.isMultimodal);
}

export function mergeGatewayModels(previous: WorkflowModel[], candidates: GatewayModelItem[], channel: GatewayChannel) {
  const models = repairWorkflowModelsForSettings(previous);
  const seen = new Set(models.map(model => workflowModelRouteId(model).toLowerCase()));
  let addedCount = 0;
  for (const candidate of parseGatewayModels(candidates)) {
    if (candidate.supported === false) continue;
    const model = repairWorkflowModelsForSettings([gatewayModelToWorkflowModel(candidate, channel)])[0];
    if (!model || seen.has(workflowModelRouteId(model).toLowerCase())) continue;
    seen.add(workflowModelRouteId(model).toLowerCase());
    models.push(model);
    addedCount++;
  }
  return { models, addedCount };
}

export type ModelChannel = NonNullable<WorkflowModel['channel']>;
export type CapabilityFilter = 'all' | 'text' | 'multimodal' | 'image' | 'video';
export type ModelDisplaySort = 'catalog' | 'configured' | 'name' | 'price';
export const MODEL_CHANNELS: { id: ModelChannel; name: string; serviceId: string }[] = [
  { id: 'comfly', name: channelDisplayName('comfly'), serviceId: 'comfly_gateway' },
  { id: 'deepseek', name: channelDisplayName('deepseek'), serviceId: 'deepseek_official' },
  { id: 'openai', name: channelDisplayName('openai'), serviceId: 'openai_official' },
];
export function modelChannel(model: Pick<WorkflowModel, 'channel' | 'id'>): ModelChannel {
  return model.channel ?? 'comfly';
}
export function channelName(channel: ModelChannel): string {
  return MODEL_CHANNELS.find(item => item.id === channel)?.name || channelDisplayName(channel);
}
export function matchesCapability(model: WorkflowModel, filter: CapabilityFilter): boolean {
  if (model.channel === 'deepseek') return filter === 'all' || (filter === 'text' ? !!model.isAssistant : filter === 'multimodal' && !!model.isVision);
  return filter === 'all' || (filter === 'text' ? false : filter === 'image' ? model.isImage : filter === 'video' ? model.isVideo : isMultimodalWorkflowModel(model));
}
/** Display-only: never mutate or persist the incoming call order. Unknown prices stay last. */
export function selectModelRows(models: readonly WorkflowModel[], options: {
  channel: ModelChannel | 'all'; capability: CapabilityFilter; query: string;
  status: 'all' | 'enabled' | 'disabled'; sort: ModelDisplaySort; prices?: ComflyPriceMap | null;
}): WorkflowModel[] {
  const query = options.query.trim().toLowerCase();
  return models.filter(model =>
    (options.channel === 'all' || modelChannel(model) === options.channel)
    && matchesCapability(model, options.capability)
    && (options.status === 'all' || (model.enabled !== false) === (options.status === 'enabled'))
    && (!query || [model.id, model.name, channelName(modelChannel(model))].some(value => value?.toLowerCase().includes(query)))
  ).sort((a, b) => {
    if (options.sort === 'catalog') return compareModelDisplayOrder(a.id, b.id);
    if (options.sort === 'name') return (a.name || a.id).localeCompare(b.name || b.id, 'zh-CN');
    if (options.sort !== 'price') return 0;
    const score = (m: WorkflowModel) => {
      const price = modelChannel(m) === 'comfly' && isMultimodalWorkflowModel(m) ? comflyTokenPrice(m.id, options.prices) : undefined;
      return price ? price.promptPer1k + price.completionPer1k : null;
    };
    const aPrice = score(a), bPrice = score(b);
    return aPrice === null ? (bPrice === null ? 0 : 1) : bPrice === null ? -1 : aPrice - bPrice;
  });
}
/** Restore only one channel's built-in entries; preserve custom routes and all other channels. */
export function restoreChannelPresets(current: readonly WorkflowModel[], presets: readonly WorkflowModel[], channel: ModelChannel): WorkflowModel[] {
  const presetIds = new Set(presets.filter(model => modelChannel(model) === channel).map(workflowModelRouteId));
  const remaining = current.filter(model => modelChannel(model) !== channel || model.isCustom || !presetIds.has(workflowModelRouteId(model)));
  const existing = new Set(remaining.map(workflowModelRouteId));
  return [...remaining, ...presets.filter(model => modelChannel(model) === channel && !existing.has(workflowModelRouteId(model)))];
}
export function formatModelPrice(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(value) : '—';
}

/** Reorder visible slots only; hidden models and other channels keep their positions. */
export function reorderVisibleModels(current: WorkflowModel[], source: string, target: string, visibleIds: string[]): WorkflowModel[] {
  const ids = new Set(visibleIds);
  const visible = current.filter(model => ids.has(workflowModelRouteId(model)));
  const from = visible.findIndex(model => workflowModelRouteId(model) === source);
  const to = visible.findIndex(model => workflowModelRouteId(model) === target);
  if (from < 0 || to < 0 || from === to || visible.some(model => modelChannel(model) !== modelChannel(visible[from]))) return current;
  const [moved] = visible.splice(from, 1);
  visible.splice(to, 0, moved);
  let index = 0;
  return current.map(model => ids.has(workflowModelRouteId(model)) ? visible[index++] : model);
}
