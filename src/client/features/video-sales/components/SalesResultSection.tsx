import { Check, Copy, Download } from 'lucide-react';
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
  onStop: () => void;
  onCompose: () => void;
  singleDelivery?: boolean;
  actionsInFooter?: boolean;
  globalError?: string | null;
  onPrepareRetry?: () => void;
}

export function SalesResultSection({ script, aspectRatio, resultUrl, renderPhase, isRendering, onStop, onCompose, singleDelivery = false, actionsInFooter = false, globalError, onPrepareRetry }: Props) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyText = async () => {
    try { await navigator.clipboard.writeText(seoText(script)); setCopyStatus('copied'); }
    catch { setCopyStatus('error'); }
  };
  const shots = script.shots;
  const issue = globalError || script.renderError;
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
      {singleDelivery && script.renderStatus === 'uncertain' && !issue && <p role="alert" className="rounded-xl bg-amber-500/10 p-4 text-xs leading-6 text-amber-700 dark:text-amber-300">{script.renderSubmissionKey ? '视频提交结果未确认。将按已保存的提交标识查询原任务，不会另外创建计费任务。' : '视频提交结果未确认。已有回执时仅查询原任务；没有回执时请核对服务端生成记录，当前项目不会自动重投，以免重复计费。'}</p>}
      {singleDelivery && script.renderStatus === 'failed' && resultUrl && <p className="rounded-xl bg-black/[0.04] p-4 text-xs leading-6 text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">本次生成失败，下面仍是之前保留的成片，没有被这次任务替换。</p>}
      {singleDelivery && issue && <p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-xs leading-6 text-rose-500">{issue}</p>}
      {singleDelivery && (script.renderTaskId || script.renderSubmissionKey) && <dl aria-label="任务核对信息" className={`${salesCardClass} space-y-2 break-all p-4 text-xs text-slate-500`}>
        <div><dt>提交标识</dt><dd className="mt-1 select-all">{script.renderSubmissionKey || '历史任务未记录'}</dd></div>
        <div><dt>上游任务 ID</dt><dd className="mt-1 select-all">{script.renderTaskId || '尚未返回，请凭提交标识核对渠道记录'}</dd></div>
        {script.renderSnapshot?.model && <div><dt>提交模型</dt><dd className="mt-1">{script.renderSnapshot.model}</dd></div>}
      </dl>}
      {singleDelivery && script.renderStatus === 'uncertain' && !script.renderTaskId && onPrepareRetry && <details className="text-xs text-slate-500"><summary className="cursor-pointer">已向渠道人工核对？</summary><p className="my-3 leading-6">仅在渠道明确确认没有创建任务后，才能另建草稿。原记录与提示词继续保留。</p><button type="button" disabled={isRendering} onClick={onPrepareRetry} className={`min-h-9 ${salesGhostButtonClass}`}>已核实未提交，准备新草稿</button></details>}
      {resultUrl && <div className="flex justify-center rounded-2xl bg-black/[0.035] p-3 dark:bg-black/20"><video src={resultUrl} controls playsInline className={`rounded-xl ring-1 ring-black/[0.06] dark:ring-white/[0.08] ${salesPreviewClass(aspectRatio, 'hero')}`} /></div>}
      {resultUrl && shots.some((shot) => shot.speechMode === 'on_camera') && <p className="text-xs leading-6 text-slate-500">预览时请听看出镜段：人物是否亲口说话、每个字与嘴唇开合是否同步、停顿是否停嘴、转身前是否说完。生成成功表示已返回视频，口型仍需看成片确认。</p>}
      {!singleDelivery && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shots.map((shot, index) => (
            <ShotResult key={shot.shotId || index} shot={shot} index={index} title={script.title} aspectRatio={aspectRatio} />
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

function ShotResult({ shot, index, title, aspectRatio }: { shot: VideoSalesShot; index: number; title: string; aspectRatio: string }) {
  const label = salesShotStatusLabel(shot.status, Boolean(shot.assetUrl));
  return (
    <article className={`${salesCardClass} p-3`}>
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-[#8E8E93]"><span>镜头 {index + 1}</span><span>{label}</span></div>
      {shot.assetUrl ? <video src={shot.assetUrl} muted playsInline controls className={`rounded-xl ${salesPreviewClass(aspectRatio, 'shot')}`} /> : shot.referenceFrameUrl ? <img src={shot.referenceFrameUrl} alt="场景参考图" className={`rounded-xl object-cover ${salesPreviewClass(aspectRatio, 'shot')}`} /> : <div className={`flex items-center justify-center rounded-xl bg-black/[0.04] text-[11px] text-slate-500 dark:bg-white/[0.06] dark:text-[#8E8E93] ${salesPreviewClass(aspectRatio, 'shot')}`}>{shot.status === 'redrawing' ? '正在重绘参考图' : '待生成'}</div>}
      {shot.status === 'uncertain' && <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">这个历史镜头的提交结果未确认。当前流程不再重新提交单镜，请核对生成记录。</p>}
      {shot.failReason && <p className="mt-2 text-[11px] text-rose-500">{shot.failReason}</p>}
      {shot.assetUrl && <a href={shot.assetUrl} download={`${title || '带货视频'}-镜头${index + 1}.mp4`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Download className="h-3 w-3" />下载</a>}
    </article>
  );
}

function seoText(script: VideoSalesScript): string {
  const seo = script.seo;
  if (!seo) return '';
  return `【标题】${seo.title}\n【标签】${seo.hashtags.join(' ')}\n【封面】${seo.coverText}\n【文案】${seo.description}\n【互动】${seo.interactionGuide}`;
}
