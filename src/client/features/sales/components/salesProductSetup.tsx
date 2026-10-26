import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Clapperboard, FileText, ImagePlus, Images, Loader2, Video } from 'lucide-react';
import { eligibleSalesImages, type SalesColorSelection, type SalesImageRef, type VideoSalesCategory, type VideoSalesProductAnalysis } from '@shared/domain/sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { salesProductProfile } from '../model/salesProductProfile';
import { PRODUCT_IMAGE_ACCEPT, imagesFromDataTransfer } from '../model/productImageDrop';
import { salesCardClass, salesDividerClass, salesFocusClass, salesGhostButtonClass, salesInputClass, salesLabelClass } from './salesChrome';
import { SalesColorGallery } from './SalesColorGallery';
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
  profileOnly?: boolean;
  onChange: (patch: { productName?: string; brand?: string; sellingPoints?: string }) => void;
}

export function SalesProductFields({
  productName, sellingPoints, props, productUrl, variantMetadata, colorSelection, images, analysis, isAnalyzing, isCollected, disabled, noDivider, canAnalyze, onAnalyze, profileOnly, onChange,
}: SalesProductFieldsProps) {
  const profile = salesProductProfile({ productName, productUrl, props, variantMetadata, colorSelection, images, isCollected });
  const productNameField = <div className="min-w-0">
    {isCollected ? <>
      <p className={salesLabelClass}>商品名称</p>
      <p className="mt-2 whitespace-pre-wrap text-[15px] font-semibold leading-6 [overflow-wrap:anywhere]">{productName || '未返回商品名称'}</p>
    </> : <>
      <label htmlFor="sales-product-name" className={salesLabelClass}>商品名称<span className="ml-1 text-[10px] font-normal text-slate-400">必填</span></label>
      <textarea id="sales-product-name" rows={3} value={productName} placeholder="填写可核实的商品名称" disabled={disabled} onChange={(event) => onChange({ productName: event.target.value })} className={`${salesInputClass} sales-product-name-input resize-y text-[13px] leading-5`} />
    </>}
  </div>;
  return <section className={`${noDivider ? '' : salesDividerClass} sales-product-fields @container space-y-3`} aria-label="商品基础档案">
    {productNameField}
    {profile.hasData ? <dl aria-label="当前采集 SKU 与规格" className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2 rounded-xl bg-slate-100/70 px-3 py-2.5 dark:bg-white/[0.04]">
      <div className="min-w-0"><dt className="text-[11px] text-slate-500 dark:text-slate-400">SKU</dt><dd className="mt-1 break-all text-xs font-medium leading-5 tabular-nums">{profile.sku || '未确认'}</dd></div>
      <div className="min-w-0"><dt className="text-[11px] text-slate-500 dark:text-slate-400">商品规格</dt><dd className="mt-1 text-xs font-medium leading-5 [overflow-wrap:anywhere]">{profile.specification || '未返回'}</dd></div>
    </dl> : <p className="text-[11px] leading-5 text-slate-400 dark:text-slate-500">采集商品链接后将自动提取 SKU 与商品规格</p>}
    {!profileOnly && <SalesProductInsights sellingPoints={sellingPoints} props={props} analysis={analysis} disabled={disabled} isAnalyzing={isAnalyzing} canAnalyze={canAnalyze} onAnalyze={onAnalyze} onChange={onChange} />}
  </section>;
}

interface SalesProductMediaProps {
  productUrl: string;
  isCollected?: boolean;
  children?: ReactNode;
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

export function SalesProductMedia({ productUrl, isCollected, children, images, usableCount, metadata, selection, isBusy, isCollecting, isUploading, onUrlChange, onSelection, onCollect, onUpload, onImageError }: SalesProductMediaProps) {
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
    <section className="sales-product-media flex h-full min-h-0 flex-col">
      <div className="sales-product-link shrink-0 pb-4">
      <h2 className="mb-4 text-sm font-semibold">商品档案与参考图</h2>
      <label className={salesLabelClass} htmlFor="sales-product-url">商品链接</label>
        <div className="mt-1.5 flex gap-2">
          <input id="sales-product-url" value={productUrl} disabled={isBusy} onChange={(event) => onUrlChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !isBusy) onCollect(); }} placeholder="京东、淘宝、天猫、1688 或拼多多" className={`${salesInputClass} mt-0 min-w-0 flex-1`} />
          <button type="button" onClick={onCollect} disabled={isBusy || !productUrl.trim()} className={`h-10 shrink-0 px-3.5 disabled:opacity-40 ${isCollected ? salesGhostButtonClass : `sales-collect-primary ${salesFocusClass}`}`}>{isCollecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}采集</button>
        </div>
      </div>
      {children}
      <input ref={inputRef} type="file" aria-label="上传商品图片" accept={PRODUCT_IMAGE_ACCEPT} multiple className="hidden" disabled={isBusy} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) void onUpload(files); }} />
      <div className={`sales-product-gallery flex min-h-0 flex-1 flex-col ${dragging ? 'rounded-xl ring-2 ring-amber-500/50' : ''}`} onDragEnter={(event) => { if (!hasFiles(event)) return; event.preventDefault(); if (!isBusy) { dragDepth.current += 1; setDragging(true); } }} onDragOver={(event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy'; }} onDragLeave={(event) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }} onDrop={onDrop}>
        <SalesColorGallery images={images} metadata={metadata} selection={selection} disabled={isBusy} onChange={onSelection} onImageError={onImageError} usableCount={usableCount} isUploading={isUploading} onUploadClick={() => inputRef.current?.click()} emptyContent={<button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className={`flex min-h-48 w-full flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 py-8 text-xs text-slate-500 transition hover:border-amber-500/50 disabled:opacity-40 dark:border-white/15 ${salesFocusClass}`}><ImagePlus className="mb-3 h-6 w-6 text-slate-400" aria-hidden />{isUploading ? '正在上传图片' : dragging ? '松开以添加图片' : '上传商品图片，或拖入图片/文件夹'}</button>} />
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
  return <div className="flex h-full min-h-0 flex-col">
    <SalesProductInsights sellingPoints={state.sellingPoints} props={state.props} analysis={state.analysis} disabled={disabled} isAnalyzing={isAnalyzing} canAnalyze={Boolean(state.productName.trim() && state.imageCatalog.some((image) => !image.unavailable))} onAnalyze={onAnalyze} onChange={onChange} card />
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

export function ProductSetupPanel({ state, updateState, compact, mediaOnly, isBusy, isCollecting, isUploading, isAnalyzing, onAnalyze, onCollect, onImageError, onUpload }: ProductSetupPanelProps) {
  const usable = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const isCollected = Boolean(state.detailsMissing !== undefined || state.collectionSource !== undefined || state.fromCache !== undefined);
  const profile = <SalesProductFields noDivider profileOnly productName={state.productName} brand={state.brand} sellingPoints={state.sellingPoints} props={state.props} productUrl={state.productUrl} variantMetadata={state.variantMetadata} colorSelection={state.colorSelection} images={state.imageCatalog} isCollected={isCollected} disabled={isBusy} onChange={updateState} />;
  const media = <SalesProductMedia productUrl={state.productUrl} isCollected={isCollected} images={state.imageCatalog} usableCount={usable.length} metadata={state.variantMetadata} selection={state.colorSelection} isBusy={isBusy} isCollecting={isCollecting} isUploading={isUploading} onUrlChange={(productUrl) => updateState({ productUrl })} onSelection={(colorSelection) => updateState({ colorSelection })} onCollect={onCollect} onUpload={onUpload} onImageError={onImageError}>{profile}</SalesProductMedia>;
  if (!compact) return mediaOnly ? media : <div className="flex h-full min-h-0 flex-col gap-5">{media}<SalesProductInsights sellingPoints={state.sellingPoints} props={state.props} analysis={state.analysis} disabled={isBusy} isAnalyzing={isAnalyzing} canAnalyze={Boolean(state.productName.trim() && state.imageCatalog.some((image) => !image.unavailable))} onAnalyze={onAnalyze} onChange={updateState} /></div>;
  const { sku } = salesProductProfile({ ...state, images: state.imageCatalog, isCollected });
  const displayProductName = state.productName;
  const summaryItems: [string, string][] = [
    ['SKU', sku || '未确认'],
    ['目标时长', `${state.targetDuration} 秒`],
    ['画面比例', state.aspectRatio],
  ];
  return <section aria-label="当前商品摘要" className="space-y-2.5">
    <div className="min-w-0"><p className="sr-only">商品名</p><h2 className="text-base font-semibold leading-6 [overflow-wrap:anywhere]">{displayProductName || '尚未确认商品'}</h2></div>
    <dl className="flex flex-wrap items-center gap-2 text-xs">{summaryItems.map(([label, value]) => <div key={label} className="flex gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5 dark:bg-white/[0.06]"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}</dl>
  </section>;
}
