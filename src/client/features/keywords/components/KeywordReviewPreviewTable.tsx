import { useEffect, useRef } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, Loader2, Search, XCircle } from 'lucide-react';
import type { useKeywordReview } from '../hooks/useKeywordReview';
import type { KeywordReviewRecord } from '../model/keywordReviewWorkbook';
import { REVIEW_FILTER_LABELS, type KeywordReviewFilter } from '../model/reviewPreview';
import { isIsolatedSubmission } from '../model/reviewProgress';

const selectClass = 'h-10 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:text-slate-200 dark:border-white/10 dark:bg-[#18191c]';
const pageButtonClass = 'flex h-8 items-center justify-center rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/5 dark:border-white/10';

function ReviewStatus({ record }: { record: KeywordReviewRecord }) {
  if (record.status === 'done') return <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" />已完成</span>;
  if (record.status === 'running') return <span className="inline-flex items-center gap-1.5 text-blue-600"><Loader2 className="h-4 w-4 animate-spin" />审核中</span>;
  if (record.status === 'error') return <span className="inline-flex items-center gap-1.5 text-rose-600" title={record.error}><XCircle className="h-4 w-4" />{isIsolatedSubmission(record) ? '待核对' : '失败'}</span>;
  return <span className="text-slate-500 dark:text-slate-400">待审核</span>;
}

function reviewReason(record: KeywordReviewRecord) {
  if (record.status === 'done') {
    return record.producible === '不制作' ? record.rejectReason || record.categoryReason || '—' : record.categoryReason || '—';
  }
  if (record.status === 'error') return record.error || (isIsolatedSubmission(record) ? '提交结果尚未确认，请先核对' : '审核失败，请重试');
  return record.status === 'running' ? '审核进行中，完成后显示依据' : '尚未完成审核';
}

export function KeywordReviewPreviewTable({ review, onSelect }: { review: ReturnType<typeof useKeywordReview>; onSelect: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [review.page, review.filter, review.search, review.sheetFilter, review.categoryFilter]);
  return (
              <section className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#18191c]/95">
                <div className="space-y-3 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h2 className="text-sm font-black text-slate-900 dark:text-slate-100">审核预览</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">按原表顺序分页，点击详情查看完整内容和审核依据</p></div>
                    <span role="status" className="text-xs font-semibold text-slate-500 dark:text-slate-400">{review.searchPending ? '正在筛选…' : `${REVIEW_FILTER_LABELS[review.filter]} · ${review.filteredCount} 条`}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 dark:border-white/10 dark:bg-[#18191c]">
                      <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <input type="search" aria-label="搜索关键词或审核依据" placeholder="搜索关键词、原表内容或审核依据" value={review.search} onChange={(event) => review.setSearch(event.target.value)} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
                    </label>
                    <select aria-label="筛选审核状态" value={review.filter} onChange={(event) => review.setFilter(event.target.value as KeywordReviewFilter)} className={selectClass}>
                      {Object.entries(REVIEW_FILTER_LABELS).filter(([key]) => key !== 'low_value' || review.reviewMode === 'video').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <select aria-label="筛选工作表" value={review.sheetFilter} onChange={(event) => review.setSheetFilter(event.target.value)} className={selectClass}>
                      <option value="">全部工作表</option>{review.parsed?.sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
                    </select>
                    <select aria-label="筛选最终垂类" value={review.categoryFilter} onChange={(event) => review.setCategoryFilter(event.target.value)} className={selectClass}>
                      <option value="">全部垂类</option>{review.categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    {(review.search || review.sheetFilter || review.categoryFilter || review.filter !== 'all') && <button type="button" onClick={() => { review.setSearch(''); review.setSheetFilter(''); review.setCategoryFilter(''); review.setFilter('all'); }} className="rounded-xl px-3 text-xs font-bold text-blue-700 hover:bg-blue-50">清空筛选</button>}
                  </div>
                </div>
                <div ref={scrollRef} tabIndex={0} role="region" aria-label="关键词审核结果表，可横向滚动" aria-busy={review.searchPending} className="max-h-[600px] overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400">
                  <table className="w-full min-w-[1000px] table-fixed border-collapse text-left text-sm">
                    <colgroup><col className="w-[7%]" /><col className="w-[27%]" /><col className="w-[13%]" /><col className="w-[12%]" />{review.reviewMode === 'video' && <col className="w-[9%]" />}<col className={review.reviewMode === 'video' ? 'w-[16%]' : 'w-[25%]'} /><col className="w-[10%]" /><col className="w-[6%]" /></colgroup>
                    <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                      <tr>
                        {['行号', 'query', '最终垂类', '是否可制作', ...(review.reviewMode === 'video' ? ['低价值'] : []), '判断依据', '状态', '详情'].map((label) => <th key={label} className="px-4 py-3 text-xs font-bold whitespace-nowrap">{label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {review.previewRecords.map((record) => (
                        <tr key={record.id} className="border-b border-slate-100 last:border-0 hover:bg-amber-50/35 dark:border-white/10">
                          <td className="px-4 py-3 text-xs tabular-nums text-slate-500 dark:text-slate-400">{record.rowNumber}</td>
                          <td className="px-4 py-3"><span className="line-clamp-2 break-words font-bold leading-5 text-slate-800 dark:text-slate-100" title={record.query}>{record.query}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{record.sheetName}</span></td>
                          <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200"><span className="line-clamp-2 break-words">{record.status === 'done' ? record.category || '—' : '—'}</span></td>
                          <td className="px-4 py-3">{record.status === 'done' && record.producible ? <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${record.producible === '制作' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{record.producible}</span> : <span className="text-slate-500 dark:text-slate-400">—</span>}</td>
                          {review.reviewMode === 'video' && <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">{record.status === 'done' ? record.lowValue || '—' : '—'}</td>}
                          <td className={`px-4 py-3 text-xs leading-5 ${record.status === 'error' ? 'text-rose-700' : 'text-slate-500 dark:text-slate-400'}`}><span className="line-clamp-2 break-words" title={reviewReason(record)}>{reviewReason(record)}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold"><ReviewStatus record={record} /></td>
                          <td className="px-3 py-3"><button type="button" onClick={() => onSelect(record.id)} aria-label={`查看${record.sheetName}第 ${record.rowNumber} 行详情`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:text-white dark:text-slate-400 dark:hover:bg-white/10"><Eye className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                      {review.previewRecords.length === 0 && <tr><td colSpan={review.reviewMode === 'video' ? 8 : 7} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">没有匹配的记录，可清空搜索或调整筛选条件</td></tr>}
                    </tbody>
                  </table>
                </div>
                <nav aria-label="审核预览分页" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3 pl-4 pr-20 dark:border-white/10">
                  <p className="text-xs text-slate-500 dark:text-slate-400">显示 {review.previewStart}–{review.previewEnd} / {review.filteredCount} 条 · 每页 {review.previewLimit} 条</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={review.page === 1} onClick={() => review.setPage(1)} className={pageButtonClass}>首页</button>
                    <button type="button" aria-label="上一页" disabled={review.page === 1} onClick={() => review.setPage(review.page - 1)} className={pageButtonClass}><ChevronLeft className="h-4 w-4" /></button>
                    <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{review.page} / {review.pageCount}</span>
                    <button type="button" aria-label="下一页" disabled={review.page === review.pageCount} onClick={() => review.setPage(review.page + 1)} className={pageButtonClass}><ChevronRight className="h-4 w-4" /></button>
                    <button type="button" disabled={review.page === review.pageCount} onClick={() => review.setPage(review.pageCount)} className={pageButtonClass}>末页</button>
                  </div>
                </nav>
              </section>
  );
}
