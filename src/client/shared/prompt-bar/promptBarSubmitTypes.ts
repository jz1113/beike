import type { GenerationTask } from '@client/store';
import type { DepthQuality, DepthVideoStyle, QuickGenMode } from '@shared/domain/media/depthVideo';
import type { SubjectItem } from './promptBarConstants';

export interface PromptBarSubmitInput {
  quickGenMode: QuickGenMode;
  quickPrompt: string;
  quickRefImages: string[];
  activeSubjects: SubjectItem[];
  allSubjects: SubjectItem[];
  quickVideoRefMode: string;
  quickVideoFirstFrame: string | null;
  quickVideoLastFrame: string | null;
  quickVideoMultiFrames: string[];
  quickCount: number;
  quickVideoCount: number;
  quickModel: string;
  quickVideoModel: string;
  sizeStr: string;
  quickQuality: string;
  quickVideoAspectId: string;
  quickVideoResolution: string;
  quickVideoDuration: number;
  currentView: string;
  hasImageModels: boolean;
  hasVideoModels?: boolean;
  hasAudioModels?: boolean;
  quickAudioModel?: string;
  assistantModel?: string;
  quickDepthStyle: DepthVideoStyle;
  quickDepthQuality: DepthQuality;
  quickVideoGenerateAudio?: boolean;
  refMediaFile?: File | null;
  depthModelReady?: boolean;
}

export type PromptBarSubmitResult =
  | { ok: false; error: string }
  | {
      ok: true;
      tasks: GenerationTask[];
      cleanedPrompt: string;
      sessionTitle: string;
      shouldCreateNewSession: boolean;
    };
