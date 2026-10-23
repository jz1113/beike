import type { VideoSalesShot } from '@shared/domain/sales';
import type { SalesFrameGenerator } from './salesAssetHelpers';
import type { SalesVideoLookup } from './salesSubmitError';
import { salesComposeAspect, salesComposeResolution, type SalesRenderPhase } from './salesWorkspace';

export type { SalesRenderPhase };

export interface SalesRenderGenerators {
  generateFrame: SalesFrameGenerator;
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
  compose(body: {
    projectId: string;
    clips: Array<{ type: 'video' | 'image'; filePath: string; duration: number; transition?: string; hasAudio?: boolean }>;
    output: { resolution: '720p' | '1080p'; aspectRatio: '9:16' | '16:9' | '3:4' | '1:1'; bgmVolume?: number };
  }): Promise<string>;
}

export async function renderSalesVideo(input: {
  shots: VideoSalesShot[];
  images: string[];
  videoModel?: string;
  imageModel?: string;
  aspectRatio: string;
  resolution?: string;
  refMode?: string;
  redraw: boolean;
  resumeOnly: boolean;
  signal: AbortSignal;
  getShots: () => VideoSalesShot[];
  patchShot: (index: number, patch: Partial<VideoSalesShot>) => void;
  onPhase: (phase: SalesRenderPhase) => void;
  single?: {
    prompt: string;
    images: string[];
    duration: number;
    existingTaskId?: string;
    submissionKey?: string;
    onTaskId?: (taskId: string) => void;
  };
}, generators: SalesRenderGenerators): Promise<string> {
  if (input.single) {
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
  input.onPhase('generating');
  for (let index = 0; index < input.shots.length; index += 1) {
    if (input.signal.aborted) throw new DOMException('已停止继续提交', 'AbortError');
    await queryHistoricalShot(input, index, generators);
  }
  const shots = input.getShots();
  if (shots.some((shot) => shot.status === 'uncertain' || !shot.assetUrl)) return '';
  input.onPhase('composing');
  return generators.compose({
    projectId: `sales${Date.now()}`,
    clips: input.getShots().map((shot) => ({
      type: 'video' as const,
      filePath: shot.assetUrl || '',
      duration: shot.duration,
      transition: shot.transition === 'ffmpeg_fade' ? 'ffmpeg_fade' as const : 'direct_concat' as const,
      hasAudio: true,
    })),
    output: { resolution: salesComposeResolution(input.resolution), aspectRatio: salesComposeAspect(input.aspectRatio), bgmVolume: 0.3 },
  });
}

async function queryHistoricalShot(input: Parameters<typeof renderSalesVideo>[0], index: number, generators: SalesRenderGenerators): Promise<void> {
  const shot = input.getShots()[index];
  if (!shot || shot.assetUrl || !shot.taskId || shot.status !== 'generating') return;
  try {
    const url = await generators.generateVideo({
      prompt: shot.finalPrompt || shot.prompt || shot.description,
      videoModel: input.videoModel,
      duration: shot.modelDuration || shot.duration,
      existingTaskId: shot.taskId,
      isAborted: () => input.signal.aborted,
    });
    if (!input.signal.aborted) input.patchShot(index, { status: 'done', assetUrl: url, failReason: undefined });
  } catch (err) {
    if (input.signal.aborted) return;
    const failed = err instanceof Error && err.name === 'ImageGenBusinessError';
    input.patchShot(index, { status: failed ? 'failed' : 'generating', failReason: err instanceof Error ? err.message : '原镜头结果未确认' });
  }
}
