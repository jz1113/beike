import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { VideoSalesProductAnalysis } from '@shared/domain/sales';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';

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
  const [activeTab, setActiveTab] = useState<'facts' | 'scenes'>('facts');
  const uid = useId();
  const evidenceScrollRef = useRef<HTMLDivElement>(null);
  const facts = [...new Set([
    analysis?.visualFeatures?.mainColor?.trim() && `主色：${analysis.visualFeatures.mainColor.trim()}`,
    analysis?.visualFeatures?.productForm?.trim() && `款式：${analysis.visualFeatures.productForm.trim()}`,
    analysis?.visualFeatures?.texture?.trim() && `材质质感：${analysis.visualFeatures.texture.trim()}`,
    analysis?.visualFeatures?.designStyle?.trim() && `设计风格：${analysis.visualFeatures.designStyle.trim()}`,
    ...(analysis?.knownFacts || []),
  ].filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim()))];
  const scenes = [...new Set([analysis?.targetAudience?.trim() && `适用人群：${analysis.targetAudience.trim()}`, ...(analysis?.usageScenarios || [])].filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim()))];
  const propFacts = new Set(Object.entries(props).map(([key, value]) => `${key.trim()}：${value.trim()}`));
  const currentPoints = sellingPoints.split(/[；;\n]+/).map((point) => point.trim()).filter(Boolean);
  const displayPoints = currentPoints.filter((point) => !propFacts.has(point));
  const hasPoints = displayPoints.length > 0;
  const extracted = Boolean(analysis || hasPoints);
  const status = isAnalyzing ? '正在自动提炼…' : analysis ? `已自动提炼 · ${displayPoints.length} 条` : displayPoints.length ? `${displayPoints.length} 条` : '等待提炼';
  const tabs = [{ id: 'facts' as const, label: '外观与材质依据', items: facts }, { id: 'scenes' as const, label: '适用人群与场景', items: scenes }];
  const selectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    evidenceScrollRef.current?.scrollTo({ top: 0 });
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'facts' : event.key === 'End' ? 'scenes' : activeTab === 'facts' ? 'scenes' : 'facts';
    selectTab(next);
    document.getElementById(`${uid}-${next}-tab`)?.focus();
  };

  return <section className={`sales-product-insights @container ${card ? 'sales-product-insights-workspace' : 'border-t border-slate-100 pt-5 dark:border-white/[0.08]'}`} aria-label="脚本卖点与分析">
    <div className="sales-insights-core">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">脚本卖点</h2>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">{isAnalyzing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}{status}</span>
          {onAnalyze && <button type="button" disabled={disabled || isAnalyzing || !canAnalyze} onClick={onAnalyze} className={`sales-extract-button ${canAnalyze && !extracted ? 'sales-extract-primary' : `sales-extract-secondary ${salesGhostButtonClass}`} ${salesFocusClass}`}>{extracted ? <RefreshCw className="h-3.5 w-3.5" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}{isAnalyzing ? '提炼中' : extracted ? '重新提炼' : 'AI 提炼卖点'}</button>}
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span id={`${uid}-points-label`} className="text-xs font-medium text-slate-500 dark:text-slate-400">已知卖点</span>
          {currentPoints.length > 0 && <button type="button" disabled={disabled} onClick={() => setEditing((value) => !value)} className={`shrink-0 rounded text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-white ${salesFocusClass}`}>{editing ? '完成编辑' : '编辑卖点'}</button>}
        </div>
        {editing || displayPoints.length === 0 ? <textarea aria-labelledby={`${uid}-points-label`} rows={5} value={sellingPoints} placeholder="采集商品或输入商品信息后，点击右上角 AI 提炼卖点，或直接在此手动输入卖点" disabled={disabled} onChange={(event) => { setEditing(true); onChange({ sellingPoints: event.target.value }); }} className={`${salesInputClass} min-h-36 resize-y text-[13px] leading-7`} /> : <ol className="sales-selling-points grid grid-cols-1 gap-3 @min-[420px]:grid-cols-2">{displayPoints.map((point, index) => {
          const firstClause = point.match(/^(.{1,28}?)([，,。！!？?：:]|$)/u)?.[1] || point.slice(0, 18);
          return <li key={index} className="sales-selling-point flex min-w-0 gap-3 rounded-xl bg-slate-100/80 p-4 dark:bg-white/[0.04]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200/80 text-[11px] font-bold tabular-nums text-slate-600 dark:bg-white/[0.08] dark:text-slate-200">{String(index + 1).padStart(2, '0')}</span>
            <p className="min-w-0 break-words text-[13px] leading-6 text-slate-600 dark:text-slate-400"><strong className="font-semibold text-slate-900 dark:text-slate-100">{firstClause}</strong>{point.slice(firstClause.length)}</p>
          </li>;
        })}</ol>}
      </div>
    </div>
    <section className="sales-insights-evidence" aria-label="AI 提炼商品信息点">
      <h3 className="mb-3 text-xs font-medium text-slate-500 dark:text-slate-400">提炼依据与适用场景</h3>
      <div role="tablist" aria-label="提炼依据分类" className="flex shrink-0 gap-5 border-b border-slate-200 dark:border-white/[0.08]">
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" id={`${uid}-${tab.id}-tab`} aria-controls={`${uid}-${tab.id}-panel`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)} onKeyDown={onTabKeyDown} className={`sales-evidence-tab relative pb-3 text-xs ${activeTab === tab.id ? 'is-active font-medium text-slate-900 dark:text-slate-100' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'} ${salesFocusClass}`}>{tab.label} ({tab.items.length || (isAnalyzing ? '提炼中' : analysis ? '未返回' : hasPoints ? '待提炼' : 0)})</button>)}
      </div>
      <div ref={evidenceScrollRef} className="sales-evidence-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth pt-3 pr-2">
        {tabs.map((tab) => <div key={tab.id} role="tabpanel" id={`${uid}-${tab.id}-panel`} aria-labelledby={`${uid}-${tab.id}-tab`} hidden={activeTab !== tab.id} tabIndex={0} className={`rounded-md ${salesFocusClass}`}>
          {tab.items.length > 0 ? <InsightList items={tab.items} /> : <p className="py-6 text-xs leading-6 text-slate-400 dark:text-slate-500">{isAnalyzing ? '正在分析商品资料…' : analysis ? `本次分析未返回${tab.label}，已有卖点仍可使用。` : hasPoints ? '已有卖点尚未关联分析依据，点击重新提炼后展示。' : '提炼完成后，这里将展示对应的商品依据与适用场景。'}</p>}
        </div>)}
      </div>
    </section>
  </section>;
}

function InsightList({ items }: { items: string[] }) {
  return <ul className="space-y-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden /><span className="min-w-0 break-words">{item}</span></li>)}</ul>;
}
