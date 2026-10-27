import { describe, expect, it } from 'vitest';
import type { WorkshopBatchSummary } from '@shared/contracts/workshopBatches';
import { batchHistoryCode, batchHistoryProductSummary, batchHistoryProgress, batchHistoryTitle, filterBatchHistory } from './batchHistory';

const batch = (overrides: Partial<WorkshopBatchSummary> = {}): WorkshopBatchSummary => ({
  id: 'batch_a12345', name: '未命名新批次', status: 'archived', revision: 1,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-24T02:00:00.000Z',
  itemCount: 2, readyCount: 2, taskCount: 8, resultCount: 4, failedCount: 1,
  productTitles: ['休闲斜挎包', '棉质衬衫'], productIds: ['123456789', '987654321'], ...overrides,
});

describe('batch history browsing', () => {
  it('keeps batch identity independent of product titles, including legacy unnamed records', () => {
    expect(batchHistoryTitle(batch())).toBe('未命名批次 · 20261001');
    expect(batchHistoryTitle(batch({ name: '秋季新品' }))).toBe('秋季新品');
    expect(batchHistoryTitle(batch({ name: '未命名的秋季方案' }))).toBe('未命名的秋季方案');
    expect(batchHistoryTitle(batch({ productTitles: [], itemCount: 0 }))).toBe(batchHistoryTitle(batch()));
    expect(batchHistoryProductSummary(batch())).toBe('休闲斜挎包 等 2 款');
    expect(batchHistoryProductSummary(batch({ productTitles: [], itemCount: 0, hasInput: true }))).toBe('已保存输入，等待采集商品');
    expect(batchHistoryProductSummary(batch({ productTitles: undefined }))).toBe('2 款商品');
    expect(batchHistoryCode(batch({ createdAt: '2026-10-01T23:00:00.000Z' }))).toBe('EC-20261002-A12345');
  });
  it('searches every product and SKU, combines search terms and omits the active batch', () => {
    const rows = [batch(), batch({ id: 'active' })];
    expect(filterBatchHistory(rows, 'active', '棉质 987654', 'all', 'recent').map(row => row.id)).toEqual(['batch_a12345']);
    expect(filterBatchHistory(rows, 'active', 'not-found', 'all', 'recent')).toEqual([]);
    expect(filterBatchHistory(rows, 'active', 'EC-20261001-A12345', 'all', 'recent')).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });
  it('filters by actual usable outputs rather than archived status or planned shots', () => {
    const rows = [batch(), batch({ id: 'complete', resultCount: 8, failedCount: 0 }), batch({ id: 'empty', itemCount: 0, taskCount: 0, resultCount: 0, failedCount: 0 }), batch({ id: 'planned', taskCount: 0, resultCount: 0, failedCount: 0 }), batch({ id: 'typed', itemCount: 0, taskCount: 0, resultCount: 0, failedCount: 0, hasInput: true })];
    const ids = (filter: Parameters<typeof filterBatchHistory>[3]) => filterBatchHistory(rows, undefined, '', filter, 'recent').map(row => row.id);
    expect(ids('results')).toEqual(['batch_a12345', 'complete']);
    expect(ids('unfinished')).toEqual(['batch_a12345', 'planned', 'typed']);
    expect(ids('empty')).toEqual(['empty']);
    expect(ids('failed')).toEqual(['batch_a12345']);
    expect(batchHistoryProgress(rows[1])).toBe('图片齐备');
    expect(batchHistoryProgress(rows[0])).toBe('有失败');
  });
  it('sorts deterministically without mutating the server order and supports older summaries', () => {
    const rows = [batch({ id: 'old', updatedAt: '2026-10-20T02:00:00.000Z', resultCount: undefined }), batch({ id: 'new' })];
    expect(filterBatchHistory(rows, undefined, '', 'all', 'recent').map(row => row.id)).toEqual(['new', 'old']);
    expect(filterBatchHistory(rows, undefined, '', 'all', 'oldest').map(row => row.id)).toEqual(['old', 'new']);
    expect(rows[0].id).toBe('old');
    expect(filterBatchHistory([batch({ name: 'B' }), batch({ id: 'a', name: 'A' })], undefined, '', 'all', 'name').map(row => row.id)).toEqual(['a', 'batch_a12345']);
    expect(filterBatchHistory([batch({ id: 'earlier', createdAt: '2026-09-01T00:00:00.000Z' }), batch({ id: 'later' })], undefined, '', 'all', 'created').map(row => row.id)).toEqual(['later', 'earlier']);
  });
});
