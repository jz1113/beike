import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';

export type PromptPreferencesTab = 'video' | 'image' | 'reasoning';

export type VideoAspectOption = 'smart' | '21:9' | '16:9' | '3:2' | '4:3' | '1:1' | '3:4' | '2:3' | '9:16';
export type VideoResolutionOption = '480P' | '720P' | '1080P' | '4K';
export type VideoDurationMode = 'smart' | 'custom';
export type PreferenceGenerationMode = 'normal' | 'auto';

export interface PromptVideoPreferences {
  modelId: string; // 'smart' 或具体模型 id
  aspect: VideoAspectOption;
  resolution: VideoResolutionOption;
  durationMode: VideoDurationMode;
  customDurationSec: number; // 4 ~ 180 秒
  generationMode: PreferenceGenerationMode;
}

export type ImageAspectOption = 'smart' | '21:9' | '16:9' | '3:2' | '4:3' | '1:1' | '3:4' | '2:3' | '9:16';
export type ImageResolutionOption = '1K' | '2K' | '4K';
export type ImageInferenceStrength = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PromptImagePreferences {
  modelId: string; // 'smart' 或具体模型 id
  aspect: ImageAspectOption;
  resolution: ImageResolutionOption;
  inferenceStrength: ImageInferenceStrength;
}

export interface PromptReasoningPreferences {
  modelId: string; // 如 'deepseek-v4-flash' 或具体模型 id
  reasoningEffort: ReasoningEffort;
  generationMode: PreferenceGenerationMode;
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
  },
  image: {
    modelId: 'smart',
    aspect: '9:16',
    resolution: '2K',
    inferenceStrength: 'low',
  },
  reasoning: {
    modelId: 'deepseek-v4-flash',
    reasoningEffort: 'medium',
    generationMode: 'normal',
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
      video: { ...DEFAULT_PROMPT_PREFERENCES.video, ...parsed.video },
      image: { ...DEFAULT_PROMPT_PREFERENCES.image, ...parsed.image },
      reasoning: {
        ...DEFAULT_PROMPT_PREFERENCES.reasoning,
        ...parsed.reasoning,
        reasoningEffort: parsed.reasoning?.reasoningEffort || DEFAULT_PROMPT_PREFERENCES.reasoning.reasoningEffort,
      },
      audio: { ...DEFAULT_PROMPT_PREFERENCES.audio, ...parsed.audio },
    };
  } catch {
    return DEFAULT_PROMPT_PREFERENCES;
  }
}

export function savePromptPreferences(prefs: PromptComposerPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
