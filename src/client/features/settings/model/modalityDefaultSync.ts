import {
  readWorkflowModelsFromStorage,
  repairWorkflowModelId,
  repairWorkflowModelsForSettings,
  setStoredMultimodalModelId,
} from '@shared/domain/models/workflowModels';
import {
  upsertExplicitWorkflowModel,
  type ExplicitWorkflowCapability,
} from '@shared/domain/models/workflowModelRegistration';
import { persistCustomModels } from './customModelsStorage';
import type { ModalityKind, ModalityModelItem } from './modalityModelTypes';

const MODEL_STORAGE_KEYS: Partial<Record<ModalityKind, string>> = {
  image: 'ai_image_gen_model',
  video: 'ai_video_gen_model',
  three_d: 'ai_3d_gen_model',
  music: 'ai_music_gen_model',
  voice: 'ai_voice_gen_model',
};

const WORKFLOW_CAPABILITY: Partial<Record<ModalityKind, ExplicitWorkflowCapability>> = {
  chat: 'multimodal',
  image: 'image',
  video: 'video',
};

export function storedDefaultModelId(modelId: string): string {
  const trimmed = modelId.trim();
  return trimmed ? repairWorkflowModelId(trimmed) : '';
}

export function writeModalityDefaultKey(kind: ModalityKind, modelId: string): string {
  const storedId = storedDefaultModelId(modelId);
  if (!storedId || typeof localStorage === 'undefined') return '';
  if (kind === 'chat') setStoredMultimodalModelId(storedId);
  const storageKey = MODEL_STORAGE_KEYS[kind];
  if (storageKey) localStorage.setItem(storageKey, storedId);
  return storedId;
}

export function registerWorkflowDefault(kind: ModalityKind, model: Pick<ModalityModelItem, 'modelId' | 'name' | 'channelId'>) {
  const capability = WORKFLOW_CAPABILITY[kind];
  const storedId = storedDefaultModelId(model.modelId);
  if (!capability || !storedId || typeof localStorage === 'undefined') return;
  if (localStorage.getItem('custom_models') === null) return;
  const current = readWorkflowModelsFromStorage();
  const next = upsertExplicitWorkflowModel(current, {
    id: storedId,
    name: model.name,
    capability,
    providerId: model.channelId,
  });
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  persistCustomModels(repairWorkflowModelsForSettings(next));
}

export function notifyWorkflowModels(kind: ModalityKind) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('models_updated'));
    window.dispatchEvent(new CustomEvent('modality_models_updated', { detail: { kind } }));
  }
}

export function withLinkedCustomName(current: ModalityModelItem, updates: Partial<ModalityModelItem>): Partial<ModalityModelItem> {
  if (updates.modelId === undefined || updates.modelId === current.modelId) return updates;
  if (!current.isCustom || current.namePinned || updates.name !== undefined) return updates;
  const autoNames = new Set([current.modelId, `${current.modelId} (自定义)`]);
  if (!autoNames.has(current.name.trim())) return updates;
  const nextId = updates.modelId.trim();
  if (!nextId) return updates;
  return { ...updates, name: `${nextId} (自定义)` };
}

export function modalityHasWorkflowPool(kind: ModalityKind): boolean {
  return Boolean(WORKFLOW_CAPABILITY[kind]);
}
