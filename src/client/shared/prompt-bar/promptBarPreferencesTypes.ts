import type { ImageCapabilityResolution } from '@shared/domain/media/imageCapabilities';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';

export type PromptPreferencesTab = 'video' | 'image' | 'reasoning';

export type VideoAspectOption = 'smart' | '21:9' | '16:9' | '3:2' | '4:3' | '1:1' | '3:4' | '2:3' | '9:16';
export type VideoResolutionOption = '360P' | '480P' | '540P' | '720P' | '768P' | '1080P' | '2K' | '4K';
export type VideoDurationMode = 'smart' | 'custom';
export type PreferenceGenerationMode = 'normal' | 'auto';

export interface PromptVideoPreferences {
  modelId: string; // 'smart' 或具体模型 id
  aspect: VideoAspectOption;
  resolution: VideoResolutionOption;
  durationMode: VideoDurationMode;
  customDurationSec: number; // 4 ~ 180 秒
  generationMode: PreferenceGenerationMode;
  contextIrEnabled?: boolean;
  generateAudio?: boolean;
}

export type ImageAspectOption = 'smart' | '21:9' | '16:9' | '3:2' | '4:3' | '1:1' | '3:4' | '2:3' | '9:16' | '5:4' | '4:5' | '4:1' | '1:4' | '8:1' | '1:8';
export type ImageResolutionOption = ImageCapabilityResolution;
export type ImageInferenceStrength = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ImageQualityTier = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PromptImagePreferences {
  modelId: string; // 'smart' 或具体模型 id
  aspect: ImageAspectOption;
  resolution: ImageResolutionOption;
  inferenceStrength: ImageInferenceStrength;
  quality: ImageQualityTier;
}

export interface PromptReasoningPreferences {
  modelId: string; // 如 'deepseek-v4-flash' 或具体模型 id
  reasoningEffort: ReasoningEffort;
}

export type AudioFormatOption = 'mp3' | 'wav' | 'aac' | 'flac';

export interface PromptAudioPreferences {
  format?: AudioFormatOption;
  speed?: number;
  modelId?: string;
  voice?: string;
}

export interface PromptComposerPreferences {
  video: PromptVideoPreferences;
  image: PromptImagePreferences;
  reasoning: PromptReasoningPreferences;
  audio: PromptAudioPreferences;
}

export const DEFAULT_PROMPT_PREFERENCES: PromptComposerPreferences = {
  video: {
    modelId: 'smart',
    aspect: '16:9',
    resolution: '480P',
    durationMode: 'smart',
    customDurationSec: 5,
    generationMode: 'normal',
    contextIrEnabled: true,
  },
  image: {
    modelId: 'smart',
    aspect: '9:16',
    resolution: '2K',
    inferenceStrength: 'low',
    quality: 'high',
  },
  reasoning: {
    modelId: 'deepseek-v4-flash',
    reasoningEffort: 'medium',
  },
  audio: {
    format: 'mp3',
    speed: 1,
  },
};

const STORAGE_KEY = 'beike_prompt_bar_preferences_v1';

export function loadPromptPreferences(): PromptComposerPreferences {
  if (typeof window === 'undefined') return DEFAULT_PROMPT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROMPT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      video: { ...DEFAULT_PROMPT_PREFERENCES.video, ...parsed.video,
        contextIrEnabled: typeof parsed.video?.contextIrEnabled === 'boolean' ? parsed.video.contextIrEnabled : true },
      image: {
        ...DEFAULT_PROMPT_PREFERENCES.image,
        ...parsed.image,
        quality: parsed.image?.quality === 'low' || parsed.image?.quality === 'medium' || parsed.image?.quality === 'high' || parsed.image?.quality === 'xhigh' || parsed.image?.quality === 'max'
          ? parsed.image.quality
          : DEFAULT_PROMPT_PREFERENCES.image.quality,
      },
      reasoning: {
        modelId: parsed.reasoning?.modelId || DEFAULT_PROMPT_PREFERENCES.reasoning.modelId,
        reasoningEffort: parsed.reasoning?.reasoningEffort || DEFAULT_PROMPT_PREFERENCES.reasoning.reasoningEffort,
      },
      audio: { ...DEFAULT_PROMPT_PREFERENCES.audio, ...parsed.audio },
    };
  } catch {
    return DEFAULT_PROMPT_PREFERENCES;
  }
}

export const promptPreferencesChanged = 'beike:prompt-preferences-changed';

export function restoreImagePromptOptions(quality: unknown, strength: unknown) {
  const validTier = (value: unknown): value is ImageQualityTier =>
    value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max';
  if (!validTier(quality) && !validTier(strength)) return;
  const prefs = loadPromptPreferences();
  savePromptPreferences({ ...prefs, image: { ...prefs.image,
    ...(validTier(quality) && { quality }), ...(validTier(strength) && { inferenceStrength: strength }),
  } });
}

export function savePromptPreferences(prefs: PromptComposerPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event(promptPreferencesChanged));
  } catch {
    // ignore
  }
}
