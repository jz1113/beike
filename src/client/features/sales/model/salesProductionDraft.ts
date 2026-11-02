import type { SalesAdaptedBeat, SalesImitationMode, SalesPresentationMode } from '@shared/domain/sales';

export interface SalesProductionPlanState {
  scriptId: string;
  presentationMode: SalesPresentationMode;
  imitationMode: SalesImitationMode;
  scriptVideoReference: 'none' | 'depth';
  personaId: string;
  customPersonaBodyUrl: string;
  customPersonaFaceUrl: string;
  sceneId: string;
  customSceneImageUrl: string;
  voiceId: string;
  bgmId: string;
  customBgmUrl: string;
  voiceModeOverride: '' | 'speech' | 'voiceover' | 'none';
  beatImageOverrides: Record<number, string>;
  beatActionIds: Record<number, string>;
  adaptedBeats: SalesAdaptedBeat[];
  adaptedSourceKey: string;
  adaptedPromptVersion: string;
  customPrompt: string;
  videoModel: string;
  videoRefMode: string;
  videoAspectRatio: string;
  videoResolution: string;
  videoDurationSec: number;
  voiceModel: string;
  voiceoverAudioUrl: string;
  generatedVideoUrl: string;
  mixedVideoUrl: string;
}

export function emptySalesProductionPlan(): SalesProductionPlanState {
  return {
    scriptId: '',
    presentationMode: 'subtitled_intro',
    imitationMode: 'script_only',
    scriptVideoReference: 'none',
    personaId: '',
    customPersonaBodyUrl: '',
    customPersonaFaceUrl: '',
    sceneId: '',
    customSceneImageUrl: '',
    voiceId: '',
    bgmId: '',
    customBgmUrl: '',
    voiceModeOverride: '',
    beatImageOverrides: {},
    beatActionIds: {},
    adaptedBeats: [],
    adaptedSourceKey: '',
    adaptedPromptVersion: '',
    customPrompt: '',
    videoModel: 'doubao-seedance-2.5',
    videoRefMode: '',
    videoAspectRatio: '',
    videoResolution: '',
    videoDurationSec: 0,
    voiceModel: 'speech-2.8-hd',
    voiceoverAudioUrl: '',
    generatedVideoUrl: '',
    mixedVideoUrl: '',
  };
}

/** Keep reusable material and mode choices, but start new script content and output from scratch. */
export function planForSelectedScript(plan: SalesProductionPlanState, scriptId: string): SalesProductionPlanState {
  if (plan.scriptId === scriptId) return plan;
  return {
    ...plan,
    scriptId,
    scriptVideoReference: 'none',
    imitationMode: 'script_only',
    adaptedBeats: [],
    adaptedSourceKey: '',
    adaptedPromptVersion: '',
    beatImageOverrides: {},
    beatActionIds: {},
    customPrompt: '',
    voiceoverAudioUrl: '',
    generatedVideoUrl: '',
    mixedVideoUrl: '',
  };
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asText = (v: unknown, max = 4096): string =>
  typeof v === 'string' ? v.slice(0, max) : '';

export function parseSalesProductionPlan(value: unknown): SalesProductionPlanState {
  const raw = asRecord(value);
  const base = emptySalesProductionPlan();
  const overridesRaw = asRecord(raw.beatImageOverrides);
  const beatImageOverrides: Record<number, string> = {};
  for (const [k, v] of Object.entries(overridesRaw)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0 && idx < 64 && typeof v === 'string' && v.trim()) {
      beatImageOverrides[idx] = v.trim().slice(0, 4096);
    }
  }
  const adaptedBeats: SalesAdaptedBeat[] = Array.isArray(raw.adaptedBeats)
    ? raw.adaptedBeats
        .map((item, i) => {
          const r = asRecord(item);
          const action = asText(r.action, 2000).trim();
          if (![action, r.subject, r.expression, r.transition, r.spokenLine, r.subtitle].some((value) => typeof value === 'string' && value.trim())) return null;
          return {
            index: typeof r.index === 'number' && Number.isInteger(r.index) ? r.index : i,
            subject: asText(r.subject, 1000),
            action,
            ...(typeof r.expression === 'string' ? { expression: asText(r.expression, 600) } : {}),
            ...(typeof r.transition === 'string' ? { transition: asText(r.transition, 400) } : {}),
            spokenLine: asText(r.spokenLine, 1000),
            subtitle: asText(r.subtitle, 400),
          };
        })
        .filter((item): item is SalesAdaptedBeat => Boolean(item))
    : [];
  const voiceMode = asText(raw.voiceModeOverride, 20);
  const presentationMode = asText(raw.presentationMode, 30);
  // Legacy source-video and per-beat modes remain readable, but never silently
  // attach those media to new production requests.
  const useDepthVideo = raw.imitationMode === 'depth_imitation' && raw.scriptVideoReference === 'depth';
  return {
    scriptId: asText(raw.scriptId, 120),
    presentationMode: presentationMode === 'clean_visual' ? 'clean_visual' : 'subtitled_intro',
    imitationMode: useDepthVideo ? 'depth_imitation' : 'script_only',
    scriptVideoReference: useDepthVideo ? 'depth' : 'none',
    personaId: asText(raw.personaId, 120),
    customPersonaBodyUrl: asText(raw.customPersonaBodyUrl),
    customPersonaFaceUrl: asText(raw.customPersonaFaceUrl),
    sceneId: asText(raw.sceneId, 120),
    customSceneImageUrl: asText(raw.customSceneImageUrl),
    voiceId: asText(raw.voiceId, 120),
    bgmId: asText(raw.bgmId, 120),
    customBgmUrl: asText(raw.customBgmUrl),
    voiceModeOverride: ['speech', 'voiceover', 'none'].includes(voiceMode)
      ? (voiceMode as SalesProductionPlanState['voiceModeOverride'])
      : '',
    beatImageOverrides,
    beatActionIds: Object.fromEntries(Object.entries(asRecord(raw.beatActionIds)).filter(([key, value]) => Number.isInteger(Number(key)) && Number(key) >= 0 && Number(key) < 64 && typeof value === 'string' && value.length <= 120)) as Record<number, string>,
    adaptedBeats,
    adaptedSourceKey: asText(raw.adaptedSourceKey, 400_000),
    adaptedPromptVersion: asText(raw.adaptedPromptVersion, 200).trim(),
    customPrompt: asText(raw.customPrompt, 20_000),
    videoModel: asText(raw.videoModel, 200) || base.videoModel,
    videoRefMode: ['omni', 'first_frame', 'first_last_frame', 'text', 'edit', 'extend'].includes(String(raw.videoRefMode)) ? String(raw.videoRefMode) : '',
    videoAspectRatio: asText(raw.videoAspectRatio, 20),
    videoResolution: asText(raw.videoResolution, 10),
    videoDurationSec: typeof raw.videoDurationSec === 'number' && Number.isFinite(raw.videoDurationSec) && raw.videoDurationSec > 0 ? Math.ceil(raw.videoDurationSec) : 0,
    voiceModel: asText(raw.voiceModel, 200) || base.voiceModel,
    voiceoverAudioUrl: asText(raw.voiceoverAudioUrl),
    generatedVideoUrl: asText(raw.generatedVideoUrl),
    mixedVideoUrl: asText(raw.mixedVideoUrl),
  };
}
