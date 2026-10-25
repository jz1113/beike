import { useId, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { VideoSalesProductAnalysis } from '@shared/domain/sales';
import { salesCardClass, salesFocusClass, salesInputClass } from './salesChrome';

interface Props {
  sellingPoints: string;
  props?: Record<string, string>;
  analysis?: VideoSalesProductAnalysis | null;
  disabled: boolean;
  isAnalyzing?: boolean;
  canAnalyze?: boolean;
  onAnalyze?: () => void;
  card?: boolean;
  onChange: (patch: { sellingPoints: string }) => void;
}

export function SalesProductInsights({ sellingPoints, props = {}, analysis, disabled, isAnalyzing, canAnalyze, onAnalyze, card, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const uid = useId();
  const points = (analysis?.sellingPoints || []).map((point) => point.trim()).filter(Boolean);
  const facts = [...new Set([
    analysis?.visualFeatures?.mainColor && `主色：${analysis.visualFeatures.mainColor}`,
    analysis?.visualFeatures?.productForm && `款式：${analysis.visualFeatures.productForm}`,
    analysis?.visualFeatures?.texture && `材质质感：${analysis.visualFeatures.texture}`,
    ...(analysis?.knownFacts || []),
  ].filter((item): item is string => Boolean(item?.trim())))];
  const scenes = [analysis?.targetAudience && `适用人群：${analysis.targetAudience}`, ...(analysis?.usageScenarios || [])].filter((item): item is string => Boolean(item?.trim()));
  const hasInsights = points.length > 0 || facts.length > 0 || scenes.length > 0;
  const propFacts = new Set(Object.entries(props).map(([key, value]) => `${key.trim()}：${value.trim()}`));
  const currentPoints = sellingPoints.split(/[；;\n]+/).map((point) => point.trim()).filter(Boolean);
  const displayPoints = currentPoints.filter((point) => !propFacts.has(point));
  const status = isAnalyzing ? '正在自动提炼…' : analysis ? `已自动提炼 · ${displayPoints.length} 条` : displayPoints.length ? `${displayPoints.length} 条` : '等待自动提炼';

  return <section className={`${card ? `${salesCardClass} p-4` : 'border-t border-slate-100 pt-5 dark:border-white/[0.08]'} space-y-4`} aria-label="脚本卖点与分析">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">脚本卖点</h3>
      <div className="flex flex-wrap items-center justify-end gap-2"><span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">{isAnalyzing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{status}</span>{card && onAnalyze && <button type="button" disabled={disabled || isAnalyzing || !canAnalyze} onClick={onAnalyze} className={`inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:opacity-40 ${salesFocusClass}`}><Sparkles className="h-3.5 w-3.5" aria-hidden />{isAnalyzing ? '提炼中' : 'AI 提炼卖点'}</button>}</div>
    </div>
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span id={`${uid}-points-label`} className="text-[13px] font-medium text-slate-600 dark:text-slate-300">已知卖点</span>
        {currentPoints.length > 0 && <button type="button" disabled={disabled} onClick={() => setEditing((value) => !value)} className={`shrink-0 rounded text-[11px] text-slate-500 disabled:opacity-40 dark:text-slate-400 ${salesFocusClass}`}>{editing ? '完成编辑' : '编辑卖点'}</button>}
      </div>
      {editing ? <textarea aria-labelledby={`${uid}-points-label`} rows={4} value={sellingPoints} placeholder="采集完成后会自动填入；也可以补充或修改。" disabled={disabled} onChange={(event) => { setEditing(true); onChange({ sellingPoints: event.target.value }); }} className={`${salesInputClass} min-h-28 resize-y text-[13px] leading-6`} /> : displayPoints.length > 0 ? <ol className="grid gap-1.5 @min-[720px]:grid-cols-2">{displayPoints.map((point, index) => <li key={index} className="flex min-w-0 gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] leading-5 dark:bg-white/[0.025]">
        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 break-words text-slate-700 dark:text-slate-200">{point}</span>
      </li>)}</ol> : <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400"><span>{card ? '参数已在上方列出，点击右上角按钮由 AI 提炼卖点。' : '参数已在上方列出，点击下方按钮由 AI 提炼卖点。'}</span>{!card && onAnalyze && <button type="button" disabled={disabled || isAnalyzing || !canAnalyze} onClick={onAnalyze} className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-500/40 px-2.5 py-1.5 font-medium text-amber-700 hover:bg-amber-500/10 disabled:opacity-40 dark:text-amber-200 ${salesFocusClass}`}><Sparkles className="h-3 w-3" aria-hidden />{isAnalyzing ? '提炼中' : 'AI 提炼卖点'}</button>}</div>}
    </div>
      {hasInsights && <div className="space-y-5 rounded-xl bg-slate-50 px-3.5 py-4 dark:bg-white/[0.035]" aria-label="AI 提炼商品信息点">
      <p className="text-[13px] font-medium">提炼依据与适用场景</p>
      {facts.length > 0 && <div><h4 className="text-[13px] font-medium">外观与材质依据</h4><InsightList items={facts} /></div>}
      {scenes.length > 0 && <div><h4 className="text-[13px] font-medium">适用人群与场景</h4><InsightList items={scenes} /></div>}
    </div>}
  </section>;
}

function InsightList({ items }: { items: string[] }) {
  return <ul className="mt-2.5 space-y-2.5 text-[13px] leading-7 text-slate-600 dark:text-slate-300">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2"><span className="mt-3 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden /><span className="min-w-0 break-words">{item}</span></li>)}</ul>;
}
