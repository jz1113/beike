import { APPROVED_MODELS } from '@shared/domain/models/modelCatalog';
import { sortMultimodalModelsByPrice } from './multimodalPriceSort';
import type { WorkflowModel } from './workflowModel';

export const DEFAULT_PRESET_MODELS: WorkflowModel[] = sortMultimodalModelsByPrice(APPROVED_MODELS.map((m) => ({
  id: m.id,
  channel: m.id === 'openai/gpt-image-2' ? 'lianchi' : 'comfly',
  name: m.name,
  shortName: m.shortName,
  badge: m.badge,
  desc: m.description,
  isMultimodal: m.capability === 'multimodal',
  isVision: m.capability === 'multimodal',
  isImage: m.capability === 'image',
  isVideo: m.capability === 'video',
  isAssistant: m.capability === 'multimodal',
  isDistill: m.capability === 'multimodal',
  isThinking: Boolean(m.isThinking),
  isCustom: false,
})));
