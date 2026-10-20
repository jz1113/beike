import { ChevronDown, Package } from 'lucide-react';
import { eligibleSalesImages } from '@shared/domain/video-sales/workflow';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { salesCreationRule } from '../model/fashionSalesSkill';
import { SalesProductFields } from './SalesProductFields';
import { SalesProductMedia } from './SalesProductMedia';
import { SalesPlanningSettings } from './SalesPlanningSettings';
import { salesFocusClass, salesInputClass, salesLabelClass } from './salesSurface';

interface Props {
  state: VideoSalesStudioState;
  updateState: (patch: Partial<VideoSalesStudioState>) => void;
  compact?: boolean;
  isBusy: boolean;
  isCollecting: boolean;
  isUploading: boolean;
  onCollect: () => void;
  onRefresh?: () => void;
  onImageError: (index: number) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onOpenRules: () => void;
}

export function ProductSetupPanel({ state, updateState, compact, isBusy, isCollecting, isUploading, onCollect, onRefresh, onImageError, onUpload, onOpenRules }: Props) {
  const usable = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const form = <div className="space-y-5">
    {(state.collectionSource || state.fromCache !== undefined) && <p className="text-[11px] text-slate-500 dark:text-slate-400">{state.fromCache ? '来自采集缓存' : '来自接口采集'}{state.collectionSource ? ` · ${state.collectionSource}` : ''}</p>}
    <SalesProductMedia productUrl={state.productUrl} images={state.imageCatalog} usableCount={usable.length} metadata={state.variantMetadata} selection={state.colorSelection} isBusy={isBusy} isCollecting={isCollecting} isUploading={isUploading} onUrlChange={(productUrl) => updateState({ productUrl })} onSelection={(colorSelection) => updateState({ colorSelection })} onCollect={onCollect} onRefresh={onRefresh} onUpload={onUpload} onImageError={onImageError} />
    <SalesProductFields productName={state.productName} brand={state.brand} priceLabel={state.priceLabel} category={state.category} sellingPoints={state.sellingPoints} disabled={isBusy} onOpenRules={onOpenRules} onChange={updateState} />
    <SalesPlanningSettings state={state} disabled={isBusy} onChange={updateState} />
    {(Object.keys(state.props).length > 0 || state.detailsMissing) && <details className="rounded-xl border border-slate-200/80 p-3 dark:border-white/10"><summary className={`cursor-pointer rounded text-xs font-medium text-slate-500 dark:text-slate-400 ${salesFocusClass}`}>采集属性与来源说明 · {Object.keys(state.props).length} 项</summary>
      {state.detailsMissing && <p className="mt-3 text-xs leading-5 text-slate-500">接口未返回详情图，可手动补充；未返回的商品事实不会自动编造。</p>}
      <dl className="mt-3 space-y-2">{Object.entries(state.props).map(([key, value]) => <div key={key}><dt className="text-[11px] text-slate-500">{key}</dt><dd><label className={salesLabelClass}><span className="sr-only">{key}</span><input disabled={isBusy} value={value} onChange={(event) => updateState({ props: { ...state.props, [key]: event.target.value } })} className={salesInputClass} /></label></dd></div>)}</dl>
    </details>}
  </div>;
  if (!compact) return form;
  return <div className="space-y-5">
    <section aria-label="当前商品摘要" className="space-y-4">
      <div className="flex items-start gap-3">
        {usable[0] ? <img src={usable[0].url} alt="当前颜色商品" onError={() => onImageError(usable[0].index)} className="h-16 w-16 shrink-0 rounded-xl border border-slate-100 bg-white object-contain dark:border-white/10" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/5"><Package className="h-5 w-5 text-slate-400" /></span>}
        <div className="min-w-0"><p className="text-[11px] text-slate-500 dark:text-slate-400">当前商品</p><h2 className="mt-1 break-words text-sm font-semibold leading-6">{state.productName || '尚未确认商品'}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{salesCreationRule(state.category).title}</p></div>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-white/[0.035]">{[['本次颜色', state.colorSelection.colorLabel || '待确认'], ['可用商品图', `${usable.length} / ${state.imageCatalog.length} 张`], ['目标时长', `${state.targetDuration} 秒`], ['画面比例', state.aspectRatio]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
      <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">修改商品、颜色或创作参数后，已有脚本需要更新；有效素材与历史回执仍保留。</p>
    </section>
    <details className="group border-t border-slate-100 pt-4 dark:border-white/10"><summary className={`flex cursor-pointer list-none items-center justify-between rounded text-xs font-medium text-slate-600 dark:text-slate-300 ${salesFocusClass}`}>展开商品资料与设置<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary><div className="pt-5">{form}</div></details>
  </div>;
}
