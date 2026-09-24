import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export const workshopMenuItemClass = 'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

export function WorkshopActionMenu({ label, icon, children, primary = false, disabled = false }: {
  label: string; icon: ReactNode; children: ReactNode; primary?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-expanded={open && !disabled} disabled={disabled} onClick={() => setOpen(!open)} className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${primary ? 'border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
      {icon}{label}<ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && !disabled && <div className="absolute right-0 top-full z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" onClick={(event) => {
      const button = (event.target as HTMLElement).closest('button');
      if (button && !button.disabled) { setOpen(false); trigger.current?.focus(); }
    }}>{children}</div>}
  </div>;
}
