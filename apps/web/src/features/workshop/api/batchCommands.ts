import type { WorkshopBatchEvent } from '@beike/contracts/workshopPipeline';
import { apiFetch } from '@/shared/api/apiClient';

export async function dispatchBatchEvent(batchId: string, revision: number, event: WorkshopBatchEvent) {
  const response = await apiFetch(`/api/catalog/workshop-batches/${batchId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, event }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || '批次事件提交失败');
  }
  return data;
}

export async function reviewWorkshopTask(
  taskId: string,
  body: { decision: 'accepted' | 'retry_requested' | 'rejected'; note?: string },
) {
  const response = await apiFetch(`/api/workshop/tasks/${encodeURIComponent(taskId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || '审核提交失败');
  }
  return data;
}
