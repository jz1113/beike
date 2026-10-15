export type PromptPreferencesTab = 'video' | 'image' | 'reasoning';

export type VideoAspectOption = 'smart' | '16:9' | '21:9' | '9:16' | '4:3' | '3:4' | '1:1';
export type VideoResolutionOption = '480P' | '720P' | '1080P';
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

export type ImageAspectOption = '21:9' | '9:16' | '4:3' | '3:4' | '1:1' | '16:9';
export type ImageResolutionOption = '1K' | '2K' | '4K';
export type ImageInferenceStrength = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PromptImagePreferences {
  modelId: string; // 'smart' 或具体模型 id
  aspect: ImageAspectOption;
  resolution: ImageResolutionOption;
  inferenceStrength: ImageInferenceStrength;
}

export interface PromptReasoningPreferences {
  modelId: string; // 如 'doubao-seed-2.0-pro'
  generationMode: PreferenceGenerationMode;
}

export interface PromptComposerPreferences {
  video: PromptVideoPreferences;
  image: PromptImagePreferences;
  reasoning: PromptReasoningPreferences;
}

export const DEFAULT_PROMPT_PREFERENCES: PromptComposerPreferences = {
  video: {
    modelId: 'seedance-2.5',
    aspect: '16:9',
    resolution: '720P',
    durationMode: 'smart',
    customDurationSec: 4,
    generationMode: 'normal',
  },
  image: {
    modelId: 'smart-image-2.5-pro',
    aspect: '9:16',
    resolution: '2K',
    inferenceStrength: 'low',
  },
  reasoning: {
    modelId: 'doubao-seed-2.0-pro',
    generationMode: 'normal',
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
      reasoning: { ...DEFAULT_PROMPT_PREFERENCES.reasoning, ...parsed.reasoning },
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
