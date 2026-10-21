import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, Check, Loader2, Plus, ShoppingBag } from 'lucide-react';
import { StudioBrandChip } from '@client/shared/ui/studio';
import type { VideoSalesCategory, VideoSalesScript } from '@shared/domain/video-sales';
import { salesCreationRule } from '../model/fashionSalesSkill';
import type { SalesWorkflowStep, SalesWorkflowStepView } from '../model/salesWorkspaceView';

/** 带货工作台的中性表面与小面积重点色，兼容浅色和深色。 */
export const salesFocusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#18191c]';
export const salesPanelClass = 'rounded-[20px] border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#18191c]';
export const salesCardClass = 'rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.025]';
export const salesGroupClass = 'space-y-3.5';
export const salesSectionTitleClass = 'text-[13px] font-semibold text-slate-800 dark:text-slate-100';
export const salesLabelClass = 'block text-xs font-medium text-slate-600 dark:text-slate-300';
export const salesInputClass = 'mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-amber-300/50';
export const salesNoteClass = 'text-xs leading-6 text-slate-500 dark:text-slate-400';
export const salesDividerClass = 'border-t border-slate-100 pt-5 dark:border-white/[0.08]';
export const salesTabTrackClass = 'inline-flex rounded-xl bg-slate-100 p-1 dark:bg-black/20';
export const salesGhostButtonClass = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.025] dark:text-slate-200 dark:hover:bg-white/[0.07] ${salesFocusClass}`;

export function salesTabClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${salesFocusClass} ${active ? 'bg-white text-slate-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`;
}

export function SalesCreationRule({ category }: { category: VideoSalesCategory; onOpenRules?: () => void }) {
  const rule = salesCreationRule(category);
  return (
    <div className={`flex items-start justify-between gap-3 p-3 ${salesCardClass}`}>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">本次创作规则</p>
        <p className="mt-1 text-sm font-semibold">{rule.title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{rule.detail}</p>
      </div>
    </div>
  );
}

export function SalesHistorySection({ scripts, selected, disabled, onSelect }: {
  scripts: VideoSalesScript[]; selected: number; disabled: boolean; onSelect: (index: number) => void;
}) {
  if (scripts.length < 2) return null;
  return <section aria-label="历史方案与任务" className="mx-3 mb-3 shrink-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2 sm:mx-5 dark:border-white/10 dark:bg-[#18191c]">
    <label className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">方案与历史任务 · {scripts.length} 份
      <select aria-label="选择历史方案" disabled={disabled} value={selected} onChange={(event) => onSelect(Number(event.target.value))} className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent p-2 dark:border-white/10">
        {scripts.map((script, index) => <option key={script.id} value={index}>{index === 0 ? '最新' : '历史'} · {script.title}{script.renderResultUrl ? ' · 已有成片' : script.renderTaskId ? ' · 已有任务回执' : ''}{script.planStale ? ' · 方案已过期' : ''}</option>)}
      </select>
    </label>
    <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">各阶段均可切换查看；历史成片和任务回执继续保留。</p>
  </section>;
}

interface Action {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
  download?: string;
}
interface SalesActionBarProps {
  primary: Action;
  secondary?: Action;
  busy?: boolean;
  reason?: string | null;
  note?: string;
  progress?: string | null;
}

export function SalesActionBar({ primary, secondary, busy, reason, note, progress }: SalesActionBarProps) {
  const uid = useId();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!busy) return;
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const description = reason || note;
  const primaryClass = `inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white ${salesFocusClass}`;
  return <footer aria-label="当前步骤操作" className="shrink-0 border-t border-slate-200/80 bg-white px-3 py-3 sm:px-5 dark:border-white/10 dark:bg-[#18191c]">
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-xs leading-5 text-slate-500 dark:text-slate-400"><p id={`${uid}-reason`} role="status" aria-live="polite">{busy ? progress || '正在处理' : description || '按步骤确认后继续，生成操作不会自动串联。'}</p>{busy && <p className="mt-1"><span className="tabular-nums">已等待 {elapsed} 秒</span>{note ? ` · ${note}` : ''}</p>}</div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {secondary && <button type="button" onClick={secondary.onClick} disabled={secondary.disabled} className={`min-h-11 flex-1 px-4 disabled:opacity-40 sm:flex-none ${salesGhostButtonClass}`}>{secondary.label}</button>}
        {primary.href && !primary.disabled ? <a href={primary.href} download={primary.download} aria-describedby={`${uid}-reason`} className={`${primaryClass} flex-1 sm:flex-none`}>{primary.label}</a> : <button type="button" onClick={primary.onClick} disabled={primary.disabled} aria-describedby={`${uid}-reason`} aria-busy={Boolean(busy)} className={`${primaryClass} flex-1 sm:flex-none`}>{busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}{primary.label}</button>}
      </div>
    </div>
  </footer>;
}

interface SalesStudioHeaderProps {
  onBack: () => void;
  onReset: () => void;
  resetDisabled: boolean;
  resetTitle: string;
  steps: SalesWorkflowStepView[];
  onStep: (step: SalesWorkflowStep) => void;
  onOpenRules: () => void;
}

export function SalesStudioHeader({ onBack, onReset, resetDisabled, resetTitle, steps, onStep, onOpenRules }: SalesStudioHeaderProps) {
  const navigationRef = useRef<HTMLOListElement>(null);
  const current = steps.find((step) => step.state === 'current')?.id;
  useEffect(() => {
    navigationRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  return (
    <div className="shrink-0">
      <header className="flex min-h-16 items-center gap-2 px-3 sm:px-5">
        <StudioBrandChip title="视频带货" icon={<ShoppingBag className="h-4 w-4" />} onBack={onBack} inline />
        <span className="hidden text-xs text-slate-400 lg:inline">从商品到一条完整视频</span>
        <button type="button" onClick={onOpenRules} className={`ml-auto h-9 ${salesGhostButtonClass}`} aria-label="带货规则"><BookOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">带货规则</span></button>
        <button type="button" onClick={onReset} disabled={resetDisabled} title={resetTitle} className={`h-9 shrink-0 disabled:opacity-40 ${salesGhostButtonClass}`}><Plus className="h-3.5 w-3.5" /><span>更换商品</span></button>
      </header>
      <nav aria-label="带货制作五步" className="overflow-x-auto px-3 pb-3 sm:px-5">
        <ol ref={navigationRef} className="flex min-w-max gap-2 sm:min-w-0">
          {steps.map((step, index) => <li key={step.id} className="min-w-0 flex-1">
            <button type="button" onClick={() => onStep(step.id)} aria-current={step.state === 'current' ? 'step' : undefined} aria-label={`${index + 1} ${step.label}${step.state === 'done' ? '，已完成' : step.state === 'current' ? '，当前步骤' : '，待完成'}`} className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition ${salesFocusClass} ${step.state === 'current' ? 'border-amber-300/80 bg-amber-50/70 font-semibold text-slate-900 dark:border-amber-300/35 dark:bg-amber-400/[0.07] dark:text-slate-100' : 'border-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums ${step.state === 'done' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-black/5 dark:bg-white/10'}`}>{step.state === 'done' ? <Check className="h-3 w-3" aria-hidden /> : index + 1}</span>
              <span className="whitespace-nowrap">{step.label}</span>
            </button>
          </li>)}
        </ol>
      </nav>
    </div>
  );
}
