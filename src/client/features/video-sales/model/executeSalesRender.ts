import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { salesActualReferences, type VideoSalesScript, type VideoSalesShot } from '@shared/domain/video-sales';
import { renderSalesVideo, type SalesRenderGenerators, type SalesRenderPhase } from './renderSalesVideo';
import { SalesSubmitUncertainError } from './salesSubmitError';
import { assertSalesPlanCurrent, salesSingleVideoError } from './salesStageRules';
import type { VideoSalesStudioState } from './salesStudioDraft';

export type SalesRenderSnapshot = VideoSalesStudioState;

export async function executeSalesRender(input: {
  resumeOnly: boolean;
  signal: AbortSignal;
  script: VideoSalesScript;
  current: SalesRenderSnapshot;
  getState: () => SalesRenderSnapshot;
  replaceScript: (script: VideoSalesScript) => void;
  commitScript: (recipe: (script: VideoSalesScript) => VideoSalesScript, extra?: { composedResultUrl?: string | null }) => void;
  patchShot: (index: number, patch: Partial<VideoSalesShot>) => void;
  onPhase: (phase: SalesRenderPhase) => void;
  onPromptPhase: () => void;
  onResult: (url: string) => void;
}, generators: SalesRenderGenerators): Promise<void> {
  const { script, current } = input;
  const resumeTask = script.renderTaskId && (script.renderStatus === 'generating' || script.renderStatus === 'uncertain');
  if (resumeTask) {
    input.onPhase('generating');
    // Query a receipt before checking today's draft: already-submitted work keeps its original inputs.
    const snapshot = script.renderSnapshot;
    try {
      const url = await generators.generateVideo({
        existingTaskId: script.renderTaskId, prompt: snapshot?.prompt || '', duration: snapshot?.duration || script.totalDuration,
        videoModel: snapshot?.model, isAborted: () => input.signal.aborted,
      });
      input.commitScript((previous) => ({ ...previous, renderStatus: 'done', renderResultUrl: url, renderError: undefined }), { composedResultUrl: url });
      if (!input.signal.aborted) input.onResult(url);
    } catch (err) {
      input.commitScript((previous) => ({ ...previous,
        renderStatus: err instanceof Error && err.name === 'ImageGenBusinessError' ? 'failed' : 'generating',
        renderError: err instanceof Error ? err.message : '原任务结果未确认',
      }));
      throw err;
    }
    return;
  }
  if (input.resumeOnly) {
    if (script.shots.some((shot) => shot.taskId && shot.status === 'generating')) {
      const url = await renderSalesVideo({
        shots: script.shots, images: current.productImages, videoModel: current.selectedVideoModel,
        aspectRatio: current.aspectRatio, resolution: current.videoResolution, refMode: current.videoRefMode,
        redraw: false, resumeOnly: true, signal: input.signal,
        getShots: () => input.getState().scripts[input.getState().selectedScriptIndex]?.shots || [],
        patchShot: input.patchShot, onPhase: input.onPhase,
      }, generators);
      if (url && !input.signal.aborted) input.onResult(url);
    }
    return;
  }
  const error = salesSingleVideoError(current, script, true);
  if (error) throw new Error(error);
  const images = assertSalesPlanCurrent(current, script);
  const references = salesActualReferences(script, images);
  const model = resolveModalityModelRoute('video', current.selectedVideoModel).modelId!;
  const snapshot = {
    model, prompt: script.fullPrompt!, images: references.map((ref) => ref.url), duration: current.targetDuration,
    aspectRatio: current.aspectRatio, resolution: current.videoResolution, refMode: current.videoRefMode,
  };
  input.commitScript((previous) => ({ ...previous, renderStatus: 'generating', renderError: undefined, renderTaskId: undefined, renderSnapshot: snapshot }));
  let receipt: string | undefined;
  try {
    const url = await renderSalesVideo({
      shots: script.shots, images: current.productImages, videoModel: model,
      aspectRatio: snapshot.aspectRatio, resolution: snapshot.resolution, refMode: snapshot.refMode,
      redraw: false, resumeOnly: false, signal: input.signal,
      getShots: () => input.getState().scripts[input.getState().selectedScriptIndex]?.shots || [],
      patchShot: input.patchShot, onPhase: input.onPhase,
      single: {
        prompt: snapshot.prompt, images: snapshot.images, duration: snapshot.duration,
        onTaskId: (taskId) => { receipt = taskId; input.commitScript((previous) => ({ ...previous, renderTaskId: taskId, renderStatus: 'generating' })); },
      },
    }, generators);
    input.commitScript((previous) => ({ ...previous, renderStatus: 'done', renderResultUrl: url, renderError: undefined }), { composedResultUrl: url });
    if (!input.signal.aborted) input.onResult(url);
  } catch (err) {
    const knownFailure = err instanceof Error && err.name === 'ImageGenBusinessError';
    input.commitScript((previous) => ({
      ...previous,
      renderStatus: receipt ? (knownFailure ? 'failed' : 'generating') : (err instanceof SalesSubmitUncertainError || !knownFailure ? 'uncertain' : 'failed'),
      renderError: err instanceof Error ? err.message : '视频结果未确认',
    }));
    throw err;
  }
}
