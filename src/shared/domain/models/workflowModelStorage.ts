import type { WorkflowCapability } from './workflowModelTypes';

import { parseTextProtocol } from './textProtocol';

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
