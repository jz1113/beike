import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, FileVideo, FolderDown, Loader2, Pause, Play, Trash2, UploadCloud } from 'lucide-react';
import { useFileDropZone } from '@client/shared/hooks/useFileDropZone';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { useVideoDownloadQueue, type VideoDownloadStatus } from '../hooks/useVideoDownloadQueue';

type Toast = (message: string) => void;
type VideoQueue = ReturnType<typeof useVideoDownloadQueue>;
type StatusFilter = 'all' | VideoDownloadStatus;

const STATUS_LABEL = {
  pending: '待下载',
  running: '下载中',
  success: '已完成',
  failed: '失败',
} as const;

const uploadIconClass = 'flex items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-100 text-slate-700 shadow-sm transition group-hover:-translate-y-1 group-hover:border-indigo-600 group-hover:bg-indigo-600 group-hover:text-white dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:group-hover:border-indigo-500 dark:group-hover:bg-indigo-500';

function acceptSheet(file: File) {
  return /\.(xlsx|xls|csv)$/i.test(file.name)
    || file.type.includes('spreadsheet')
    || file.type.includes('csv')
    || file.type === 'text/csv';
}

export default function CollectorVideoDownloadPanel({ showToast, queue }: { showToast: Toast; queue: VideoQueue }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  useEffect(() => { setFilter('all'); }, [queue.importEpoch]);
  const { dropZoneProps } = useFileDropZone({
    onFiles: (files) => { if (files[0]) void queue.importFile(files[0]); },
    accept: acceptSheet,
    disabled: queue.running,
    onReject: () => showToast('请上传 .xlsx、.xls 或 .csv 表格'),
  });
  const hasItems = queue.items.length > 0;
  const finished = queue.successCount + queue.failedCount;
  const progress = queue.items.length ? Math.round((finished / queue.items.length) * 100) : 0;
  const visibleItems = queue.items.filter((item) => filter === 'all' || item.status === filter);
  const canStart = Boolean(queue.directory) && queue.pendingCount > 0;

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void queue.importFile(file);
        }}
      />
      <div
        onClick={() => { if (!queue.running) fileInputRef.current?.click(); }}
        {...dropZoneProps}
        className={`group flex w-full items-center justify-center rounded-[32px] border-2 border-dashed border-slate-300/80 bg-white/80 text-center backdrop-blur-xl transition hover:border-indigo-400 hover:bg-white dark:border-white/15 dark:bg-[#18181B]/80 dark:hover:border-indigo-500/80 dark:hover:bg-[#1E1E22] ${
          queue.running ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${hasItems ? 'min-h-0 flex-row gap-3 px-5 py-3' : 'min-h-[220px] flex-col px-8'}`}
      >
        <div className={`${uploadIconClass} ${hasItems ? 'h-10 w-10' : 'h-16 w-16'}`}>
          <UploadCloud className={hasItems ? 'h-5 w-5' : 'h-7 w-7'} />
        </div>
        <div className={hasItems ? 'text-left' : ''}>
          <div className={`font-black text-slate-900 dark:text-white ${hasItems ? 'text-sm' : 'mt-5 text-lg'}`}>
            {hasItems ? '重新导入表格' : '导入标题和视频链接表格'}
          </div>
          {!hasItems && (
            <p className="mt-2 max-w-lg text-sm text-slate-400 dark:text-slate-500">
              识别「新标题 / 标题 / 商品标题」和「链接 / 视频链接 / oss链接」。支持 .xlsx、.xls、.csv。文件名使用标题，已带 .mp4 时不会再追加。
            </p>
          )}
        </div>
      </div>

      {hasItems && (
        <div className="space-y-4 rounded-3xl border border-slate-200/90 bg-white/85 p-5 shadow-sm backdrop-blur-xl animate-fade-in dark:border-white/10 dark:bg-[#18181B]/85">
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 ${
            queue.directory
              ? 'border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-white/5'
              : 'border-amber-300/80 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/30'
          }`}>
            {queue.directory ? (
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white">保存位置：{queue.folderName}</div>
                <div className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={queue.directory}>{queue.directory}</div>
              </div>
            ) : (
              <div className="text-xs font-bold text-amber-800 dark:text-amber-200">请先选择本地保存文件夹</div>
            )}
            <button
              type="button"
              onClick={() => void queue.pickFolder()}
              disabled={queue.running}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                queue.directory
                  ? 'border border-slate-200/80 bg-white/70 text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                  : 'bg-blue-600 text-white shadow-md shadow-blue-500/25 hover:bg-blue-700'
              }`}
            >
              <FolderDown className="h-3.5 w-3.5" />{queue.directory ? '更换文件夹' : '选择保存文件夹'}
            </button>
          </div>

          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-slate-900 dark:text-white">oss视频下载</span>
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} className="bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300">共 {queue.items.length} 个</FilterChip>
              <FilterChip active={filter === 'success'} onClick={() => setFilter('success')} className="text-emerald-600 dark:text-emerald-400">完成 {queue.successCount}</FilterChip>
              <FilterChip active={filter === 'failed'} onClick={() => setFilter('failed')} className="text-rose-600 dark:text-rose-400">失败 {queue.failedCount}</FilterChip>
              <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')} className="text-amber-600 dark:text-amber-400">待下载 {queue.pendingCount}</FilterChip>
              {queue.runningCount > 0 && (
                <FilterChip active={filter === 'running'} onClick={() => setFilter('running')} className="animate-pulse text-blue-600 dark:text-blue-400">进行中 {queue.runningCount}</FilterChip>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-xl border border-slate-200/80 bg-slate-100/90 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                并发 100 路
              </span>
              {queue.running ? (
                <button
                  type="button"
                  onClick={() => void queue.pause()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-600"
                >
                  <Pause className="h-3.5 w-3.5" />暂停
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void queue.start(false)}
                  disabled={!canStart}
                  title={queue.directory ? '开始下载到已选文件夹' : '请先选择保存文件夹'}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold ${
                    canStart
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 hover:bg-blue-700'
                      : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-600'
                  }`}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />开始下载
                </button>
              )}
              <button
                type="button"
                onClick={() => void queue.start(true)}
                disabled={queue.running || queue.failedCount === 0 || !queue.directory}
                title={queue.directory ? '重试失败的视频' : '请先选择保存文件夹'}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                  queue.running || queue.failedCount === 0 || !queue.directory
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-600'
                    : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-950/40'
                }`}
              >
                <Download className="h-3.5 w-3.5" />重试失败
              </button>
              <button
                type="button"
                title="清空列表"
                onClick={async () => {
                  if (await confirmAction('确定清空当前视频下载列表吗？')) queue.clearItems();
                }}
                className="cursor-pointer rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>

          <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {visibleItems.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">当前筛选下没有视频</li>
            )}
            {visibleItems.map((item) => (
              <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 dark:border-white/5 dark:bg-white/5">
                <FileVideo className={`h-4 w-4 ${item.status === 'running' ? 'animate-pulse text-blue-600' : 'text-slate-400'}`} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900 dark:text-white" title={item.filename}>{item.filename}</div>
                  <div className={`truncate text-xs ${item.error ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`} title={item.error || item.url}>{item.error || item.url}</div>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-bold ${item.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' : item.status === 'failed' ? 'text-rose-600 dark:text-rose-400' : item.status === 'running' ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {item.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {STATUS_LABEL[item.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`cursor-pointer rounded-full px-2 py-0.5 font-mono text-xs font-bold ${className} ${active ? 'ring-1 ring-current' : ''}`}
    >
      {children}
    </button>
  );
}
