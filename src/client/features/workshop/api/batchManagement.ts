import { apiFetch } from '@client/shared/api/apiClient';

export interface BatchDeleteResult {
  deletedIds: string[];
  failures: { id: string; message: string }[];
}

export async function deleteWorkshopBatches(ids: string[], fetchBatch = apiFetch): Promise<BatchDeleteResult> {
  const result: BatchDeleteResult = { deletedIds: [], failures: [] };
  for (const id of new Set(ids)) {
    try {
      const response = await fetchBatch(`/api/catalog/workshop-batches/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '批次删除失败');
      result.deletedIds.push(id);
    } catch (error) {
      result.failures.push({ id, message: error instanceof Error ? error.message : '批次删除失败' });
    }
  }
  return result;
}
