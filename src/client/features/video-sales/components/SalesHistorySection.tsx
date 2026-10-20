import type { VideoSalesScript } from '@shared/domain/video-sales';

export function SalesHistorySection({ scripts, selected, disabled, onSelect }: {
  scripts: VideoSalesScript[]; selected: number; disabled: boolean; onSelect: (index: number) => void;
}) {
  if (scripts.length < 2) return null;
  return <section aria-label="历史方案与任务" className="border-b border-black/5 px-6 py-4 dark:border-white/10">
    <label className="flex items-center gap-3 text-xs text-slate-500">查看方案与历史任务
      <select aria-label="选择历史方案" disabled={disabled} value={selected} onChange={(event) => onSelect(Number(event.target.value))} className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent p-2 dark:border-white/10">
        {scripts.map((script, index) => <option key={script.id} value={index}>{index === 0 ? '最新' : '历史'} · {script.title}{script.renderResultUrl ? ' · 已有成片' : script.renderTaskId ? ' · 已有任务回执' : ''}{script.planStale ? ' · 方案已过期' : ''}</option>)}
      </select>
    </label>
    <p className="mt-2 text-[11px] text-slate-500">历史成片和任务回执继续保留；过期方案需要更新，已有任务只查询原任务。</p>
  </section>;
}
