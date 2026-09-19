import { Settings } from 'lucide-react';
import BatchWorkshopView from '@/features/workshop/batch/components/BatchWorkshopView';

interface Props {
  onOpenSettings?: () => void;
}

export default function ReplicationStudio({ onOpenSettings }: Props) {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white relative select-none">
      <header className="px-5 sm:px-8 py-2.5 bg-transparent flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-3 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-base font-black text-slate-900 tracking-tight">
              爆款复刻
            </span>
            <span className="text-[11px] text-slate-400 font-medium truncate">
              对标爆款 · 五步出图闭环
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              title="设置"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <BatchWorkshopView fixedBatchMode="replication" />
      </div>
    </div>
  );
}
