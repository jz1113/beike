import { Check, ChevronDown, Copy, Download, Loader2, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { SalesImageRef, VideoSalesScript, VideoSalesShot } from '@shared/domain/sales';
import { salesPreviewClass, salesRenderStatus, salesShotStatusLabel, type SalesRenderPhase } from '../model/salesWorkspace';
import { salesSingleResultStatus } from '../model/salesWorkspaceView';
import { SalesAlert, salesCardClass, salesFocusClass, salesGhostButtonClass, salesLabelClass, salesNoteClass } from './salesChrome';
import { SalesResultPreview } from './SalesResultPreview';
import { SalesResultPublishing } from './SalesResultPublishing';

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
  productImages?: SalesImageRef[];
  sidebar?: ReactNode;
  actions?: ReactNode;
}

export function SalesResultSection({ script, aspectRatio, resultUrl, renderPhase, isRendering, onStop, onQuery, singleDelivery = false, actionsInFooter = false, globalError, onPrepareRetry, onBindTask, productImages = [], sidebar, actions }: Props) {
  const shots = script.shots;
  const issue = globalError || script.renderError;
  const done = shots.filter((shot) => shot.status === 'done' && shot.assetUrl).length;
  const status = singleDelivery ? salesSingleResultStatus({ rendering: isRendering, hasResult: Boolean(resultUrl), status: script.renderStatus, hasReceipt: Boolean(script.renderTaskId) }) : salesRenderStatus({ renderPhase, done, total: shots.length, hasResult: Boolean(resultUrl) });
  const failed = script.renderStatus === 'failed' || (Boolean(issue) && !isRendering);
  const uncertain = singleDelivery && script.renderStatus === 'uncertain' && !isRendering;
  const notices = <>
    {uncertain && <SalesUncertainCard script={script} detail={issue} onBindTask={onBindTask} onPrepareRetry={onPrepareRetry} />}
    {singleDelivery && !isRendering && script.renderStatus === 'failed' && resultUrl && <SalesAlert>本次生成失败，仍保留之前的成片，没有被这次任务替换。</SalesAlert>}
    {singleDelivery && !isRendering && issue && !uncertain && <SalesAlert tone="error">{issue}</SalesAlert>}
  </>;
  const taskDetails = singleDelivery && <details className="sales-result-drawer group" open={uncertain || failed}>
    <summary className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-3 text-xs font-medium ${salesFocusClass}`}><span>任务核对信息</span><ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden /></summary>
    <dl aria-label="任务核对信息" className="space-y-3 pb-3">
      <ReceiptRow label="提交标识" value={script.renderSubmissionKey} fallback="历史任务未记录" />
      <ReceiptRow label="上游任务 ID" value={script.renderTaskId} fallback="尚未返回，请凭提交标识核对渠道记录" />
      {script.renderSnapshot?.model && <ReceiptRow label="提交模型" value={script.renderSnapshot.model} />}
    </dl>
  </details>;
  const defaultActions = !actionsInFooter && <div className="space-y-2">
    {!isRendering && shots.some((shot) => shot.taskId && ['generating', 'uncertain'].includes(shot.status || '')) && !singleDelivery && <button type="button" onClick={onQuery} className={`min-h-9 w-full ${salesGhostButtonClass}`}><RefreshCw className="h-3.5 w-3.5" />查询历史镜头</button>}
    {singleDelivery && !isRendering && script.renderTaskId && ['generating', 'uncertain'].includes(script.renderStatus || '') && <button type="button" onClick={onQuery} className={`min-h-9 w-full ${salesGhostButtonClass}`}>继续查询原任务（不重新提交）</button>}
    {resultUrl && <a href={resultUrl} download={`${script.title || '电商视频'}.mp4`} className={`min-h-9 w-full ${salesGhostButtonClass}`}><Download className="h-3.5 w-3.5" />下载完整视频</a>}
  </div>;
  return <div className={`sales-result-workspace ${sidebar ? 'has-storyboard' : ''}`}>
    {sidebar && <aside aria-label="商品信息与分镜" className="sales-result-panel sales-result-storyboard"><div className="sales-result-sidebar-scroll min-h-0 flex-1 overflow-hidden">{sidebar}</div></aside>}
    <SalesResultPreview resultUrl={resultUrl} aspectRatio={aspectRatio} duration={script.totalDuration || shots.reduce((sum, shot) => sum + (shot.duration || 0), 0)} isRendering={isRendering} status={status} onStop={onStop}>
      {!singleDelivery && <>
        <SalesAlert>这是历史逐镜方案，仅支持查询和下载已有片段；请更新脚本后生成整段视频。</SalesAlert>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{shots.map((shot, index) => <ShotResult key={shot.shotId || index} shot={shot} index={index} title={script.title} aspectRatio={aspectRatio} />)}</div>
      </>}
    </SalesResultPreview>
    <aside aria-label="成片发布与任务" className="sales-result-panel sales-result-publishing">
      <SalesResultPublishing script={script} productImages={productImages} tasks={taskDetails} notices={notices} actions={actions || defaultActions} />
    </aside>
  </div>;
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
        <p className="mt-1 text-xs leading-6 opacity-90">{script.renderTaskId ? '已有上游任务 ID，可继续查询原任务，不会重新提交。' : '请求可能已被渠道接收，但没有收到确认回执。为避免重复计费，系统不会自动重新提交。请凭下方「任务核对信息」中的提交标识到渠道后台核对生成记录。'}</p>
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
