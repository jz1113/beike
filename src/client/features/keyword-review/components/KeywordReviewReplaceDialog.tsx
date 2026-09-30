import { useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { useKeywordReviewDialog } from '../hooks/useKeywordReviewDialog';

export function KeywordReviewReplaceDialog({ busy, onClose, onReplace, onExport }: {
  busy: boolean; onClose: () => void; onReplace: () => void; onExport: () => Promise<boolean>;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const isBusy = busy || exporting;
  const dialogRef = useKeywordReviewDialog(true, onClose, !isBusy);
  const exportAndReplace = async () => {
    if (isBusy) return;
    setExporting(true);
    setExportError('');
    try {
      if (await onExport()) onReplace();
      else setExportError('导出未完成，当前进度已保留。可重试导出或继续查看。');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，当前进度已保留。');
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="keyword-replace-title" aria-describedby="keyword-replace-description" aria-busy={isBusy} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-white p-4 shadow-2xl outline-none sm:p-6">
        <div className="flex items-center justify-between gap-3"><h2 id="keyword-replace-title" className="text-lg font-black">保存当前审核进度</h2><button type="button" disabled={isBusy} onClick={onClose} aria-label="关闭换表提示" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X className="h-4 w-4" /></button></div>
        <p id="keyword-replace-description" className="mt-3 text-sm leading-6 text-slate-600">当前表格有未导出的审核结果或待核对记录。换表会清空本页进度，建议先导出，之后可重新导入继续。</p>
        {exportError && <p role="alert" className="mt-3 break-words text-sm leading-6 text-rose-700">{exportError}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={isBusy} onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40">继续查看</button>
          <button type="button" disabled={isBusy} onClick={onReplace} className="rounded-xl px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40">直接换表</button>
          <button type="button" data-dialog-initial-focus disabled={isBusy} onClick={() => void exportAndReplace()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{isBusy ? '正在导出…' : '导出并换表'}</button>
        </div>
      </section>
    </div>
  );
}
