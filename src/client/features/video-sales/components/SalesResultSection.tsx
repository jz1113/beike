import { Check, Copy, Download, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { VideoSalesScript, VideoSalesShot } from '@shared/domain/video-sales';
import { salesPreviewClass, salesRedrawnCount, salesRenderStatus, salesShotStatusLabel, type SalesRenderPhase } from '../model/salesWorkspace';
import { salesSingleResultStatus } from '../model/salesWorkspaceView';
import { salesCardClass, salesGhostButtonClass } from './salesChrome';

interface Props {
  script: VideoSalesScript;
  aspectRatio: string;
  resultUrl: string | null;
  renderPhase: SalesRenderPhase | null;
  isRendering: boolean;
  onRetryShot: (index: number) => void;
  onStop: () => void;
  onCompose: () => void;
  singleDelivery?: boolean;
  actionsInFooter?: boolean;
  globalError?: string | null;
}

export function SalesResultSection({ script, aspectRatio, resultUrl, renderPhase, isRendering, onRetryShot, onStop, onCompose, singleDelivery = false, actionsInFooter = false, globalError }: Props) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyText = async () => {
    try { await navigator.clipboard.writeText(seoText(script)); setCopyStatus('copied'); }
    catch { setCopyStatus('error'); }
  };
  const shots = script.shots;
  const videoDone = shots.filter((shot) => shot.status === 'done' && shot.assetUrl).length;
  const done = renderPhase === 'redrawing' ? salesRedrawnCount(shots) : videoDone;
  const status = singleDelivery ? salesSingleResultStatus({ rendering: isRendering, hasResult: Boolean(resultUrl), status: script.renderStatus, hasReceipt: Boolean(script.renderTaskId) }) : salesRenderStatus({ renderPhase, done, total: shots.length, hasResult: Boolean(resultUrl) });
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className={`${salesCardClass} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">生成结果</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-[#8E8E93]">{status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!actionsInFooter && isRendering && <button type="button" onClick={onStop} className={`h-9 px-4 text-xs ${salesGhostButtonClass}`}>停止继续提交</button>}
          {!singleDelivery && !isRendering && videoDone === shots.length && !resultUrl && <button type="button" onClick={onCompose} className="cursor-pointer rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">重新合成</button>}
          {!actionsInFooter && resultUrl && <a href={resultUrl} download={`${script.title || '带货视频'}.mp4`} className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"><Download className="h-3.5 w-3.5" />下载完整视频</a>}
        </div>
      </div>
      {!actionsInFooter && singleDelivery && !isRendering && script.renderTaskId && ['generating', 'uncertain'].includes(script.renderStatus || '') && <button type="button" onClick={onCompose} className={`h-9 px-4 text-xs ${salesGhostButtonClass}`}>继续查询原任务（不重新提交）</button>}
      {singleDelivery && script.renderStatus === 'uncertain' && <p role="alert" className="rounded-xl bg-amber-500/10 p-4 text-xs leading-6 text-amber-700 dark:text-amber-300">视频提交结果未确认。已有回执时仅查询原任务；没有回执时请核对服务端生成记录，当前项目不会自动重投，以免重复计费。</p>}
      {singleDelivery && script.renderError && script.renderError !== globalError && <p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-xs leading-6 text-rose-500">{script.renderError}</p>}
      {resultUrl && <div className="flex justify-center rounded-2xl bg-black/[0.035] p-3 dark:bg-black/20"><video src={resultUrl} controls playsInline className={`rounded-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08] ${salesPreviewClass(aspectRatio, 'hero')}`} /></div>}
      {!singleDelivery && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shots.map((shot, index) => (
            <ShotResult key={shot.shotId || index} shot={shot} index={index} title={script.title} aspectRatio={aspectRatio} disabled={isRendering} onRetry={() => onRetryShot(index)} />
          ))}
        </div>
      )}
      <div className={`${salesCardClass} p-4 text-sm`}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-slate-500 dark:text-[#8E8E93]">发布文案</h3>
          <button type="button" onClick={() => { void copyText(); }} className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-[#EDEDED]">
            {copyStatus === 'copied' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}复制
          </button>
        </div>
        {copyStatus !== 'idle' && <p role="status" className="mb-2 text-xs text-slate-500">{copyStatus === 'copied' ? '已复制发布文案' : '复制失败，请选中文案手动复制或重试'}</p>}
        <p className="font-medium text-slate-800 dark:text-white">{script.seo?.title}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-[#8E8E93]">{script.seo?.hashtags?.join(' ')}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{script.seo?.description}</p>
      </div>
    </div>
  );
}

function ShotResult({ shot, index, title, aspectRatio, disabled, onRetry }: { shot: VideoSalesShot; index: number; title: string; aspectRatio: string; disabled: boolean; onRetry: () => void }) {
  const label = salesShotStatusLabel(shot.status, Boolean(shot.assetUrl));
  return (
    <article className={`${salesCardClass} p-3`}>
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8E8E93]"><span>镜头 {index + 1}</span><span>{label}</span></div>
      {shot.assetUrl ? <video src={shot.assetUrl} muted playsInline controls className={`rounded-xl ${salesPreviewClass(aspectRatio, 'shot')}`} /> : shot.referenceFrameUrl ? <img src={shot.referenceFrameUrl} alt="场景参考图" className={`rounded-xl object-cover ${salesPreviewClass(aspectRatio, 'shot')}`} /> : <div className={`flex items-center justify-center rounded-xl bg-black/[0.04] text-[11px] text-slate-500 dark:bg-white/[0.06] dark:text-[#8E8E93] ${salesPreviewClass(aspectRatio, 'shot')}`}>{shot.status === 'redrawing' ? '正在重绘参考图' : '待生成'}</div>}
      {shot.status === 'uncertain' && <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">提交结果未确认。重新提交可能重复计费，请先核对这个镜头是否已经生成。</p>}
      {shot.failReason && <p className="mt-2 text-[11px] text-rose-500">{shot.failReason}</p>}
      <div className="mt-2 flex gap-3 text-[11px]">
        {shot.status !== 'generating' && shot.status !== 'redrawing' && <button type="button" disabled={disabled} onClick={onRetry} className="inline-flex cursor-pointer items-center gap-1 font-medium text-slate-800 disabled:opacity-40 dark:text-[#EDEDED]"><RotateCcw className="h-3 w-3" />{shot.status === 'uncertain' ? '确认后重新提交' : '重试这个镜头'}</button>}
        {shot.assetUrl && <a href={shot.assetUrl} download={`${title || '带货视频'}-镜头${index + 1}.mp4`} className="inline-flex items-center gap-1 font-semibold text-slate-500"><Download className="h-3 w-3" />下载</a>}
      </div>
    </article>
  );
}

function seoText(script: VideoSalesScript): string {
  const seo = script.seo;
  if (!seo) return '';
  return `【标题】${seo.title}\n【标签】${seo.hashtags.join(' ')}\n【封面】${seo.coverText}\n【文案】${seo.description}\n【互动】${seo.interactionGuide}`;
}
