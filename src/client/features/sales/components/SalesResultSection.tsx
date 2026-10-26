import { Check, Copy, Download, Film, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { VideoSalesScript, VideoSalesShot } from '@shared/domain/sales';
import { salesPreviewClass, salesRenderStatus, salesShotStatusLabel, type SalesRenderPhase } from '../model/salesWorkspace';
import { salesSingleResultStatus } from '../model/salesWorkspaceView';
import { SalesAlert, SalesIndeterminateBar, SalesStatusPill, SalesStickyHeader, salesCardClass, salesGhostButtonClass, salesLabelClass, salesNoteClass } from './salesChrome';

interface Props {
  script: VideoSalesScript;
  aspectRatio: string;
  resultUrl: string | null;
  renderPhase: SalesRenderPhase | null;
  isRendering: boolean;
  onStop: () => void;
  onQuery: () => void;
  singleDelivery?: boolean;
  actionsInFooter?: boolean;
  globalError?: string | null;
  onPrepareRetry?: () => void;
  onBindTask?: (taskId: string) => Promise<string | null>;
}

export function SalesResultSection({ script, aspectRatio, resultUrl, renderPhase, isRendering, onStop, onQuery, singleDelivery = false, actionsInFooter = false, globalError, onPrepareRetry, onBindTask }: Props) {
  const [copyStatus, setCopyStatus] = useState<{ title: 'idle' | 'copied' | 'error'; body: 'idle' | 'copied' | 'error' }>({ title: 'idle', body: 'idle' });
  const copyText = async (kind: 'title' | 'body') => {
    const seo = script.seo;
    if (!seo) return;
    const value = kind === 'title' ? seo.title : seo.description;
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus((previous) => ({ ...previous, [kind]: 'copied' }));
    } catch {
      setCopyStatus((previous) => ({ ...previous, [kind]: 'error' }));
    }
  };
  const shots = script.shots;
  const issue = globalError || script.renderError;
  const videoDone = shots.filter((shot) => shot.status === 'done' && shot.assetUrl).length;
  const done = videoDone;
  const status = singleDelivery ? salesSingleResultStatus({ rendering: isRendering, hasResult: Boolean(resultUrl), status: script.renderStatus, hasReceipt: Boolean(script.renderTaskId) }) : salesRenderStatus({ renderPhase, done, total: shots.length, hasResult: Boolean(resultUrl) });
  const failed = script.renderStatus === 'failed' || (Boolean(issue) && !isRendering);
  const pill = isRendering ? <SalesStatusPill tone="busy">{script.renderTaskId ? '生成中' : '提交中'}</SalesStatusPill> : resultUrl && !failed ? <SalesStatusPill tone="done">已完成</SalesStatusPill> : script.renderStatus === 'uncertain' ? <SalesStatusPill tone="warn">待核对</SalesStatusPill> : failed ? <SalesStatusPill tone="error">失败</SalesStatusPill> : <SalesStatusPill tone="idle">未完成</SalesStatusPill>;
  const uncertain = singleDelivery && script.renderStatus === 'uncertain' && !isRendering;
  const showReceipt = singleDelivery && (!resultUrl || failed || isRendering) && Boolean(script.renderTaskId || script.renderSubmissionKey);
  const previewRatio = ({ '16:9': 16 / 9, '3:4': 3 / 4, '1:1': 1 } as Record<string, number>)[aspectRatio] || 9 / 16;
  const showStatus = !resultUrl || failed || isRendering;
  return (
    <div className="min-h-full space-y-4 p-3 sm:p-4">
      {showStatus && <SalesStickyHeader label="生成结果" title="生成结果" meta={<><span className="truncate text-xs text-slate-500">{status}</span>{pill}</>}
        actions={<>
          {!actionsInFooter && isRendering && <button type="button" onClick={onStop} className={`h-8 ${salesGhostButtonClass}`}>停止继续提交</button>}
          {!singleDelivery && !isRendering && shots.some((shot) => shot.taskId && ['generating', 'uncertain'].includes(shot.status || '')) && <button type="button" onClick={onQuery} className={`h-8 ${salesGhostButtonClass}`}><RefreshCw className="h-3.5 w-3.5" />查询历史镜头</button>}
          {!actionsInFooter && singleDelivery && !isRendering && script.renderTaskId && ['generating', 'uncertain'].includes(script.renderStatus || '') && <button type="button" onClick={onQuery} className={`h-8 ${salesGhostButtonClass}`}>继续查询原任务（不重新提交）</button>}
          {!actionsInFooter && resultUrl && <a href={resultUrl} download={`${script.title || '电商视频'}.mp4`} className={`h-8 ${salesGhostButtonClass}`}><Download className="h-3.5 w-3.5" />下载完整视频</a>}
        </>}>
        {isRendering && <SalesIndeterminateBar label={status} />}
      </SalesStickyHeader>}
      {!showStatus && !actionsInFooter && <div className="flex justify-end"><a href={resultUrl!} download={`${script.title || '电商视频'}.mp4`} className={`h-8 ${salesGhostButtonClass}`}><Download className="h-3.5 w-3.5" />下载完整视频</a></div>}
      <div className="@container">
        <div className="grid items-start gap-5 @min-[960px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            {uncertain && <SalesUncertainCard script={script} detail={issue} onBindTask={onBindTask} onPrepareRetry={onPrepareRetry} />}
            {singleDelivery && script.renderStatus === 'failed' && resultUrl && <SalesAlert>本次生成失败，下面仍是之前保留的成片，没有被这次任务替换。</SalesAlert>}
            {singleDelivery && issue && !uncertain && <SalesAlert tone="error">{issue}</SalesAlert>}
            {(singleDelivery || resultUrl) && <section aria-label="成片预览" className="flex min-w-0 flex-col items-center gap-3">
              {resultUrl ? <video src={resultUrl} controls playsInline preload="metadata" aria-label="完整视频" style={{ aspectRatio: previewRatio, width: `min(100%, calc((100dvh - 12rem) * ${previewRatio}))` }} className="block max-w-full rounded-lg bg-black object-contain" /> : <div className={`relative mx-auto flex max-h-[72vh] flex-col items-center justify-center gap-3 overflow-hidden rounded-lg bg-slate-950 px-6 text-center ${salesPreviewClass(aspectRatio, 'hero')}`}>
                {isRendering && <div aria-hidden className="absolute inset-0 animate-pulse bg-gradient-to-b from-white/[0.06] via-transparent to-white/[0.04]" />}
                {isRendering ? <Loader2 className="relative h-6 w-6 animate-spin text-amber-300" aria-hidden /> : <Film className="relative h-6 w-6 text-slate-500" aria-hidden />}
                <p className="relative text-sm font-medium text-slate-100">{isRendering ? status : failed ? '视频未生成' : '暂无成片'}</p>
                <p className="relative text-xs leading-6 text-slate-400">{isRendering ? '整段视频通常需要数分钟，可离开页面，回来后会继续查询。' : '查看下方任务信息或返回视频生成重新提交。'}</p>
              </div>}
              {resultUrl && <p className="text-[11px] text-slate-500 dark:text-slate-400">{aspectRatio} · {script.totalDuration || shots.reduce((sum, shot) => sum + (shot.duration || 0), 0)} 秒</p>}
            </section>}
            {!singleDelivery && <SalesAlert>这是历史逐镜方案，仅支持查询和下载已有片段；请更新脚本后生成整段视频。</SalesAlert>}
      {!singleDelivery && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shots.map((shot, index) => <ShotResult key={shot.shotId || index} shot={shot} index={index} title={script.title} aspectRatio={aspectRatio} />)}
            </div>}
          </div>
          <aside className="min-w-0 space-y-4 border-t border-slate-200/70 pt-4 @min-[960px]:sticky @min-[960px]:top-4 @min-[960px]:border-t-0 @min-[960px]:pt-0 dark:border-white/10">
            <section aria-label="发布文案" className={`${salesCardClass} overflow-hidden p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">发布内容</p><h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">发布文案</h3></div>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => { void copyText('title'); }} className={`h-8 px-2.5 ${salesGhostButtonClass}`} aria-label="复制标题">{copyStatus.title === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copyStatus.title === 'copied' ? '已复制' : '复制标题'}</button>
                  <button type="button" onClick={() => { void copyText('body'); }} className={`h-8 px-2.5 ${salesGhostButtonClass}`} aria-label="复制文案">{copyStatus.body === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copyStatus.body === 'copied' ? '已复制' : '复制文案'}</button>
                </div>
              </div>
              {(copyStatus.title === 'error' || copyStatus.body === 'error') && <p role="status" className="mt-3 text-xs text-rose-500">复制失败，请选中文案手动复制或重试</p>}
              <div className="mt-4 rounded-xl bg-black/[0.025] p-3 dark:bg-white/[0.035]">
                <p className="text-sm font-semibold leading-6 text-slate-900 dark:text-white">{script.seo?.title}</p>
                {Boolean(script.seo?.hashtags?.length) && <div className="mt-2 flex flex-wrap gap-1.5">{script.seo?.hashtags.map((tag) => <span key={tag} className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">{tag}</span>)}</div>}
                <p className="mt-3 text-xs leading-6 text-slate-600 dark:text-slate-300">{script.seo?.description}</p>
              </div>
              {(script.seo?.coverText || script.seo?.interactionGuide) && <div className="mt-4 grid gap-3 border-t border-slate-200/70 pt-4 dark:border-white/10">
                {script.seo?.coverText && <div><p className={salesLabelClass}>封面文案</p><p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">{script.seo.coverText}</p></div>}
                {script.seo?.interactionGuide && <div><p className={salesLabelClass}>互动引导</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{script.seo.interactionGuide}</p></div>}
              </div>}
            </section>
            {showReceipt && <details className={`${salesCardClass} group p-4`} open={script.renderStatus === 'uncertain' || failed}>
              <summary className="cursor-pointer list-none text-xs font-medium text-slate-700 dark:text-slate-200">任务核对信息<span className="ml-1 text-slate-400 group-open:hidden">· 展开</span></summary>
              <dl aria-label="任务核对信息" className="mt-3 space-y-3">
                <ReceiptRow label="提交标识" value={script.renderSubmissionKey} fallback="历史任务未记录" />
                <ReceiptRow label="上游任务 ID" value={script.renderTaskId} fallback="尚未返回，请凭提交标识核对渠道记录" />
                {script.renderSnapshot?.model && <ReceiptRow label="提交模型" value={script.renderSnapshot.model} />}
              </dl>
            </details>}
          </aside>
        </div>
      </div>
    </div>
  );
}

function SalesUncertainCard({ script, detail, onBindTask, onPrepareRetry }: { script: VideoSalesScript; detail?: string | null; onBindTask?: (taskId: string) => Promise<string | null>; onPrepareRetry?: () => void }) {
  const [taskId, setTaskId] = useState('');
  const [binding, setBinding] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  const canBind = Boolean(onBindTask && script.renderSubmissionKey && !script.renderTaskId);
  const bind = async () => {
    if (!onBindTask || !taskId.trim()) return;
    setBinding(true);
    setBindError(null);
    try { setBindError(await onBindTask(taskId.trim())); } finally { setBinding(false); }
  };
  return (
    <section aria-label="提交结果待核对" className="space-y-3 rounded-2xl border border-amber-300/60 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.07] dark:text-amber-100">
      <div>
        <h3 className="font-semibold">视频提交结果未确认</h3>
        <p className="mt-1 text-xs leading-6 opacity-90">{script.renderTaskId ? '已有上游任务 ID，可继续查询原任务，不会重新提交。' : '请求可能已被渠道接收，但没有收到确认回执。为避免重复计费，系统不会自动重新提交。请凭右侧「提交标识」到渠道后台核对生成记录。'}</p>
      </div>
      {detail && <details className="text-xs"><summary className="cursor-pointer opacity-80">技术详情</summary><p className="mt-1 break-all font-mono text-[11px] leading-5 opacity-80">{detail}</p></details>}
      {canBind && <div className="space-y-1.5">
        <label htmlFor="sales-bind-task" className="text-xs font-medium">渠道后台已找到任务？填入上游任务 ID 继续查询</label>
        <div className="flex gap-2">
          <input id="sales-bind-task" value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="上游任务 ID" className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 font-mono text-xs text-slate-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100" />
          <button type="button" disabled={binding || !taskId.trim()} onClick={() => { void bind(); }} className={`h-9 disabled:opacity-40 ${salesGhostButtonClass}`}>{binding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}绑定并查询</button>
        </div>
        {bindError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{bindError}</p>}
      </div>}
      {!script.renderTaskId && onPrepareRetry && <div className="border-t border-amber-300/50 pt-3 dark:border-amber-400/20">
        <p className="text-xs leading-6 opacity-90">渠道明确确认没有创建任务？可另建新草稿重新生成，原记录与提示词保留。</p>
        <button type="button" onClick={onPrepareRetry} className={`mt-2 min-h-9 ${salesGhostButtonClass}`}>已核实未提交，准备新草稿</button>
      </div>}
    </section>
  );
}

function ReceiptRow({ label, value, fallback }: { label: string; value?: string | null; fallback?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <dt className={salesLabelClass}>{label}</dt>
      <dd className="mt-1 flex items-start gap-1.5">
        {value ? <><code className="min-w-0 flex-1 select-all break-all rounded-md bg-black/[0.04] px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-white/[0.05] dark:text-slate-200">{value}</code>
          <button type="button" aria-label={`复制${label}`} onClick={() => { void navigator.clipboard.writeText(value).then(() => setCopied(true), () => setCopied(false)); }} className={`h-7 w-7 shrink-0 px-0 ${salesGhostButtonClass}`}>{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</button></>
          : <span className={salesNoteClass}>{fallback}</span>}
      </dd>
    </div>
  );
}

function ShotResult({ shot, index, title, aspectRatio }: { shot: VideoSalesShot; index: number; title: string; aspectRatio: string }) {
  const historicalFrame = typeof shot.historicalData?.referenceFrameUrl === 'string' ? shot.historicalData.referenceFrameUrl : '';
  const label = salesShotStatusLabel(shot.status, Boolean(shot.assetUrl));
  return (
    <article className={`${salesCardClass} p-3`}>
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8E8E93]"><span>镜头 {index + 1}</span><span>{label}</span></div>
      {shot.assetUrl ? <video src={shot.assetUrl} muted playsInline controls className={`rounded-xl ${salesPreviewClass(aspectRatio, 'shot')}`} /> : historicalFrame ? <img src={historicalFrame} alt="场景参考图" className={`rounded-xl object-cover ${salesPreviewClass(aspectRatio, 'shot')}`} /> : <div className={`flex items-center justify-center rounded-xl bg-black/[0.04] text-[11px] text-slate-500 dark:bg-white/[0.06] dark:text-[#8E8E93] ${salesPreviewClass(aspectRatio, 'shot')}`}>历史镜头尚无结果</div>}
      {shot.status === 'uncertain' && <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">这个历史镜头的提交结果未确认。当前流程不再重新提交单镜，请核对生成记录。</p>}
      {shot.failReason && <p className="mt-2 text-[11px] text-rose-500">{shot.failReason}</p>}
      {shot.assetUrl && <a href={shot.assetUrl} download={`${title || '电商视频'}-镜头${index + 1}.mp4`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Download className="h-3 w-3" />下载</a>}
    </article>
  );
}
