'use client';

import { Check, ChevronDown, Loader2, X, Zap } from 'lucide-react';
import type { AssistantMessage } from '@/store/useAppStore';

type ToolActivityItem = NonNullable<AssistantMessage['toolActivity']>[number];

interface Props {
  items: ToolActivityItem[];
}

export default function AssistantToolActivity({ items }: Props) {
  return (
    <details open className="w-full rounded-xl border border-slate-200 bg-slate-50/90 text-[11px] text-slate-600 overflow-hidden">
      <summary className="cursor-pointer px-3 py-1.5 font-semibold text-slate-700 flex items-center gap-1.5 list-none">
        <Zap className="w-3 h-3 text-amber-500" />
        <span>已调用 {items.length} 项工具</span>
        <ChevronDown className="w-3 h-3 ml-auto opacity-50" />
      </summary>
      <ul className="px-3 pb-2 space-y-1 border-t border-slate-100">
        {items.map((t, ti) => (
          <li key={`${t.name}-${ti}`} className="flex items-start gap-1.5 pt-1.5">
            {t.status === 'running' ? (
              <Loader2 className="w-3 h-3 mt-0.5 animate-spin text-blue-500 shrink-0" />
            ) : t.status === 'error' ? (
              <X className="w-3 h-3 mt-0.5 text-rose-500 shrink-0" />
            ) : (
              <Check className="w-3 h-3 mt-0.5 text-emerald-600 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-medium text-slate-800">{t.displayName || t.name}</div>
              {t.detail && (
                <div className="text-slate-400 truncate max-w-full" title={t.detail}>{t.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
