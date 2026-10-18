import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ModalityChannelOption } from '../model/modalityModelTypes';

interface Props {
  channels: ModalityChannelOption[];
  channelId: string;
  onChange: (channelId: string) => void;
}

function channelHost(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).host;
  } catch {
    return trimmed.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

export function ModalitySyncChannelPicker({ channels, channelId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = channels.find((channel) => channel.id === channelId) || channels[0];
  const host = channelHost(current?.baseUrl || '');

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 max-w-[240px] items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-2.5 text-left transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 sm:max-w-[280px]"
        title={current?.baseUrl || '未配置地址'}
      >
        <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
          {current?.name || '选择渠道'}
        </span>
        <span className="max-w-[9rem] truncate text-[11px] text-slate-400 dark:text-slate-500">
          {host || '未配置地址'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="选择同步渠道"
          className="absolute right-0 top-full z-30 mt-1.5 w-72 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-1 shadow-[0_16px_40px_rgba(28,25,23,0.12)] dark:border-white/10 dark:bg-[#1b1b1e] dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          {channels.map((channel) => {
            const selected = channel.id === channelId;
            const itemHost = channelHost(channel.baseUrl);
            return (
              <button
                key={channel.id || 'global'}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(channel.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                  selected
                    ? 'bg-slate-100 dark:bg-white/10'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.05]'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-100">
                    <span className="truncate">{channel.name}</span>
                    {!channel.hasKey && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        未配置 Key
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-400 dark:text-slate-500">
                    {itemHost || '未配置地址'}
                  </span>
                </span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0 text-slate-700 dark:text-white" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
