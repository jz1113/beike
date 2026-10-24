import React from 'react';
import { Loader2 } from 'lucide-react';

export type BatchStatusVariant = 'ready' | 'pending' | 'analyzing' | 'success' | 'failure';

const STYLES: Record<BatchStatusVariant, string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/20',
  pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/20',
  analyzing: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-400/20',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/20',
  failure: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-400/20',
};

interface Props {
  variant: BatchStatusVariant;
  children: React.ReactNode;
  spinning?: boolean;
  className?: string;
}

export default function BatchStatusBadge({ variant, children, spinning, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${STYLES[variant]} ${className}`}
    >
      {spinning && <Loader2 className="w-3 h-3 animate-spin" />}
      {children}
    </span>
  );
}
