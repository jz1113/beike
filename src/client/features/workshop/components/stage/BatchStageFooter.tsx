import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface Props {
  onPrev?: () => void;
  prevLabel?: string;
  prevDisabled?: boolean;
  primaryAction: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: React.ReactNode;
  };
  secondaryActions?: React.ReactNode;
  hint?: React.ReactNode;
}

export default function BatchStageFooter({
  onPrev,
  prevLabel = '返回上一步',
  prevDisabled = false,
  primaryAction,
  secondaryActions,
  hint,
}: Props) {
  return (
    <div className="sticky bottom-0 z-20 -mx-1 flex shrink-0 flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_-6px_24px_-16px_rgba(15,23,42,.25)] backdrop-blur-xl sm:flex-row sm:items-center dark:border-white/10 dark:bg-[#18191c]/95">
      {onPrev && <button
        type="button"
        onClick={onPrev}
        disabled={prevDisabled}
        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{prevLabel}</span>
      </button>}

      <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
        {hint}
        {secondaryActions}
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          className="px-5 py-3 rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {primaryAction.icon}
          <span>{primaryAction.label}</span>
          {!primaryAction.icon && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
