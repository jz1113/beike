import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, History, Loader2, Trash2 } from 'lucide-react';
import type { KeywordReviewMode } from '@shared/contracts/generate';
import { useKeywordReviewDialog } from '../hooks/useKeywordReviewDialog';

export interface KeywordReviewRecoverySummary {
  fileName: string;
  mode: KeywordReviewMode;
  savedAt: number;
  total: number;
  done: number;
  pending: number;
  uncertain: number;
  failed?: number;
}

interface Props {
  snapshot: KeywordReviewRecoverySummary;
  onRestore: () => Promise<void>;
  onDiscard: () => Promise<void>;
}

export function KeywordReviewRecoveryDialog({ snapshot, onRestore, onDiscard }: Props) {
  const [action, setAction] = useState<'restore' | 'discard' | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDiscardRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useKeywordReviewDialog(true, () => undefined, false);
  const busy = action !== null;
  const savedTime = Number.isFinite(snapshot.savedAt)
    ? new Date(snapshot.savedAt).toLocaleString('zh-CN', { hour12: false }) : '保存时间未知';

  useEffect(() => {
    (confirmDiscard ? cancelDiscardRef : restoreButtonRef).current?.focus({ preventScroll: true });
  }, [confirmDiscard]);

  const perform = async (nextAction: 'restore' | 'discard') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAction(nextAction);
    setError('');
    try {
      await (nextAction === 'restore' ? onRestore() : onDiscard());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时无法读取本机记录，请重试。');
    } finally {
      busyRef.current = false;
      setAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="keyword-recovery-title" aria-describedby="keyword-recovery-description" aria-busy={busy} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none dark:bg-[#18191c]">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6 dark:border-white/10">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><History className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="keyword-recovery-title" className="text-lg font-black text-slate-950 dark:text-slate-100">发现上次审核进度</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">此浏览器已保存一份关键词任务</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:bg-white/5 dark:border-white/10">
            <p className="flex items-start gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{snapshot.fileName}</span></p>
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{snapshot.mode === 'video' ? '视频' : '图文'}审核 · 共 {snapshot.total.toLocaleString('zh-CN')} 条关键词</p>
            <p className="mt-1 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">保存于 {savedTime}</p>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {([
                ['已完成', snapshot.done, 'text-blue-600'],
                ['待审核', snapshot.pending, 'text-slate-900 dark:text-slate-100'],
                ['待核对', snapshot.uncertain, 'text-amber-700'],
              ] as const).map(([label, value, tone]) => (
                <div key={label} className="rounded-xl bg-white px-2 py-3 text-center dark:bg-[#18191c]">
                  <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className={`mt-1 break-words text-lg font-black tabular-nums sm:text-2xl ${tone}`}>{value.toLocaleString('zh-CN')}</dd>
                </div>
              ))}
            </dl>
            {Boolean(snapshot.failed) && <p className="mt-3 text-xs leading-5 text-rose-700">另有 {snapshot.failed} 条已确认失败，恢复后可查看原因。</p>}
          </div>
          <p id="keyword-recovery-description" className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">继续上次任务将恢复表格与审核结果，审核不会自动开始。请先处理这份进度，再导入新表。</p>
          {snapshot.uncertain > 0 && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">待核对记录可能已提交给模型，恢复后会继续隔离，避免重复提交。可先导出进度并核对模型用量。</p>}
          {confirmDiscard && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">清除后将无法从本机恢复这份审核进度，已导出的表格不受影响。</p>}
          {error && <p role="alert" className="mt-3 break-words text-sm leading-6 text-rose-700">{error}</p>}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6 dark:border-white/10">
          {confirmDiscard ? <>
            <button ref={cancelDiscardRef} type="button" disabled={busy} onClick={() => { setConfirmDiscard(false); setError(''); }} className="rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10">取消清除</button>
            <button type="button" disabled={busy} onClick={() => void perform('discard')} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50">{action === 'discard' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}{action === 'discard' ? '正在清除…' : '确认清除本机记录'}</button>
          </> : <>
            <button type="button" disabled={busy} onClick={() => setConfirmDiscard(true)} className="rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10">清除本机记录</button>
            <button ref={restoreButtonRef} type="button" data-dialog-initial-focus disabled={busy} onClick={() => void perform('restore')} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50 dark:hover:bg-slate-200">{action === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <History className="h-4 w-4" aria-hidden="true" />}{action === 'restore' ? '正在恢复…' : '继续上次任务'}</button>
          </>}
        </footer>
      </section>
    </div>
  );
}
