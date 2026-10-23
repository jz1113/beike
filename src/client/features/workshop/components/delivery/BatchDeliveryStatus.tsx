import { summarizeWorkshopResults } from '../../model/generation/workshopReadiness';
import type { BatchProductItem } from '../../model/batchTypes';

export function BatchDeliveryStatus({ items, busy, readOnly, onLocateFailure, onRetryFailed, onContinue }: {
  items: BatchProductItem[]; busy: boolean; readOnly: boolean; onLocateFailure: () => void;
  onRetryFailed?: () => Promise<void>; onContinue?: () => Promise<void>;
}) {
  const stats = summarizeWorkshopResults(items);
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-[#1B1B1E]/90 px-4 py-3 text-xs">
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-slate-500 dark:text-slate-400">
      <span>成图 <b className="font-semibold text-slate-800 dark:text-slate-200">{stats.success}/{stats.total}</b></span>
      <span>生成中 {stats.running}</span><span>待生成 {stats.pending}</span>
      <span className={stats.failed > stats.recovery ? 'text-rose-600 dark:text-rose-400' : ''}>失败 {Math.max(0, stats.failed - stats.recovery)}</span>
      {stats.recovery > 0 && <span className="text-amber-700 dark:text-amber-400">待核对 {stats.recovery}</span>}
      <span>文案 {stats.copyReady}/{items.length} 款</span>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      {stats.failed > 0 && <button type="button" onClick={onLocateFailure} className="font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer">定位失败商品</button>}
      {!readOnly && !busy && stats.recovery === 0 && <>
        {stats.failed > 0 && onRetryFailed && <button type="button" onClick={() => void onRetryFailed()} className="rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-transparent dark:border-rose-900/40 px-3 py-1.5 font-semibold cursor-pointer">仅重试失败</button>}
        {stats.pending > 0 && onContinue && <button type="button" onClick={() => void onContinue()} className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-transparent dark:border-indigo-900/40 px-3 py-1.5 font-semibold cursor-pointer">继续未完成</button>}
      </>}
    </div>
  </div>;
}
