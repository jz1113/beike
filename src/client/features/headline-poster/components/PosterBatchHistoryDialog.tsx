import { Clock3, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import type { PosterBatchRecord } from '../model/posterBatchHistory';

interface Props {
  batches: PosterBatchRecord[];
  activeBatchId: string | null;
  onClose: () => void;
  onRestore: (record: PosterBatchRecord) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatBatchTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(value);
}

function batchTitle(batch: PosterBatchRecord) {
  const first = batch.items[0];
  const title = first?.originalTitle || first?.productName || '未命名批次';
  return batch.items.length > 1 ? `${title} 等 ${batch.items.length} 条` : title;
}

export function PosterBatchHistoryDialog({ batches, activeBatchId, onClose, onRestore, onDelete }: Props) {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const restore = async (batch: PosterBatchRecord) => {
    setRestoringId(batch.id);
    try {
      await onRestore(batch);
      onClose();
    } finally {
      setRestoringId(null);
    }
  };

  const remove = async (batch: PosterBatchRecord) => {
    setDeletingId(batch.id);
    try {
      await onDelete(batch.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[91] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="历史批次" className="w-full max-w-[680px] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)]" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Clock3 className="h-3.5 w-3.5" /></span><div><h2 className="text-sm font-black">历史批次</h2><p className="mt-0.5 text-xs text-slate-400">已自动保存生成记录与可恢复成品。</p></div></div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="关闭历史批次"><X className="h-4 w-4" /></button>
        </header>
        <div className="max-h-[min(56vh,460px)] overflow-y-auto border-t border-slate-100">
          {batches.length === 0 ? <div className="px-6 py-14 text-center text-sm text-slate-400">暂无历史批次。导入内容后会自动建立并保存批次记录。</div> : (
            <div className="divide-y divide-slate-100">
              {batches.map((batch) => {
                const complete = batch.items.filter((item) => item.status === 'complete').length;
                const failed = batch.items.filter((item) => item.status === 'failed').length;
                const preview = batch.items.find((item) => item.resultUrl || item.sourceImageUrl);
                const isActive = batch.id === activeBatchId;
                return <article key={batch.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <div className="h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {preview ? <LazyProxyImage src={preview.resultUrl || preview.sourceImageUrl} alt="批次预览" width={72} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="truncate text-sm font-bold text-slate-800">{batchTitle(batch)}</p>{isActive && <span className="shrink-0 text-[10px] font-bold text-rose-500">当前批次</span>}</div>
                    <p className="mt-1 text-xs text-slate-400">{formatBatchTime(batch.updatedAt)} · {batch.items.length} 条 · 完成 {complete} · 失败 {failed}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => void restore(batch)} disabled={restoringId !== null} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-45"><RotateCcw className="h-3.5 w-3.5" />{restoringId === batch.id ? '恢复中' : '查看'}</button>
                    {!isActive && <button type="button" onClick={() => void remove(batch)} disabled={deletingId !== null} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-45" aria-label={`删除批次 ${batchTitle(batch)}`} title="删除历史批次"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </article>;
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
