import type { GenerationTask } from '@client/store/appStoreTypes';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';

export function agentModelName(task: Pick<GenerationTask, 'model' | 'modelRouteKey' | 'agentTurn'>): string {
  const reported = task.agentTurn?.modelUsed;
  const selection = task.modelRouteKey || task.model;
  const options = modalityPickerSelections('chat') || [];
  const entry = options.find(item => item.entryId === selection || item.id === selection);
  if (entry && (!reported || reported === selection || reported === entry.modelId)) return entry.name;

  // The server reports an upstream model, which can be shared by several channels.
  const id = reported || task.model || selection;
  if (!id) return '';
  const modelId = selectedTextModel(id).modelId;
  if (modelId.startsWith('chat_sync_')) return '';
  return getApprovedModel(modelId)?.shortName || modelId;
}
