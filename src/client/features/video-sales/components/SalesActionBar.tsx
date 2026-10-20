import { useId } from 'react';
import { Loader2 } from 'lucide-react';
import { salesFocusClass, salesGhostButtonClass } from './salesSurface';

interface Action {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  href?: string;
  download?: string;
}
interface Props {
  primary: Action;
  secondary?: Action;
  busy?: boolean;
  reason?: string | null;
  note?: string;
  progress?: string | null;
}

export function SalesActionBar({ primary, secondary, busy, reason, note, progress }: Props) {
  const uid = useId();
  const description = [progress, reason || note].filter((value, index, values) => value && values.indexOf(value) === index).join(' · ');
  const primaryClass = `inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white ${salesFocusClass}`;
  return <footer aria-label="当前步骤操作" className="shrink-0 border-t border-slate-200/80 bg-white px-3 py-3 sm:px-5 dark:border-white/10 dark:bg-[#18191c]">
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p id={`${uid}-reason`} role="status" aria-live="polite" className="min-w-0 text-xs leading-5 text-slate-500 dark:text-slate-400">{description || '按步骤确认后继续，生成操作不会自动串联。'}</p>
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {secondary && <button type="button" onClick={secondary.onClick} disabled={secondary.disabled} className={`min-h-11 flex-1 px-4 disabled:opacity-40 sm:flex-none ${salesGhostButtonClass}`}>{secondary.label}</button>}
        {primary.href && !primary.disabled ? <a href={primary.href} download={primary.download} aria-describedby={`${uid}-reason`} className={`${primaryClass} flex-1 sm:flex-none`}>{primary.label}</a> : <button type="button" onClick={primary.onClick} disabled={primary.disabled} aria-describedby={`${uid}-reason`} aria-busy={Boolean(busy)} className={`${primaryClass} flex-1 sm:flex-none`}>{busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}{primary.label}</button>}
      </div>
    </div>
  </footer>;
}
