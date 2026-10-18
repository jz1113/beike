import { X } from 'lucide-react';

export interface StudioHistoryItem {
  id: string;
  title: string;
  subtitle?: string;
  onOpen: () => void;
}

interface Props {
  open: boolean;
  title?: string;
  items: StudioHistoryItem[];
  onClose: () => void;
}

export function StudioHistoryDrawer({ open, title = '历史记录', items, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#16161A]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="关闭历史">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-slate-400">还没有历史记录</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={item.onOpen}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-left hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/40"
                  >
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</div>
                    {item.subtitle && <div className="mt-0.5 truncate text-[11px] text-slate-400">{item.subtitle}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
