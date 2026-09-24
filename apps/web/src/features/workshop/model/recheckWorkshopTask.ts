import { apiFetch, storageConfigHeaders } from '@/shared/api/apiClient';
import type { BatchProductItem } from './batchTypes';

/** Queries the original upstream task only; never submits a new generation. */
export async function recheckWorkshopTask(itemId: string, taskId: string, items: BatchProductItem[], setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>, showToast: (message: string) => void) {
  const task = items.find((item) => item.id === itemId)?.tasks.find((entry) => entry.id === taskId);
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
