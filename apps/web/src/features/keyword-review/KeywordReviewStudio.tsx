import { useRef, useState } from 'react';
import {
  BookOpen, CheckCircle2, Download, FileSpreadsheet, Layers, ListChecks, Loader2, Play,
  RefreshCcw, Settings2, Square, UploadCloud, XCircle,
} from 'lucide-react';
import { ToolSuiteMark } from '@/shared/icons';
import { KeywordReviewRulesDialog } from './KeywordReviewRulesDialog';
import { useKeywordReview } from './hooks/useKeywordReview';
import { splitRejectReason, type KeywordReviewRecord, type OutputColumn } from './model/keywordReviewWorkbook';

interface Props {
  onBack: () => void;
  onOpenSettings?: () => void;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function RejectReasonCell({ producible, reason }: { producible?: '制作' | '不制作'; reason?: string }) {
  const reject = producible === '不制作' ? splitRejectReason(reason) : null;
  if (!reject) return '—';
  return (
    <span className="inline-flex max-w-full items-start gap-1.5" title={reason}>
      {reject.kind ? <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700">{reject.kind}</span> : null}
      <span className="line-clamp-2 text-xs leading-5 text-slate-500">{reject.detail || '—'}</span>
    </span>
  );
}

function sourceValue(record: KeywordReviewRecord, column: OutputColumn): string {
  if (column.key === 'query') return record.query;
  if (column.key === 'expansion') return record.expansion || record.sourceValues[column.key] || '';
  if (column.key === 'entityExpansion') return record.entityExpansion || record.sourceValues[column.key] || '';
  if (column.key === 'contentType') return record.contentType || record.sourceValues[column.key] || '';
  return record.sourceValues?.[column.key] || '';
}

function PreviewCell({ column, record }: { column: OutputColumn; record: KeywordReviewRecord }) {
  if (column.kind === 'category') {
    return <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{record.category || '—'}</td>;
  }
  if (column.kind === 'categoryReason') {
    return (
      <td className="max-w-[220px] px-4 py-3 text-xs leading-5 text-slate-500">
        <span className="line-clamp-2" title={record.categoryReason || undefined}>{record.categoryReason || '—'}</span>
      </td>
    );
  }
  if (column.kind === 'producible') {
    return (
      <td className="whitespace-nowrap px-4 py-3">
        {record.producible ? <span className={`rounded-full px-2.5 py-1 text-xs font-black ${record.producible === '制作' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{record.producible}</span> : '—'}
      </td>
    );
  }
  if (column.kind === 'rejectReason') {
    return (
      <td className="max-w-[260px] px-4 py-3">
        <RejectReasonCell producible={record.producible} reason={record.rejectReason} />
      </td>
    );
  }
  const value = sourceValue(record, column);
  const isQuery = column.key === 'query' || column.sourceKind === 'query';
  const compact = column.sourceKind === 'dispatchTime' || column.key.startsWith('source:');
  return (
    <td className={`${isQuery ? 'max-w-[220px] font-bold text-slate-800' : 'max-w-[240px] text-xs leading-5 text-slate-500'} ${compact ? 'whitespace-nowrap' : ''} px-4 py-3`}>
      {isQuery ? value : (value || '—')}
    </td>
  );
}

export default function KeywordReviewStudio({ onBack, onOpenSettings }: Props) {
  const review = useKeywordReview();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const progress = review.counts.total > 0 ? Math.round(review.counts.done / review.counts.total * 100) : 0;
  const canExport = review.counts.total > 0 && review.counts.done === review.counts.total;
  const trialLabel = review.counts.done > 0 || review.counts.failed > 0 ? '再试下一批' : `试跑 ${review.batchSize} 条`;
  const batchLabel = review.counts.done > 0 || review.counts.failed > 0 ? '继续批量' : '批量审核';
  const canRun = review.counts.pending > 0 || review.counts.failed > 0;
  const displayColumns = review.parsed?.displayColumns ?? [];

  const receiveFile = (file?: File) => {
    if (file) void review.importFile(file);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-slate-900">
      <header className="flex min-h-[72px] shrink-0 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onBack} aria-label="关键词分类及制作判断，返回首页" title="返回首页" className="group inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:bg-white">
          <ToolSuiteMark><ListChecks className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /></ToolSuiteMark>
          <span className="text-sm font-black tracking-tight">关键词分类及制作判断</span>
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowRules(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 text-sm font-bold text-slate-600 shadow-sm transition hover:border-amber-300 hover:bg-white hover:text-slate-950">
            <BookOpen className="h-4 w-4" />
            审核规则
          </button>
          <span
            className="hidden rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 sm:inline-flex sm:items-center sm:gap-1.5"
            title={review.balance
              ? `赠金 ${review.balance.granted} · 充值 ${review.balance.toppedUp}`
              : review.balanceError || `当前模型：${review.model}`}
          >
            {review.model}
            {review.balance && (
              <>
                <span className="text-slate-300">·</span>
                <span className={`tabular-nums ${!review.balance.available || Number(review.balance.total) <= 0 ? 'text-amber-600' : ''}`}>
                  {review.balance.currency === 'CNY' ? '¥' : '$'}{review.balance.total}
                </span>
              </>
            )}
          </span>
          {onOpenSettings && (
            <button type="button" onClick={onOpenSettings} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-950" title="配置 DeepSeek API Key" aria-label="配置 DeepSeek API Key">
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1680px] space-y-5">
          {!review.parsed ? (
            <section className="mx-auto max-w-[980px] pt-8 sm:pt-14">
              <div className="mb-7 text-center">
                <p className="text-xs font-black tracking-[0.22em] text-amber-600">SEMANTIC REVIEW</p>
                <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">关键词分类及制作判断</h1>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">按原表头读取全部工作表。空的实体拓展 q 和分类列不会进入结果表，审核列接在下发时间后面。可先试跑 {review.batchSize} 条，确认无误后再批量连续审核。走 DeepSeek 官方接口，不替换当前生图网关。</p>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { receiveFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => { event.preventDefault(); setIsDragging(false); receiveFile(event.dataTransfer.files?.[0]); }}
                className={`group flex min-h-[300px] w-full flex-col items-center justify-center rounded-[32px] border-2 border-dashed px-8 text-center shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)] transition ${isDragging ? 'border-amber-500 bg-amber-50/90' : 'border-slate-300 bg-white/80 hover:border-amber-400 hover:bg-white'}`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg transition group-hover:-translate-y-1 group-hover:bg-amber-600">
                  {review.isImporting ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
                </span>
                <span className="mt-5 text-lg font-black text-slate-900">{review.isImporting ? '正在读取表格…' : '点击或拖拽上传关键词表'}</span>
                <span className="mt-2 text-sm text-slate-400">支持 .xlsx、.xls 和 .csv，自动识别多个关键词工作表</span>
              </button>
              {review.notice && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{review.notice}</p>}
            </section>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4">
                <StatCard label="关键词总数" value={review.counts.total} tone="text-slate-950" />
                <StatCard label="已完成" value={review.counts.done} tone="text-blue-600" />
                <StatCard label="可制作" value={review.counts.producible} tone="text-emerald-600" />
                <StatCard label="不制作" value={review.counts.rejected} tone="text-rose-600" />
              </section>

              <section className="rounded-[26px] border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
                <div className="flex min-w-0 items-center gap-3 overflow-x-auto">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                    <h2 className="truncate text-base font-black text-slate-950">{review.parsed.fileName}</h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={review.lookupEnabled}
                      onClick={() => review.setLookupEnabled(!review.lookupEnabled)}
                      disabled={review.isRunning}
                      title="默认关闭。只补查认不出的作品、品牌、游戏、外文词和机构，每批最多 5 条。"
                      className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm font-bold transition disabled:opacity-40 ${review.lookupEnabled ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      不确定词联网补查
                    </button>
                    <button type="button" onClick={review.reset} disabled={review.isRunning} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"><RefreshCcw className="h-4 w-4" />换表</button>
                    {review.isRunning ? (
                      <button type="button" onClick={review.stopReview} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"><Square className="h-4 w-4 fill-current" />{review.runMode === 'all' ? '停止批量' : '停止试跑'}</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => void review.runReview('trial')} disabled={!canRun} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"><Play className="h-4 w-4 fill-current" />{trialLabel}</button>
                        <button type="button" onClick={() => void review.runReview('all')} disabled={!canRun} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"><Layers className="h-4 w-4" />{batchLabel}</button>
                      </>
                    )}
                    <button type="button" onClick={() => void review.exportWorkbook()} disabled={!canExport || review.isExporting} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300">
                      {review.isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}导出审核表
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">已识别 {review.parsed.sheets.length} 个关键词工作表：{review.sheetSummary}。试跑每次 {review.batchSize} 条；批量审核会按同样批次连续跑完剩余记录。联网补查默认关闭，只补查认不出的实体，每批最多 5 条。</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-400"><span>{review.notice || '等待试跑'}</span><span>{progress}%</span></div>
              </section>

              <section className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
                <div className="overflow-auto">
                  <table className="w-full min-w-[1580px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                      <tr>
                        {displayColumns.map((column) => (
                          <th key={column.key} className="px-4 py-3 font-bold">{column.label}</th>
                        ))}
                        <th className="px-4 py-3 font-bold">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {review.previewRecords.map((record) => (
                        <tr key={record.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-amber-50/35">
                          {displayColumns.map((column) => (
                            <PreviewCell key={column.key} column={column} record={record} />
                          ))}
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                            {record.status === 'done' ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />已完成</span>
                              : record.status === 'running' ? <span className="inline-flex items-center gap-1 text-blue-600"><Loader2 className="h-3.5 w-3.5 animate-spin" />审核中</span>
                              : record.status === 'error' ? <span className="inline-flex items-center gap-1 text-rose-600" title={record.error}><XCircle className="h-3.5 w-3.5" />失败</span>
                              : <span className="text-slate-400">待审核</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {review.records.length > review.previewRecords.length && <p className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-400">界面优先显示刚试跑和失败的记录，最多 {review.previewLimit} 条；全部 {review.records.length} 条都会保留在本次导入中。</p>}
              </section>
            </>
          )}
        </div>
      </main>
      <KeywordReviewRulesDialog open={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
