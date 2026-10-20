import { shotReferenceImage, type VideoSalesShot } from '@shared/domain/video-sales';
import { composeSalesVideo } from '../api/videoSalesApi';
import { SalesSubmitUncertainError, generateSalesReferenceFrame, generateSalesShotVideo } from './generateShotAsset';
import { salesComposeAspect, salesComposeResolution, salesResolveRefMode, salesResolveResolution, type SalesRenderPhase } from './salesWorkspace';
import { salesAspectError, salesShotTiming } from './salesTiming';

const CONCURRENCY = 2;

export type { SalesRenderPhase };

export interface SalesRenderGenerators {
  generateFrame: typeof generateSalesReferenceFrame;
  generateVideo: typeof generateSalesShotVideo;
  compose: typeof composeSalesVideo;
}

const defaultGenerators: SalesRenderGenerators = {
  generateFrame: generateSalesReferenceFrame,
  generateVideo: generateSalesShotVideo,
  compose: composeSalesVideo,
};

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
    onTaskId?: (taskId: string) => void;
  };
  fashion?: {
    prompt: string;
    images: string[];
    duration: number;
    existingTaskId?: string;
    onTaskId?: (taskId: string) => void;
  };
}, generators: SalesRenderGenerators = defaultGenerators): Promise<string> {
  const single = input.single || input.fashion;
  if (single) {
    input.onPhase('generating');
    return generators.generateVideo({
      prompt: single.prompt,
      videoModel: input.videoModel,
      referenceImages: single.images,
      keepAllImages: true,
      duration: single.duration,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      refMode: input.single ? input.refMode : 'omni',
      existingTaskId: input.resumeOnly ? single.existingTaskId : undefined,
      isAborted: () => input.signal.aborted,
      onTaskId: single.onTaskId,
    });
  }
  const videoModel = input.videoModel || 'doubao-seedance-2.5';
  const resolution = salesResolveResolution(videoModel, input.resolution);
  const refMode = salesResolveRefMode(videoModel, input.refMode);
  const aspectError = salesAspectError(videoModel, input.aspectRatio);
  if (aspectError) throw new Error(aspectError);
  const job = { ...input, resolution, refMode };
  if (input.redraw && !input.resumeOnly && input.shots.some(shotNeedsNewFrame)) {
    if (!input.imageModel) throw new Error('请先配置绘图模型');
    input.onPhase('redrawing');
    await mapPool(input.shots.length, CONCURRENCY, async (index) => {
      if (input.signal.aborted) return;
      await redrawShot(job, index, generators);
    });
    if (input.signal.aborted) throw new DOMException('已停止继续提交', 'AbortError');
  }
  input.onPhase('generating');
  await mapPool(input.shots.length, CONCURRENCY, async (index) => {
    if (input.signal.aborted) return;
    await renderShot(job, index, generators);
  });
  if (input.signal.aborted) throw new DOMException('已停止继续提交', 'AbortError');
  const shots = input.getShots();
  if (input.resumeOnly && shots.some((shot) => !shot.assetUrl)) return '';
  if (shots.some((shot) => shot.status === 'uncertain')) throw new Error('有镜头的提交结果未确认，请核对后再继续');
  if (shots.some((shot) => !shot.assetUrl)) throw new Error('还有镜头没有生成视频');
  if (input.signal.aborted) throw new DOMException('已停止继续提交', 'AbortError');
  input.onPhase('composing');
  const latest = input.getShots();
  return generators.compose({
    projectId: `sales${Date.now()}`,
    clips: latest.map((shot) => ({
      type: 'video' as const,
      filePath: shot.assetUrl || '',
      duration: shot.duration,
      transition: shot.transition === 'ffmpeg_fade' ? 'ffmpeg_fade' as const : 'direct_concat' as const,
      hasAudio: true,
    })),
    output: { resolution: salesComposeResolution(resolution), aspectRatio: salesComposeAspect(input.aspectRatio), bgmVolume: 0.3 },
  });
}

type RenderJob = Parameters<typeof renderSalesVideo>[0] & { resolution: string; refMode: string };

function shotNeedsNewFrame(shot: VideoSalesShot | undefined): shot is VideoSalesShot {
  if (!shot || shot.visualSource !== 'ai_generate' || shot.status === 'uncertain') return false;
  if (shot.status === 'done' && shot.assetUrl && !shot.promptStale) return false;
  if (shot.taskId && shot.status === 'generating' && !shot.assetUrl) return false;
  return !shot.referenceFrameUrl;
}

async function redrawShot(input: RenderJob, index: number, generators: SalesRenderGenerators): Promise<void> {
  const shot = input.getShots()[index];
  if (!shotNeedsNewFrame(shot)) return;
  const prompt = shot.imagePrompt?.trim() || '';
  const source = shotReferenceImage(shot, input.images, index);
  if (!prompt) {
    input.patchShot(index, { status: 'failed', failReason: '这个镜头还没有绘图提示词' });
    return;
  }
  if (!source) {
    input.patchShot(index, { status: 'failed', failReason: '这个镜头还没有参考图' });
    return;
  }
  input.patchShot(index, { status: 'redrawing', failReason: undefined });
  try {
    const url = await generators.generateFrame({
      prompt,
      imageModel: input.imageModel,
      referenceImage: source,
      aspectRatio: input.aspectRatio,
      isAborted: () => input.signal.aborted,
    });
    input.patchShot(index, { referenceFrameUrl: url, status: 'pending', failReason: undefined });
  } catch (err) {
    if (input.signal.aborted) {
      const current = input.getShots()[index];
      if (current?.status === 'redrawing') input.patchShot(index, { status: 'pending' });
      return;
    }
    input.patchShot(index, { status: 'failed', failReason: err instanceof Error ? err.message : '参考图重绘失败' });
  }
}

async function renderShot(input: RenderJob, index: number, generators: SalesRenderGenerators): Promise<void> {
  const shot = input.getShots()[index];
  if (!shot || shot.status === 'uncertain') return;
  if (shot.status === 'done' && shot.assetUrl && !shot.promptStale) return;
  const resumePoll = Boolean(shot.taskId && shot.status === 'generating' && !shot.assetUrl);
  if (input.resumeOnly && !resumePoll) return;
  const reference = input.redraw && shot.visualSource === 'ai_generate'
    ? shot.referenceFrameUrl || ''
    : shotReferenceImage(shot, input.images, index);
  if (!resumePoll && !reference) {
    if (shot.status !== 'failed') input.patchShot(index, { status: 'failed', failReason: '这个镜头还没有参考图' });
    return;
  }
  const videoModel = input.videoModel || 'doubao-seedance-2.5';
  const timing = salesShotTiming(videoModel, shot.duration);
  input.patchShot(index, { status: 'generating', modelDuration: timing.modelDuration, failReason: undefined, duration: timing.keepDuration });
  try {
    const url = await generators.generateVideo({
      prompt: shot.finalPrompt || shot.prompt || shot.description,
      videoModel,
      referenceImage: reference,
      duration: timing.modelDuration,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      refMode: input.refMode,
      existingTaskId: resumePoll ? shot.taskId : undefined,
      isAborted: () => input.signal.aborted,
      onTaskId: (taskId) => input.patchShot(index, { taskId, status: 'generating' }),
    });
    if (input.signal.aborted) return;
    input.patchShot(index, { status: 'done', assetUrl: url, failReason: undefined });
  } catch (err) {
    if (input.signal.aborted) return;
    if (err instanceof SalesSubmitUncertainError) {
      input.patchShot(index, { status: 'uncertain', failReason: err.message });
      return;
    }
    input.patchShot(index, { status: 'failed', failReason: err instanceof Error ? err.message : '视频生成失败' });
  }
}

async function mapPool(count: number, limit: number, worker: (index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, count) }, async () => {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      await worker(index);
    }
  });
  await Promise.all(runners);
}
