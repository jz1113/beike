import { Settings2 } from 'lucide-react';
import type { useBatchWorkshopRunner } from '../../hooks/useBatchWorkshopRunner';

export function WorkshopProductionSummary({ runner, onOpenSettings }: {
  runner: ReturnType<typeof useBatchWorkshopRunner>;
  onOpenSettings: () => void;
}) {
  const modelName = (models: Array<{ id: string; name: string; shortName?: string }>, id: string) => {
    const model = models.find(item => item.id === id);
    return model?.shortName || model?.name || id || '未选择';
  };
  const recipe = runner.selectedArchId === 'auto' || runner.selectedArchId === '__category_skill__' ? '按商品细分应用创作技能' : runner.recipes.find(item => item.id === runner.selectedArchId)?.name || '技能待选择';
  const settings = [
    ['创作技能', recipe],
    ['商品依据', '当前选中的商品图'],
    ['分析模型', modelName(runner.availableVisionModels, runner.selectedVisionModel)],
    ['生图输出', `${modelName(runner.availableImageModels, runner.selectedImageGenModel)} · ${runner.selectedAspect} · ${runner.selectedShotCount} 镜`],
  ];
  return <section aria-label="本批次生产配置" className="mb-4 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3.5 sm:px-5 dark:border-white/10 dark:bg-[#18191c]/95">
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs"><h2 className="font-semibold text-slate-800 dark:text-slate-100">本批次配置</h2><span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{runner.generationStrategy === 'grid_first' ? '四宫格生成后拆图' : '单张逐镜生成'}</span></div>
      <button type="button" onClick={onOpenSettings} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"><Settings2 className="h-3.5 w-3.5" />检查与调整</button>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 xl:grid-cols-[1fr_1fr_1fr_1.5fr]">
      {settings.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[11px] text-slate-400 dark:text-slate-500">{label}</dt><dd title={value} className="mt-1 truncate text-xs text-slate-700 dark:text-slate-300">{value}</dd></div>)}
    </dl>
  </section>;
}
