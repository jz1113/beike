import { useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useKeywordReviewDialog } from '../hooks/useKeywordReviewDialog';

export function KeywordReviewClearRecoveryDialog({ onClose, onClear }: {
  onClose: () => void;
  onClear: () => Promise<boolean>;
}) {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const cancel = () => { if (!busyRef.current) onClose(); };
  const dialogRef = useKeywordReviewDialog(true, cancel, !clearing);
  const clear = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setClearing(true);
    setError('');
    try {
      if (await onClear()) onClose();
      else setError('清除未完成，本机记录仍保留。请重试。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '清除失败，请重试。');
    } finally {
      busyRef.current = false;
      setClearing(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="keyword-clear-recovery-title" aria-describedby="keyword-clear-recovery-description" aria-busy={clearing} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl outline-none sm:p-6">
        <h2 id="keyword-clear-recovery-title" className="text-lg font-black text-slate-950">清除本机审核记录？</h2>
        <p id="keyword-clear-recovery-description" className="mt-3 text-sm leading-6 text-slate-600">当前保存的进度无法读取。清除后可重新导入表格，但这份本机审核记录将无法恢复。原始表格和已导出的进度表不受影响。</p>
        {error && <p role="alert" className="mt-3 break-words text-sm leading-6 text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" data-dialog-initial-focus disabled={clearing} onClick={cancel} className="rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">取消</button>
          <button type="button" disabled={clearing} onClick={() => void clear()} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50">{clearing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}{clearing ? '正在清除…' : '确认清除本机记录'}</button>
        </div>
      </section>
    </div>
  );
}
