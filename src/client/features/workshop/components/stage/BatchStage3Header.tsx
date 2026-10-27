import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import BatchProgressBar from '../delivery/BatchProgressBar';

export interface BatchStage3HeaderProps {
  readyCount: number;
  totalCount: number;
  failedCount: number;
  isAnalyzingAll: boolean;
  analyzeProgress: { current: number; total: number };
}

export function BatchStage3Header({ readyCount, totalCount, failedCount, isAnalyzingAll, analyzeProgress }: BatchStage3HeaderProps) {
  return <header aria-live="polite" className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 dark:border-white/10 dark:bg-[#18191c]/95">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">分析并确认分镜</h1>
        <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">先核对商品身份、创作技能与逐镜设计，再微调提示词。分析结束后，由你确认开始生图。</p></div>
      <div className="flex items-center gap-3 text-xs">
        {isAnalyzingAll ? <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />分析进行中</span>
          : failedCount > 0 ? <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><AlertCircle className="h-3.5 w-3.5" />{failedCount} 款分析失败</span> : null}
        <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{readyCount}/{totalCount} 款就绪</span>
      </div>
    </div>
    {isAnalyzingAll && <div className="mt-4"><BatchProgressBar current={analyzeProgress.current} total={analyzeProgress.total} label="正在生成分镜提示词，完成后可审核" showSpinner /></div>}
  </header>;
}
