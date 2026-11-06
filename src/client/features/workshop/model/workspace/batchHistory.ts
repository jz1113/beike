import type { WorkshopBatchSummary } from '@shared/contracts/workshopBatches';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import { isUsableWorkshopResult } from '../generation/workshopReadiness';

export type BatchHistoryFilter = 'all' | 'results' | 'unfinished' | 'failed' | 'empty';
export type BatchHistorySort = 'recent' | 'oldest' | 'created' | 'name';
type HistoryBatch = WorkshopBatchSummary | WorkshopBatch;

function batchDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知日期' : new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date).replaceAll('-', '');
}

export function batchHistoryCode(batch: Pick<HistoryBatch, 'id' | 'createdAt'>) {
  return `EC-${batchDate(batch.createdAt)}-${batch.id.slice(-6).toUpperCase()}`;
}

export function batchHistoryTitle(batch: HistoryBatch) {
  if (batch.name !== '未命名新批次' && batch.name !== '未命名批次') return batch.name;
  return `未命名批次 · ${batchDate(batch.createdAt)}`;
}

export function batchHistoryProductSummary(batch: HistoryBatch) {
  const titles = 'snapshot' in batch ? batch.snapshot.items.map(item => item.title) : batch.productTitles || [];
  const title = titles.find(value => value.trim())?.trim();
  const count = 'snapshot' in batch ? batch.snapshot.items.length : batch.itemCount;
  return title ? count > 1 ? `${title} 等 ${count} 款` : title : count ? `${count} 款商品` : batchHistoryMetrics(batch).hasInput ? '已保存输入，等待采集商品' : '尚未添加商品';
}

export function batchHistoryMetrics(batch: HistoryBatch) {
  if ('snapshot' in batch) {
    const tasks = batch.snapshot.items.flatMap(item => item.tasks).filter(task => task.resultStatus !== 'superseded');
    return { itemCount: batch.snapshot.items.length, hasInput: Boolean(batch.snapshot.batchInputText.trim()),
      taskCount: tasks.length, resultCount: tasks.filter(isUsableWorkshopResult).length,
      failedCount: tasks.filter(task => task.status === 'FAILURE').length };
  }
  return { ...batch, hasInput: Boolean(batch.hasInput), resultCount: batch.resultCount || 0, failedCount: batch.failedCount || 0 };
}

export function batchHistoryProgress(batch: HistoryBatch) {
  const metrics = batchHistoryMetrics(batch);
  if (!metrics.itemCount) return metrics.hasInput ? '待采集' : '空批次';
  if (metrics.failedCount) return '有失败';
  if (metrics.taskCount > 0 && metrics.resultCount >= metrics.taskCount) return '图片齐备';
  if (metrics.resultCount) return '部分成图';
  return metrics.taskCount ? '待生成' : '待准备';
}

export function filterBatchHistory(batches: WorkshopBatchSummary[], activeId: string | undefined, query: string, filter: BatchHistoryFilter, sort: BatchHistorySort) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return batches.filter(batch => {
    if (batch.id === activeId) return false;
    const metrics = batchHistoryMetrics(batch);
    if (filter === 'results' && !metrics.resultCount) return false;
    if (filter === 'failed' && !metrics.failedCount) return false;
    if (filter === 'unfinished' && ((!metrics.itemCount && !metrics.hasInput) || (metrics.taskCount > 0 && metrics.resultCount >= metrics.taskCount))) return false;
    if (filter === 'empty' && (metrics.itemCount !== 0 || metrics.hasInput)) return false;
    const text = [batch.name, batch.id, batchHistoryCode(batch), batchHistoryTitle(batch), ...(batch.productTitles || []), ...(batch.productIds || [])].join(' ').toLowerCase();
    return terms.every(term => text.includes(term));
  }).sort((a, b) => {
    if (sort === 'name') return batchHistoryTitle(a).localeCompare(batchHistoryTitle(b), 'zh-CN') || a.id.localeCompare(b.id);
    const difference = Date.parse(sort === 'created' ? b.createdAt : b.updatedAt) - Date.parse(sort === 'created' ? a.createdAt : a.updatedAt);
    return (sort === 'oldest' ? -difference : difference) || a.id.localeCompare(b.id);
  });
}
