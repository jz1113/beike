import { SearchX } from 'lucide-react';

interface Props { message?: string; onAction?: () => void; actionLabel?: string }

export function SkillsEmptyState({ message = '暂无技能', onAction, actionLabel = '创建技能' }: Props) {
  return <div role="status" className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/30 px-5 py-12 text-center dark:border-white/10 dark:bg-white/[0.015]">
    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200/50 text-slate-400 dark:bg-white/5"><SearchX size={23} /></span>
    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">{message}</h3>
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">可以调整筛选条件，也可以导入或创建自己的技能。</p>
    {onAction && <button type="button" onClick={onAction} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">{actionLabel}</button>}
  </div>;
}
