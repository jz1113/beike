import { useRef } from 'react';
import { Download, FileVideo, FolderDown, Loader2, Pause, Play, Trash2, UploadCloud } from 'lucide-react';
import { useFileDropZone } from '@client/shared/hooks/useFileDropZone';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { useVideoDownloadQueue, VIDEO_CONCURRENCY_TIERS } from '../hooks/useVideoDownloadQueue';

type Toast = (message: string) => void;

const STATUS_LABEL = {
  pending: '待下载',
  running: '下载中',
  success: '已完成',
  failed: '失败',
} as const;

export default function CollectorVideoDownloadPanel({ showToast }: { showToast: Toast }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queue = useVideoDownloadQueue(showToast);
  const acceptSheet = (file: File) => /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheet');
  const { dropZoneProps } = useFileDropZone({
    onFiles: (files) => { if (files[0]) void queue.importFile(files[0]); },
    accept: acceptSheet,
    disabled: queue.running,
    onReject: () => showToast('请上传 .xlsx 表格'),
  });
  const finished = queue.successCount + queue.failedCount;
  const progress = queue.items.length ? Math.round((finished / queue.items.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
        className={`group flex min-h-[220px] w-full flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-rose-200 bg-white px-8 text-center transition hover:border-rose-400 ${queue.running ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg transition group-hover:-translate-y-1 group-hover:bg-blue-600">
          <UploadCloud className="h-7 w-7" />
        </div>
        <div className="mt-5 text-lg font-black text-slate-900">导入标题和视频链接表格</div>
        <p className="mt-2 max-w-lg text-sm text-slate-400">识别「新标题 / 标题」和「链接 / 视频链接」。文件名使用标题，已带 .mp4 时不会再追加。</p>
      </div>

      {queue.items.length > 0 && (
        <div className="space-y-4 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-black text-slate-900">oss视频下载</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">共 {queue.items.length} 个</span>
              <span className="text-xs font-bold text-emerald-600">完成 {queue.successCount}</span>
              <span className="text-xs font-bold text-rose-600">失败 {queue.failedCount}</span>
              <span className="text-xs font-bold text-amber-600">待下载 {queue.pendingCount}</span>
              {queue.runningCount > 0 && <span className="animate-pulse text-xs font-bold text-blue-600">进行中 {queue.runningCount}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/90 px-2.5 py-1.5 text-xs text-slate-700">
                <span className="font-medium text-slate-500">并发</span>
                <select
                  value={queue.concurrency}
                  disabled={queue.running}
                  onChange={(event) => queue.setConcurrency(Number(event.target.value))}
                  className="cursor-pointer bg-transparent text-xs font-bold text-slate-900 focus:outline-none"
                  aria-label="下载并发数"
                >
                  {VIDEO_CONCURRENCY_TIERS.map((value) => <option key={value} value={value}>{value} 路</option>)}
                </select>
              </label>
              {queue.folderName && <span className="max-w-40 truncate text-xs text-slate-500" title={queue.directory}>文件夹：{queue.folderName}</span>}
              {queue.running ? (
                <button type="button" onClick={() => void queue.pause()} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-600">
                  <Pause className="h-3.5 w-3.5" />暂停
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void queue.start(false)}
                  disabled={queue.pendingCount === 0}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold ${queue.pendingCount === 0 ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-md shadow-blue-500/25 hover:bg-blue-700'}`}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />{queue.folderName ? '开始下载' : '选择文件夹并下载'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void queue.start(true)}
                disabled={queue.running || queue.failedCount === 0}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold ${queue.running || queue.failedCount === 0 ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'}`}
              >
                <Download className="h-3.5 w-3.5" />重试失败
              </button>
              <button
                type="button"
                onClick={() => void queue.pickFolder()}
                disabled={queue.running}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FolderDown className="h-3.5 w-3.5" />更换文件夹
              </button>
              <button
                type="button"
                title="清空列表"
                onClick={async () => {
                  if (await confirmAction('确定清空当前视频下载列表吗？')) queue.clearItems();
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>

          <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {queue.items.map((item) => (
              <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-100 px-3 py-2.5">
                <FileVideo className={`h-4 w-4 ${item.status === 'running' ? 'animate-pulse text-blue-600' : 'text-slate-400'}`} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900" title={item.filename}>{item.filename}</div>
                  <div className="truncate text-xs text-slate-400" title={item.url}>{item.error || item.url}</div>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-bold ${item.status === 'success' ? 'text-emerald-600' : item.status === 'failed' ? 'text-rose-600' : item.status === 'running' ? 'text-blue-600' : 'text-amber-600'}`}>
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
