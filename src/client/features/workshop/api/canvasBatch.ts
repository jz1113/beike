import { apiFetch } from '@client/shared/api/apiClient';

/** Negotiate before POST: older APIs otherwise treat a canvas request as a legacy batch switch. */
export async function requestCanvasWorkshopBatch(input: { canvasProjectId: string; sourceBatchId?: string; name?: string }) {
  const capabilities = await apiFetch('/api/catalog/workshop-batches');
  const data = await capabilities.json();
  if (!capabilities.ok) throw new Error(data.error || '项目服务读取失败，请重试');
  if (data.canvasProjects !== true) throw new Error('本地 API 尚未更新到画布图文版本，请重启本地服务后重试；未创建或切换旧批次');
  return apiFetch('/api/catalog/workshop-batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}
