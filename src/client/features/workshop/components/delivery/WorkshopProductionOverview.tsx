import { Check, Settings2 } from 'lucide-react';
import type { BatchProductItem, GenerationStrategy } from '../../model/batchTypes';
import { checkWorkshopReadiness, summarizeWorkshopResults } from '../../model/generation/workshopReadiness';

export function WorkshopProductionOverview({ items, currentStage, onStageChange, busy, strategy, shotCount, aspect, gridOutputSize, concurrency, onSettings, analysisIssue }: {
  analysisIssue?: string | null;
  items: BatchProductItem[]; currentStage: number; onStageChange: (stage: number) => void; busy: boolean;
  strategy: GenerationStrategy; shotCount: number; aspect: string; concurrency: number; onSettings: () => void;
  gridOutputSize?: string;
}) {
  const selected = items.filter((item) => item.selected && item.status === 'success');
  const selectedImages = selected.filter((item) => item.selectedProductImages?.some(Boolean)).length;
  const readiness = checkWorkshopReadiness(selected, { generationStrategy: strategy, selectedShotCount: shotCount });
  const results = summarizeWorkshopResults(selected);
  const steps = [
    { title: '采集商品', detail: `${selected.length} 款已选`, enabled: true, done: selected.length > 0 },
    { title: '选图与配置', detail: `${selectedImages}/${selected.length} 款已选图`, enabled: selected.length > 0, done: selected.length > 0 && selectedImages === selected.length },
    { title: '确认提示词', detail: `${readiness.readyCount}/${selected.length} 款就绪`, enabled: selected.length > 0 && selectedImages === selected.length && (currentStage >= 3 || selected.some((item) => item.analyzedSuccess)), done: readiness.canGenerate },
    { title: '生成与交付', detail: `${results.success} 张成图 · ${results.copyReady} 款文案`, enabled: results.total > 0, done: results.total > 0 && results.success === results.total },
  ];
  return <section className="border-b border-slate-200/60 bg-transparent pb-4 dark:border-white/10" aria-label="批次生产流程">
    <nav className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="生产步骤">
      {steps.map((step, index) => <button key={step.title} type="button" onClick={() => onStageChange(index + 1)} disabled={busy || !step.enabled} aria-current={currentStage === index + 1 ? 'step' : undefined}
        className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left disabled:cursor-not-allowed ${currentStage === index + 1 ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-white/5'}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${currentStage === index + 1 ? 'bg-indigo-600 text-white' : step.done ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400 dark:bg-white/10'}`}>{step.done && currentStage !== index + 1 ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
        <span className="min-w-0"><span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{step.title}</span><span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{step.detail}</span></span>
      </button>)}
    </nav>
    {currentStage === 2 && analysisIssue && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">分析前待处理：{analysisIssue}。选图问题在下方修正，资源问题可打开生产设置处理。</p>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-2 pt-3 text-[11px] text-slate-500 dark:text-slate-400 dark:border-white/10">
      <span>{strategy === 'grid_first' ? '四宫格拆分' : '单张逐镜生成'} · 每款 {shotCount} 镜 · {aspect}{strategy === 'grid_first' && gridOutputSize ? ` · 切图 ${gridOutputSize.replace('x', ' × ')} px` : ''} · {concurrency} 并发{busy ? ' · 任务执行中' : ''}</span>
      <button type="button" onClick={onSettings} disabled={busy} className="flex items-center gap-1 text-indigo-600 disabled:opacity-40"><Settings2 className="h-3.5 w-3.5" />生产设置</button>
    </div>
  </section>;
}
