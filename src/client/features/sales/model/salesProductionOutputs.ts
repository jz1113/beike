import type { AssembledSalesPrompt, SalesBgmCandidate, SalesImageRef, SalesVoiceCandidate } from '@shared/domain/sales';
import { grokPresetVoicesAllowed } from '@shared/domain/media/grokVoices';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type { SalesProductionPlanState } from './salesProductionDraft';
import { productFaceReferences } from './salesProductFaces';

const visualFields = [
  'scriptId', 'presentationMode', 'imitationMode', 'scriptVideoReference', 'personaId', 'customPersonaBodyUrl', 'customPersonaFaceUrl',
  'sceneId', 'customSceneImageUrl', 'voiceModeOverride', 'beatImageOverrides', 'beatActionIds', 'adaptedSourceKey', 'adaptedPromptVersion',
  'videoModel', 'videoRefMode', 'videoAspectRatio', 'videoResolution', 'videoDurationSec', 'videoContextIrEnabled', 'spokenCopySourceKey', 'spokenCopyPromptVersion',
  'videoVoiceId',
] as const;
const voiceFields = ['presentationMode', 'voiceModeOverride', 'voiceId', 'voiceModel'] as const;
const mixFields = ['bgmId', 'customBgmUrl', 'voiceoverAudioUrl', 'generatedVideoUrl'] as const;
const valueKey = (value: unknown) => JSON.stringify(value);
const fieldValue = (plan: SalesProductionPlanState, field: keyof SalesProductionPlanState) => field === 'videoContextIrEnabled' ? plan[field] ?? true : plan[field];
// The default preserves existing receipt keys; disabling IR adds an explicit visual input.
const visualInputValues = (plan: SalesProductionPlanState) => visualFields
  .filter((field) => (field !== 'videoContextIrEnabled' || plan.videoContextIrEnabled === false)
    && (field !== 'videoVoiceId' || Boolean(plan.videoVoiceId))).map((field) => fieldValue(plan, field));
const narrationKey = (plan: SalesProductionPlanState) => valueKey(plan.adaptedBeats.filter((beat) => beat.spokenLine.trim()).map((beat) => [beat.index, beat.spokenLine]));

const visualBeatsKey = (plan: SalesProductionPlanState) => valueKey(plan.adaptedBeats
  .filter((beat) => beat.subject.trim() || beat.action.trim() || beat.expression?.trim() || beat.transition?.trim() || beat.spokenLine.trim())
  .map((beat) => [beat.index, beat.subject, beat.action, beat.expression, beat.transition, beat.spokenLine]));

/** Editing an upstream choice invalidates its derived media, while a completed task keeps its own result. */
export function patchSalesProductionPlan(plan: SalesProductionPlanState, patch: Partial<SalesProductionPlanState>): SalesProductionPlanState {
  const next = { ...plan, ...patch };
  const changed = (fields: readonly (keyof SalesProductionPlanState)[]) => fields.some((field) => valueKey(fieldValue(plan, field)) !== valueKey(fieldValue(next, field)));
  // Inherited narration is invalidated by the resolved voice key below;
  // speech references stay reusable when only their dialogue changes.
  const voiceChanged = changed(voiceFields)
    || (next.voiceModeOverride !== 'speech' && plan.scriptId !== next.scriptId)
    || (next.voiceModeOverride === 'voiceover' && narrationKey(plan) !== narrationKey(next));
  // An empty override inherits the script; the assembled output key resolves
  // that mode. Do not guess speech and discard an inherited voiceover video.
  const grokPreset = grokPresetVoicesAllowed(upstreamModalityModelId('video', next.videoModel));
  const grokPresetSpeech = grokPreset && Boolean(next.videoVoiceId) && next.presentationMode !== 'clean_visual'
    && next.voiceModeOverride !== 'voiceover' && next.voiceModeOverride !== 'none';
  const nativeSpeech = next.presentationMode !== 'clean_visual' && next.voiceModeOverride === 'speech' && !grokPreset;
  const speechVoiceChanged = nativeSpeech && (voiceChanged || plan.voiceoverAudioUrl !== next.voiceoverAudioUrl);
  const visualChanged = changed(visualFields) || changed(['personaVisualProfile']) || visualBeatsKey(plan) !== visualBeatsKey(next) || speechVoiceChanged;
  // An inherited voiceover still resolves its library dependencies in output keys.
  const mixChanged = visualChanged || (!grokPresetSpeech && voiceChanged)
    || changed(grokPresetSpeech ? mixFields.filter((field) => field !== 'voiceoverAudioUrl') : mixFields);
  if (visualChanged) {
    next.generatedVideoUrl = '';
    next.pendingVideoTask = null;
  }
  if (patch.generatedVideoUrl) next.pendingVideoTask = null;
  if (visualChanged || 'generatedVideoUrl' in patch) next.generatedVideoTaskId = next.generatedVideoUrl ? patch.generatedVideoTaskId || '' : '';
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
  voiceTimingKey = '',
): SalesProductionOutputKeys {
  return {
    video: valueKey([assembled.enginePrompt, productFaceReferences(assembled.references, plan.productFaceEdits), assembled.audios || [], images.map((image) => [image.url, image.view]), visualInputValues(plan), adaptationSourceKey,
      assembled.effectiveVoiceMode === 'speech' ? assembled.voiceIds?.length ? assembled.voiceIds : [plan.voiceId, plan.voiceModel, voice?.id, voice?.sampleAudioUrl, voice?.ttsVoice, voice?.voiceId] : null]),
    voice: assembled.voiceIds?.length ? '' : valueKey([assembled.effectiveVoiceMode === 'voiceover' ? assembled.narrationText : '', assembled.effectiveVoiceMode, plan.voiceModel, voice?.id, voice?.ttsVoice, voice?.voiceId, voice?.sampleAudioUrl,
      assembled.effectiveVoiceMode === 'voiceover' ? voiceTimingKey : '']),
    mix: valueKey([plan.customBgmUrl || bgm?.id, plan.customBgmUrl || bgm?.audioUrl]),
  };
}

export function staleSalesProductionOutputs(plan: SalesProductionPlanState, previous: SalesProductionOutputKeys, next: SalesProductionOutputKeys): Partial<SalesProductionPlanState> {
  const videoChanged = previous.video !== next.video;
  const voiceChanged = next.voice !== '' && previous.voice !== next.voice;
  return {
    ...(videoChanged && plan.generatedVideoUrl ? { generatedVideoUrl: '' } : {}),
    ...(videoChanged && plan.pendingVideoTask ? { pendingVideoTask: null } : {}),
    ...(voiceChanged && plan.voiceoverAudioUrl ? { voiceoverAudioUrl: '' } : {}),
    ...((videoChanged || voiceChanged || previous.mix !== next.mix) && plan.mixedVideoUrl ? { mixedVideoUrl: '' } : {}),
  };
}
