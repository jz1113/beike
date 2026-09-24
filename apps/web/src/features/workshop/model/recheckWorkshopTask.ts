import { apiFetch, storageConfigHeaders } from '@/shared/api/apiClient';
import { runGridImageTask } from './batchGridGeneration';
import type { BatchProductItem } from './batchTypes';
import type { TaskExecutionConfig } from './batchTaskExecution';

export interface GridRecoverySettings {
  selectedAspect: TaskExecutionConfig['selectedAspect'];
  selectedQuality: TaskExecutionConfig['selectedQuality'];
  selectedImageGenModel: string;
}

const gridRecovery = new Set<string>();

/** Queries the original upstream task only; never submits a new generation. */
export async function recheckWorkshopTask(itemId: string, taskId: string, items: BatchProductItem[], setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>, showToast: (message: string) => void, settings?: GridRecoverySettings) {
  const item = items.find((entry) => entry.id === itemId);
  const task = item?.tasks.find((entry) => entry.id === taskId);
  const recoverFromMaster = Boolean(task && !task.upstreamTaskId && !task.gridTaskKey && !task.gridSourceUrl && item?.masterGridUrl);
  if (task && (task.gridTaskKey || task.gridSourceUrl || recoverFromMaster)) {
    if (gridRecovery.has(itemId)) return;
    const failed = new Set(item!.tasks.filter(entry => entry.status === 'FAILURE' && (recoverFromMaster
      ? !entry.gridTaskKey && !entry.gridSourceUrl && !entry.upstreamTaskId
      : entry.gridTaskKey === task.gridTaskKey && entry.gridSourceUrl === task.gridSourceUrl)).map(entry => entry.shot_no));
    gridRecovery.add(itemId);
    let recovered = 0;
    try {
      await runGridImageTask(item!, item!.prompts.filter(shot => failed.has(shot.shot_no)), {
        selectedAspect: settings?.selectedAspect || '3:4',
        selectedQuality: settings?.selectedQuality || 'high',
        selectedImageGenModel: settings?.selectedImageGenModel || 'gpt-image-2',
        selectedShotCount: 4,
        isAborted: () => false, idempotencyKey: task.gridTaskKey,
      }, setItems, (ok,n) => { if (ok) recovered += n; }, true);
      showToast(recovered ? `已恢复 ${recovered} 张分镜，未重新提交生图` : '原结果尚未恢复，请查看分镜中的具体原因；未重新提交生图');
    } finally { gridRecovery.delete(itemId); }
    return;
  }
  if (!task?.upstreamTaskId) { showToast('旧任务未保存上游任务 ID，无法自动核对，请先核对网关记录'); return; }
  try {
    const response = await apiFetch(`/api/generate/image?taskId=${encodeURIComponent(task.upstreamTaskId)}&recheck_failed=1`, { headers: storageConfigHeaders() });
    const data = await response.json();
    if (!response.ok || data.status === 'QUERY_FAILED') throw new Error(data.error || '原任务暂时无法查询，请稍后再核对');
    if (data.status === 'SUCCESS' && typeof data.resultUrl === 'string' && data.resultUrl) {
      setItems((previous) => previous.map((item) => item.id === itemId ? { ...item, tasks: item.tasks.map((entry) =>
        entry.id === taskId && entry.upstreamTaskId === task.upstreamTaskId && entry.idempotencyKey === task.idempotencyKey && entry.status === 'FAILURE'
          ? { ...entry, status: 'SUCCESS', resultUrl: data.resultUrl, temporaryUrl: Boolean(data.temporaryUrl), error: undefined, recoveryRequired: false } : entry) } : item));
      showToast('原任务已成功，已恢复成图；未重新生成');
    } else showToast(data.status === 'FAILURE' ? `原任务返回失败：${data.failReason || '请查看网关任务记录'}` : '原任务仍在处理，稍后可再次核对；未重新生成');
  } catch (error) { showToast(error instanceof Error ? error.message : '查询失败，请稍后核对原任务'); }
}
