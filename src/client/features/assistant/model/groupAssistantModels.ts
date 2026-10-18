import { getApprovedModel, vendorLabel } from '@shared/domain/models/modelCatalog';
import { upstreamModelId } from '@shared/domain/models/workflowModels';

/** Group only the displayed options; preserve configured routing order and route identities. */
export function groupAssistantModels<T extends { id: string; modelId?: string }>(models: readonly T[]) {
  const groups = new Map<string, { vendor: string; label: string; models: T[] }>();
  for (const model of models) {
    const identity = model.modelId || model.id;
    const approved = getApprovedModel(identity) || getApprovedModel(upstreamModelId(identity));
    const vendor = approved?.vendor || 'other';
    let group = groups.get(vendor);
    if (!group) {
      group = { vendor, label: approved ? vendorLabel(approved.vendor) : '其他模型', models: [] };
      groups.set(vendor, group);
    }
    group.models.push(model);
  }
  return [...groups.values()];
}
