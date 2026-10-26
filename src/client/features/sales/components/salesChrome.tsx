import { useEffect, useId, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, BookOpen, Check, Loader2, Plus, RefreshCw, ShoppingBag, Video } from 'lucide-react';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import type { VideoSalesCategory, VideoSalesScript } from '@shared/domain/sales';
import { salesCreationRule } from '../model/fashionSalesSkill';

/** 带货工作台的中性表面与小面积重点色，兼容浅色和深色。 */
export const salesFocusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#18191c]';
export const salesPanelClass = 'rounded-[20px] border border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#18191c]';
export const salesCardClass = 'rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.025]';
export const salesTileClass = 'rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.02]';
export const salesGroupClass = 'space-y-3.5';
export const salesSectionTitleClass = 'text-[13px] font-semibold text-slate-800 dark:text-slate-100';
export const salesLabelClass = 'block text-xs font-medium text-slate-600 dark:text-slate-300';
export const salesInputClass = 'mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-amber-300/50';
export const salesNoteClass = 'text-xs leading-6 text-slate-500 dark:text-slate-400';
export const salesDividerClass = 'border-t border-slate-100 pt-5 dark:border-white/[0.08]';
export const salesTabTrackClass = 'inline-flex rounded-xl bg-slate-100 p-1 dark:bg-black/20';
export const salesGhostButtonClass = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.025] dark:text-slate-200 dark:hover:bg-white/[0.07] ${salesFocusClass}`;

/** 不确定时长的细进度条，用于提示词合成、视频生成等等待。 */
export function SalesIndeterminateBar({ label }: { label: string }) {
  return <div role="progressbar" aria-label={label} className="relative h-1 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
    <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-amber-500/80 motion-safe:animate-[sales-indeterminate_1.4s_ease-in-out_infinite] dark:bg-amber-300/80" />
    <style>{'@keyframes sales-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
  </div>;
}

export function SalesAlert({ tone = 'warn', children }: { tone?: 'warn' | 'error'; children: ReactNode }) {
  const color = tone === 'error' ? 'border-rose-500/20 bg-rose-500/[0.06] text-rose-600 dark:text-rose-300' : 'border-amber-500/20 bg-amber-500/[0.07] text-amber-700 dark:text-amber-200';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-6 ${color}`}><AlertCircle className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden /><div className="min-w-0">{children}</div></div>;
}

/** 步骤内吸顶子标题，与素材补齐保持一致。 */
export function SalesStickyHeader({ label, title, meta, actions, children }: { label: string; title: string; meta?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return <section aria-label={label} className="sticky top-0 z-10 -mx-4 -mt-4 space-y-2 border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mt-5 sm:px-5 dark:border-white/[0.08] dark:bg-[#18191c]/90">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2>{meta}</div>
      {actions}
    </div>
    {children}
  </section>;
}

export function SalesStatusPill({ tone, children }: { tone: 'done' | 'busy' | 'warn' | 'error' | 'idle'; children: ReactNode }) {
  const color = { done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', busy: 'bg-amber-500/10 text-amber-700 dark:text-amber-200', warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-200', error: 'bg-rose-500/10 text-rose-600 dark:text-rose-300', idle: 'bg-black/5 text-slate-500 dark:bg-white/10 dark:text-slate-400' }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{tone === 'busy' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}{tone === 'done' && <Check className="h-3 w-3" aria-hidden />}{children}</span>;
}

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
    <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">切换方案可查看对应脚本；已有成片和任务可通过页头的“查看生成结果”打开。</p>
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
  quietReason?: boolean;
  primaryTitle?: string;
  secondary?: Action;
  busy?: boolean;
  reason?: string | null;
  note?: string;
  progress?: string | null;
  controls?: ReactNode;
}

export function SalesActionBar({ primary, secondary, busy, reason, note, progress, controls, quietReason, primaryTitle }: SalesActionBarProps) {
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
  const primaryClass = `sales-primary-action inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold transition disabled:cursor-not-allowed ${salesFocusClass}`;
  return <footer aria-label="当前步骤操作" className="shrink-0 bg-transparent px-3 py-2.5 sm:px-5">
    <div className="@container mx-auto flex w-full justify-center">
      <div className="sales-action-dock flex w-full max-w-full flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm @min-[720px]:rounded-full dark:border-white/10 dark:bg-[#18191c]">
        <div className={`${quietReason ? 'sr-only' : 'min-w-0'} text-xs leading-5 text-slate-500 dark:text-slate-400`}>
        <div className={controls && !busy && (!reason || quietReason) ? 'sr-only' : 'min-w-0'}>
          <p id={`${uid}-reason`} role="status" aria-live="polite" className={reason && !busy && !quietReason ? 'flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 font-medium text-amber-800 dark:text-amber-200' : ''}>{reason && !busy && !quietReason && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />}{busy ? progress || '正在处理' : description || '按步骤确认后继续，生成操作不会自动串联。'}</p>
          {busy && <div className="mt-1.5 w-48 max-w-full"><SalesIndeterminateBar label={progress || '正在处理'} /></div>}
          {busy && <p className="mt-0.5"><span className="tabular-nums">已等待 {elapsed} 秒</span>{note ? ` · ${note}` : ''}</p>}
        </div>
        </div>
        {controls && <div className="hidden min-w-0 @min-[720px]:flex">{controls}</div>}
        {controls && <details className="w-full rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03] @min-[720px]:hidden"><summary className="cursor-pointer list-none text-xs font-medium text-slate-700 dark:text-slate-200">创作设置</summary><div className="mt-2">{controls}</div></details>}
        <div className="sales-dock-actions flex w-full min-w-0 flex-wrap justify-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
        {secondary && <button type="button" onClick={secondary.onClick} disabled={secondary.disabled} className={`min-h-11 min-w-max shrink-0 whitespace-nowrap px-4 disabled:opacity-40 ${salesGhostButtonClass}`}>{/重新生成/.test(secondary.label) && <RefreshCw className="h-3.5 w-3.5" aria-hidden />}{secondary.label}</button>}
        <span className="sales-primary-tooltip relative inline-flex max-w-full" title={primaryTitle || description || undefined} tabIndex={primary.disabled ? 0 : undefined}>
        {primary.href && !primary.disabled ? <a href={primary.href} download={primary.download} title={primaryTitle || description || undefined} aria-describedby={`${uid}-reason`} className={`${primaryClass} min-w-max shrink-0 whitespace-nowrap`}>{primary.label}</a> : <button type="button" onClick={primary.onClick} disabled={primary.disabled} title={primaryTitle || description || undefined} aria-describedby={`${uid}-reason`} aria-busy={Boolean(busy)} className={`${primaryClass} min-w-max shrink-0 whitespace-nowrap`}>{busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}{primary.label}</button>}
        {primary.disabled && (primaryTitle || description) && <span role="tooltip" className="sales-disabled-tooltip pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal leading-5 text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">{primaryTitle || description}</span>}
        </span>
        </div>
      </div>
    </div>
  </footer>;
}

interface SalesStudioHeaderProps {
  onBack: () => void;
  onReset: () => void;
  resetDisabled: boolean;
  resetTitle: string;
  returnAction?: { label: string; onClick: () => void };
  onViewResult?: () => void;
  onOpenRules: () => void;
}

export function SalesStudioHeader({ onBack, onReset, resetDisabled, resetTitle, returnAction, onViewResult, onOpenRules }: SalesStudioHeaderProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 px-3 sm:px-5">
      <StudioBrandChip title="电商视频" icon={<ShoppingBag className="h-4 w-4" />} onBack={onBack} inline />
      {returnAction ? <button type="button" onClick={returnAction.onClick} title={returnAction.label} aria-label={returnAction.label} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-xs text-slate-500 transition hover:bg-black/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 ${salesFocusClass}`}><ArrowLeft className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">{returnAction.label}</span></button> : <span className="hidden text-xs text-slate-400 lg:inline">从商品到一条完整视频</span>}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {onViewResult && <button type="button" onClick={onViewResult} title="查看生成结果" aria-label="查看生成结果" className={`h-9 ${salesGhostButtonClass}`}><Video className="h-3.5 w-3.5" aria-hidden /><span className="hidden md:inline">查看生成结果</span></button>}
        <button type="button" onClick={onOpenRules} title="带货规则" className={`h-9 ${salesGhostButtonClass}`} aria-label="带货规则"><BookOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">带货规则</span></button>
        <button type="button" onClick={onReset} disabled={resetDisabled} title={resetTitle} className={`h-9 shrink-0 disabled:opacity-40 ${salesGhostButtonClass}`}><Plus className="h-3.5 w-3.5" /><span>更换商品</span></button>
      </div>
    </header>
  );
}
