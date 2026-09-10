import React from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  current: number;
  total: number;
  label?: string;
  showSpinner?: boolean;
  variant?: 'indigo' | 'neutral';
}

export default function BatchProgressBar({
  current,
  total,
  label,
  showSpinner = false,
  variant = 'indigo',
}: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const barBg = variant === 'indigo' ? 'bg-indigo-100' : 'bg-slate-100';
  const barFill = variant === 'indigo' ? 'bg-indigo-600' : 'bg-indigo-500';

  return (
    <div className="space-y-1.5">
      {(label || total > 0) && (
        <div className="flex items-center justify-between text-xs font-medium text-slate-600">
          <span className="flex items-center gap-1.5">
            {showSpinner && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />}
            {label && <span>{label}</span>}
          </span>
          <span className="font-mono text-slate-500">
            {current} / {total} ({pct}%)
          </span>
        </div>
      )}
      <div className={`w-full h-1.5 ${barBg} rounded-full overflow-hidden`}>
        <div
          className={`h-full ${barFill} transition-all duration-300 rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
