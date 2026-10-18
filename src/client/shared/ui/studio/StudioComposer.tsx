import type { ReactNode } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  title?: string;
  onTitleChange?: (value: string) => void;
  submitting?: boolean;
  disabled?: boolean;
  meta?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
}

export function StudioComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  title,
  onTitleChange,
  submitting = false,
  disabled = false,
  meta,
  toolbar,
  footer,
}: Props) {
  return (
    <section className="sticky bottom-3 z-20 mx-auto w-full max-w-[860px] rounded-[28px] border border-slate-200/80 bg-white/90 p-4 text-left shadow-[0_28px_80px_-50px_rgba(15,23,42,.55)] backdrop-blur-xl dark:border-white/10 dark:bg-[#1B1B1E]/90 sm:p-5">
      {onTitleChange && (
        <div className="mb-2 flex items-center justify-between gap-3 border-b border-black/[0.04] pb-2 dark:border-white/[0.06]">
          <input
            value={title || ''}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="标题"
            className="w-full border-0 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
          />
          {meta}
        </div>
      )}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder={placeholder}
        className="w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-200 dark:placeholder:text-slate-500 sm:text-base"
      />
      {toolbar && <div className="mt-3 flex flex-wrap items-center gap-2">{toolbar}</div>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.04] pt-3 dark:border-white/[0.06]">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{footer}</div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || submitting}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950"
          title="开始生成"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" strokeWidth={2.5} />}
        </button>
      </div>
    </section>
  );
}
