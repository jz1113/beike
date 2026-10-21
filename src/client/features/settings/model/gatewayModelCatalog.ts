import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { inferWorkflowCapabilitiesFromId, openAIModelRouteId, gatewayModelToWorkflowModel, repairWorkflowModelsForSettings, repairWorkflowModelId, workflowModelRouteId } from '@shared/domain/models/workflowModels';
import type { WorkflowModel } from './workflowModel';

export interface GatewayModelItem {
  id: string; name: string; shortName: string;
  category: 'text' | 'image' | 'video' | 'audio' | 'embedding';
  isVision: boolean; isThinking: boolean; isImage: boolean; isVideo: boolean;
  isAudio: boolean; isEmbedding: boolean; isTool: boolean;
  owned_by?: string; isCustom?: boolean; supported?: boolean;
}
export type GatewayChannel = 'comfly' | 'openai' | 'lianchi';
export type GatewayModelType = 'all' | 'image' | 'multimodal' | 'video';

export function gatewayRouteId(id: string, channel: GatewayChannel): string {
  const canonical = repairWorkflowModelId(id);
  return channel === 'openai' ? openAIModelRouteId(canonical) : canonical;
}

export function isSupportedGatewayModel(id: string, channel: GatewayChannel): boolean {
  const approved = getApprovedModel(id);
  return Boolean(approved && (channel === 'openai' ? approved.capability === 'multimodal'
    : channel === 'lianchi' ? approved.id === 'openai/gpt-image-2' : approved.id !== 'openai/gpt-image-2'));
}

export function parseGatewayModels(value: unknown, channel: GatewayChannel): GatewayModelItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: GatewayModelItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) continue;
    const id = item.id.trim();
    if (seen.has(id.toLowerCase())) continue;
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
      isTool: item.isTool === true, supported: item.supported !== false && isSupportedGatewayModel(id, channel),
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
  for (const candidate of parseGatewayModels(candidates, channel)) {
    if (candidate.supported === false) continue;
    const model = repairWorkflowModelsForSettings([gatewayModelToWorkflowModel(candidate, channel)])[0];
    if (!model || seen.has(workflowModelRouteId(model).toLowerCase())) continue;
    seen.add(workflowModelRouteId(model).toLowerCase());
    models.push(model);
    addedCount++;
  }
  return { models, addedCount };
}
