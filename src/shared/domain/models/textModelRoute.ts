import { domainStorage } from '../core/runtime';
import { findConfiguredModalityModel } from './modalityStorage';
import { configuredTextProtocol, resolveTextProtocol, type TextProtocol } from './textProtocol';

/** Resolve by selection ID first so duplicate upstream IDs keep their channel and explicit protocol. */
export function selectedTextModel(selection: string): { modelId: string; textProtocol?: TextProtocol; apiTemplate?: string } {
  const modality = findConfiguredModalityModel(selection);
  if (modality) return { modelId: modality.modelId, textProtocol: configuredTextProtocol(modality), apiTemplate: modality.apiTemplate };
  try {
    const models: unknown = JSON.parse((domainStorage() || (typeof window !== 'undefined' ? window.localStorage : undefined))?.getItem('custom_models') || '[]');
    if (Array.isArray(models)) {
      const model = models.find(item => item?.routeId === selection) || models.find(item => item?.id === selection);
      if (model) return { modelId: stripTextRoute(model.id), textProtocol: configuredTextProtocol(model), apiTemplate: model.apiTemplate };
    }
  } catch { /* Malformed storage does not override protocol inference. */ }
  return { modelId: stripTextRoute(selection) };
}
function stripTextRoute(id: string): string {
  return id.replace(/^(?:openai-responses:|deepseek-official:)/, '');
}
export function selectedTextProtocol(selection: string, preference?: TextProtocol) {
  if (selection.startsWith('openai-responses:')) return 'openai';
  const model = selectedTextModel(selection);
  return resolveTextProtocol(model.modelId, preference || model.textProtocol || (model.apiTemplate === 'responses' ? 'openai' : undefined));
}
