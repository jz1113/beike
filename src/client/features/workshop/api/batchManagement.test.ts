import { describe, expect, it, vi } from 'vitest';
import { deleteWorkshopBatches } from './batchManagement';

describe('batch deletion', () => {
  it('deduplicates IDs and reports partial failures without losing successful deletions', async () => {
    const fetchBatch = vi.fn()
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ error: '当前批次不能删除' }, { status: 409 }))
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValueOnce(Response.json({ success: true }));
    const result = await deleteWorkshopBatches(['old', 'old', 'active', 'offline', 'last'], fetchBatch);
    expect(result.deletedIds).toEqual(['old', 'last']);
    expect(result.failures).toEqual([{ id: 'active', message: '当前批次不能删除' }, { id: 'offline', message: '网络中断' }]);
    expect(fetchBatch).toHaveBeenCalledTimes(4);
    expect(fetchBatch).toHaveBeenNthCalledWith(2, '/api/catalog/workshop-batches/active', { method: 'DELETE' });
  });
});
