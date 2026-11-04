import type { ReactNode } from 'react';
import BatchProgressBar from '../delivery/BatchProgressBar';

export interface BatchStage3HeaderProps {
  settings: ReactNode;
  isAnalyzingAll: boolean;
  analyzeProgress: { current: number; total: number };
}

export function BatchStage3Header({ settings, isAnalyzingAll, analyzeProgress }: BatchStage3HeaderProps) {
  return <header aria-live="polite" className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 dark:border-white/10 dark:bg-[#18191c]/95">
    <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">配图方案</h1>
    {settings}
    {isAnalyzingAll && <div className="mt-4"><BatchProgressBar current={analyzeProgress.current} total={analyzeProgress.total} label="正在生成分镜提示词，完成后可审核" showSpinner /></div>}
  </header>;
}
