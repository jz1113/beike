import { useEffect, useRef } from 'react';
import { BookOpen, Check, ChevronLeft, Plus, ShoppingBag } from 'lucide-react';
import type { SalesWorkflowStep, SalesWorkflowStepView } from '../model/salesWorkspaceView';
import { salesFocusClass, salesGhostButtonClass } from './salesSurface';

interface Props {
  onBack: () => void;
  onReset: () => void;
  resetDisabled: boolean;
  resetTitle: string;
  steps: SalesWorkflowStepView[];
  onStep: (step: SalesWorkflowStep) => void;
  onOpenRules: () => void;
}

export function SalesStudioHeader({ onBack, onReset, resetDisabled, resetTitle, steps, onStep, onOpenRules }: Props) {
  const navigationRef = useRef<HTMLOListElement>(null);
  const current = steps.find((step) => step.state === 'current')?.id;
  useEffect(() => {
    navigationRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);
  return (
    <div className="shrink-0">
      <header className="flex min-h-16 items-center gap-2 px-3 sm:px-5">
        <button type="button" onClick={onBack} className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-2 text-sm font-semibold ${salesFocusClass}`} title="返回首页"><ChevronLeft className="h-4 w-4 text-slate-400" /><ShoppingBag className="h-4 w-4 text-amber-700 dark:text-amber-200" /><span>视频带货</span></button>
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
