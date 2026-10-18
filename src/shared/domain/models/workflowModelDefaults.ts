import { domainStorage, type DomainStorage } from '../core/runtime';
import {
  getEnabledImageModelsFromSettings, getEnabledVideoModelsFromSettings,
  getEnabledMultimodalModelsFromSettings, repairWorkflowModelId,
  upstreamModelId, type WorkflowCapability,
} from './workflowModels';
import { canonicalModelId } from './modelCatalog';

export function resolveEnabledModelId(storedId: string | null | undefined, models: readonly { id: string }[]): string {
  if (!storedId) return models[0]?.id || '';
  // 1. 精确匹配
  const exact = models.find(model => model.id === storedId || model.id.toLowerCase() === storedId.toLowerCase());
  if (exact) return exact.id;

  // 2. 去除前缀和别名后的规范化核心 ID 双向比对
  const cleanStored = upstreamModelId(storedId).trim().toLowerCase();
  const canonicalStored = canonicalModelId(cleanStored).toLowerCase();
  const repairedStored = repairWorkflowModelId(cleanStored).toLowerCase();

  const matched = models.find((model) => {
    const rawId = model.id.toLowerCase();
    const cleanModel = upstreamModelId(model.id).trim().toLowerCase();
    const canonicalModel = canonicalModelId(cleanModel).toLowerCase();
    const repairedModel = repairWorkflowModelId(cleanModel).toLowerCase();

    return (
      cleanModel === cleanStored ||
      canonicalModel === canonicalStored ||
      repairedModel === repairedStored ||
      rawId === `openai-responses:${cleanStored}` ||
      rawId === `openai-responses:${repairedStored}` ||
      rawId === `openai-responses:${canonicalStored}` ||
      `openai-responses:${rawId}` === cleanStored
    );
  });

  return matched?.id || models[0]?.id || '';
}

export interface WorkflowDefaults { vision: string; assistant: string; image: string; video: string }

/** Keep defaults in enabled routes; supports all configured multimodal models. */
export function reconcileStoredWorkflowDefaults(
  models: WorkflowCapability[],
  storage: DomainStorage | null | undefined = domainStorage(),
  requested: Partial<WorkflowDefaults> = {},
): WorkflowDefaults {
  if (!storage) throw new Error('浏览器存储不可用');
  const visionModels = getEnabledMultimodalModelsFromSettings(models);
  const assistantModels = getEnabledMultimodalModelsFromSettings(models, 'assistant');
  const vision = resolveEnabledModelId(requested.vision ?? storage.getItem('ai_multimodal_model') ?? storage.getItem('ai_vision_model'), visionModels);
  const syncAssistant = requested.vision !== undefined && assistantModels.some(model => model.id === vision);
  const assistant = resolveEnabledModelId(requested.assistant ?? (syncAssistant ? vision : storage.getItem('ai_assistant_model')), assistantModels);
  const image = resolveEnabledModelId(requested.image ?? storage.getItem('ai_image_gen_model'), getEnabledImageModelsFromSettings(models) as { id: string }[]);
  const video = resolveEnabledModelId(requested.video ?? storage.getItem('ai_video_gen_model'), getEnabledVideoModelsFromSettings(models) as { id: string }[]);
  const writes: Array<[string, string]> = [
    ['ai_multimodal_model', vision], ['ai_vision_model', vision], ['ai_assistant_model', assistant],
    ['ai_image_gen_model', image], ['ai_video_gen_model', video],
  ];
  const selectedAssistant = storage.getItem('beike_assistant_selected_model');
  if (selectedAssistant !== null) writes.push(['beike_assistant_selected_model', resolveEnabledModelId(selectedAssistant, assistantModels)]);
  const previous = writes.map(([key]) => [key, storage.getItem(key)] as const);
  try {
    for (const [key, value] of writes) {
      if (storage.getItem(key) === (value || null)) continue;
      if (value) storage.setItem(key, value); else storage.removeItem(key);
    }
  } catch (error) {
    for (const [key, value] of previous) {
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* Preserve the original storage error. */ }
    }
    throw error;
  }
  return { vision, assistant, image, video };
}
