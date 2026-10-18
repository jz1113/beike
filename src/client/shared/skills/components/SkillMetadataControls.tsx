import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Info } from 'lucide-react';

export function FieldHint({ text }: { text: string }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="inline-flex"
      onMouseEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
      }}
      onMouseLeave={() => setAnchor(null)}
    >
      <Info className="h-3 w-3 text-slate-400" />
      {anchor && createPortal(
        <span
          role="tooltip"
          style={{ left: anchor.x, top: anchor.y - 8 }}
          className="pointer-events-none fixed z-[140] w-52 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-normal leading-relaxed text-white shadow-lg"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

export function SkillModelSelect({
  label,
  hint,
  value,
  models,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  models: { id: string; name: string }[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={rootRef}>
      <div className="mb-1.5 flex items-center gap-1">
        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <FieldHint text={hint} />
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-9 w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-xs text-slate-800 transition-colors hover:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-white/30"
        >
          <span>{selected?.name || value || '点击选择模型'}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-black/10 bg-white p-1 shadow-xl dark:border-white/15 dark:bg-[#1E1E22]">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <span>不设默认（由系统自适应）</span>
              {!value && <Check className="h-3.5 w-3.5" />}
            </button>
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => { onChange(model.id); setOpen(false); }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <span>{model.name}</span>
                {value === model.id && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
