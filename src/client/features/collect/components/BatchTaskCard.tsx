import React, { memo, useCallback } from 'react';
import {
  X, CheckCircle2, Loader2, RefreshCw, Download,
} from 'lucide-react';
import {
  BatchTaskItem,
  displayMediaSrc,
  collectedVideos,
  handleImgError,
} from '@client/features/collect/model/collectorTypes';

export interface BatchTaskCardProps {
  task: BatchTaskItem;
  index: number;
  onRetry: (task: BatchTaskItem) => Promise<void>;
  onRemove: (taskId: string) => void;
  onPreview: (url: string) => void;
  onDownloadZip?: (task: BatchTaskItem) => void;
  retryDisabled?: boolean;
}

const BatchTaskCard = memo(function BatchTaskCard({
  task,
  index,
  onRetry,
  onRemove,
  onPreview,
  onDownloadZip,
  retryDisabled = false,
}: BatchTaskCardProps) {
  const videoCount = collectedVideos(task).length;
  const handleRetry = useCallback(async () => {
    await onRetry(task);
  }, [onRetry, task]);

  const handleRemove = useCallback(() => {
    onRemove(task.id);
  }, [onRemove, task.id]);

  const handlePreview = useCallback(() => {
    if (task.coverImage) onPreview(task.coverImage);
  }, [onPreview, task.coverImage]);

  const handleDownload = useCallback(() => {
    onDownloadZip?.(task);
  }, [onDownloadZip, task]);

  return (
    <div className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs" role="listitem">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="w-5 text-slate-400 font-mono text-center flex-shrink-0">{index + 1}</span>

        {/* 封面或平台图标 */}
        {displayMediaSrc(task.coverImage) ? (
          <button type="button" onClick={handlePreview} aria-label={`预览 ${task.title || '采集条目'} 的封面`} className="shrink-0">
          <img
            src={displayMediaSrc(task.coverImage)}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => handleImgError(e, task.coverImage)}
            className="w-9 h-9 rounded-xl object-cover border border-slate-200 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          />
          </button>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 uppercase flex-shrink-0 text-[10px]">
            {task.platform}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="font-bold text-slate-900 break-words whitespace-normal leading-snug">
              {task.title || task.url}
            </span>
            {task.images && (
              <span className="px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 text-[10px] font-mono font-bold shrink-0">
                {task.images.length} 张图
              </span>
            )}
          </div>
          {task.status === 'failed' && task.error && (
            <p className="text-[11px] text-rose-600 break-words mt-0.5" role="alert">
              失败原因: {task.error}
            </p>
          )}
        </div>
      </div>

      {/* 状态徽标与单项操作 */}
      <div className="flex items-center gap-2 flex-shrink-0" role="status" aria-live="polite">
        {task.status === 'pending' && (
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
            等待中
          </span>
        )}
        {task.status === 'running' && (
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            <span>采集解析中...</span>
          </span>
        )}
        {task.status === 'success' && (
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
            <span>采集成功</span>
          </span>
        )}
        {task.status === 'failed' && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={retryDisabled}
            title={retryDisabled ? '请等待本轮采集结束后重试' : '重新采集此任务'}
            className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`重新采集任务 ${task.title || task.url}`}
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            <span>重试</span>
          </button>
        )}

        {/* 单独打包下载 */}
        {task.status === 'success' && ((task.images?.length || 0) > 0 || videoCount > 0) && (
          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
            aria-label={`下载 ${task.title || '商品'} ZIP`}
            title="单独下载该商品 ZIP"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}

        {/* 移除 */}
        <button
          type="button"
          onClick={handleRemove}
          className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
          aria-label="移除此任务"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});

export default BatchTaskCard;
