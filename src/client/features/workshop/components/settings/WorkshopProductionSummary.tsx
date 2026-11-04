import { Settings2 } from 'lucide-react';
import type { useBatchWorkshopRunner } from '../../hooks/useBatchWorkshopRunner';

export function WorkshopProductionSummary({ runner, onOpenSettings, onOpenSkills }: {
  runner: ReturnType<typeof useBatchWorkshopRunner>;
  onOpenSettings: () => void;
  onOpenSkills?: () => void;
}) {
  const recipe = runner.selectedArchId === 'auto' || runner.selectedArchId === '__category_skill__' ? '按商品细分应用创作技能' : runner.recipes.find(item => item.id === runner.selectedArchId)?.name || '技能待选择';
  return <section aria-label="本批次生产配置" className="mt-3 border-t border-slate-200 pt-2 dark:border-white/10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs"><h2 className="font-semibold text-slate-800 dark:text-slate-100">{recipe}</h2><span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{runner.generationStrategy === 'grid_first' ? '四宫格生成后拆图' : '单张逐镜生成'} · 每条 {runner.selectedShotCount} 张 · {runner.selectedAspect}</span></div>
      <div className="flex items-center gap-2">
        {onOpenSkills && <button type="button" onClick={onOpenSkills} className="rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-white/5">管理创作技能</button>}
        <button type="button" onClick={onOpenSettings} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"><Settings2 className="h-3.5 w-3.5" />调整生产设置</button>
      </div>
    </div>
  </section>;
}
