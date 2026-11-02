import type { AssembledSalesPrompt, SalesBgmCandidate, SalesImageRef, SalesVoiceCandidate } from '@shared/domain/sales';
import type { SalesProductionPlanState } from './salesProductionDraft';

const visualFields = [
  'scriptId', 'presentationMode', 'imitationMode', 'scriptVideoReference', 'personaId', 'customPersonaBodyUrl', 'customPersonaFaceUrl',
  'sceneId', 'customSceneImageUrl', 'voiceModeOverride', 'beatImageOverrides', 'beatActionIds', 'adaptedSourceKey', 'adaptedPromptVersion',
  'videoModel', 'videoRefMode', 'videoAspectRatio', 'videoResolution', 'videoDurationSec',
] as const;
const voiceFields = ['scriptId', 'presentationMode', 'voiceModeOverride', 'voiceId', 'voiceModel'] as const;
const mixFields = ['bgmId', 'customBgmUrl', 'voiceoverAudioUrl', 'generatedVideoUrl'] as const;
const valueKey = (value: unknown) => JSON.stringify(value);
const narrationKey = (plan: SalesProductionPlanState) => valueKey(plan.adaptedBeats.filter((beat) => beat.spokenLine.trim()).map((beat) => [beat.index, beat.spokenLine]));

const visualBeatsKey = (plan: SalesProductionPlanState) => valueKey(plan.adaptedBeats
  .filter((beat) => beat.subject.trim() || beat.action.trim() || beat.expression?.trim() || beat.transition?.trim() || beat.spokenLine.trim())
  .map((beat) => [beat.index, beat.subject, beat.action, beat.expression, beat.transition, beat.spokenLine]));

/** Editing an upstream choice invalidates its derived media, while a completed task keeps its own result. */
export function patchSalesProductionPlan(plan: SalesProductionPlanState, patch: Partial<SalesProductionPlanState>): SalesProductionPlanState {
  const next = { ...plan, ...patch };
  const changed = (fields: readonly (keyof SalesProductionPlanState)[]) => fields.some((field) => valueKey(plan[field]) !== valueKey(next[field]));
  const visualChanged = changed(visualFields) || visualBeatsKey(plan) !== visualBeatsKey(next);
  const voiceChanged = changed(voiceFields) || narrationKey(plan) !== narrationKey(next);
  const mixChanged = visualChanged || voiceChanged || changed(mixFields);
  if (visualChanged) next.generatedVideoUrl = '';
  if (voiceChanged) next.voiceoverAudioUrl = '';
  if (mixChanged) next.mixedVideoUrl = '';
  return next;
}

export interface SalesProductionOutputKeys { video: string; voice: string; mix: string }

/** Also track resolved library assets and gallery selections, which may change outside patchPlan. */
export function salesProductionOutputKeys(
  assembled: AssembledSalesPrompt,
  plan: SalesProductionPlanState,
  images: readonly SalesImageRef[],
  voice: SalesVoiceCandidate | null,
  bgm: SalesBgmCandidate | null,
  adaptationSourceKey = '',
): SalesProductionOutputKeys {
  return {
    video: valueKey([assembled.enginePrompt, assembled.references, images.map((image) => [image.url, image.view]), visualFields.map((field) => plan[field]), adaptationSourceKey]),
    voice: valueKey([assembled.narrationText, assembled.effectiveVoiceMode, plan.voiceModel, voice?.id, voice?.ttsVoice, voice?.voiceId]),
    mix: valueKey([plan.customBgmUrl || bgm?.id, plan.customBgmUrl || bgm?.audioUrl]),
  };
}

export function staleSalesProductionOutputs(plan: SalesProductionPlanState, previous: SalesProductionOutputKeys, next: SalesProductionOutputKeys): Partial<SalesProductionPlanState> {
  const videoChanged = previous.video !== next.video;
  const voiceChanged = previous.voice !== next.voice;
  return {
    ...(videoChanged && plan.generatedVideoUrl ? { generatedVideoUrl: '' } : {}),
    ...(voiceChanged && plan.voiceoverAudioUrl ? { voiceoverAudioUrl: '' } : {}),
    ...((videoChanged || voiceChanged || previous.mix !== next.mix) && plan.mixedVideoUrl ? { mixedVideoUrl: '' } : {}),
  };
}
