import { waitSalesMediaJob } from './salesMediaJobs';
import { pollGenerationTask } from '@client/shared/api/generation/generationApi';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';
import { classifyGenerationPollResult, isTransientPollError } from '@client/shared/api/generation/generationErrors';

export interface SalesVideoTaskReceipt {
  taskId: string;
  model: string;
  modelSelection: string;
  channelTaskId?: string;
}

const text = (value: unknown): string => typeof value === 'string' ? value : '';

/** Resume the accepted task without submitting or paying for a new generation. */
export async function pollSalesVideoTask(
  task: SalesVideoTaskReceipt,
  onProgress: (label: string) => void,
  signal: AbortSignal,
  onReceipt?: (receipt: SalesVideoTaskReceipt) => void | Promise<void>,
): Promise<{ videoUrl: string; taskId: string; channelTaskId?: string }> {
  const { taskId, model, modelSelection } = task;
  if (taskId.startsWith('sales_media_')) {
    const result = await waitSalesMediaJob(taskId, signal, onProgress, (channelTaskId) => onReceipt?.({ ...task, channelTaskId }));
    if (!text(result.resultUrl)) throw new Error('后台视频任务缺少成片地址');
    return { videoUrl: text(result.resultUrl), taskId, channelTaskId: text(result.taskId) || task.channelTaskId };
  }
  const startedAt = Date.now();
  let queryFailures = 0;
  let pollDelay = 3000;
  const elapsed = () => Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const retryQuery = () => {
    queryFailures += 1;
    pollDelay = Math.min(30_000, 3000 * 2 ** Math.min(queryFailures, 4));
    onProgress(`视频状态暂时无法查询，正在重试（${pollDelay / 1000}秒后；任务 ${taskId.slice(-8)} · 已等待 ${elapsed()}s）…`);
  };
  while (true) {
    signal.throwIfAborted();
    await sleepWhilePolling(pollDelay, () => signal.aborted);
    signal.throwIfAborted();
    onProgress(`视频生成中（任务 ${taskId.slice(-8)} · 已等待 ${elapsed()}s）…`);
    let polled: Record<string, unknown>;
    try {
      const data: unknown = await pollGenerationTask(taskId, 'video', model, { modelSelection, signal });
      polled = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
      signal.throwIfAborted();
    } catch (error) {
      signal.throwIfAborted();
      const message = error instanceof Error ? error.message : '查询失败';
      const transient = isTransientPollError(error) || /轮询失败 \((?:408|429|5\d\d)\)/.test(message);
      if (!transient) {
        throw new Error(`视频任务查询中断：${message}（任务 ${taskId}）。原任务可能仍在生成，请到历史记录核对，避免重复提交。`);
      }
      retryQuery();
      continue;
    }
    const outcome = classifyGenerationPollResult(polled, { httpOk: true });
    if (outcome === 'success' && text(polled.resultUrl)) {
      return { videoUrl: text(polled.resultUrl), taskId };
    }
    if (outcome === 'failure') {
      throw new Error(text(polled.failReason) || text(polled.error) || '视频生成任务失败');
    }
    if (polled.retryable === true || text(polled.status).toUpperCase() === 'QUERY_FAILED') {
      retryQuery();
      continue;
    }
    if (polled.progress) onProgress(`视频生成中 ${polled.progress}（任务 ${taskId.slice(-8)} · 已等待 ${elapsed()}s）…`);
    queryFailures = 0;
    pollDelay = elapsed() >= 120 ? 10_000 : 3000;
  }
}
