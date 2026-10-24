import { useId, useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import type { VideoSalesProductAnalysis } from '@shared/domain/sales';
import { salesFocusClass, salesGhostButtonClass, salesInputClass, salesLabelClass } from './salesChrome';

interface Props {
  sellingPoints: string;
  analysis?: VideoSalesProductAnalysis | null;
  disabled: boolean;
  isAnalyzing?: boolean;
  canAnalyze: boolean;
  onAnalyze?: () => void;
  onChange: (patch: { sellingPoints: string }) => void;
}

const normalizePoints = (text: string) => text.replace(/[\s；;。\n]/g, '');

export function SalesProductInsights({ sellingPoints, analysis, disabled, isAnalyzing, canAnalyze, onAnalyze, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [allPoints, setAllPoints] = useState(false);
  const uid = useId();
  const points = (analysis?.sellingPoints || []).map((point) => point.trim()).filter(Boolean);
  const samePoints = points.length > 0 && normalizePoints(sellingPoints) === normalizePoints(points.join('；'));
  const facts = [...new Set([
    analysis?.visualFeatures?.mainColor && `主色：${analysis.visualFeatures.mainColor}`,
    analysis?.visualFeatures?.productForm && `款式：${analysis.visualFeatures.productForm}`,
    analysis?.visualFeatures?.texture && `材质质感：${analysis.visualFeatures.texture}`,
    ...(analysis?.knownFacts || []),
  ].filter((item): item is string => Boolean(item?.trim())))];
  const scenes = [analysis?.targetAudience && `适用人群：${analysis.targetAudience}`, ...(analysis?.usageScenarios || [])].filter((item): item is string => Boolean(item?.trim()));
  const hasInsights = points.length > 0 || facts.length > 0 || scenes.length > 0;
  const currentPoints = sellingPoints.split(/[；;\n]+/).map((point) => point.trim()).filter(Boolean);

  return <section className="space-y-3 border-t border-slate-100 pt-5 dark:border-white/[0.08]" aria-label="脚本卖点与分析">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-[13px] font-semibold">脚本卖点</h3><p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">生成口播时使用，可补充或修改有依据的信息。</p></div>
      {onAnalyze && <button type="button" disabled={disabled || isAnalyzing || !canAnalyze} onClick={onAnalyze} className={`h-8 shrink-0 px-3 disabled:opacity-40 ${salesGhostButtonClass}`}>
        {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />}
        {isAnalyzing ? 'AI 正在提炼卖点…' : 'AI 提炼卖点与信息'}
      </button>}
    </div>
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span id={`${uid}-points-label`} className={salesLabelClass}>已知卖点<span className="ml-2 text-[10px] font-normal text-slate-400">{samePoints ? '已填入 AI 提炼结果' : currentPoints.length ? `${currentPoints.length} 条` : '可选'}</span></span>
        {currentPoints.length > 0 && <button type="button" disabled={disabled} onClick={() => setEditing((value) => !value)} className={`shrink-0 rounded text-[11px] text-slate-500 disabled:opacity-40 dark:text-slate-400 ${salesFocusClass}`}>{editing ? '完成编辑' : '编辑卖点'}</button>}
      </div>
      {editing || !currentPoints.length ? <textarea aria-labelledby={`${uid}-points-label`} rows={4} value={sellingPoints} placeholder="填写商品的核心特点和使用体验；也可由 AI 结合所选商品图与规格提炼。" disabled={disabled} onChange={(event) => { setEditing(true); onChange({ sellingPoints: event.target.value }); }} className={`${salesInputClass} min-h-28 resize-y text-[13px] leading-6`} /> : <div>
        <ol className="space-y-2">{currentPoints.slice(0, allPoints ? undefined : 3).map((point, index) => <li key={index} className="flex gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] leading-6 dark:bg-white/[0.025]">
          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{String(index + 1).padStart(2, '0')}</span><span className={`min-w-0 break-words text-slate-700 dark:text-slate-200 ${allPoints ? '' : 'line-clamp-2'}`}>{point}</span>
        </li>)}</ol>
        <button type="button" aria-expanded={allPoints} onClick={() => setAllPoints((value) => !value)} className={`mt-2 rounded text-[11px] text-slate-500 dark:text-slate-400 ${salesFocusClass}`}>{allPoints ? '收起卖点' : `展开完整卖点 · 共 ${currentPoints.length} 条`}</button>
      </div>}
    </div>
    {hasInsights && <div className="rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-white/[0.035]" aria-label="AI 提炼商品信息点">
      <button type="button" aria-expanded={expanded} aria-controls={`${uid}-insights`} onClick={() => setExpanded((value) => !value)} className={`flex w-full items-center justify-between gap-3 rounded text-left ${salesFocusClass}`}>
        <span className="min-w-0"><span className="block text-xs font-medium">AI 提炼卖点与商品信息点</span><span className="mt-1 block text-[11px] leading-5 text-slate-500 dark:text-slate-400">{samePoints ? '卖点已填入上方，展开核对分析依据与适用场景' : '展开查看建议卖点、分析依据与适用场景'}</span></span>
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div id={`${uid}-insights`} className="mt-4 space-y-4 border-t border-black/[0.06] pt-4 text-xs dark:border-white/[0.06]">
        {points.length > 0 && !samePoints && <div>
          <div className="flex items-center justify-between gap-2"><h4 className="font-medium">建议卖点</h4><button type="button" disabled={disabled} onClick={() => onChange({ sellingPoints: points.join('；') })} className={`rounded px-2 py-1 text-xs text-amber-700 disabled:opacity-40 dark:text-amber-200 ${salesFocusClass}`}>填入已知卖点</button></div>
          <InsightList items={points} />
        </div>}
        {facts.length > 0 && <div><h4 className="font-medium">外观与材质依据</h4><InsightList items={facts} /></div>}
        {scenes.length > 0 && <div><h4 className="font-medium">适用人群与场景</h4><InsightList items={scenes} /></div>}
        <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">AI 分析请结合商品原图与采集属性核对后使用。</p>
      </div>}
    </div>}
  </section>;
}

function InsightList({ items }: { items: string[] }) {
  return <ul className="mt-2 space-y-2 text-slate-600 dark:text-slate-300">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2 leading-6"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden /><span className="min-w-0 break-words">{item}</span></li>)}</ul>;
}
