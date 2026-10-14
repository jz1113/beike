import { useMemo, useRef, useState } from 'react';
import {
  BookOpen, Download, FileSpreadsheet, Layers, Loader2, Play,
  RefreshCcw, Settings2, Square, UploadCloud,
} from 'lucide-react';
import { KeywordReviewRulesDialog } from './components/KeywordReviewRulesDialog';
import { KeywordReviewSettingsDialog } from './components/KeywordReviewSettingsDialog';
import { useKeywordReview } from './hooks/useKeywordReview';
import { countReviewRecords, isKnownModelOutputFailure } from './model/reviewProgress';
import { KeywordReviewPreviewTable } from './components/KeywordReviewPreviewTable';
import { KeywordReviewReplaceDialog } from './components/KeywordReviewReplaceDialog';
import { KeywordReviewRecordDetails } from './components/KeywordReviewRecordDetails';
import { KeywordReviewRecoveryDialog } from './components/KeywordReviewRecoveryDialog';
import { KeywordReviewRecoveryStatus } from './components/KeywordReviewRecoveryStatus';

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

export default function KeywordReviewStudio({ onBack, onOpenSettings }: Props) {
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
  const trialLabel = `${review.counts.done > 0 || review.counts.failed > 0 ? '再试跑' : '试跑'} ${trialCount || review.trialSize} 条`;
  const batchLabel = review.counts.done > 0 || review.counts.failed > 0 ? '继续批量' : '批量审核';
  const canTrial = review.counts.pending > 0 && !busy && review.sessionReady;
  const canRun = !busy && review.sessionReady && (canTrial || review.records.some(isKnownModelOutputFailure));
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-slate-900">
      <header className="flex min-h-[72px] shrink-0 flex-wrap items-center justify-between py-3 gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onBack} aria-label="词包审核，返回首页" title="返回首页" className="group inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:bg-white">
          <img src="/brand/keyword-pack.jpg" alt="" draggable={false} className="h-8 w-auto max-w-16 shrink-0 object-contain" />
          <span className="text-sm font-black tracking-tight">词包审核</span>
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowRules(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 text-sm font-bold text-slate-600 shadow-sm transition hover:border-amber-300 hover:bg-white hover:text-slate-950">
            <BookOpen className="h-4 w-4" />
            审核规则
          </button>
          <label className="relative flex h-10 max-w-[240px] items-center rounded-xl border border-slate-200 bg-white/90 px-2 shadow-sm hover:border-amber-300">
            <span className="sr-only">审核模型</span>
            <select aria-label="审核模型" value={review.modelValue} onChange={(event) => review.selectModel(event.target.value)} disabled={busy} className="min-w-0 w-full cursor-pointer bg-transparent px-1 text-sm font-semibold text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-60">
              {review.modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {review.modelProvider === 'deepseek' && <button
            type="button"
            onClick={() => review.refreshBalance(true)}
            className="hidden rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-500 sm:inline-flex sm:items-center sm:gap-1.5 hover:border-slate-300"
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
          <button type="button" onClick={() => setShowSettings(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-950" title="关键词分类设置" aria-label="关键词分类设置" aria-haspopup="dialog" aria-expanded={showSettings}>
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1680px] space-y-5">
          <KeywordReviewRecoveryStatus saving={review.sessionLoading || review.sessionSaving} savedAt={review.sessionSavedAt} error={review.sessionError} hasTask={Boolean(review.parsed)} disableRetry={review.isRunning || review.isPreparing || review.isImporting || review.isExporting} onRetry={() => void review.retrySessionSave()} onDiscard={review.sessionCanClear ? review.reset : undefined} />
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div role="group" aria-label="关键词审核类型" className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1">
              {(['image', 'video'] as const).map((mode) => <button key={mode} type="button" aria-pressed={review.reviewMode === mode} disabled={!review.canSwitchMode} onClick={() => void review.selectReviewMode(mode)} className={`rounded-xl px-5 py-2 text-sm font-bold transition disabled:cursor-not-allowed ${review.reviewMode === mode ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-white disabled:opacity-50'}`}>{mode === 'image' ? '图文关键词' : '视频关键词'}</button>)}
            </div>
            {review.parsed && <span className="text-xs text-slate-500">{review.isRunning || review.isPreparing ? '审核进行中，暂不可切换类型' : review.counts.done > 0 ? '已有审核结果；请先导出进度，再点击“换表”切换类型' : !review.canSwitchMode ? '本次已有审核尝试；请先处理当前任务，或点击“换表”后切换类型' : '尚未审核，可直接切换类型'}</span>}
          </div>
          {!review.parsed ? (
            <section className="mx-auto max-w-[980px] pt-8 sm:pt-14">
              <div className="mb-7 text-center">
                <p className="text-xs font-black tracking-[0.22em] text-amber-600">SEMANTIC REVIEW</p>
                <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">{review.reviewMode === 'video' ? '视频词包审核' : '图文词包审核'}</h1>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">{review.reviewMode === 'video'
                  ? `保留视频词包原始内容，逐行判断最终垂类、是否可制作及低价值标记。先试跑 ${review.trialSize} 条，查看结果后再批量审核。`
                  : `逐行判断图文关键词的最终垂类和制作价值，并给出具体依据。先试跑 ${review.trialSize} 条，查看结果后再批量审核、导出结果。`}审核模型可在右上角切换。</p>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { receiveFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy || !review.sessionReady}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => { event.preventDefault(); setIsDragging(false); receiveFile(event.dataTransfer.files?.[0]); }}
                className={`group flex min-h-[300px] w-full flex-col items-center justify-center rounded-[32px] border-2 border-dashed px-8 text-center shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)] transition ${isDragging ? 'border-amber-500 bg-amber-50/90' : 'border-slate-300 bg-white/80 hover:border-amber-400 hover:bg-white'}`}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg transition group-hover:-translate-y-1 group-hover:bg-amber-600">
                  {review.isImporting || review.sessionLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
                </span>
                <span className="mt-5 text-lg font-black text-slate-900">{review.sessionLoading ? '正在读取本机进度…' : review.isImporting ? '正在读取表格…' : '点击或拖拽上传关键词表'}</span>
                <span className="mt-2 text-sm text-slate-500">支持 .xlsx、.xls 和 .csv · 表头需含 query、关键词或搜索词</span>
              </button>
              {review.notice && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{review.notice}</p>}
            </section>
          ) : (
            <>
              <section className={`grid grid-cols-2 gap-3 pt-2 ${review.reviewMode === 'video' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                <StatCard label="关键词总数" value={review.counts.total} tone="text-slate-950" active={review.filter === 'all'} onClick={() => review.setFilter('all')} />
                <StatCard label="已完成" value={review.counts.done} tone="text-blue-600" active={review.filter === 'done'} onClick={() => review.setFilter('done')} />
                <StatCard label="可制作" value={review.counts.producible} tone="text-emerald-600" active={review.filter === 'producible'} onClick={() => review.setFilter('producible')} />
                <StatCard label="不制作" value={review.counts.rejected} tone="text-rose-600" active={review.filter === 'rejected'} onClick={() => review.setFilter('rejected')} />
                {review.reviewMode === 'video' && <StatCard label="低价值" value={review.counts.lowValue} tone="text-amber-700" active={review.filter === 'low_value'} onClick={() => review.setFilter('low_value')} />}
              </section>

              <section className="rounded-[26px] border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                    <h2 className="truncate text-base font-black text-slate-950">{review.parsed.fileName}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={requestReplace} disabled={busy} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"><RefreshCcw className="h-4 w-4" />换表</button>
                    {review.isRunning ? (
                      <button type="button" onClick={review.stopReview} disabled={review.isStopping} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"><Square className="h-4 w-4 fill-current" />{review.isStopping ? '正在收尾…' : review.runMode === 'all' ? '停止批量' : '停止试跑'}</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => void review.runReview('trial')} disabled={!canTrial} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"><Play className="h-4 w-4 fill-current" />{trialLabel}</button>
                        <button type="button" onClick={() => void review.runReview('all')} disabled={!canRun}  className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"><Layers className="h-4 w-4" />{batchLabel}</button>
                        {review.counts.failed > review.counts.uncertain && <button type="button" onClick={() => void review.retryFailed()} disabled={busy || !review.sessionReady} title="仅重新审核已确认失败的记录；可能再次产生费用" className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40">重审失败 {review.counts.failed - review.counts.uncertain} 条</button>}
                      </>
                    )}
                    <button type="button" onClick={() => void review.exportWorkbook()} disabled={!canExport || review.isExporting} className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300">
                      {review.isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{review.counts.done === review.counts.total ? '导出审核表' : '导出当前进度'}
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">{review.reviewMode === 'video' ? '视频' : '图文'}审核 · {review.model} · 已识别 {review.parsed.sheets.length} 个工作表，共 {review.counts.total} 条关键词</p>
                <details className="mt-2 text-xs leading-5 text-slate-500">
                  <summary className="w-fit cursor-pointer font-semibold hover:text-slate-800">审核与费用说明</summary>
                  <div className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2">
                    <p>工作表：{review.sheetSummary}。试跑 {review.trialSize} 条，每次请求 {review.batchSize} 条，最多 {review.concurrency} 路并发；遇限流会自动降速。</p>
                    <p>停止后会等待已提交请求返回并保留结果。提交结果不确定的记录会单独隔离，避免自动重复提交；费用估算只计入已收到的用量，待核对请求可能尚未计入。</p>
                    <p>联网补查暂不可用，当前审核不发起额外补查请求。</p>
                    <p>模型费用以实际账单为准。<a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/" target="_blank" rel="noreferrer" className="ml-1 font-semibold text-blue-700 underline underline-offset-2">查看 DeepSeek 官方价格</a></p>
                    <p>{review.parsed.preserveSourceLayout ? '含公式、内部引用或辅助工作表的工作簿保留原工作表与列顺序。' : review.reviewMode === 'video' ? '原表列全部保留，追加最终垂类、制作判断与低价值标记。' : '原表列保留；整列为空的实体拓展q和分类不进入结果表，审核列接在下发时间后。'}</p>
                  </div>
                </details>
                {review.parsed.preserveSourceLayout && <p className="mt-2 text-xs font-semibold text-blue-700">为保留公式、内部引用或辅助表，导出保留原布局，新增审核列追加至末尾。</p>}
                {review.parsed.reviewModeMismatch && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">此表来自{review.parsed.sourceReviewMode === 'video' ? '视频' : '图文'}审核，旧裁决已清除；当前将按{review.reviewMode === 'video' ? '视频' : '图文'}规则重新审核。</p>}
                {(review.tokenUsage.cacheHit + review.tokenUsage.cacheMiss + review.tokenUsage.completion) > 0 && <p className="mt-1 text-xs font-semibold text-slate-600">{review.usageProvider === 'deepseek' ? `本轮估算费用 ¥${review.estimatedCostLabel}（仅供参考，以官方账单为准） · ` : '本轮用量（费用以所选网关账单为准） · '}缓存命中 {review.tokenUsage.cacheHit}、未命中 {review.tokenUsage.cacheMiss}、输出 {review.tokenUsage.completion} token。</p>}
                {review.reviewMode === 'video' && <p className="mt-1 text-xs font-semibold text-rose-700">已标记低价值关键词 {review.counts.lowValue} 条；原表“分类”保留，新增“最终垂类”和“低价值关键词”结果列。</p>}
                {review.counts.uncertain > 0 && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{review.counts.uncertain} 条提交结果待核对：已隔离，避免重复扣费。请导出当前进度并核对所用模型的用量。</p>}
                <div role="progressbar" aria-label="关键词审核完成进度" aria-valuemin={0} aria-valuemax={review.counts.total} aria-valuenow={review.counts.done} aria-valuetext={`已完成 ${review.counts.done} / ${review.counts.total} 条`} className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500"><span role="status" aria-live="polite">{review.notice || '等待试跑'}</span><span className="shrink-0 tabular-nums">{review.counts.done} / {review.counts.total} · {progress}%</span></div>
              </section>

              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                {([['pending', '待审核', review.counts.pending], ['running', '审核中', review.counts.running], ['failed', '失败', review.counts.failed - review.counts.uncertain], ['uncertain', '待核对', review.counts.uncertain]] as const).map(([filter, label, count]) => <button key={filter} type="button" aria-pressed={review.filter === filter} onClick={() => review.setFilter(filter)} className={`rounded-xl border px-3 py-2 transition ${review.filter === filter ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300'}`}>{label} <span className="ml-1 tabular-nums">{count}</span></button>)}
              </div>
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
