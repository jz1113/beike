import { Check, History, Loader2, Package, Play, Plus, RotateCcw, Settings2, Square, Type, X } from 'lucide-react';
import Dock, { type DockItemData } from '@client/shared/ui/Dock';
import { ToolSuiteMark } from '@client/shared/icons';

interface Props {
  onBack: () => void;
  failedCount: number;
  completedCount: number;
  pendingCount: number;
  isRunning: boolean;
  isExporting: boolean;
  hasItems: boolean;
  historyCount: number;
  isNewBatchConfirming: boolean;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onRetryFailed: () => void;
  onExport: () => void;
  onStartBatch: () => void;
  onStop: () => void;
  onRequestNewBatch: () => void;
  onCancelNewBatch: () => void;
  onConfirmNewBatch: () => void;
}

export function PosterToolbar({
  onBack, failedCount, completedCount, pendingCount, isRunning, isExporting,
  hasItems, historyCount, isNewBatchConfirming, onOpenSettings, onOpenHistory, onRetryFailed, onExport, onStartBatch, onStop,
  onRequestNewBatch, onCancelNewBatch, onConfirmNewBatch,
}: Props) {
  const dockButtonClass = '!border-slate-200 !bg-white !text-slate-950 shadow-sm hover:!border-slate-300 hover:!bg-slate-50';
  const generationControl: DockItemData = isRunning
    ? { icon: <Square className="h-4 w-4 fill-current" />, label: '停止生成', onClick: onStop, className: dockButtonClass }
    : failedCount > 0 && pendingCount === 0
      ? { icon: <RotateCcw className="h-4 w-4" />, label: `重试失败（${failedCount} 条）`, onClick: onRetryFailed, className: dockButtonClass }
      : { icon: <Play className="h-4 w-4 fill-current" />, label: pendingCount > 0 ? `开始批量生成（${pendingCount} 条）` : '没有待生成任务', onClick: onStartBatch, className: dockButtonClass, disabled: pendingCount === 0 };
  const dockItems: DockItemData[] = [
    { icon: <Plus className="h-4 w-4" />, label: '新建批次', onClick: onRequestNewBatch, className: dockButtonClass, disabled: !hasItems },
    generationControl,
    { icon: isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />, label: completedCount > 0 ? `打包下载（${completedCount} 张）` : '暂无可下载成品', onClick: onExport, className: dockButtonClass, disabled: isExporting || completedCount === 0 },
    { icon: <History className="h-4 w-4" />, label: historyCount > 0 ? `历史批次（${historyCount}）` : '历史批次', onClick: onOpenHistory, className: dockButtonClass },
    { icon: <Settings2 className="h-4 w-4" />, label: '生产设置', onClick: onOpenSettings, className: dockButtonClass },
  ];

  return (
    <header className="relative flex min-h-[72px] items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="group inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:bg-white" title="返回首页">
        <ToolSuiteMark><Type className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /></ToolSuiteMark>
        <span className="text-sm font-black tracking-tight">大字报生成</span>
      </button>
      {isNewBatchConfirming ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-300/30 bg-[#121116] p-2 shadow-[0_12px_28px_-18px_rgba(15,23,42,0.85)]">
          <span className="hidden px-1 text-xs font-bold text-rose-100 sm:inline">清空当前批次？</span>
          <button type="button" onClick={onCancelNewBatch} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-300 transition-colors hover:bg-white/10 hover:text-white" aria-label="取消新建批次" title="取消"><X className="h-4 w-4" /></button>
          <button type="button" onClick={onConfirmNewBatch} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500 text-white transition-colors hover:bg-rose-400" aria-label={isRunning ? '停止并新建批次' : '确认新建批次'} title={isRunning ? '停止并新建批次' : '确认新建批次'}><Check className="h-4 w-4" /></button>
        </div>
      ) : <Dock items={dockItems} positioned={false} expandsOnHover={false} showLabels labelPlacement="bottom" panelHeight={56} dockHeight={56} baseItemSize={42} magnification={58} distance={140} className="!border-transparent !bg-transparent !shadow-none" />}
    </header>
  );
}
