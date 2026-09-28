import { summarizeWorkshopResults } from '../model/generation/workshopReadiness';
import type { BatchProductItem } from '../model/batchTypes';

export function BatchDeliveryStatus({ items, busy, readOnly, onLocateFailure, onRetryFailed, onContinue }: {
  items: BatchProductItem[]; busy: boolean; readOnly: boolean; onLocateFailure: () => void;
  onRetryFailed?: () => Promise<void>; onContinue?: () => Promise<void>;
}) {
  const stats = summarizeWorkshopResults(items);
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 text-xs">
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-slate-500">
      <span>成图 <b className="font-semibold text-slate-800">{stats.success}/{stats.total}</b></span>
      <span>生成中 {stats.running}</span><span>待生成 {stats.pending}</span>
      <span className={stats.failed > stats.recovery ? 'text-rose-600' : ''}>失败 {Math.max(0, stats.failed - stats.recovery)}</span>
      {stats.recovery > 0 && <span className="text-amber-700">待核对 {stats.recovery}</span>}
      <span>文案 {stats.copyReady}/{items.length} 款</span>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      {stats.failed > 0 && <button type="button" onClick={onLocateFailure} className="font-semibold text-rose-600 hover:underline">定位失败商品</button>}
      {!readOnly && !busy && stats.recovery === 0 && <>
        {stats.failed > 0 && onRetryFailed && <button type="button" onClick={() => void onRetryFailed()} className="rounded-lg bg-rose-50 px-3 py-1.5 font-semibold text-rose-700">仅重试失败</button>}
        {stats.pending > 0 && onContinue && <button type="button" onClick={() => void onContinue()} className="rounded-lg bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700">继续未完成</button>}
      </>}
    </div>
  </div>;
}
