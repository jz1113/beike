import type { SalesVideoLookup } from './salesSubmitError';
import { type SalesRenderPhase } from './salesWorkspace';

export type { SalesRenderPhase };

export interface SalesRenderGenerators {
  generateVideo(input: {
    prompt: string;
    videoModel?: string;
    referenceImage?: string;
    referenceImages?: string[];
    keepAllImages?: boolean;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    refMode?: string;
    existingTaskId?: string;
    submissionKey?: string;
    onTaskId?: (taskId: string) => void;
    isAborted: () => boolean;
  }): Promise<string>;
  lookupSubmission?(key: string, model: string | undefined, isAborted: () => boolean): Promise<SalesVideoLookup>;
}

export async function renderSalesVideo(input: {
  videoModel?: string;
  aspectRatio: string;
  resolution?: string;
  refMode?: string;
  signal: AbortSignal;
  onPhase: (phase: SalesRenderPhase) => void;
  single: {
    prompt: string;
    images: string[];
    duration: number;
    existingTaskId?: string;
    submissionKey?: string;
    onTaskId?: (taskId: string) => void;
  };
}, generators: SalesRenderGenerators): Promise<string> {
  input.onPhase('generating');
  return generators.generateVideo({
    prompt: input.single.prompt,
    videoModel: input.videoModel,
    referenceImages: input.single.images,
    keepAllImages: true,
    duration: input.single.duration,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    refMode: input.refMode,
    existingTaskId: input.single.existingTaskId,
    submissionKey: input.single.submissionKey,
    isAborted: () => input.signal.aborted,
    onTaskId: input.single.onTaskId,
  });
}
