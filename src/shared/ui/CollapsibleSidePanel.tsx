'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { PanelLeftOpen, X } from 'lucide-react';
import { LG_QUERY, useMediaQuery } from '@/lib/useMediaQuery';

interface Props {
  storageKey: string;
  widthClass?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function CollapsibleSidePanel({
  storageKey,
  widthClass = 'w-[360px]',
  title = '面板',
  children,
  className = '',
}: Props) {
  const isLarge = useMediaQuery(LG_QUERY);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLarge) setOpen(false);
  }, [isLarge]);

  useEffect(() => {
    if (!isLarge) {
      try {
        setOpen(localStorage.getItem(`sidepanel:${storageKey}`) === 'open');
      } catch {
        /* ignore */
      }
    }
  }, [isLarge, storageKey]);

  const setOpenPersist = (next: boolean) => {
    setOpen(next);
    if (!isLarge) {
      try {
        localStorage.setItem(`sidepanel:${storageKey}`, next ? 'open' : 'closed');
      } catch {
        /* ignore */
      }
    }
  };

  const baseAsideClass = `${widthClass} flex-shrink-0 bg-white border-r border-slate-200/80 flex flex-col h-full overflow-hidden select-none shadow-[2px_0_12px_rgba(0,0,0,0.03)] z-10 ${className}`;

  if (isLarge) {
    return <aside className={baseAsideClass}>{children}</aside>;
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpenPersist(true)}
          className="absolute left-3 top-3 z-30 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-md text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
          title={`打开${title}`}
        >
          <PanelLeftOpen className="w-4 h-4" />
          <span className="hidden sm:inline">{title}</span>
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setOpenPersist(false)}
          aria-hidden
        />
      )}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 max-w-[min(420px,92vw)] transition-transform duration-300 ease-out ${baseAsideClass} ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
          <span className="text-xs font-bold text-slate-700">{title}</span>
          <button
            type="button"
            onClick={() => setOpenPersist(false)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
            title="收起面板"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto scroll-contain">{children}</div>
      </aside>
    </>
  );
}
