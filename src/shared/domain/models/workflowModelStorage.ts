import { domainStorage } from '../core/runtime';
import { findConfiguredModalityModel } from './modalityStorage';
import { configuredTextProtocol, parseTextProtocol, resolveTextProtocol, type TextProtocol } from './deepseek';

export type WorkflowCapability = {
  textProtocol?: TextProtocol;
  apiTemplate?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  id: string;
  /** Upstream model ID stays bare; routeId distinguishes equal IDs on separate gateways. */
  routeId?: string;
  enabled?: boolean;
  channel?: 'comfly' | 'openai' | 'deepseek' | (string & {});
  /** 服务商配置中的 ApiProvider.id，用于按渠道取地址和 Key。 */
  providerId?: string;
  name?: string;
  shortName?: string;
  provider?: string;
  badge?: string;
  desc?: string;
  description?: string;
  isMultimodal?: boolean;
  isImage?: boolean;
  isVideo?: boolean;
  isVision?: boolean;
  isAudio?: boolean;
  isAssistant?: boolean;
  isDistill?: boolean;
  isThinking?: boolean;
  isCustom?: boolean;
};

const stringFields = ['customBaseUrl', 'customApiKey', 'apiTemplate', 'routeId', 'name', 'shortName', 'provider', 'providerId', 'badge', 'desc', 'description'] as const;
const booleanFields = ['enabled', 'isMultimodal', 'isImage', 'isVideo', 'isVision', 'isAssistant', 'isDistill', 'isThinking', 'isCustom'] as const;

/** Storage is untrusted input; reject malformed rows before any capability or route lookup. */
export function parseWorkflowModelList(value: unknown): WorkflowCapability[] {
  if (!Array.isArray(value)) return [];
  const models: WorkflowCapability[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim()) continue;
    if (item.id.trim() === 'openai/gpt-image-2' || item.channel === 'lianchi' || item.name === '联池image2') continue;
    if (stringFields.some(key => item[key] !== undefined && typeof item[key] !== 'string')) continue;
    if (booleanFields.some(key => item[key] !== undefined && typeof item[key] !== 'boolean')) continue;
    if (item.channel !== undefined && (typeof item.channel !== 'string' || !item.channel.trim())) continue;
    if (item.textProtocol !== undefined && !parseTextProtocol(item.textProtocol)) continue;
    const model: WorkflowCapability = { id: item.id.trim(), ...(parseTextProtocol(item.textProtocol) ? { textProtocol: parseTextProtocol(item.textProtocol) } : {}) };
    for (const key of stringFields) if (typeof item[key] === 'string') model[key] = item[key] as string;
    for (const key of booleanFields) if (typeof item[key] === 'boolean') model[key] = item[key] as boolean;
    if (item.channel) model.channel = item.channel as WorkflowCapability['channel'];
    models.push(model);
  }
  return models;
}

export function isValidWorkflowModelList(value: unknown): value is WorkflowCapability[] {
  return Array.isArray(value) && parseWorkflowModelList(value).length === value.length;
}

function stripTextRoute(id: string): string {
  return id.replace(/^(?:openai-responses:|deepseek-official:)/, '');
}

/** Resolve by selection ID first so duplicate upstream IDs keep their channel and explicit protocol. */
export function selectedTextModel(selection: string): { modelId: string; textProtocol?: TextProtocol; apiTemplate?: string } {
  const modality = findConfiguredModalityModel(selection);
  if (modality) return { modelId: modality.modelId, textProtocol: configuredTextProtocol(modality), apiTemplate: modality.apiTemplate };
  try {
    const models: unknown = JSON.parse(domainStorage()?.getItem('custom_models') || '[]');
    if (Array.isArray(models)) {
      const model = models.find(item => item?.routeId === selection) || models.find(item => item?.id === selection);
      if (model) return { modelId: stripTextRoute(model.id), textProtocol: configuredTextProtocol(model), apiTemplate: model.apiTemplate };
    }
  } catch { /* Malformed storage does not override protocol inference. */ }
  return { modelId: stripTextRoute(selection) };
}

export function selectedTextProtocol(selection: string, preference?: TextProtocol) {
  if (selection.startsWith('openai-responses:')) return 'openai';
  const model = selectedTextModel(selection);
  return resolveTextProtocol(model.modelId, preference || model.textProtocol || (model.apiTemplate === 'responses' ? 'openai' : undefined));
}
