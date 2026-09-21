import { VISION_MODELS } from '@beike/domain/vision';
import { IMAGE_GEN_MODELS } from '@beike/domain/drawing';
import {
  getEnabledMultimodalModelsFromSettings,
  getEnabledImageModelsFromSettings,
  getStoredMultimodalModelId,
  repairWorkflowModelsInStorage,
} from '@beike/domain/workflowModels';

export interface ConfiguredModelOption {
  id: string;
  name?: string;
  shortName?: string;
  provider?: string;
}

export function loadSystemConfiguredModels(): {
  availableVisionModels: ConfiguredModelOption[];
  selectedVisionModel: string;
  availableImageModels: ConfiguredModelOption[];
  selectedImageGenModel: string;
} {
  repairWorkflowModelsInStorage();

  let availableVisionModels: ConfiguredModelOption[];
  let selectedVisionModel: string;

  const multimodalFromSettings = getEnabledMultimodalModelsFromSettings();
  if (multimodalFromSettings.length > 0) {
    availableVisionModels = multimodalFromSettings.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      shortName: m.shortName || (m.name || m.id).split(' ')[0],
      provider: m.provider || '多模态',
    }));
    selectedVisionModel = getStoredMultimodalModelId(availableVisionModels[0].id);
  } else {
    availableVisionModels = VISION_MODELS;
    selectedVisionModel = getStoredMultimodalModelId('gemini-3.7-flash');
  }

  let availableImageModels: ConfiguredModelOption[];
  let selectedImageGenModel: string;

  const imageFromSettings = getEnabledImageModelsFromSettings();
  if (imageFromSettings.length > 0) {
    availableImageModels = imageFromSettings.map((m) => ({
      id: String(m.id ?? ''),
      name: typeof m.name === 'string' ? m.name : undefined,
      shortName: typeof m.shortName === 'string' ? m.shortName : undefined,
      provider: typeof m.provider === 'string' ? m.provider : undefined,
    }));
    selectedImageGenModel =
      localStorage.getItem('ai_image_gen_model') ||
      availableImageModels[0]?.id ||
      'gpt-image-2';
  } else {
    availableImageModels = IMAGE_GEN_MODELS;
    selectedImageGenModel = localStorage.getItem('ai_image_gen_model') || 'gpt-image-2';
  }

  return {
    availableVisionModels,
    selectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
  };
}
