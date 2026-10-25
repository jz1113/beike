import type { VideoSalesScript } from '@shared/domain/sales';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { salesAssetProgress } from '../model/salesAssetProgress';
import { salesCardClass, salesSectionTitleClass } from './salesChrome';

export function SalesAssetsSummary({ script }: { script: VideoSalesScript }) {
  const assets = script.assets || [];
  const progress = salesAssetProgress(assets);
  const allRequiredDone = assets.length > 0 && assets.every((asset) => !asset.required || (asset.status === 'done' && asset.url));
  const unresolved = Math.max(progress.total - progress.confirmed, 0);
  const requiredCount = assets.filter((asset) => asset.required).length;
  const optionalCount = Math.max(assets.length - requiredCount, 0);
  return <aside className={`${salesCardClass} h-fit p-4`} aria-label="素材任务摘要">
    <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" aria-hidden /><h3 className={salesSectionTitleClass}>任务摘要</h3></div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]"><p className="text-[11px] text-slate-500">已生成</p><p className="mt-1 text-lg font-semibold tabular-nums">{progress.generated}<span className="text-xs font-normal text-slate-400"> / {progress.total}</span></p></div>
      <div className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]"><p className="text-[11px] text-slate-500">待确认</p><p className="mt-1 text-lg font-semibold tabular-nums">{unresolved}</p></div>
    </div>
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-white/[0.08]">
      <div className="flex items-center justify-between text-xs"><span className="text-slate-500">必需素材</span><span className="font-medium">{requiredCount} 张</span></div>
      <div className="flex items-center justify-between text-xs"><span className="text-slate-500">可选素材</span><span className="font-medium">{optionalCount} 张</span></div>
      <div className="flex items-center justify-between text-xs"><span className="text-slate-500">失败任务</span><span className={progress.failed ? 'font-medium text-rose-500' : 'font-medium'}>{progress.failed} 张</span></div>
    </div>
    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-800 dark:text-amber-200"><p className="font-medium">核对重点</p><p className="mt-1 text-amber-700/80 dark:text-amber-200/80">{script.beat ? '人物身份、服装颜色、整件商品比例与嘴部是否完整入画。' : '商品结构、颜色、标志与关键细节是否和原图一致。'}</p></div>
    <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{allRequiredDone ? '必需素材已具备，可继续确认' : '全部必需素材确认后才能继续'}</div>
  </aside>;
}
