import React from 'react';
import { Download, Loader2, Minus, Trash2, X } from 'lucide-react';
import { useI18n } from '@client/shared/i18n';

interface Props {
  selectedCount: number;
  onClearSelection: () => void;
  onBatchDownload?: () => void;
  onBatchDelete: () => void;
  isDownloading?: boolean;
  isDeleting?: boolean;
  itemUnit?: string;
}

export default function MaterialFloatingDock({
  selectedCount,
  onClearSelection,
  onBatchDownload,
  onBatchDelete,
  isDownloading = false,
  isDeleting = false,
}: Props) {
  const { t } = useI18n();
  if (selectedCount <= 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2.5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-4 py-2 text-slate-800 dark:text-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.12)] border border-slate-200/90 dark:border-white/10">
        {/* 已选项标识与取消全选 */}
        <button
          type="button"
          onClick={onClearSelection}
          title={t('assets.deselectAll')}
          aria-label={t('assets.selectedCount', { count: selectedCount })}
          className="flex items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200/80 dark:bg-white/10 dark:hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-300 dark:bg-white/30 text-slate-800 dark:text-white">
            <Minus className="h-2.5 w-2.5 stroke-[2.5]" />
          </span>
          <span>{t('assets.selectedCount', { count: selectedCount })}</span>
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-white/15" />

        {/* 批量下载（可选） */}
        {onBatchDownload && (
          <button
            type="button"
            disabled={isDownloading || isDeleting}
            onClick={onBatchDownload}
            className="flex items-center gap-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 text-xs font-semibold active:scale-95 transition-all disabled:opacity-50 shadow-xs cursor-pointer dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:text-white dark:shadow-[0_0_14px_rgba(99,102,241,0.25)]"
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>{t('assets.batchDownload')}</span>
          </button>
        )}

        {/* 批量删除：优雅警示浅红胶囊，符合系统调性 */}
        <button
          type="button"
          disabled={isDownloading || isDeleting}
          onClick={onBatchDelete}
          className="flex items-center gap-1.5 rounded-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-200/80 dark:border-rose-800/60 px-3.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          <span>{selectedCount === 1 ? t('common.delete') : t('assets.batchDelete')}</span>
        </button>

        {/* 退出选择 */}
        <button
          type="button"
          onClick={onClearSelection}
          title={t('assets.exitBatch')}
          aria-label="退出选择"
          className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
