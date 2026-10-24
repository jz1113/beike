export type ModelCapability = 'image' | 'video' | 'multimodal';

export type ModelVendorId =
  | 'openai'
  | 'google'
  | 'bytedance'
  | 'alibaba'
  | 'midjourney'
  | 'bfl'
  | 'kuaishou'
  | 'xai'
  | 'minimax'
  | 'anthropic'
  | 'deepseek'
  | 'moonshot'
  | 'vidu';

export type VideoAudioSupportType = 'controllable' | 'default_off' | 'prompt_controlled';

export interface ApprovedModel {
  id: string;
  capability: ModelCapability;
  vendor: ModelVendorId;
  name: string;
  shortName: string;
  adapter: string;
  docs: string;
  badge?: string;
  description?: string;
  isPrimary?: boolean;
  isThinking?: boolean;
  supportedQualities?: Array<'max' | 'xhigh' | 'high' | 'medium' | 'low'>;
  defaultSize?: string;
  supportEdits?: boolean;
  supportedDurations?: number[];
  supportedResolutions?: Array<'480P' | '540P' | '720P' | '1080P' | '2K' | '4K'>;
  supportedAspectRatios?: string[];
  audioSupport?: VideoAudioSupportType;
}

export function rangeDurations(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i += 1) out.push(i);
  return out;
}

export const IMAGE_QUALITIES = ['high', 'medium', 'low'] as const;
export const GPT_IMAGE_25_QUALITIES = ['high', 'medium', 'low', 'xhigh', 'max'] as const;
export const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
