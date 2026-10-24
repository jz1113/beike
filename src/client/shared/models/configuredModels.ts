import { VISION_MODELS, isVisionCapableModel } from '@shared/domain/prompts/vision';
import { IMAGE_GEN_MODELS } from '@shared/domain/media/drawing';
import { modalityPickerSelections, readEffectiveModalityModels } from '@shared/domain/models/modalityStorage';
import {
  hasWorkflowModelConfiguration,
  getEnabledMultimodalModelsFromSettings,
  getEnabledImageModelsFromSettings,
  getStoredMultimodalModelId,
  repairWorkflowModelsInStorage,
  upstreamModelId,
} from '@shared/domain/models/workflowModels';

export interface ConfiguredModelOption {
  id: string;
  name?: string;
  shortName?: string;
  provider?: string;
  upstreamId?: string;
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

  const syncedVision = modalityPickerSelections('chat')?.filter((item) => isVisionCapableModel(item.modelId));
  const multimodalFromSettings = getEnabledMultimodalModelsFromSettings();
  if (syncedVision && syncedVision.length > 0) {
    availableVisionModels = syncedVision.map((m) => ({
      id: m.id,
      upstreamId: m.modelId,
      name: m.name || m.modelId,
      shortName: (m.name || m.modelId).split(' · ')[0],
      provider: m.provider,
    }));
    const chatRead = readEffectiveModalityModels('chat');
    const defaultEntry = chatRead.models.find((item) => item.isDefault);
    const defaultPick = defaultEntry
      ? availableVisionModels.find((m) => m.id === defaultEntry.id || m.upstreamId === defaultEntry.modelId)
      : undefined;
    selectedVisionModel = getStoredMultimodalModelId(defaultPick?.id || availableVisionModels[0]?.id || '');
  } else if (multimodalFromSettings.length > 0 || hasWorkflowModelConfiguration()) {
    availableVisionModels = multimodalFromSettings.map((m) => ({
      id: m.id,
      upstreamId: upstreamModelId(m.id),
      name: m.name || m.id,
      shortName: m.shortName || (m.name || m.id).split(' ')[0],
      provider: m.provider || '多模态',
    }));
    selectedVisionModel = getStoredMultimodalModelId(availableVisionModels[0]?.id || '');
  } else {
    availableVisionModels = VISION_MODELS.map((m) => ({ ...m, upstreamId: m.id }));
    selectedVisionModel = getStoredMultimodalModelId('gemini-3.7-flash');
  }

  let availableImageModels: ConfiguredModelOption[];
  let selectedImageGenModel: string;

  const syncedImage = modalityPickerSelections('image');
  const imageFromSettings = getEnabledImageModelsFromSettings();
  if (syncedImage && syncedImage.length > 0) {
    availableImageModels = syncedImage.map((m) => ({
      id: m.id,
      upstreamId: m.modelId,
      name: m.name || m.modelId,
      shortName: (m.name || m.modelId).split(' · ')[0],
      provider: m.provider,
    }));
    const imageRead = readEffectiveModalityModels('image');
    const defaultEntry = imageRead.models.find((item) => item.isDefault);
    const defaultPick = defaultEntry
      ? availableImageModels.find((m) => m.id === defaultEntry.id || m.upstreamId === defaultEntry.modelId)
      : undefined;
    selectedImageGenModel =
      localStorage.getItem('ai_image_gen_model') ||
      defaultPick?.id ||
      availableImageModels[0]?.id ||
      'gpt-image-2';
  } else if (imageFromSettings.length > 0 || hasWorkflowModelConfiguration()) {
    availableImageModels = imageFromSettings.map((m) => ({
      id: String(m.id ?? ''),
      upstreamId: String(m.id ?? ''),
      name: typeof m.name === 'string' ? m.name : undefined,
      shortName: typeof m.shortName === 'string' ? m.shortName : undefined,
      provider: typeof m.provider === 'string' ? m.provider : undefined,
    }));
    selectedImageGenModel =
      localStorage.getItem('ai_image_gen_model') ||
      availableImageModels[0]?.id ||
      'gpt-image-2';
  } else {
    availableImageModels = IMAGE_GEN_MODELS.map((m) => ({ ...m, upstreamId: m.id }));
    selectedImageGenModel = localStorage.getItem('ai_image_gen_model') || 'gpt-image-2';
  }

  if (!availableVisionModels.some((model) => model.id === selectedVisionModel)) {
    selectedVisionModel = availableVisionModels.find((model) => model.upstreamId === selectedVisionModel)?.id
      || availableVisionModels[0]?.id
      || '';
  }
  if (!availableImageModels.some((model) => model.id === selectedImageGenModel)) {
    selectedImageGenModel = availableImageModels.find((model) => model.upstreamId === selectedImageGenModel)?.id
      || availableImageModels[0]?.id
      || '';
  }

  return {
    availableVisionModels,
    selectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
  };
}
