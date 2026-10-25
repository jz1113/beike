import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Clapperboard, FileText, ImagePlus, Images, Loader2, Pencil, Video, X } from 'lucide-react';
import { cleanSalesProductProps, eligibleSalesImages, type SalesColorSelection, type SalesImageRef, type VideoSalesCategory, type VideoSalesProductAnalysis } from '@shared/domain/sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
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
  isCollected?: boolean;
  disabled: boolean;
  noDivider?: boolean;
  canAnalyze?: boolean;
  onAnalyze?: () => void;
  workspaceLayout?: boolean;
  onSelection?: (selection: SalesColorSelection) => void;
  onChange: (patch: { productName?: string; brand?: string; sellingPoints?: string }) => void;
}

function trimCollectedProductTitle(productName: string): string {
  const value = productName.trim();
  if (!value) return value;
  // Collected titles commonly end with the selected color and size. Keep the
  // product identity in the title and surface the SKU details below it.
  return value.replace(/\s+(?:黑色|白色|灰色|蓝色|绿色|黄色|红色|粉色|紫色|橙色|棕色|米色|咖色|驼色|藏青)(?:加绒|常规|薄款|厚款)?(?:\s+[A-Za-z0-9一二三四五六七八九十]{1,8})?\s*$/i, '').trim() || value;
}

function selectionWasCleared(selection?: SalesColorSelection): boolean {
  return Boolean(selection
    && !selection.variantId
    && !selection.colorLabel.trim()
    && selection.confirmedImageUrls.length === 0
    && selection.excludedImageUrls.length > 0);
}

function collectedSpecEntries(props: Record<string, string>): string[] {
  const specKeys = /尺码|规格|版本|配置|套餐|容量|尺寸|型号|网络|内存|存储/i;
  return cleanSalesProductProps(props, '__hidden_brand__')
    .filter(([key]) => specKeys.test(key))
    .map(([key, value]) => `${key}：${value}`);
}

function splitVariantLabel(label: string | undefined, color: string | undefined): { color: string; spec: string } {
  const source = label?.trim() || '';
  if (!source) return { color: color?.trim() || '', spec: '' };
  const colorPrefix = /^(原色钛金属|黑色钛金属|银白灰|深空灰|钛空灰|暗夜黑|曜石黑|幻夜黑|亮黑|磨砂黑|星空黑|羽砂黑|雪域白|凝光白|珍珠白|象牙白|钛金|流光金|香槟金|玫瑰金|土豪金|远峰蓝|海蓝|天蓝|冰蓝|藏青|深蓝|暗夜绿|苍岭绿|墨绿|橄榄绿|薄荷绿|浅绿|暗夜紫|丁香紫|薰衣草紫|樱花粉|活力橙|日落橙|中国红|酒红|银色|灰色|黑色|白色|金色|蓝色|绿色|黄色|橙色|棕色|米色|驼色|咖色|粉色|紫色)(?=加绒|常规|薄款|厚款|套装|标准版|高配|顶配|\s|[/]|$)/;
  const match = source.match(colorPrefix);
  if (match) return { color: match[1], spec: source.slice(match[1].length).trim().replace(/^[/,:：-]+/, '').trim() };
  return { color: color?.trim() || source, spec: color && source !== color ? source : '' };
}

export function SalesProductFields({
  productName, sellingPoints, props, productUrl, variantMetadata, colorSelection, images, analysis, isAnalyzing, isCollected, disabled, noDivider, canAnalyze, onAnalyze, workspaceLayout, onSelection, onChange,
}: SalesProductFieldsProps) {
  const [editingProductName, setEditingProductName] = useState(false);
  const entries = cleanSalesProductProps(props || {}, '__hidden_brand__');
  const collectedId = variantMetadata?.requestedSkuId || (/^\d{7,20}$/.test((productUrl || '').trim()) ? (productUrl || '').trim() : '');
  const variants = (variantMetadata?.variants || []).filter((item) => item.label && item.label !== '未知');
  const selected = eligibleSalesImages(images || [], colorSelection || { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] }, variantMetadata);
  const matching = selected.length > 0 ? variants.filter((variant) => selected.every((image) => variant.imageUrls.includes(image.url))) : [];
  const selectionCleared = selectionWasCleared(colorSelection);
  const currentVariant = selectionCleared ? undefined : (
    variants.find((variant) => variant.id === colorSelection?.variantId)
    || matching.find((variant) => variant.id === colorSelection?.variantId)
    || (matching.length === 1 ? matching[0] : undefined)
    || (selected.length === 0 ? variants.find((variant) => variant.id === variantMetadata?.selectedVariantId) : undefined)
    || (selected.length === 0 && collectedId ? variants.find((variant) => variant.skuIds.includes(collectedId)) : undefined)
  );
  const variantDetails = splitVariantLabel(currentVariant?.label, currentVariant?.color);
  const currentColor = variantDetails.color || (selected.length > 0 ? colorSelection?.colorLabel || '' : '');
  const variantSpec = variantDetails.spec;
  const collectedSpecs = collectedSpecEntries(props || {});
  const currentSpec = [variantSpec, ...collectedSpecs].filter((value, index, all) => value && all.indexOf(value) === index).join(' / ');
  const displayProductName = isCollected ? trimCollectedProductTitle(productName) : productName;
  const selectedUrls = selected.map((image) => image.url);
  const toggleReferenceImage = (url: string) => {
    if (!onSelection) return;
    const wasSelected = selectedUrls.includes(url);
    const nextUrls = wasSelected ? selectedUrls.filter((item) => item !== url) : [...selectedUrls, url];
    onSelection({
      ...(colorSelection || { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] }),
      variantId: undefined,
      colorLabel: '',
      confirmedImageUrls: nextUrls,
      excludedImageUrls: wasSelected ? [...new Set([...(colorSelection?.excludedImageUrls || []), url])] : (colorSelection?.excludedImageUrls || []).filter((item) => item !== url),
    });
  };

  const productNameField = <div className={workspaceLayout ? `${salesCardClass} p-4` : ''}>
    <label className={salesLabelClass}>商品名称<span className="ml-1 text-[10px] font-normal text-slate-400">必填</span>
      {isCollected && !editingProductName ? <div className="mt-2 flex items-start gap-2"><p className="min-w-0 flex-1 text-[15px] font-semibold leading-6">{displayProductName || '未返回商品名称'}</p><button type="button" disabled={disabled} onClick={() => setEditingProductName(true)} className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-black/[0.04] disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/5 ${salesFocusClass}`}><Pencil className="h-3 w-3" aria-hidden />编辑</button></div> : <textarea rows={2} value={productName} placeholder="填写可核实的商品名称" disabled={disabled} onChange={(event) => onChange({ productName: event.target.value })} className={`${salesInputClass} resize-y text-[13px] leading-6`} />}
    </label>
  </div>;
  const skuCard = (collectedId || variants.length > 0 || selected.length > 0) ? <div className={`${workspaceLayout ? `${salesCardClass} p-4` : 'space-y-2 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-white/[0.035]'} `} aria-label="当前采集 SKU 与规格">
    <div className={`grid gap-3 ${workspaceLayout ? '@min-[440px]:grid-cols-3' : '@min-[440px]:grid-cols-2'}`}>
      <div className="min-w-0"><span className="block text-[11px] text-slate-500 dark:text-slate-400">SKU 颜色</span><span className="mt-1 block break-words text-xs font-medium">{currentColor || '未选择'}</span></div>
      <div className="min-w-0"><span className="block text-[11px] text-slate-500 dark:text-slate-400">SKU 规格</span><span className="mt-1 block break-words text-xs font-medium">{currentSpec || '未返回'}</span></div>
      <div className={`min-w-0 ${workspaceLayout ? '' : '@min-[440px]:col-span-2'}`}><span className="block text-[11px] text-slate-500 dark:text-slate-400">SKU</span><span className="mt-1 block break-all text-xs font-medium tabular-nums">{collectedId || '未返回'}</span></div>
    </div>
  </div> : null;
  const selectedReferences = workspaceLayout ? <section className={`${salesCardClass} space-y-3 p-4`} aria-label="已选参考图">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">已选参考图</h3><span className="text-xs text-slate-500 dark:text-slate-400">{selected.length} 张</span></div>
    {selected.length > 0 ? <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2.5">{selected.map((image) => <button key={`${image.index}-${image.url}`} type="button" disabled={disabled} onClick={() => toggleReferenceImage(image.url)} aria-label={`取消选择商品图 ${image.index + 1}`} className={`group relative aspect-square min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-amber-500/70 disabled:opacity-40 dark:border-white/10 ${salesFocusClass}`}><img src={image.url} alt={`已选商品图 ${image.index + 1}`} className="h-full w-full object-contain" /><span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><X className="h-4 w-4" aria-hidden /></span></button>)}</div> : <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400"><Images className="mb-2 h-5 w-5" aria-hidden /><span>从左侧勾选，最多用于生成的参考图</span></div>}
  </section> : null;
  const propertiesCard = entries.length > 0 && <section className={workspaceLayout ? `${salesCardClass} space-y-3 p-4` : 'space-y-3 border-t border-slate-100 pt-5 dark:border-white/[0.08]'} aria-label="已采集商品属性">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium">商品参数<span className="ml-2 text-xs font-normal text-slate-400">{entries.length} 项</span></h3>
    </div>
    <dl className="grid grid-cols-1 gap-x-6 @min-[440px]:grid-cols-2">
      {entries.map(([key, value]) => <div key={key} className={`grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-3 text-[13px] leading-6 ${workspaceLayout ? '' : 'border-b border-slate-100 dark:border-white/[0.05]'}`}>
        <dt className="break-words text-slate-500 dark:text-slate-400">{key}</dt><dd className="min-w-0 break-words text-slate-700 dark:text-slate-200">{value}</dd>
      </div>)}
    </dl>
  </section>;

  const insights = <SalesProductInsights sellingPoints={sellingPoints} props={props} analysis={analysis} disabled={disabled} isAnalyzing={isAnalyzing} canAnalyze={canAnalyze} onAnalyze={onAnalyze} onChange={onChange} card={workspaceLayout} />;
  return <section className={`${noDivider ? '' : salesDividerClass} @container ${workspaceLayout ? '' : 'space-y-5'}`}>
    {workspaceLayout ? <div className="grid gap-5 @min-[900px]:grid-cols-2"><div className="space-y-5">{productNameField}{skuCard}{propertiesCard}{selectedReferences}</div><div className="space-y-5">{insights}</div></div> : <>{productNameField}{skuCard}{propertiesCard}{insights}</>}
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
      </div>
    </section>
  );
}

interface SalesEmptyGuideProps { kind: 'plan' | 'result' | 'assets' | 'video'; category?: VideoSalesCategory; compact?: boolean; onOpenRules?: () => void }
const CONTENT = {
  plan: { title: '先采集商品，再生成卖点与脚本', input: '商品资料和所选参考图', output: '卖点、口播时间轴、分镜提示词与素材计划', icon: FileText, steps: ['选择本次使用的商品图', '设置目标时长、画幅和多模态模型', '核对卖点、脚本和分镜提示词'] },
  assets: { title: '脚本确认后，在这里补齐素材图片', input: '脚本规划的人物、场景或关键静帧', output: '可核验的参考图片', icon: Images, steps: ['先在卖点与脚本阶段确认分镜时间轴', '选择绘图模型并生成缺失素材', '核对商品外观一致后进入视频生成'] },
  video: { title: '素材就绪后，在这里生成视频', input: '已确认的实际参考图片与完整脚本', output: '完整视频提示词、参数校验与视频任务', icon: Clapperboard, steps: ['完成并确认所需素材图片', '合成完整视频提示词并检查模型能力', '单独确认并提交整段视频生成'] },
  result: { title: '成片与任务状态会显示在这里', input: '已明确确认的视频生成任务', output: '可预览、下载的完整视频', icon: Video, steps: ['先完成素材补齐与视频生成', '查看或下载整段视频', '已有回执优先查询，不重复提交'] },
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
  return <div className="w-full max-w-none space-y-5 p-5 lg:p-6">
    <div className="min-w-0">
      <SalesProductFields
        noDivider
        workspaceLayout
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
        isCollected={Boolean(state.detailsMissing !== undefined || state.collectionSource !== undefined || state.fromCache !== undefined)}
        disabled={disabled}
        canAnalyze={Boolean(state.productName.trim() && state.imageCatalog.some((image) => !image.unavailable))}
        onAnalyze={onAnalyze}
        onSelection={(colorSelection) => onChange({ colorSelection })}
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
  onAnalyze?: () => void;
  onCollect: () => void;
  onImageError: (index: number) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onOpenRules: () => void;
}

export function ProductSetupPanel({ state, updateState, compact, mediaOnly, isBusy, isCollecting, isUploading, isAnalyzing, onAnalyze, onCollect, onImageError, onUpload, onOpenRules }: ProductSetupPanelProps) {
  const usable = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const media = <SalesProductMedia productUrl={state.productUrl} images={state.imageCatalog} usableCount={usable.length} metadata={state.variantMetadata} selection={state.colorSelection} isBusy={isBusy} isCollecting={isCollecting} isUploading={isUploading} onUrlChange={(productUrl) => updateState({ productUrl })} onSelection={(colorSelection) => updateState({ colorSelection })} onCollect={onCollect} onUpload={onUpload} onImageError={onImageError} />;
  const isCollected = Boolean(state.detailsMissing !== undefined || state.collectionSource !== undefined || state.fromCache !== undefined);
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
      isCollected={isCollected}
      disabled={isBusy}
      canAnalyze={Boolean(state.productName.trim() && state.imageCatalog.some((image) => !image.unavailable))}
      onAnalyze={onAnalyze}
      onChange={updateState}
    />
    {compact && <SalesPlanningSettings state={state} disabled={isBusy} onOpenRules={onOpenRules} onChange={updateState} />}
  </div>;
  if (!compact) return mediaOnly ? media : form;
  const selectedVariantId = state.colorSelection.variantId || state.variantMetadata?.selectedVariantId;
  const selectedVariant = state.variantMetadata?.variants.find((variant) => variant.id === selectedVariantId);
  const requestedSku = state.variantMetadata?.requestedSkuId;
  const sku = selectedVariant
    ? selectedVariant.skuIds.length === 1 ? selectedVariant.skuIds[0] : requestedSku && selectedVariant.skuIds.includes(requestedSku) ? requestedSku : undefined
    : requestedSku;
  const displayProductName = state.productName;
  const summaryItems: [string, string][] = [
    ['SKU', sku || '未确认'],
    ['目标时长', `${state.targetDuration} 秒`],
    ['画面比例', state.aspectRatio],
  ];
  return <section aria-label="当前商品摘要" className="space-y-2.5">
    <div className="min-w-0"><p className="sr-only">商品名</p><h2 title={displayProductName} className="line-clamp-2 break-words text-base font-semibold leading-6">{displayProductName || '尚未确认商品'}</h2></div>
    <dl className="flex flex-wrap items-center gap-2 text-xs">{summaryItems.map(([label, value]) => <div key={label} className="flex gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5 dark:bg-white/[0.06]"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}</dl>
  </section>;
}
