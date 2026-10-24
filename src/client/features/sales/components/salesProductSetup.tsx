import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ChevronDown, Clapperboard, FileText, ImagePlus, Images, Loader2, Package, Video } from 'lucide-react';
import { cleanSalesProductProps, eligibleSalesImages, type SalesColorSelection, type SalesImageRef, type VideoSalesCategory, type VideoSalesProductAnalysis } from '@shared/domain/sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { salesCreationRule } from '../model/fashionSalesSkill';
import { PRODUCT_IMAGE_ACCEPT, imagesFromDataTransfer } from '../model/productImageDrop';
import { salesCardClass, salesDividerClass, salesFocusClass, salesGhostButtonClass, salesInputClass, salesLabelClass, salesSectionTitleClass } from './salesChrome';
import { SalesColorGallery } from './SalesColorGallery';
import { SalesPlanningSettings } from './salesPlanning';
import { SalesProductInsights } from './SalesProductInsights';

interface SalesProductFieldsProps {
  productName: string;
  brand: string;
  sellingPoints: string;
  props?: Record<string, string>;
  productUrl?: string;
  variantMetadata?: VideoSalesStudioState['variantMetadata'];
  colorSelection?: SalesColorSelection;
  images?: SalesImageRef[];
  analysis?: VideoSalesProductAnalysis | null;
  isAnalyzing?: boolean;
  disabled: boolean;
  noDivider?: boolean;
  onAnalyze?: () => void;
  onChange: (patch: { productName?: string; brand?: string; sellingPoints?: string }) => void;
}

export function SalesProductFields({
  productName, brand, sellingPoints, props, productUrl, variantMetadata, colorSelection, images, analysis, isAnalyzing, disabled, noDivider, onAnalyze, onChange,
}: SalesProductFieldsProps) {
  const [allProps, setAllProps] = useState(false);
  const entries = cleanSalesProductProps(props || {}, brand);
  const requestedSku = variantMetadata?.requestedSkuId;
  const collectedId = requestedSku || (/^\d{7,20}$/.test((productUrl || '').trim()) ? (productUrl || '').trim() : '');
  const variants = (variantMetadata?.variants || []).filter((item) => item.label && item.label !== '未知');
  const selected = eligibleSalesImages(images || [], colorSelection || { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] }, variantMetadata);
  const matching = selected.length > 0 ? variants.filter((variant) => selected.every((image) => variant.imageUrls.includes(image.url))) : [];
  const currentVariant = matching.find((variant) => variant.id === colorSelection?.variantId) || (matching.length === 1 ? matching[0] : undefined);
  const currentSpecLabel = currentVariant?.label || (selected.length > 0 ? colorSelection?.colorLabel : '');

  return <section className={`${noDivider ? '' : salesDividerClass} @container space-y-5`}>
    <div>
      <h2 className={salesSectionTitleClass}>商品资料</h2>
      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">核对采集信息与本次参考规格，再确认用于口播的卖点。</p>
    </div>
    <div className="grid items-start gap-3.5 @min-[600px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <label className={salesLabelClass}>商品名称<span className="ml-1 text-[10px] font-normal text-slate-400">必填</span>
        <textarea rows={2} value={productName} placeholder="填写可核实的商品名称" disabled={disabled} onChange={(event) => onChange({ productName: event.target.value })} className={`${salesInputClass} resize-y text-[13px] leading-6`} />
      </label>
      <label className={salesLabelClass}>品牌<span className="ml-1 text-[10px] font-normal text-slate-400">可选</span>
        <input value={brand} disabled={disabled} onChange={(event) => onChange({ brand: event.target.value })} className={`${salesInputClass} text-[13px]`} />
      </label>
    </div>
    {(collectedId || variants.length > 0 || selected.length > 0) && <div className="space-y-2 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-white/[0.035]" aria-label="当前采集 SKU 与规格">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="text-slate-500 dark:text-slate-400">本次参考规格</span>
        <span className="font-medium">{currentSpecLabel ? `当前规格：${currentSpecLabel}` : selected.length > 0 ? '按所选商品图确认' : '请先在图库中选择商品图'}</span>
        {selected.length > 0 && <span className="text-[11px] text-slate-500 dark:text-slate-400">已选 {selected.length} 张</span>}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        {collectedId && <span className="break-all tabular-nums">{requestedSku ? '采集 SKU' : '采集编号'}：{collectedId}</span>}
        <span>在商品图库中切换规格与参考图</span>
      </div>
    </div>}
    {entries.length > 0 && <section className="space-y-3 border-t border-slate-100 pt-5 dark:border-white/[0.08]" aria-label="已采集商品属性">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium">规格参数<span className="ml-2 text-[10px] font-normal text-slate-400">已采集客观属性 · {entries.length} 项</span></h3>
        {entries.length > 6 && <button type="button" aria-expanded={allProps} onClick={() => setAllProps((value) => !value)} className={`rounded text-[11px] text-slate-500 dark:text-slate-400 ${salesFocusClass}`}>{allProps ? '收起参数' : `查看全部 ${entries.length} 项参数`}</button>}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 @min-[440px]:grid-cols-2">
        {entries.slice(0, allProps ? undefined : 6).map(([key, value]) => <div key={key} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 border-b border-slate-100 py-2.5 text-xs leading-5 dark:border-white/[0.05]">
          <dt className="break-words text-slate-500 dark:text-slate-400">{key}</dt><dd className="min-w-0 break-words text-slate-700 dark:text-slate-200">{value}</dd>
        </div>)}
      </dl>
    </section>}
    <SalesProductInsights sellingPoints={sellingPoints} analysis={analysis} disabled={disabled} isAnalyzing={isAnalyzing} canAnalyze={Boolean(productName.trim())} onAnalyze={onAnalyze} onChange={onChange} />
  </section>;
}

interface SalesProductMediaProps {
  productUrl: string;
  images: SalesImageRef[];
  usableCount: number;
  metadata: VideoSalesStudioState['variantMetadata'];
  selection: SalesColorSelection;
  isBusy: boolean;
  isCollecting: boolean;
  isUploading: boolean;
  onUrlChange: (value: string) => void;
  onSelection: (selection: SalesColorSelection) => void;
  onCollect: () => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onImageError: (index: number) => void;
}

export function SalesProductMedia({ productUrl, images, usableCount, metadata, selection, isBusy, isCollecting, isUploading, onUrlChange, onSelection, onCollect, onUpload, onImageError }: SalesProductMediaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const hasFiles = (event: DragEvent<HTMLDivElement>) => event.dataTransfer.types.includes('Files');
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (!isBusy) void imagesFromDataTransfer(event.dataTransfer).then((files) => onUpload(files));
  };
  return (
    <section className="space-y-5">
      <h2 className={salesSectionTitleClass}>商品采集与选图</h2>
      <div className="space-y-2">
      <label className={salesLabelClass} htmlFor="sales-product-url">商品链接
        <div className="mt-1.5 flex gap-2">
          <input id="sales-product-url" value={productUrl} disabled={isBusy} onChange={(event) => onUrlChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !isBusy) onCollect(); }} placeholder="京东、淘宝、天猫、1688 或拼多多" className={`${salesInputClass} mt-0 min-w-0 flex-1`} />
          <button type="button" onClick={onCollect} disabled={isBusy || !productUrl.trim()} className={`h-10 shrink-0 px-3.5 disabled:opacity-40 ${salesGhostButtonClass}`}>{isCollecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}采集</button>
        </div>
      </label>
      </div>
      <input ref={inputRef} type="file" aria-label="上传商品图片" accept={PRODUCT_IMAGE_ACCEPT} multiple className="hidden" disabled={isBusy} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) void onUpload(files); }} />
      <div className={`space-y-3 rounded-2xl ${dragging ? 'ring-2 ring-slate-400' : ''}`} onDragEnter={(event) => { if (!hasFiles(event)) return; event.preventDefault(); if (!isBusy) { dragDepth.current += 1; setDragging(true); } }} onDragOver={(event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy'; }} onDragLeave={(event) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }} onDrop={onDrop}>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium">商品参考图 <span className="ml-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">{images.length} 张 · 已选 {usableCount} 张</span></span>{images.length > 0 && <button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className={`inline-flex items-center gap-1 rounded text-xs disabled:opacity-40 ${salesFocusClass}`}>{isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}上传商品图</button>}</div>
        {images.length > 0 ? <SalesColorGallery images={images} metadata={metadata} selection={selection} disabled={isBusy} onChange={onSelection} onImageError={onImageError} /> : <button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-xs text-slate-500 disabled:opacity-40 dark:border-white/20"><ImagePlus className="mb-2 h-5 w-5" />{isUploading ? '正在上传图片' : dragging ? '松开以添加图片' : '上传商品图片，或拖入图片 / 文件夹'}</button>}
        {dragging && <p role="status" className="text-center text-xs text-slate-500">松开以添加商品图片，原图会保留。</p>}
        {images.length > 0 && <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">选择同一款式、颜色的图片作为本次参考；未选图片仍保留在图库中。</p>}
      </div>
    </section>
  );
}

interface SalesEmptyGuideProps { kind: 'plan' | 'result' | 'assets' | 'video'; category?: VideoSalesCategory; compact?: boolean; onOpenRules?: () => void }
const CONTENT = {
  plan: { title: '先确认商品，再编写口播', input: '商品资料和所选参考图', output: '口播时间轴与素材计划', icon: FileText, steps: ['选择本次使用的商品图', '设置目标时长、画幅和多模态模型', '编写脚本后，分步确认素材与视频'] },
  assets: { title: '脚本确认后，在这里准备素材图片', input: '脚本规划的人物、场景或关键静帧', output: '可核验的参考图片', icon: Images, steps: ['先在口播脚本阶段确认分镜时间轴', '选择绘图模型并生成缺失素材', '核对商品外观一致后进入定稿'] },
  video: { title: '素材就绪后，在这里定稿视频提示词', input: '已确认的实际参考图片与分镜时间轴', output: '完整视频提示词与参数校验', icon: Clapperboard, steps: ['完成并确认所需素材图片', '选择视频模型并检查能力匹配', '生成完整视频提示词后单独确认出片'] },
  result: { title: '成片与任务状态会显示在这里', input: '已明确确认的视频生成任务', output: '可预览、下载的完整视频', icon: Video, steps: ['先完成素材与视频定稿', '单独确认生成一条整段视频', '已有回执优先查询，不重复提交'] },
};

export function SalesEmptyGuide({ kind, compact }: SalesEmptyGuideProps) {
  const content = CONTENT[kind];
  const Icon = content.icon;
  if (compact) {
    return <section aria-label="当前阶段说明" className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${salesCardClass}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20"><Icon className="h-4 w-4" aria-hidden /></span>
        <div><h2 className="text-sm font-semibold">{content.title}</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">输入：{content.input} · 产出：{content.output}</p></div>
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">{content.steps.map((step, index) => <li key={step} className="flex items-center gap-1.5"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] dark:bg-white/10">{index + 1}</span><span>{step}</span></li>)}</ol>
    </section>;
  }
  return <div className="flex items-center justify-center p-4 sm:p-6"><section aria-label="当前阶段说明" className="w-full max-w-lg py-8">
    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20"><Icon className="h-5 w-5" aria-hidden /></span>
    <h2 className="text-lg font-semibold leading-8">{content.title}</h2>
    <dl className={`mt-5 grid gap-4 p-4 sm:grid-cols-2 ${salesCardClass}`}>{[['输入', content.input], ['产出', content.output]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 text-[13px] leading-6">{value}</dd></div>)}</dl>
    <ol className="mt-5 space-y-3 text-xs leading-6 text-slate-500 dark:text-slate-400">{content.steps.map((step, index) => <li key={step} className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] dark:bg-white/5">{index + 1}</span><span>{step}</span></li>)}</ol>
  </section></div>;
}

export function SalesProductWorkspace({ state, disabled, isAnalyzing, onAnalyze, onChange, children }: {
  state: VideoSalesStudioState;
  disabled: boolean;
  isAnalyzing?: boolean;
  onAnalyze?: () => void;
  onOpenRules?: () => void;
  onChange: (patch: Partial<VideoSalesStudioState>) => void;
  children?: ReactNode;
}) {
  return <div className="space-y-5 p-4 sm:p-5">
    <div className="min-w-0">
      <SalesProductFields
        noDivider
        productName={state.productName}
        brand={state.brand}
        sellingPoints={state.sellingPoints}
        props={state.props}
        productUrl={state.productUrl}
        variantMetadata={state.variantMetadata}
        colorSelection={state.colorSelection}
        images={state.imageCatalog}
        analysis={state.analysis}
        isAnalyzing={isAnalyzing}
        disabled={disabled}
        onAnalyze={onAnalyze}
        onChange={onChange}
      />
    </div>
    {children}
  </div>;
}

interface ProductSetupPanelProps {
  state: VideoSalesStudioState;
  updateState: (patch: Partial<VideoSalesStudioState>) => void;
  compact?: boolean;
  mediaOnly?: boolean;
  isBusy: boolean;
  isCollecting: boolean;
  isUploading: boolean;
  isAnalyzing?: boolean;
  onCollect: () => void;
  onAnalyze?: () => void;
  onImageError: (index: number) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onOpenRules: () => void;
  onEditProduct?: () => void;
}

const MODE_LABELS: Record<VideoSalesStudioState['videoMode'], string> = {
  live_presenter: '人物出镜讲解',
  product_closeup: '商品与细节展示',
  scene_demo: '手部或背影展示',
  graphic_montage: '商品混剪',
};

export function ProductSetupPanel({ state, updateState, compact, mediaOnly, isBusy, isCollecting, isUploading, isAnalyzing, onCollect, onAnalyze, onImageError, onUpload, onOpenRules, onEditProduct }: ProductSetupPanelProps) {
  const usable = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const media = <SalesProductMedia productUrl={state.productUrl} images={state.imageCatalog} usableCount={usable.length} metadata={state.variantMetadata} selection={state.colorSelection} isBusy={isBusy} isCollecting={isCollecting} isUploading={isUploading} onUrlChange={(productUrl) => updateState({ productUrl })} onSelection={(colorSelection) => updateState({ colorSelection })} onCollect={onCollect} onUpload={onUpload} onImageError={onImageError} />;
  const form = <div className="space-y-5">
    {media}
    <SalesProductFields
      productName={state.productName}
      brand={state.brand}
      sellingPoints={state.sellingPoints}
      props={state.props}
      productUrl={state.productUrl}
      variantMetadata={state.variantMetadata}
      colorSelection={state.colorSelection}
      images={state.imageCatalog}
      analysis={state.analysis}
      isAnalyzing={isAnalyzing}
      disabled={isBusy}
      onAnalyze={onAnalyze}
      onChange={updateState}
    />
    {compact && <SalesPlanningSettings state={state} disabled={isBusy} onOpenRules={onOpenRules} onChange={updateState} />}
  </div>;
  if (!compact) return mediaOnly ? media : form;
  const summaryItems: [string, string][] = [
    ['商品外观', '以所选图片为准'],
    ['已选商品图', `${usable.length} / ${state.imageCatalog.length} 张`],
    ['目标时长', `${state.targetDuration} 秒`],
    ['画面比例', state.aspectRatio],
    ...(state.category === 'fashion' ? [['出镜方式', MODE_LABELS[state.videoMode] || '人物出镜讲解'] as [string, string]] : []),
  ];
  return <div className="space-y-5">
    <section aria-label="当前商品摘要" className="space-y-4">
      <div className="flex items-start gap-3">
        {usable[0] ? <img src={usable[0].url} alt="所选商品图" onError={() => onImageError(usable[0].index)} className="h-16 w-16 shrink-0 rounded-xl border border-slate-100 bg-white object-contain dark:border-white/10" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/5"><Package className="h-5 w-5 text-slate-400" /></span>}
        <div className="min-w-0 flex-1"><p className="text-[11px] text-slate-500 dark:text-slate-400">当前商品</p><h2 className="mt-1 break-words text-sm font-semibold leading-6">{state.productName || '尚未确认商品'}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{salesCreationRule(state.category).title}</p></div>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-white/[0.035]">{summaryItems.map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
      {onEditProduct && <button type="button" onClick={onEditProduct} className={`h-8 w-full text-xs ${salesGhostButtonClass}`}>返回修改商品与设置</button>}
      <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">修改商品、所选图片或创作参数后，已有脚本需要更新；有效素材与历史回执仍保留。</p>
    </section>
    <details className="group border-t border-slate-100 pt-4 dark:border-white/10"><summary className={`flex cursor-pointer list-none items-center justify-between rounded text-xs font-medium text-slate-600 dark:text-slate-300 ${salesFocusClass}`}>展开商品资料与设置<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary><div className="pt-5">{form}</div></details>
  </div>;
}
