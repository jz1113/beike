import { Camera } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { ActionAngleEntry } from '../model/salesActionViews';
import { salesFocusClass } from './salesChrome';

export function SalesActionAngleGallery({
  title,
  entries,
  activeEntry,
  canManage,
  pending,
  onSelectAngle,
  onSetDefaultAngle,
}: {
  title: string;
  entries: readonly ActionAngleEntry[];
  activeEntry: ActionAngleEntry;
  canManage: boolean;
  pending: boolean;
  onSelectAngle: (angle: string) => void;
  onSetDefaultAngle: () => void;
}) {
  return (
    <div className="my-2 flex flex-col gap-3">
      <div className="relative flex justify-center overflow-hidden rounded-xl border border-slate-200/70 bg-slate-950/5 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
        <img
          src={proxyMediaUrl(activeEntry.url)}
          alt={`${title} · ${activeEntry.label}`}
          className="max-h-[340px] rounded-lg object-contain"
        />
        <span className="absolute bottom-3 left-3 rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          {activeEntry.label}{activeEntry.isDefault ? ' · 当前默认封面' : ''}
        </span>
        {canManage && !activeEntry.isDefault ? (
          <button
            type="button"
            disabled={pending}
            onClick={onSetDefaultAngle}
            className={`absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white shadow-md hover:bg-indigo-500 ${salesFocusClass}`}
          >
            <Camera size={12} />设为默认机位
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="多视角机位预览">
        {entries.map((entry) => (
          <button
            key={entry.angle}
            type="button"
            onClick={() => onSelectAngle(entry.angle)}
            className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[11px] font-medium transition ${
              entry.angle === activeEntry.angle
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                : 'border-slate-200/70 hover:border-indigo-400/50 dark:border-zinc-800'
            } ${salesFocusClass}`}
          >
            <img src={proxyMediaUrl(entry.url)} alt={entry.label} className="aspect-[3/4] w-full rounded-lg object-cover" />
            <span>{entry.shortLabel}{entry.isDefault ? '★' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

