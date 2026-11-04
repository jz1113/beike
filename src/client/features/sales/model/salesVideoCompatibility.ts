import type { ModalityPickerSelection } from '@shared/domain/models/modalityStorage';
import { videoDurationOptions } from '@shared/domain/media/videoCapabilities';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import type { SalesReferenceSlot, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from './salesProductionDraft';
import { resolveSalesVideoSettings } from './salesVideoSettings';
import { resolveSalesProductionTimeline } from './salesProductionTimeline';

export function salesVideoModelPatch(videoModel: string, context?: {
  plan: SalesProductionPlanState;
  script: SalesScriptDomain;
  references: readonly SalesReferenceSlot[];
  audios?: readonly string[];
}): Partial<SalesProductionPlanState> {
  const patch: Partial<SalesProductionPlanState> = { videoModel, videoRefMode: '', videoResolution: '', videoDurationSec: 0, customPrompt: '' };
  if (context) {
    const { plan, script, references, audios } = context;
    const timeline = resolveSalesProductionTimeline(plan, script, references);
    const current = resolveSalesVideoSettings(plan, timeline.script, references, audios);
    const replacement = resolveSalesVideoSettings({ ...plan, ...patch }, script, references, audios);
    // Switching providers should not expand a previously shortened storyboard.
    const durations = videoDurationOptions(replacement.model, replacement.resolution, replacement.refMode, replacement.baseUrl);
    if (durations.includes(current.durationSec)) patch.videoDurationSec = current.durationSec;
  }
  return patch;
}

/** Validate the same defaults applied by the model picker, keeping each configured channel's identity. */
export function compatibleSalesVideoModels(
  plan: SalesProductionPlanState,
  script: SalesScriptDomain,
  references: readonly SalesReferenceSlot[],
  models: readonly ModalityPickerSelection[],
  audios: readonly string[] = [],
) {
  return models.flatMap((option) => {
    const settings = resolveSalesVideoSettings({ ...plan, ...salesVideoModelPatch(option.modelId) }, script, references, audios,
      getGatewayClientBaseUrl(option.entryId || option.id));
    return settings.validationError ? [] : [{ ...option, durationSec: settings.durationSec }];
  });
}
