import { ChevronRight, ImageIcon } from 'lucide-react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import type { WorkshopBatch, WorkshopBatchSummary } from '@beike/contracts/workshopBatches';
import { isUsableWorkshopResult } from '../model/generation/workshopReadiness';

type HistoryProduct = WorkshopBatch['snapshot']['items'][number];

function hasCompletedCopy(item: HistoryProduct) {
  const copy = item.copywriting as { title?: unknown; content?: unknown } | undefined;
  return typeof copy?.title === 'string' && Boolean(copy.title.trim())
    && typeof copy.content === 'string' && Boolean(copy.content.trim());
}

export const batchHistoryStatus = (batch: WorkshopBatchSummary | WorkshopBatch) => ({
  draft: '草稿', collecting: '采集中', plan_ready: '待分析', analyzing: '分析中', review_required: '待确认分镜', approved: '待生成',
  generating: '生成中', qc_required: '待检查成图', partial_failed: '部分失败', paused: '已暂停', completed: '已完成', cancelled: '已取消', archived: '已归档',
}[batch.status]);

export function formatBatchHistoryDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function BatchHistoryRecord({ batch, disabled, onView }: {
  batch: WorkshopBatchSummary; disabled: boolean; onView: () => void;
}) {
  return <button type="button" disabled={disabled} onClick={onView} aria-label={`查看 ${batch.name}`}
    className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/30 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-40">
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="truncate text-sm font-semibold text-slate-900" title={batch.name}>{batch.name}</h3>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{batchHistoryStatus(batch)}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{formatBatchHistoryDate(batch.updatedAt)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        <span>{batch.itemCount} 款商品</span><span>{batch.taskCount} 个分镜任务</span>
      </div>
      <p className="mt-2 truncate font-mono text-[11px] text-slate-400" title={batch.id}>编号 {batch.id}</p>
    </div>
    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-600" />
  </button>;
}

export function BatchHistoryStats({ batch }: { batch: WorkshopBatch }) {
  const items = batch.snapshot.items;
  const tasks = items.flatMap(item => item.tasks).filter(task => task.resultStatus !== 'superseded');
  const stats = [[items.length, '商品'], [tasks.filter(isUsableWorkshopResult).length, '已成图'],
    [items.filter(hasCompletedCopy).length, '文案完成'], [tasks.filter(task => task.status === 'FAILURE').length, '失败分镜']] as const;
  return <dl className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-50 px-2 py-3 text-center">
    {stats.map(([count, label]) => <div key={label} className="min-w-0">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={`mt-1 text-xl font-bold ${label === '失败分镜' && count > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{count}</dd>
    </div>)}
  </dl>;
}

export function BatchHistoryProduct({ item, index }: { item: HistoryProduct; index: number }) {
  const tasks = item.tasks.filter(task => task.resultStatus !== 'superseded');
  const images = tasks.filter(isUsableWorkshopResult);
  const failed = tasks.filter(task => task.status === 'FAILURE').length;
  const hasCopy = hasCompletedCopy(item);
  const thumb = images[0]?.resultUrl || item.selectedProductImages[0] || item.coverImage;
  const title = item.title?.trim() || `商品 ${item.itemId || index + 1}`;
  return <li className="flex min-w-0 items-start gap-3 py-4">
    {/* LazyProxyImage owns a full-size wrapper; constrain that wrapper, not only its img. */}
    <div data-history-thumbnail className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
      {thumb ? <LazyProxyImage src={thumb} width={160} alt={title} className="object-contain" />
        : <div className="flex h-full items-center justify-center" aria-label="暂无商品图片"><ImageIcon className="h-6 w-6 text-slate-300" /></div>}
    </div>
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-800" title={title}>{title}</p>
      <p className="mt-1 truncate text-[11px] text-slate-400" title={item.itemId}>SKU {item.itemId || '未提供'}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5">
        <span className="text-slate-600">{tasks.length ? `成图 ${images.length}/${tasks.length} 张` : '尚未生成'}</span>
        <span className={hasCopy ? 'text-emerald-700' : 'text-slate-400'}>{hasCopy ? '文案已完成' : '文案待完善'}</span>
        {failed > 0 && <span className="text-rose-600">{failed} 个分镜失败</span>}
      </div>
    </div>
  </li>;
}
