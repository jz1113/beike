import { CheckSquare, Download, Loader2, Square, Trash2 } from 'lucide-react';
import { densityPill } from '@client/shared/ui/layoutClasses';

interface Props {
  failedCount: number;
  recordCount: number;
  selectedCount: number;
  downloadableSelectedCount: number;
  isBatchMode: boolean;
  isBusy: boolean;
  isDeleting: boolean;
  isDownloadingZip: boolean;
  areAllSelected: boolean;
  tasksHasMore: boolean;
  zipProgressLabel: string;
  onClearFailed: () => void;
  onToggleSelectAll: () => void;
  onBatchDownload: () => void;
  onBatchDelete: () => void;
  onExitBatch: () => void;
  onEnterBatch: () => void;
}

export default function AssetGenerationActions({ failedCount, recordCount, selectedCount, downloadableSelectedCount, isBatchMode, isBusy, isDeleting, isDownloadingZip, areAllSelected, tasksHasMore, zipProgressLabel, onClearFailed, onToggleSelectAll, onBatchDownload, onBatchDelete, onExitBatch, onEnterBatch }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 ml-auto">
      {/* 一键清理失败/卡顿任务按钮 */}
      {failedCount > 0 && (
        <button
          onClick={onClearFailed}
          disabled={isBusy}
          className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          title="清理当前筛选中的失败记录"
        >
          <Trash2 className="w-3.5 h-3.5 text-amber-600" />
          <span>{isDeleting ? '处理中...' : '清理失败'}</span>
        </button>
      )}
    
      {/* 批量操作（只保留画圈的批量操作） */}
      {isBatchMode ? (
        <div className="flex items-center gap-2 animate-fade-in flex-wrap">
          <button
            onClick={onToggleSelectAll}
            disabled={recordCount === 0 || isDeleting || isDownloadingZip}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            {areAllSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            <span>{areAllSelected ? '取消全选' : tasksHasMore ? '全选已加载' : '全选'}</span>
          </button>
    
          <button
            onClick={onBatchDownload}
            disabled={downloadableSelectedCount === 0 || isDownloadingZip || isDeleting}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            title="将选中的媒体记录打包为 ZIP；单视频最多 200 MB、音频 100 MB、图片 25 MB，素材总量最多 512 MB"
          >
            {isDownloadingZip ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            ) : (
              <Download className="w-3.5 h-3.5 text-indigo-600" />
            )}
            <span aria-live="polite">{isDownloadingZip ? zipProgressLabel || '正在打包…' : `批量下载 (${downloadableSelectedCount})`}</span>
          </button>
    
          <button
            onClick={onBatchDelete}
            disabled={selectedCount === 0 || isDeleting || isDownloadingZip}
            className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? '删除中…' : `批量删除 (${selectedCount})`}</span>
          </button>
    
          <button
            onClick={onExitBatch}
            disabled={isDeleting || isDownloadingZip}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
          >
            退出批量
          </button>
        </div>
      ) : (
        <button
          onClick={onEnterBatch}
          disabled={recordCount === 0 || isBusy}
          className={`${densityPill} rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          <span>批量操作</span>
        </button>
      )}
    </div>
  );
}
