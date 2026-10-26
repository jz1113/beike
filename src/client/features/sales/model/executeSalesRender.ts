import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { salesActualReferences, type VideoSalesScript } from '@shared/domain/sales';
import { queryHistoricalSalesShots } from './querySalesHistory';
import { renderSalesVideo, type SalesRenderGenerators, type SalesRenderPhase } from './renderSalesVideo';
import { SalesSubmitUncertainError, type SalesVideoLookup } from './salesSubmitError';
import { assertSalesPlanCurrent, salesSingleVideoError } from './salesStageRules';
import type { VideoSalesStudioState } from './salesStudioDraft';

export type SalesRenderSnapshot = VideoSalesStudioState;

export async function executeSalesRender(input: {
  resumeOnly: boolean;
  signal: AbortSignal;
  script: VideoSalesScript;
  current: SalesRenderSnapshot;
  getState: () => SalesRenderSnapshot;
  commitScript: (recipe: (script: VideoSalesScript) => VideoSalesScript, extra?: { composedResultUrl?: string | null }) => void;
  persistScript?: (recipe: (script: VideoSalesScript) => VideoSalesScript, extra?: { composedResultUrl?: string | null }) => void;
  onPhase: (phase: SalesRenderPhase) => void;
  onResult: (url: string) => void;
}, generators: SalesRenderGenerators): Promise<void> {
  const { script, current } = input;
  const open = script.renderStatus === 'generating' || script.renderStatus === 'uncertain';
  const resumeTask = script.renderTaskId && open;
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
  if (script.renderSubmissionKey && open) {
    const found = await recoverSalesSubmission(script, input, generators);
    if (found !== 'missing') return;
    if (input.resumeOnly) throw new Error('尚未找到原视频提交记录，请稍后查询；不会自动重新提交');
  }
  if (script.deliveryMode !== 'single') {
    if (!input.resumeOnly) throw new Error('历史逐镜方案仅支持查询和下载，请更新脚本后生成整段视频');
    input.onPhase('querying');
    await queryHistoricalSalesShots({
      script, signal: input.signal, videoModel: current.selectedVideoModel,
      getShots: () => input.getState().scripts.find((item) => item.id === script.id)?.shots || [],
      patchShot: (index, patch) => input.commitScript((previous) => ({ ...previous, shots: previous.shots.map((shot, ordinal) => ordinal === index ? { ...shot, ...patch } : shot) })),
    }, generators.generateVideo);
    return;
  }
  if (input.resumeOnly) return;
  const error = salesSingleVideoError(current, script, true);
  if (error) throw new Error(error);
  const images = assertSalesPlanCurrent(current, script);
  const references = salesActualReferences(script, images);
  const model = resolveModalityModelRoute('video', current.selectedVideoModel).modelId!;
  const submissionKey = script.renderSubmissionKey && open ? script.renderSubmissionKey : crypto.randomUUID();
  const snapshot = {
    model, prompt: script.fullPrompt!, images: references.map((ref) => ref.url), duration: current.targetDuration,
    aspectRatio: current.aspectRatio, resolution: current.videoResolution, refMode: current.videoRefMode, submissionKey,
  };
  const store = input.persistScript || input.commitScript;
  store((previous) => ({ ...previous, renderStatus: 'generating', renderError: undefined, renderTaskId: undefined, renderSubmissionKey: submissionKey, renderSnapshot: snapshot }));
  let receipt: string | undefined;
  try {
    const url = await renderSalesVideo({
      videoModel: model,
      aspectRatio: snapshot.aspectRatio, resolution: snapshot.resolution, refMode: snapshot.refMode,
      signal: input.signal,
      onPhase: input.onPhase,
      single: {
        prompt: snapshot.prompt, images: snapshot.images, duration: snapshot.duration, submissionKey,
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

async function recoverSalesSubmission(script: VideoSalesScript, input: Parameters<typeof executeSalesRender>[0], generators: SalesRenderGenerators): Promise<SalesVideoLookup['outcome']> {
  if (!generators.lookupSubmission || !script.renderSubmissionKey) return 'missing';
  const found = await generators.lookupSubmission(script.renderSubmissionKey, script.renderSnapshot?.model, () => input.signal.aborted);
  if (found.outcome === 'done' && found.url) {
    input.commitScript((previous) => ({ ...previous, renderTaskId: found.taskId || previous.renderTaskId, renderStatus: 'done', renderResultUrl: found.url, renderError: undefined }), { composedResultUrl: found.url });
    if (!input.signal.aborted) input.onResult(found.url);
    return found.outcome;
  }
  if (found.outcome === 'poll' && found.taskId) {
    input.commitScript((previous) => ({ ...previous, renderTaskId: found.taskId, renderStatus: 'generating', renderError: undefined }));
    const snapshot = script.renderSnapshot;
    let url: string;
    try {
      url = await generators.generateVideo({
        existingTaskId: found.taskId, prompt: snapshot?.prompt || '', duration: snapshot?.duration || script.totalDuration,
        videoModel: snapshot?.model, isAborted: () => input.signal.aborted,
      });
    } catch (err) {
      input.commitScript((previous) => ({ ...previous,
        renderStatus: err instanceof Error && err.name === 'ImageGenBusinessError' ? 'failed' : 'generating',
        renderError: err instanceof Error ? err.message : '原任务结果未确认',
      }));
      throw err;
    }
    input.commitScript((previous) => ({ ...previous, renderStatus: 'done', renderResultUrl: url, renderError: undefined }), { composedResultUrl: url });
    if (!input.signal.aborted) input.onResult(url);
    return found.outcome;
  }
  if (found.outcome === 'failed') {
    input.commitScript((previous) => ({ ...previous, renderTaskId: found.taskId, renderStatus: 'failed', renderError: found.error || '视频生成失败' }));
    throw new Error(found.error || '视频生成失败');
  }
  if (found.outcome === 'pending') throw new Error(found.error || '原视频提交结果待核实，请稍后查询；不会自动重新提交');
  return 'missing';
}
