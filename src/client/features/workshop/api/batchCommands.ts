import type { WorkshopBatchEvent } from '@shared/contracts/workshopPipeline';
import { apiRequest } from '@client/shared/api/apiRequest';

export async function dispatchBatchEvent(batchId: string, revision: number, event: WorkshopBatchEvent) {
  const response = await apiRequest('POST', '/api/catalog/workshop-batches/{id}/events', {
    pathParams: { id: batchId },
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
  const response = await apiRequest('POST', '/api/workshop/tasks/{taskId}/review', {
    pathParams: { taskId },
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || '审核提交失败');
  }
  return data;
}
