import { Check } from 'lucide-react';
import { workshopSteps, type getWorkshopFlow, type WorkshopStage } from '../../model/workspace/workshopFlow';

export function WorkshopStageNavigation({ stage, flow, onSelect }: {
  stage: number;
  flow: ReturnType<typeof getWorkshopFlow>;
  onSelect: (stage: WorkshopStage) => void;
}) {
  return <nav aria-label="图文制作步骤" className="workshop-steps">
    {workshopSteps.map((step, index) => {
      const current = step.stage === stage || (stage === 1 && step.stage === 2);
      const target = step.stage === 2 && !flow.products.length ? 1 : step.stage;
      const blocked = flow.reasonForStage(target);
      const complete = flow.completedStages.includes(step.stage);
      return <button type="button" key={step.stage} aria-current={current ? 'step' : undefined}
        aria-disabled={!!blocked && !current} title={blocked || step.description}
        disabled={!!blocked && !current} onClick={() => { if (!current) onSelect(target); }}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 aria-disabled:opacity-50 aria-[current=step]:bg-slate-200 aria-[current=step]:font-semibold dark:text-slate-300 dark:hover:bg-white/10 dark:aria-[current=step]:bg-white/10">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current">
          {complete && !current ? <Check size={12} aria-label="已就绪" /> : index + 1}
        </span>{step.title}
      </button>;
    })}
  </nav>;
}
