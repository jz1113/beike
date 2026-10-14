import { Download, Loader2, Minus, Trash2, X } from 'lucide-react';

interface Props {
  selectedCount: number;
  onClearSelection: () => void;
  onBatchDownload: () => void;
  onBatchDelete: () => void;
  isDownloading?: boolean;
  isDeleting?: boolean;
}

export default function MaterialFloatingDock({
  selectedCount,
  onClearSelection,
  onBatchDownload,
  onBatchDelete,
  isDownloading = false,
  isDeleting = false,
}: Props) {
  if (selectedCount <= 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-3 rounded-full bg-slate-950/95 px-5 py-2.5 text-white shadow-2xl backdrop-blur-md border border-slate-800">
        {/* 已选项标识与取消全选 */}
        <button
          type="button"
          onClick={onClearSelection}
          title="取消全选"
          aria-label={`已选 ${selectedCount} 项，点击取消全选`}
          className="flex items-center gap-2 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-white/20 hover:bg-white/30 text-white">
            <Minus className="h-3 w-3" />
          </span>
          <span>已选 {selectedCount} 个</span>
        </button>

        <div className="h-4 w-px bg-slate-700/80" />

        {/* 批量下载 */}
        <button
          type="button"
          disabled={isDownloading || isDeleting}
          onClick={onBatchDownload}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/20 active:scale-95 transition-all disabled:opacity-50"
        >
          {isDownloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>批量下载</span>
        </button>

        {/* 批量删除 */}
        <button
          type="button"
          disabled={isDownloading || isDeleting}
          onClick={onBatchDelete}
          className="flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-500 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          <span>批量删除</span>
        </button>

        {/* 退出选择 */}
        <button
          type="button"
          onClick={onClearSelection}
          title="退出选择模式"
          aria-label="退出选择"
          className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
