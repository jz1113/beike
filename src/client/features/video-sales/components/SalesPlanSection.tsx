import { VIDEO_SALES_SHOT_TYPE_CONFIG, type VideoSalesProductAnalysis, type VideoSalesScript, type VideoSalesShot } from '@shared/domain/video-sales';
import { salesCardClass, salesFocusClass, salesInputClass } from './salesSurface';

interface Props {
  analysis: VideoSalesProductAnalysis | null;
  script: VideoSalesScript;
  disabled: boolean;
  onEditShot: (index: number, patch: Partial<VideoSalesShot>) => void;
}

export function SalesPlanSection({ analysis, script, disabled, onEditShot }: Props) {
  let elapsed = 0;
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <section className={`${salesCardClass} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{script.title || '口播脚本'}</h2><span className="text-xs text-slate-500">{script.shots.length} 段 · {script.totalDuration} 秒</span></div>
        <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">确认口播和画面节奏后，再准备素材。分镜属于同一条视频，不逐镜生成或拼接。</p>
        {script.planStale && <p role="status" className="mt-3 rounded-xl bg-amber-500/[0.07] p-3 text-xs leading-6 text-amber-700 dark:text-amber-200">商品或方案已修改，请重新生成脚本后继续。</p>}
        {analysis && <details className="mt-4 border-t border-slate-200/80 pt-3 dark:border-white/10"><summary className={`cursor-pointer rounded text-xs text-slate-500 ${salesFocusClass}`}>查看商品分析与事实依据 · 已分析 {analysis.coveredImageCount ?? 0}/{analysis.imageCount ?? analysis.coveredImageCount ?? 0} 张图片</summary><div className="mt-4 grid gap-4 text-sm md:grid-cols-3"><Fact title="卖点" items={analysis.sellingPoints} /><Fact title="已知事实" items={analysis.knownFacts || []} /><Fact title="创作建议" items={[analysis.targetAudience, ...(analysis.creativeNotes || []), analysis.videoSuggestions?.suggestedStyle || '']} /></div></details>}
      </section>
      <ol className="space-y-3" aria-label="口播与画面时间轴">
        {script.shots.map((shot, index) => {
          const start = elapsed;
          elapsed += shot.duration;
          const type = VIDEO_SALES_SHOT_TYPE_CONFIG[shot.type] || VIDEO_SALES_SHOT_TYPE_CONFIG.demo;
          return <li key={shot.shotId || index} className={`${salesCardClass} p-4`}>
            <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-lg bg-black/5 px-2 py-1 text-xs font-medium tabular-nums dark:bg-white/10">{start}–{elapsed} 秒</span><span className="text-xs text-slate-500">{index + 1}. {type.label}</span></div>
            <div className="grid gap-3 xl:grid-cols-2"><div><p className="text-[11px] text-slate-500">口播</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7">{shot.voiceover || '此段无口播'}</p></div><div><p className="text-[11px] text-slate-500">画面</p><p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-7 text-slate-600 dark:text-slate-300">{shot.description}</p></div></div>
            <details className="mt-3 border-t border-slate-200/70 pt-3 dark:border-white/10"><summary className={`cursor-pointer rounded text-xs text-slate-500 ${salesFocusClass}`}>编辑这一段</summary>
              <div className="mt-3 space-y-3"><label className="block text-xs text-slate-500">段落时长（秒）<input aria-label={`段落 ${index + 1} 时长`} type="number" min={1} max={60} disabled={disabled} value={shot.duration} onChange={(event) => onEditShot(index, { duration: Number(event.target.value) || shot.duration })} className={`${salesInputClass} max-w-28`} /></label>
                <div className="grid gap-3 xl:grid-cols-2"><label className="text-xs text-slate-500">口播<textarea value={shot.voiceover} rows={3} disabled={disabled} onChange={(event) => onEditShot(index, { voiceover: event.target.value })} className={`${salesInputClass} resize-y`} /></label><label className="text-xs text-slate-500">画面描述<textarea value={shot.description} rows={3} disabled={disabled} onChange={(event) => onEditShot(index, { description: event.target.value })} className={`${salesInputClass} resize-y`} /></label></div>
                {shot.selectionReason && <p className="text-[11px] leading-5 text-slate-500">参考依据：{shot.selectionReason}</p>}
              </div>
            </details>
          </li>;
        })}
      </ol>
    </div>
  );
}

function Fact({ title, items }: { title: string; items: string[] }) {
  return <div><h3 className="text-xs text-slate-500">{title}</h3><p className="mt-1 break-words text-sm leading-6">{items.filter((item) => item.trim()).join('；') || '暂无已确认信息'}</p></div>;
}
