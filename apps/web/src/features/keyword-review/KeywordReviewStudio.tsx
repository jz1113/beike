import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, CheckCircle2, Download, Eye, FileSpreadsheet, Layers, ListChecks, Loader2, Play,
  RefreshCcw, Settings2, Square, UploadCloud, X, XCircle,
} from 'lucide-react';
import { ToolSuiteMark } from '@/shared/icons';
import { KeywordReviewRulesDialog } from './KeywordReviewRulesDialog';
import { useKeywordReview, type KeywordReviewFilter } from './hooks/useKeywordReview';
import { splitRejectReason, type KeywordReviewRecord, type OutputColumn } from './model/keywordReviewWorkbook';

interface Props {
  onBack: () => void;
  onOpenSettings?: () => void;
}

function StatCard({ label, value, tone, active, onClick }: { label: string; value: number; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-2xl border bg-white/85 px-4 py-3 text-left shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${active ? 'border-blue-400 ring-2 ring-blue-100' : 'border-white/80'}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tone}`}>{value}</p>
    </button>
  );
}

function sourceValue(record: KeywordReviewRecord, column: OutputColumn): string {
  if (column.key === 'query') return record.query;
  if (column.key === 'expansion') return record.expansion || record.sourceValues[column.key] || '';
  if (column.key === 'entityExpansion') return record.entityExpansion || record.sourceValues[column.key] || '';
  if (column.key === 'contentType') return record.contentType || record.sourceValues[column.key] || '';
  return record.sourceValues?.[column.key] || '';
}

function ReviewStatus({ record }: { record: KeywordReviewRecord }) {
  if (record.status === 'done') return <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" />已完成</span>;
  if (record.status === 'running') return <span className="inline-flex items-center gap-1.5 text-blue-600"><Loader2 className="h-4 w-4 animate-spin" />审核中</span>;
  if (record.status === 'error') return <span className="inline-flex items-center gap-1.5 text-rose-600" title={record.error}><XCircle className="h-4 w-4" />失败</span>;
  return <span className="text-slate-500">待审核</span>;
}

function RecordDetails({ record, columns, onClose }: { record: KeywordReviewRecord; columns: OutputColumn[]; onClose: () => void }) {
  const sourceColumns = columns.filter((column) => column.kind === 'source' && column.sourceKind !== 'query');
  const reject = record.producible === '不制作' ? splitRejectReason(record.rejectReason) : null;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="keyword-record-title" className="flex max-h-[min(780px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">{record.sheetName} · 第 {record.rowNumber} 行</p>
            <h2 id="keyword-record-title" className="mt-1 break-words text-lg font-black leading-7 text-slate-950">{record.query}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭详情" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
            <div><p className="text-xs font-bold text-slate-500">最终垂类</p><p className="mt-1 font-bold text-slate-800">{record.category || '—'}</p></div>
            <div><p className="text-xs font-bold text-slate-500">是否可制作</p><p className="mt-1 font-bold text-slate-800">{record.producible || '—'}</p></div>
            <div className="sm:col-span-2"><p className="text-xs font-bold text-slate-500">垂类依据</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{record.categoryReason || '—'}</p></div>
            {record.producible === '不制作' && <div className="sm:col-span-2"><p className="text-xs font-bold text-slate-500">不制作依据</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{reject ? `${reject.kind ? `${reject.kind}：` : ''}${reject.detail}` : record.rejectReason || '—'}</p></div>}
            {record.error && <div className="sm:col-span-2"><p className="text-xs font-bold text-rose-500">审核错误</p><p className="mt-1 break-words text-sm text-rose-700">{record.error}</p></div>}
          </div>
          {sourceColumns.length > 0 && <div>
            <h3 className="mb-3 text-sm font-black text-slate-900">原表内容</h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              {sourceColumns.map((column) => <div key={column.key} className={`min-w-0 rounded-xl border border-slate-200 p-4 ${column.sourceKind === 'expansion' || column.sourceKind === 'entityExpansion' ? 'sm:col-span-2' : ''}`}>
                <dt className="text-xs font-bold text-slate-500">{column.label}</dt>
                <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{sourceValue(record, column) || '—'}</dd>
              </div>)}
            </dl>
          </div>}
        </div>
      </section>
    </div>
  );
}

export default function KeywordReviewStudio({ onBack, onOpenSettings }: Props) {
  const review = useKeywordReview();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const progress = review.counts.total > 0 ? Math.round(review.counts.done / review.counts.total * 100) : 0;
  const canExport = review.counts.done > 0 && !review.isRunning;
  const trialLabel = review.counts.done > 0 || review.counts.failed > 0 ? '再试下一批' : `试跑 ${review.batchSize} 条`;
  const batchLabel = review.counts.done > 0 || review.counts.failed > 0 ? '继续批量' : '批量审核';
  const canRun = review.counts.pending > 0 || review.counts.failed > 0;
  const displayColumns = review.parsed?.displayColumns ?? [];
  const filterLabels: Record<KeywordReviewFilter, string> = { all: '全部', done: '已完成', producible: '可制作', rejected: '不制作' };
  const selectedRecord = review.records.find((record) => record.id === selectedRecordId);
  const selectedColumns = review.parsed?.sheets.find((sheet) => sheet.name === selectedRecord?.sheetName)?.outputColumns ?? displayColumns;
  const showBalanceAmount = Boolean(review.balance && review.balanceUpdatedAt && !review.balanceDirty && !review.balanceError && Date.now() - review.balanceUpdatedAt < 45_000);

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
          <button
            type="button"
            onClick={() => review.refreshBalance(true)}
            className="hidden rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 sm:inline-flex sm:items-center sm:gap-1.5 hover:border-slate-300"
            title={`${review.balance ? `赠金 ${review.balance.granted} · 充值 ${review.balance.toppedUp} · ` : ''}${review.balanceUpdatedAt ? `上次同步 ${new Date(review.balanceUpdatedAt).toLocaleTimeString('zh-CN')}` : '尚未同步'}${review.balanceError ? ` · 查询失败：${review.balanceError}` : ''} · 点击刷新`}
          >
            {review.model}
            {showBalanceAmount && review.balance && (
              <>
                <span className="text-slate-300">·</span>
                <span className={`tabular-nums ${!review.balance.available || Number(review.balance.total) <= 0 ? 'text-amber-600' : ''}`}>
                  {review.balance.currency === 'CNY' ? '¥' : '$'}{review.balance.total}
                </span>
              </>
            )}
            <span className={review.balanceError ? 'text-amber-600' : 'text-slate-400'}>
              {review.balanceRefreshing ? '同步中' : review.balanceError || !showBalanceAmount ? '余额待更新' : `截至 ${new Date(review.balanceUpdatedAt!).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          </button>
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
                <span className="mt-2 text-sm text-slate-500">支持 .xlsx、.xls 和 .csv，自动识别多个关键词工作表</span>
              </button>
              {review.notice && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{review.notice}</p>}
            </section>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4">
                <StatCard label="关键词总数" value={review.counts.total} tone="text-slate-950" active={review.filter === 'all'} onClick={() => review.setFilter('all')} />
                <StatCard label="已完成" value={review.counts.done} tone="text-blue-600" active={review.filter === 'done'} onClick={() => review.setFilter('done')} />
                <StatCard label="可制作" value={review.counts.producible} tone="text-emerald-600" active={review.filter === 'producible'} onClick={() => review.setFilter('producible')} />
                <StatCard label="不制作" value={review.counts.rejected} tone="text-rose-600" active={review.filter === 'rejected'} onClick={() => review.setFilter('rejected')} />
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
                      {review.isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{review.counts.done === review.counts.total ? '导出审核表' : '导出当前进度'}
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">已识别 {review.parsed.sheets.length} 个关键词工作表：{review.sheetSummary}。试跑每次 {review.batchSize} 条；批量审核每批 {review.batchSize} 条、最多 {review.concurrency} 个请求并行，直到跑完剩余记录。联网补查默认关闭，只补查认不出的实体，每批最多 5 条。</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500"><span>{review.notice || '等待试跑'}</span><span>{progress}%</span></div>
              </section>

              <section className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                  <div><h2 className="text-sm font-black text-slate-900">审核预览</h2><p className="mt-0.5 text-xs text-slate-500">列表显示关键信息，点击详情查看完整原表内容和审核依据</p></div>
                  <span className="text-xs font-semibold text-slate-500">{filterLabels[review.filter]} · 显示 {review.previewRecords.length} / {review.filteredCount} 条</span>
                </div>
                <div className="overflow-auto">
                  <table className="w-full min-w-[1000px] table-fixed border-collapse text-left text-sm">
                    <colgroup><col className="w-[7%]" /><col className="w-[29%]" /><col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[23%]" /><col className="w-[10%]" /><col className="w-[6%]" /></colgroup>
                    <thead className="bg-slate-950 text-white">
                      <tr>
                        {['行号', 'query', '最终垂类', '是否可制作', '判断依据', '状态', '详情'].map((label) => <th key={label} className="px-4 py-3 text-xs font-bold whitespace-nowrap">{label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {review.previewRecords.map((record) => (
                        <tr key={record.id} className="border-b border-slate-100 last:border-0 hover:bg-amber-50/35">
                          <td className="px-4 py-3 text-xs tabular-nums text-slate-500">{record.rowNumber}</td>
                          <td className="px-4 py-3"><span className="line-clamp-2 break-words font-bold leading-5 text-slate-800" title={record.query}>{record.query}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{record.sheetName}</span></td>
                          <td className="px-4 py-3 font-bold text-slate-700"><span className="line-clamp-2 break-words">{record.category || '—'}</span></td>
                          <td className="px-4 py-3">{record.producible ? <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${record.producible === '制作' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{record.producible}</span> : <span className="text-slate-500">—</span>}</td>
                          <td className="px-4 py-3 text-xs leading-5 text-slate-500"><span className="line-clamp-2 break-words" title={record.producible === '不制作' ? record.rejectReason : record.categoryReason}>{record.producible === '不制作' ? record.rejectReason || record.categoryReason || '—' : record.categoryReason || '—'}</span></td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold"><ReviewStatus record={record} /></td>
                          <td className="px-3 py-3"><button type="button" onClick={() => setSelectedRecordId(record.id)} aria-label={`查看第 ${record.rowNumber} 行详情`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Eye className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                      {review.previewRecords.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">暂无{filterLabels[review.filter]}记录</td></tr>}
                    </tbody>
                  </table>
                </div>
                {review.filteredCount > review.previewRecords.length && <p className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-500">当前筛选共 {review.filteredCount} 条，界面优先显示刚试跑和失败的记录，最多 {review.previewLimit} 条；全部 {review.records.length} 条都会保留在本次导入中。</p>}
              </section>
            </>
          )}
        </div>
      </main>
      {selectedRecord && <RecordDetails record={selectedRecord} columns={selectedColumns} onClose={() => setSelectedRecordId(null)} />}
      <KeywordReviewRulesDialog open={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
