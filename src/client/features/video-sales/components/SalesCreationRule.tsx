import type { VideoSalesCategory } from '@shared/domain/video-sales';
import { salesCreationRule } from '../model/fashionSalesSkill';
import { salesCardClass, salesGhostButtonClass } from './salesSurface';

export function SalesCreationRule({ category, onOpenRules }: { category: VideoSalesCategory; onOpenRules: () => void }) {
  const rule = salesCreationRule(category);
  return (
    <div className={`flex items-start justify-between gap-3 p-3 ${salesCardClass}`}>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">本次创作规则</p>
        <p className="mt-1 text-sm font-semibold">{rule.title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{rule.detail}</p>
      </div>
      <button type="button" onClick={onOpenRules} className={`h-8 shrink-0 ${salesGhostButtonClass}`}>带货规则</button>
    </div>
  );
}
