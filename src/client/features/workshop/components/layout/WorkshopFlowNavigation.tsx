import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { workshopSteps, type WorkshopStage } from '../../model/workspace/workshopFlow';

interface Props {
  currentStage: number;
  busy: boolean;
  productCount: number;
  readyCount: number;
  resultCount: number;
  reasonForStage: (stage: number) => string | null;
  onSelectStage: (stage: WorkshopStage) => void;
}

export function WorkshopFlowNavigation({ currentStage, busy, productCount, readyCount, resultCount, reasonForStage, onSelectStage }: Props) {
  const counts = [productCount ? `${productCount} 款商品` : '从这里开始', `${productCount} 款待确认`, `${readyCount}/${productCount} 款就绪`, `${resultCount} 张成图`];
  return (
    <nav aria-label="电商图文生产流程" className="shrink-0 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-8 dark:border-white/10 dark:bg-[#151619]/95">
      <ol className="mx-auto grid w-full max-w-[1760px] grid-cols-4 gap-1 sm:gap-3">
        {workshopSteps.map(({ stage, title, description }, index) => {
          const active = currentStage === stage;
          const reason = reasonForStage(stage);
          const completed = stage < currentStage && !reason;
          return <li key={stage} className="relative min-w-0">
            <button type="button" aria-current={active ? 'step' : undefined} disabled={active || Boolean(reason)}
              title={reason || description} onClick={() => onSelectStage(stage)}
              className={`flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left transition-colors sm:gap-3 sm:px-3 disabled:cursor-default focus-visible:outline-indigo-500 ${active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : reason ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-8 sm:w-8 ${active ? 'bg-indigo-600 text-white' : completed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'border border-current/20'}`}>
                {active && busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : completed ? <Check className="h-3.5 w-3.5" /> : stage}
              </span>
              <span className="min-w-0"><span className="block text-[11px] font-semibold sm:text-sm">{title}</span><span className="mt-0.5 hidden truncate text-[11px] opacity-70 md:block">{counts[index]}</span></span>
            </button>
            {stage < 4 && <ChevronRight className="pointer-events-none absolute -right-2 top-5 hidden h-3 w-3 text-slate-300 sm:block dark:text-slate-600" />}
          </li>;
        })}
      </ol>
    </nav>
  );
}
