import { useMemo, useRef, useState } from 'react';
import {
  BookOpen, Download, FilePen, FileSpreadsheet, Layers, Loader2, Play,
  RefreshCcw, Settings2, Square, UploadCloud,
} from 'lucide-react';
import { ToolSuiteMark } from '@client/shared/icons';
import { KeywordReviewRulesDialog } from './components/KeywordReviewRulesDialog';
import { KeywordReviewSettingsDialog } from './components/KeywordReviewSettingsDialog';
import { useKeywordReview } from './hooks/useKeywordReview';
import { countReviewRecords, isAutomaticRetryRecord } from './model/reviewProgress';
import { KeywordReviewPreviewTable } from './components/KeywordReviewPreviewTable';
import { KeywordReviewReplaceDialog } from './components/KeywordReviewReplaceDialog';
import { KeywordReviewRecordDetails } from './components/KeywordReviewRecordDetails';
import { KeywordReviewRecoveryDialog } from './components/KeywordReviewRecoveryDialog';
import { KeywordReviewRecoveryStatus } from './components/KeywordReviewRecoveryStatus';
import { KeywordReviewModelPicker } from './components/KeywordReviewModelPicker';
import { KeywordReviewEffortButton } from './components/KeywordReviewEffortButton';

interface Props {
  onBack: () => void;
  onOpenSettings?: () => void;
}

function StatCard({ label, value, tone, active, onClick }: { label: string; value: number; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-2xl border border-white/[0.07] bg-white/85 dark:bg-zinc-900/90 px-4 py-3 text-left shadow-sm backdrop-blur transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${active ? 'ring-1 ring-zinc-300 dark:ring-white/15' : ''}`}>
      <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">{tone && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} />}{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">{value.toLocaleString('en-US')}</p>
    </button>
  );
}

export default function KeywordsStudio({ onBack, onOpenSettings }: Props) {
  const review = useKeywordReview();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReplacePrompt, setShowReplacePrompt] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const progress = review.counts.total > 0 ? Math.round(review.counts.done / review.counts.total * 100) : 0;
  const busy = review.isRunning || review.isPreparing || review.isImporting || review.isExporting || review.sessionLoading || review.sessionSaving;
  const canExport = (review.counts.done > 0 || review.counts.failed > 0) && !busy;
  const trialCount = Math.min(review.trialSize, review.counts.pending);
  const trialLabel = `${review.counts.done > 0 || review.counts.failed > 0 ? '再试跑' : '试跑'} ${(trialCount || review.trialSize).toLocaleString('en-US')} 条`;
  const batchLabel = review.counts.done > 0 || review.counts.failed > 0 ? '继续批量' : '批量审核';
  const canTrial = review.counts.pending > 0 && !busy && review.sessionReady;
  const canRun = !busy && review.sessionReady && (canTrial || review.records.some(isAutomaticRetryRecord));
  const displayColumns = review.parsed?.displayColumns ?? [];
  const selectedRecord = review.records.find((record) => record.id === selectedRecordId);
  const selectedColumns = review.parsed?.sheets.find((sheet) => sheet.name === selectedRecord?.sheetName)?.outputColumns ?? displayColumns;
  const showBalanceAmount = Boolean(review.balance && review.balanceUpdatedAt);

  const recovered = review.sessionRecovery;
  const recoveredCounts = useMemo(() => recovered ? countReviewRecords(recovered.records) : null, [recovered]);
  const replaceWorkbook = async () => { if (await review.reset()) { setShowReplacePrompt(false); setSelectedRecordId(null); } };
  const requestReplace = () => {
    if (review.hasUnexportedResults) setShowReplacePrompt(true);
    else void replaceWorkbook();
  };

  const receiveFile = (file?: File) => {
    if (file && !busy && review.sessionReady) void review.importFile(file);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-slate-900 dark:text-slate-100">
      <header className="relative z-20 grid min-h-[72px] shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-8">
        <button type="button" onClick={onBack} aria-label="词包，返回首页" title="返回首页" className="group inline-flex h-10 items-center justify-self-start gap-2 rounded-xl border border-white/[0.07] bg-white/90 dark:bg-[#1B1B1E]/90 px-3 shadow-sm backdrop-blur transition-colors hover:border-white/[0.12] hover:bg-white dark:hover:bg-[#26262B] text-slate-900 dark:text-white">
          <ToolSuiteMark>
            <FilePen className="h-4 w-4 stroke-[2]" />
          </ToolSuiteMark>
          <span className="text-sm font-black tracking-tight">词包</span>
        </button>
        <div className="col-span-2 row-start-2 flex max-w-full flex-col items-center gap-1.5 justify-self-center text-center lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <div role="group" aria-label="词包审核类型" className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] bg-zinc-900/90 p-1">
            {(['image', 'video'] as const).map((mode) => <button key={mode} type="button" aria-pressed={review.reviewMode === mode} disabled={!review.canSwitchMode} onClick={() => void review.selectReviewMode(mode)} className={`rounded-md px-3 py-1.5 text-sm transition disabled:cursor-not-allowed ${review.reviewMode === mode ? 'bg-zinc-800 font-medium text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 disabled:opacity-50'}`}>{mode === 'image' ? '图文关键词' : '视频关键词'}</button>)}
          </div>
          {review.parsed && <span className="max-w-xs text-xs leading-5 text-zinc-500">{review.isRunning || review.isPreparing ? '审核进行中，暂不可切换类型' : review.counts.done > 0 ? '已有审核结果；请先导出进度，再点击“换表”切换类型' : !review.canSwitchMode ? '本次已有审核尝试；请先处理当前任务，或点击“换表”后切换类型' : '尚未审核，可直接切换类型'}</span>}
        </div>
        <div className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center justify-end gap-2 lg:col-start-3">
          <div className="max-w-xl">
            <KeywordReviewRecoveryStatus saving={review.sessionLoading || review.sessionSaving} savedAt={review.sessionSavedAt} error={review.sessionError} hasTask={Boolean(review.parsed)} disableRetry={review.isRunning || review.isPreparing || review.isImporting || review.isExporting} onRetry={() => void review.retrySessionSave()} onDiscard={review.sessionCanClear ? review.reset : undefined} />
          </div>
          <button type="button" onClick={() => setShowRules(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/90 dark:bg-[#1B1B1E]/90 px-3 text-sm font-bold text-slate-600 dark:text-slate-300 shadow-sm transition hover:border-white/[0.12] hover:bg-white dark:hover:bg-[#26262B] hover:text-slate-950 dark:hover:text-white">
            <BookOpen className="h-4 w-4" />
            审核规则
          </button>
          <KeywordReviewModelPicker options={review.modelOptions} value={review.modelValue} disabled={busy} onChange={review.selectModel} />
          <KeywordReviewEffortButton model={review.modelOptions.find((option) => option.value === review.modelValue)?.model || review.modelOptions[0]?.model || ''} disabled={busy} />
          {review.modelProvider === 'deepseek' && <button
            type="button"
            onClick={() => review.refreshBalance(true)}
            className="hidden rounded-xl border border-white/[0.07] bg-white/80 dark:bg-[#1B1B1E]/80 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:inline-flex sm:items-center sm:gap-1.5 hover:border-white/[0.12]"
            title={`${review.balance ? `赠金 ${review.balance.granted} · 充值 ${review.balance.toppedUp} · ` : ''}${review.balanceUpdatedAt ? `上次同步 ${new Date(review.balanceUpdatedAt).toLocaleTimeString('zh-CN')}` : '尚未同步'}${review.balanceDirty ? ' · 正在审核的请求费用可能尚未计入' : ''}${review.balanceError ? ` · 查询失败：${review.balanceError}` : ''} · 点击刷新`}
          >
            账户余额
            {showBalanceAmount && review.balance && (
              <>
                <span className="text-slate-300">·</span>
                <span className={`tabular-nums ${!review.balance.available || Number(review.balance.total) <= 0 ? 'text-amber-600' : ''}`}>
                  {review.balance.currency === 'CNY' ? '¥' : '$'}{review.balance.total}
                </span>
              </>
            )}
            <span className={review.balanceError ? 'text-amber-600' : 'text-slate-400'}>
              {review.balanceDirty ? '有费用待同步' : review.balanceError ? '刷新失败' : review.balanceRefreshing ? '同步中' : showBalanceAmount ? `截至 ${new Date(review.balanceUpdatedAt!).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '余额待更新'}
            </span>
          </button>}
          <button type="button" onClick={() => setShowSettings(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/90 dark:bg-[#1B1B1E]/90 text-slate-600 dark:text-slate-300 shadow-sm transition hover:bg-white dark:hover:bg-[#26262B] hover:text-slate-950 dark:hover:text-white" title="关键词分类设置" aria-label="关键词分类设置" aria-haspopup="dialog" aria-expanded={showSettings}>
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1680px] space-y-5">
          {!review.parsed ? (
            <section className="mx-auto max-w-[980px] pt-8 sm:pt-14">
              <div className="mb-7 text-center">
                <p className="text-xs font-black tracking-[0.22em] text-amber-600">SEMANTIC REVIEW</p>
                <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-slate-950 dark:text-white sm:text-5xl">{review.reviewMode === 'video' ? '视频词包审核' : '图文词包审核'}</h1>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400 sm:text-base tabular-nums">{review.reviewMode === 'video'
                  ? `保留视频词包原始内容，逐行判断最终垂类、是否可制作及低价值标记。先试跑 ${review.trialSize.toLocaleString('en-US')} 条，查看结果后再批量审核。`
                  : `逐行判断图文关键词的最终垂类和制作价值，并给出具体依据。先试跑 ${review.trialSize.toLocaleString('en-US')} 条，查看结果后再批量审核、导出结果。`}审核模型可在右上角切换。</p>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { receiveFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy || !review.sessionReady}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => { event.preventDefault(); setIsDragging(false); receiveFile(event.dataTransfer.files?.[0]); }}
                className={`group flex min-h-[300px] w-full flex-col items-center justify-center rounded-[32px] border-2 border-dashed px-8 text-center shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)] transition ${isDragging ? 'border-amber-500 bg-amber-50/90 dark:bg-amber-950/40' : 'border-white/[0.07] bg-white/80 dark:bg-[#1B1B1E]/80 hover:border-amber-400 dark:hover:border-amber-400/60 hover:bg-white dark:hover:bg-[#1B1B1E]'}`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 dark:bg-white/10 text-white shadow-lg transition group-hover:-translate-y-1 group-hover:bg-amber-600">
                  {review.isImporting || review.sessionLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
                </span>
                <span className="mt-5 text-lg font-black text-slate-900 dark:text-white">{review.sessionLoading ? '正在读取本机进度…' : review.isImporting ? '正在读取表格…' : '点击或拖拽上传关键词表'}</span>
                <span className="mt-2 text-sm text-slate-500 dark:text-slate-400">支持 .xlsx、.xls 和 .csv · 表头需含 query、关键词或搜索词</span>
              </button>
              {review.notice && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-200 px-4 py-3 text-sm font-medium text-amber-800">{review.notice}</p>}
            </section>
          ) : (
            <>
              <section className={`grid grid-cols-2 gap-3 pt-2 ${review.reviewMode === 'video' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                <StatCard label="关键词总数" value={review.counts.total} tone="" active={review.filter === 'all'} onClick={() => review.setFilter('all')} />
                <StatCard label="已完成" value={review.counts.done} tone="bg-blue-400" active={review.filter === 'done'} onClick={() => review.setFilter('done')} />
                <StatCard label="可制作" value={review.counts.producible} tone="bg-emerald-400" active={review.filter === 'producible'} onClick={() => review.setFilter('producible')} />
                <StatCard label="不制作" value={review.counts.rejected} tone="bg-rose-400" active={review.filter === 'rejected'} onClick={() => review.setFilter('rejected')} />
                {review.reviewMode === 'video' && <StatCard label="低价值" value={review.counts.lowValue} tone="bg-amber-400" active={review.filter === 'low_value'} onClick={() => review.setFilter('low_value')} />}
              </section>

              <section className="rounded-[26px] border border-white/[0.07] bg-white/90 dark:bg-zinc-900/90 p-4 shadow-sm backdrop-blur sm:p-5">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <h2 className="truncate text-base font-black text-slate-950 dark:text-white">{review.parsed.fileName}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={requestReplace} disabled={busy} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-white/[0.08] bg-zinc-800/60 px-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCcw className="h-4 w-4" />换表</button>
                    {review.isRunning ? (
                      <button type="button" onClick={review.stopReview} disabled={review.isStopping} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 text-sm font-medium text-rose-400 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"><Square className="h-4 w-4 fill-current" />{review.isStopping ? '正在收尾…' : review.runMode === 'all' ? '停止批量' : '停止试跑'}</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => void review.runReview('trial')} disabled={!canTrial} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-white/[0.07] bg-white dark:bg-zinc-800 px-4 text-sm font-medium text-slate-700 tabular-nums dark:text-slate-200 transition hover:border-white/[0.12] hover:bg-amber-50 dark:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-white/10 disabled:text-slate-400 dark:disabled:text-slate-600"><Play className="h-4 w-4 fill-current" />{trialLabel}</button>
                        <button type="button" onClick={() => void review.runReview('all')} disabled={!canRun}  className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-950 dark:bg-white px-4 text-sm font-black text-white dark:text-slate-950 transition hover:bg-amber-600 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-white/10"><Layers className="h-4 w-4" />{batchLabel}</button>
                        {review.counts.failed > review.counts.uncertain && <button type="button" onClick={() => void review.retryFailed()} disabled={busy || !review.sessionReady} title="仅重新审核已确认失败的记录；可能再次产生费用" className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 text-sm font-medium text-rose-700 tabular-nums dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-40">重审失败 {(review.counts.failed - review.counts.uncertain).toLocaleString('en-US')} 条</button>}
                      </>
                    )}
                    <button type="button" onClick={() => void review.exportWorkbook()} disabled={!canExport || review.isExporting} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-transparent bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:border-white/[0.05] disabled:bg-zinc-800/70 disabled:text-zinc-500">
                      {review.isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{review.counts.done === review.counts.total ? '导出审核表' : '导出当前进度'}
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-500 tabular-nums dark:text-zinc-400">{review.reviewMode === 'video' ? '视频' : '图文'}审核 · {review.model} · 已识别 {review.parsed.sheets.length.toLocaleString('en-US')} 个工作表，共 {review.counts.total.toLocaleString('en-US')} 条关键词</p>
                <details className="mt-2 text-xs leading-5 text-zinc-500 tabular-nums dark:text-zinc-400">
                  <summary className="w-fit cursor-pointer font-semibold hover:text-slate-800 dark:hover:text-slate-100">审核与费用说明</summary>
                  <div className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                    <p>工作表：{review.parsed.sheets.map((sheet) => `${sheet.name} ${sheet.recordCount.toLocaleString('en-US')} 条`).join('、')}。试跑 {review.trialSize.toLocaleString('en-US')} 条，每次请求 {review.batchSize.toLocaleString('en-US')} 条，最多 {review.concurrency.toLocaleString('en-US')} 路并发；遇限流会自动降速并重试。网关切断单次响应时，会把该批拆开再提交。</p>
                    <p>停止后会等待已提交请求返回并保留结果。网关已明确返回且没有用量的失败会自动换新任务重试。只有提交结果无法确认的记录会单独隔离，避免重复扣费；费用估算只计入已收到的用量。</p>
                    <p>联网补查暂不可用，当前审核不发起额外补查请求。</p>
                    <p>模型费用以实际账单为准。<a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/" target="_blank" rel="noreferrer" className="ml-1 font-semibold text-blue-700 underline underline-offset-2">查看 DeepSeek 官方价格</a></p>
                    <p>{review.parsed.preserveSourceLayout ? '含备注说明行、公式、内部引用或辅助工作表的工作簿保留原工作表与列顺序。' : review.reviewMode === 'video' ? '原表列全部保留，追加最终垂类、制作判断与低价值标记。' : '原表列保留；整列为空的实体拓展q和分类不进入结果表，审核列接在下发时间后。'}</p>
                    {review.parsed.preserveSourceLayout && <p>为保留备注说明行、公式、内部引用或辅助表，导出保留原布局，新增审核列追加至末尾。</p>}
                  </div>
                </details>
                {review.parsed.reviewModeMismatch && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">此表来自{review.parsed.sourceReviewMode === 'video' ? '视频' : '图文'}审核，旧裁决已清除；当前将按{review.reviewMode === 'video' ? '视频' : '图文'}规则重新审核。</p>}
                {(review.tokenUsage.cacheHit + review.tokenUsage.cacheMiss + review.tokenUsage.completion) > 0 && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{review.usageProvider === 'deepseek' ? `本轮估算费用 ¥${review.estimatedCostLabel}（仅供参考，以官方账单为准） · ` : '本轮用量（费用以所选网关账单为准） · '}缓存命中 <span className="font-medium text-zinc-700 tabular-nums dark:text-zinc-300">{review.tokenUsage.cacheHit.toLocaleString('en-US')}</span>、未命中 <span className="font-medium text-zinc-700 tabular-nums dark:text-zinc-300">{review.tokenUsage.cacheMiss.toLocaleString('en-US')}</span>、输出 <span className="font-medium text-zinc-700 tabular-nums dark:text-zinc-300">{review.tokenUsage.completion.toLocaleString('en-US')}</span> token。</p>}
                {review.reviewMode === 'video' && <p className="mt-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">已标记低价值关键词 {review.counts.lowValue.toLocaleString('en-US')} 条；原表“分类”保留，新增“最终垂类”和“低价值关键词”结果列。</p>}
                {review.counts.uncertain > 0 && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 tabular-nums">{review.counts.uncertain.toLocaleString('en-US')} 条提交结果待核对：已隔离，避免重复扣费。请导出当前进度并核对所用模型的用量。</p>}
                <div role="progressbar" aria-label="词包审核完成进度" aria-valuemin={0} aria-valuemax={review.counts.total} aria-valuenow={review.counts.done} aria-valuetext={`已完成 ${review.counts.done} / ${review.counts.total} 条`} className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {([['pending', '待审核', review.counts.pending], ['running', '审核中', review.counts.running], ['failed', '失败', review.counts.failed - review.counts.uncertain], ['uncertain', '待核对', review.counts.uncertain]] as const).map(([filter, label, count]) => <button key={filter} type="button" aria-pressed={review.filter === filter} onClick={() => review.setFilter(filter)} className={`inline-flex items-center gap-1.5 rounded py-0.5 transition hover:text-zinc-900 dark:hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${review.filter === filter ? 'font-medium text-zinc-900 dark:text-zinc-100' : ''}`}><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${filter === 'running' ? 'bg-amber-400' : filter === 'failed' ? 'bg-rose-400' : filter === 'uncertain' ? 'bg-amber-400/70' : 'bg-zinc-500'}`} />{label} <span className="tabular-nums">{count.toLocaleString('en-US')}</span></button>)}
                  </div>
                  <span className="ml-auto shrink-0 tabular-nums">{review.counts.done.toLocaleString('en-US')} / {review.counts.total.toLocaleString('en-US')} ({progress.toLocaleString('en-US')}%)</span>
                </div>
                <p role="status" aria-live="polite" className="mt-2 text-xs text-zinc-500">{review.notice || '等待试跑'}</p>
              </section>

              <KeywordReviewPreviewTable review={review} onSelect={setSelectedRecordId} />
            </>
          )}
        </div>
      </main>
      {recovered && recoveredCounts && <KeywordReviewRecoveryDialog snapshot={{ fileName: recovered.parsed.fileName, mode: recovered.parsed.mode, savedAt: recovered.updatedAt, total: recoveredCounts.total, done: recoveredCounts.done, pending: recoveredCounts.pending, uncertain: recoveredCounts.uncertain, failed: recoveredCounts.failed - recoveredCounts.uncertain }} onRestore={review.restoreSession} onDiscard={review.discardSession} />}
      {showReplacePrompt && <KeywordReviewReplaceDialog busy={busy} onClose={() => setShowReplacePrompt(false)} onReplace={() => void replaceWorkbook()} onExport={review.exportWorkbook} />}
      {selectedRecord && <KeywordReviewRecordDetails record={selectedRecord} columns={selectedColumns} onClose={() => setSelectedRecordId(null)} />}
      <KeywordReviewRulesDialog open={showRules} onClose={() => setShowRules(false)} mode={review.reviewMode} />
      <KeywordReviewSettingsDialog
        open={showSettings}
        busy={busy}
        settings={review.settings}
        onClose={() => setShowSettings(false)}
        onSave={(settings) => {
          if (review.saveSettings(settings)) setShowSettings(false);
        }}
        onOpenSystemSettings={onOpenSettings ? () => { setShowSettings(false); onOpenSettings(); } : undefined}
      />
    </div>
  );
}
