import { X } from 'lucide-react';
import { useKeywordReviewDialog } from '../hooks/useKeywordReviewDialog';
import { splitRejectReason, type KeywordReviewRecord, type OutputColumn } from '../model/keywordReviewWorkbook';
import { isIsolatedSubmission } from '../model/reviewProgress';

function sourceValue(record: KeywordReviewRecord, column: OutputColumn): string {
  if (column.key === 'query') return record.query;
  if (column.key === 'expansion') return record.expansion || record.sourceValues[column.key] || '';
  if (column.key === 'entityExpansion') return record.entityExpansion || record.sourceValues[column.key] || '';
  if (column.key === 'contentType') return record.contentType || record.sourceValues[column.key] || '';
  return record.sourceValues?.[column.key] || '';
}

export function KeywordReviewRecordDetails({ record, columns, onClose }: { record: KeywordReviewRecord; columns: OutputColumn[]; onClose: () => void }) {
  const sourceColumns = columns.filter((column) => column.kind === 'source' && (column.sourceKind !== 'query' || column.key !== 'query'));
  const hasResult = record.status === 'done';
  const reject = hasResult && record.producible === '不制作' ? splitRejectReason(record.rejectReason) : null;
  const isolated = isIsolatedSubmission(record);
  const statusLabel = record.status === 'done' ? '已完成' : record.status === 'running' ? '审核中' : record.status === 'error' ? isolated ? '待核对' : '失败' : '待审核';
  const dialogRef = useKeywordReviewDialog(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="keyword-record-title" className="flex max-h-[min(780px,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none dark:bg-[#18191c]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5 dark:border-white/10">
          <div className="min-w-0">
            <h2 id="keyword-record-title" tabIndex={-1} data-dialog-initial-focus className="text-lg font-black leading-7 text-slate-950 outline-none dark:text-slate-100">词包审核详情</h2>
            <p className="mt-1 break-words text-xs font-semibold text-slate-500 dark:text-slate-400">{record.sheetName} · 第 {record.rowNumber} 行 · {statusLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭详情" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div tabIndex={0} role="region" aria-label="关键词详情正文" className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 sm:px-6">
          <div><h3 className="text-xs font-bold text-slate-500 dark:text-slate-400">Query</h3><p className="mt-2 whitespace-pre-wrap break-words text-base font-bold leading-7 text-slate-900 dark:text-slate-100">{record.query}</p></div>
          <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 dark:bg-white/5">
            <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400">最终垂类</p><p className="mt-1 font-bold text-slate-800 dark:text-slate-100">{hasResult ? record.category || '—' : '—'}</p></div>
            <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400">是否可制作</p><p className="mt-1 font-bold text-slate-800 dark:text-slate-100">{hasResult ? record.producible || '—' : '—'}</p></div>
            <div className="sm:col-span-2"><p className="text-xs font-bold text-slate-500 dark:text-slate-400">垂类依据</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{hasResult ? record.categoryReason || '—' : record.status === 'running' ? '审核进行中，完成后显示依据' : '尚未获得有效审核结果'}</p></div>
            {hasResult && record.producible === '不制作' && <div className="sm:col-span-2"><p className="text-xs font-bold text-slate-500 dark:text-slate-400">不制作依据</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{reject ? `${reject.kind ? `${reject.kind}：` : ''}${reject.detail}` : record.rejectReason || '—'}</p></div>}
            {record.status === 'error' && <div className="sm:col-span-2"><p className="text-xs font-bold text-rose-500">{isolated ? '待核对原因' : '审核错误'}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-rose-700">{record.error || (isolated ? '提交结果尚未确认，请先核对' : '审核失败，请重试')}</p></div>}
            {hasResult && record.lowValue && <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400">低价值关键词</p><p className="mt-1 font-bold text-slate-800 dark:text-slate-100">{record.lowValue}</p></div>}
          </div>
          {sourceColumns.length > 0 && <div>
            <h3 className="mb-3 text-sm font-black text-slate-900 dark:text-slate-100">原表内容</h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              {sourceColumns.map((column) => <div key={column.key} className={`min-w-0 rounded-xl border border-slate-200 p-4 dark:border-white/10 ${column.sourceKind === 'expansion' || column.sourceKind === 'entityExpansion' ? 'sm:col-span-2' : ''}`}>
                <dt className="text-xs font-bold text-slate-500 dark:text-slate-400">{column.label}</dt>
                <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{sourceValue(record, column) || '—'}</dd>
              </div>)}
            </dl>
          </div>}
        </div>
      </section>
    </div>
  );
}
