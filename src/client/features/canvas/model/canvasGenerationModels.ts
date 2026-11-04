import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { getVideoModelById } from '@shared/domain/media/video';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { getEnabledVideoModelsFromSettings, getEnabledImageModelsFromSettings, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';

interface CanvasGenerationModel {
  id: string;
  name: string;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
}

/** Preserve configured channel IDs so the picker and dispatch resolve one route. */
export function loadCanvasGenerationModels(video = false): CanvasGenerationModel[] {
  const synced = video ? modalityPickerSelections('video') : null;
  if (synced) return synced.map((item) => {
    const profile = getVideoModelById(item.modelId, getGatewayClientBaseUrl(item.id));
    return { id: item.id, name: item.name, supportedAspectRatios: profile?.supportedAspectRatios,
      supportedResolutions: profile?.supportedResolutions, supportedDurations: profile?.supportedDurations };
  });
  return (video ? getEnabledVideoModelsFromSettings : getEnabledImageModelsFromSettings)(readWorkflowModelsFromStorage())
    .filter(item => typeof item.id === 'string' && item.id)
    .map(item => ({
      id: String(item.id), name: typeof item.name === 'string' ? item.name : String(item.id),
      supportedAspectRatios: 'supportedAspectRatios' in item ? item.supportedAspectRatios : undefined,
      supportedResolutions: 'supportedResolutions' in item ? item.supportedResolutions : undefined,
      supportedDurations: 'supportedDurations' in item ? item.supportedDurations : undefined,
    }));
}
