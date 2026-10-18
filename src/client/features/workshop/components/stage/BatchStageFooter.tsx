import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface Props {
  onPrev: () => void;
  prevLabel?: string;
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
  primaryAction,
  secondaryActions,
  hint,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-white/10">
      <button
        type="button"
        onClick={onPrev}
        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{prevLabel}</span>
      </button>

      <div className="flex items-center gap-3 flex-wrap justify-end">
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
