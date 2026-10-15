import { isApprovedModel } from './modelCatalog';
import {
  repairWorkflowModelId,
  upstreamModelId,
  type WorkflowCapability,
} from './workflowModels';

export type ExplicitWorkflowCapability = 'multimodal' | 'image' | 'video';

function explicitWorkflowFlags(capability: ExplicitWorkflowCapability): Pick<WorkflowCapability, 'isImage' | 'isVideo' | 'isMultimodal' | 'isVision' | 'isAssistant'> {
  if (capability === 'image') return { isImage: true, isVideo: false, isMultimodal: false, isVision: false, isAssistant: false };
  if (capability === 'video') return { isImage: false, isVideo: true, isMultimodal: false, isVision: false, isAssistant: false };
  return { isImage: false, isVideo: false, isMultimodal: true, isVision: true, isAssistant: true };
}

/** 把模态线路里设为默认的模型补进工作流列表。已有条目只确保启用，不改能力标签。 */
export function upsertExplicitWorkflowModel(
  models: readonly WorkflowCapability[],
  entry: { id: string; name?: string; capability: ExplicitWorkflowCapability },
): WorkflowCapability[] {
  const id = repairWorkflowModelId(entry.id.trim());
  if (!id) return [...models];
  const index = models.findIndex((model) => {
    const sameId = repairWorkflowModelId(upstreamModelId(model.id)).toLowerCase() === id.toLowerCase();
    const channel = model.channel || 'comfly';
    return sameId && channel !== 'deepseek' && channel !== 'openai';
  });
  if (index >= 0) {
    if (models[index]?.enabled !== false) return [...models];
    return models.map((model, itemIndex) => itemIndex === index ? { ...model, enabled: true } : model);
  }
  const name = entry.name?.trim() || id;
  return [{
    id,
    name,
    shortName: name,
    channel: 'comfly',
    enabled: true,
    isCustom: !isApprovedModel(id),
    ...explicitWorkflowFlags(entry.capability),
  }, ...models];
}
