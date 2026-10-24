import { finishWorkshopSingleOutput } from './workshopSingleOutput';
import { apiFetch, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { runGridImageTask } from './batchGridGeneration';
import type { BatchProductItem } from '../batchTypes';
import type { TaskExecutionConfig } from './batchTaskExecution';

export interface GridRecoverySettings {
  selectedAspect: TaskExecutionConfig['selectedAspect'];
  selectedQuality: TaskExecutionConfig['selectedQuality'];
  selectedImageGenModel: string;
  gridOutputSize?: string;
}

const recoveryInFlight = new Set<string>();

/** Queries the original upstream task only; never submits a new generation. */
export async function recheckWorkshopTask(itemId: string, taskId: string, items: BatchProductItem[], setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>, showToast: (message: string) => void, settings?: GridRecoverySettings) {
  const item = items.find(entry => entry.id === itemId);
  const task = item?.tasks.find(entry => entry.id === taskId);
  if (!item || !task || task.status === 'IN_PROGRESS') return;
  const recoverFromMaster = Boolean(!task.upstreamTaskId && !task.idempotencyKey && !task.gridTaskKey && !task.gridSourceUrl && item.masterGridUrl);
  // One recovery per product also prevents simultaneous re-slicing of the same grid.
  if (recoveryInFlight.has(itemId)) return;
  recoveryInFlight.add(itemId);
  try {
    if (task.gridTaskKey || task.gridSourceUrl || recoverFromMaster) {
      const failed = new Set(item.tasks.filter(entry => entry.status === 'FAILURE' && entry.resultStatus !== 'superseded' && (recoverFromMaster
        ? !entry.gridTaskKey && !entry.gridSourceUrl && !entry.upstreamTaskId && !entry.idempotencyKey
        : entry.gridTaskKey === task.gridTaskKey && entry.gridSourceUrl === task.gridSourceUrl)).map(entry => entry.shot_no));
      let recovered = 0;
      await runGridImageTask(item, item.prompts.filter(shot => failed.has(shot.shot_no)), {
        selectedAspect: settings?.selectedAspect || '3:4',
        selectedQuality: settings?.selectedQuality || 'high',
        selectedImageGenModel: settings?.selectedImageGenModel || 'gpt-image-2',
        selectedShotCount: 4,
        gridOutputSize: settings?.gridOutputSize,
        isAborted: () => false, idempotencyKey: task.gridTaskKey,
      }, setItems, (ok, n) => { if (ok) recovered += n; }, true);
      showToast(recovered ? `已恢复 ${recovered} 张分镜，未重新提交生图` : '原结果尚未恢复，请查看分镜中的具体原因；未重新提交生图');
      return;
    }
    const query = task.upstreamTaskId ? `taskId=${encodeURIComponent(task.upstreamTaskId)}`
      : task.idempotencyKey ? `taskKey=${encodeURIComponent(task.idempotencyKey)}` : '';
    if (!query) { showToast('旧任务未保存任务标识，无法自动核对，请先核对网关记录'); return; }
    const modelId = task.learningContext?.model || settings?.selectedImageGenModel;
    const model = modelId ? `&model=${encodeURIComponent(modelId)}` : '';
    const response = await apiFetch(`/api/generate/image?${query}${model}&recheck_failed=1`, {
      headers: { ...getGatewayClientHeaders(modelId), ...storageConfigHeaders() },
    });
    const data = await response.json();
    if (!response.ok || data.status === 'QUERY_FAILED') throw new Error(data.error || '原任务暂时无法查询，请稍后再核对');
    const succeeded = data.status === 'SUCCESS' && typeof data.resultUrl === 'string' && data.resultUrl;
    const output = succeeded ? await finishWorkshopSingleOutput(
      { url: data.resultUrl, temporary: Boolean(data.temporaryUrl) }, task.generationSize, task.outputSize,
      `${item.id}-${task.shot_no}.jpg`,
    ) : undefined;
    const failed = data.status === 'FAILURE';
    setItems(previous => previous.map(product => product.id === itemId ? { ...product, tasks: product.tasks.map(entry => {
      if (entry.id !== taskId || entry.upstreamTaskId !== task.upstreamTaskId || entry.idempotencyKey !== task.idempotencyKey || entry.status !== 'FAILURE') return entry;
      return { ...entry, upstreamTaskId: data.taskId || entry.upstreamTaskId,
        ...(succeeded ? { status: 'SUCCESS' as const, resultUrl: output!.url, temporaryUrl: output!.temporary, error: undefined, recoveryRequired: false }
          : failed ? { recoveryRequired: false, error: data.failReason || '原任务已明确失败，可重新生成' }
            : { recoveryRequired: true, error: '原任务仍在处理中，请稍后再次核对，不要重复生成' }),
      };
    }) } : product));
    showToast(succeeded ? '原任务已成功，已恢复成图；未重新生成'
      : failed ? `原任务已明确失败，可重新生成：${data.failReason || '请查看网关任务记录'}`
        : '原任务仍在处理，稍后可再次核对；未重新生成');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '查询失败，请稍后核对原任务');
  } finally { recoveryInFlight.delete(itemId); }
}
