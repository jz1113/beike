import { useRef, useState, type DragEvent } from 'react';
import { ChevronDown, Clapperboard, FileText, ImagePlus, Images, Loader2, Package, Video } from 'lucide-react';
import { eligibleSalesImages, type SalesColorSelection, type SalesImageRef, type VideoSalesCategory } from '@shared/domain/video-sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { salesCreationRule } from '../model/fashionSalesSkill';
import { PRODUCT_IMAGE_ACCEPT, imagesFromDataTransfer } from '../model/productImageDrop';
import { SalesCreationRule, salesCardClass, salesDividerClass, salesFocusClass, salesGhostButtonClass, salesGroupClass, salesInputClass, salesLabelClass, salesSectionTitleClass } from './salesChrome';
import { SalesColorGallery } from './SalesColorGallery';
import { SalesPlanningSettings } from './salesPlanning';

interface SalesProductFieldsProps {
  productName: string;
  brand: string;
  sellingPoints: string;
  disabled: boolean;
  onChange: (patch: { productName?: string; brand?: string; sellingPoints?: string }) => void;
}

export function SalesProductFields({ productName, brand, sellingPoints, disabled, onChange }: SalesProductFieldsProps) {
  return (
    <section className={`${salesGroupClass} ${salesDividerClass}`}>
      <h2 className={salesSectionTitleClass}>商品资料</h2>
      <label className={salesLabelClass}>商品名称<span className="ml-1 text-[10px] font-normal text-slate-400">必填</span>
        <input value={productName} placeholder="填写可核实的商品名称" disabled={disabled} onChange={(event) => onChange({ productName: event.target.value })} className={salesInputClass} />
      </label>
      <label className={salesLabelClass}>品牌<span className="ml-1 text-[10px] font-normal text-slate-400">可选</span>
        <input value={brand} disabled={disabled} onChange={(event) => onChange({ brand: event.target.value })} className={salesInputClass} />
      </label>
      <label className={salesLabelClass}>已知卖点<span className="ml-1 text-[10px] font-normal text-slate-400">可选</span>
        <textarea rows={3} value={sellingPoints} placeholder="只填写有依据的卖点，留空时由商品资料提炼" disabled={disabled} onChange={(event) => onChange({ sellingPoints: event.target.value })} className={`${salesInputClass} resize-y leading-6`} />
      </label>
    </section>
  );
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
    <section className={salesGroupClass}>
      <label className={salesLabelClass} htmlFor="sales-product-url">商品链接
        <div className="mt-1.5 flex gap-2">
          <input id="sales-product-url" value={productUrl} disabled={isBusy} onChange={(event) => onUrlChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !isBusy) onCollect(); }} placeholder="京东、淘宝、天猫、1688 或拼多多" className={`${salesInputClass} mt-0 min-w-0 flex-1`} />
          <button type="button" onClick={onCollect} disabled={isBusy || !productUrl.trim()} className={`h-10 shrink-0 px-3.5 disabled:opacity-40 ${salesGhostButtonClass}`}>{isCollecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}采集</button>
        </div>
      </label>
      <input ref={inputRef} type="file" aria-label="上传商品图片" accept={PRODUCT_IMAGE_ACCEPT} multiple className="sr-only" disabled={isBusy} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) void onUpload(files); }} />
      <div className={`space-y-3 rounded-2xl ${dragging ? 'ring-2 ring-slate-400' : ''}`} onDragEnter={(event) => { if (!hasFiles(event)) return; event.preventDefault(); if (!isBusy) { dragDepth.current += 1; setDragging(true); } }} onDragOver={(event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy'; }} onDragLeave={(event) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }} onDrop={onDrop}>
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">商品参考图 · 已选 {usableCount}/{images.length}</span><button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1 text-xs disabled:opacity-40">{isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}上传商品图</button></div>
        {images.length > 0 ? <SalesColorGallery images={images} metadata={metadata} selection={selection} disabled={isBusy} onChange={onSelection} onImageError={onImageError} /> : <button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-xs text-slate-500 disabled:opacity-40 dark:border-white/20"><ImagePlus className="mb-2 h-5 w-5" />{isUploading ? '正在上传图片' : dragging ? '松开以添加图片' : '上传商品图片，或拖入图片 / 文件夹'}</button>}
        {dragging && <p role="status" className="text-center text-xs text-slate-500">松开以添加商品图片，原图会保留。</p>}
      </div>
    </section>
  );
}

interface SalesEmptyGuideProps { kind: 'plan' | 'result' | 'assets' | 'video'; category?: VideoSalesCategory; onOpenRules?: () => void }
const CONTENT = {
  plan: { title: '先确认商品，再编写口播', input: '商品资料和所选参考图', output: '口播时间轴与素材计划', icon: FileText, steps: ['选择本次使用的商品图', '设置目标时长、画幅和多模态模型', '编写脚本后，分步确认素材与视频'] },
  assets: { title: '脚本确认后，准备素材图片', input: '有效脚本与素材计划', output: '实际图片与校验状态', icon: Images, steps: ['先完成商品确认与口播脚本', '仅生成脚本需要的人物、场景或关键帧', '素材通过校验后，再进入视频定稿'] },
  video: { title: '素材完成后，定稿整段视频', input: '已校验素材与视频模型配置', output: '一条完整视频提示词', icon: Clapperboard, steps: ['先完成必要素材与校验', '按实际图片与模型能力定稿提示词', '定稿后单独确认付费生成，整段一次出片'] },
  result: { title: '成片与任务状态会显示在这里', input: '已明确确认的视频生成任务', output: '可预览、下载的完整视频', icon: Video, steps: ['先完成素材与视频定稿', '单独确认生成一条整段视频', '已有回执优先查询，不重复提交'] },
};

export function SalesEmptyGuide({ kind, category, onOpenRules }: SalesEmptyGuideProps) {
  const content = CONTENT[kind];
  const Icon = content.icon;
  return <div className="flex min-h-full items-center justify-center p-4 sm:p-6"><section aria-label="当前阶段说明" className="w-full max-w-lg py-8">
    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20"><Icon className="h-5 w-5" aria-hidden /></span>
    <h2 className="text-lg font-semibold leading-8">{content.title}</h2>
    <dl className={`mt-5 grid gap-4 p-4 sm:grid-cols-2 ${salesCardClass}`}>{[['输入', content.input], ['产出', content.output]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 text-[13px] leading-6">{value}</dd></div>)}</dl>
    {kind === 'plan' && category && onOpenRules && <div className="mt-5"><SalesCreationRule category={category} onOpenRules={onOpenRules} /></div>}
    <ol className="mt-5 space-y-3 text-xs leading-6 text-slate-500 dark:text-slate-400">{content.steps.map((step, index) => <li key={step} className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] dark:bg-white/5">{index + 1}</span><span>{step}</span></li>)}</ol>
  </section></div>;
}

interface ProductSetupPanelProps {
  state: VideoSalesStudioState;
  updateState: (patch: Partial<VideoSalesStudioState>) => void;
  compact?: boolean;
  isBusy: boolean;
  isCollecting: boolean;
  isUploading: boolean;
  onCollect: () => void;
  onImageError: (index: number) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onOpenRules: () => void;
}

export function ProductSetupPanel({ state, updateState, compact, isBusy, isCollecting, isUploading, onCollect, onImageError, onUpload, onOpenRules }: ProductSetupPanelProps) {
  const usable = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const form = <div className="space-y-5">
    <SalesProductMedia productUrl={state.productUrl} images={state.imageCatalog} usableCount={usable.length} metadata={state.variantMetadata} selection={state.colorSelection} isBusy={isBusy} isCollecting={isCollecting} isUploading={isUploading} onUrlChange={(productUrl) => updateState({ productUrl })} onSelection={(colorSelection) => updateState({ colorSelection })} onCollect={onCollect} onUpload={onUpload} onImageError={onImageError} />
    <SalesProductFields productName={state.productName} brand={state.brand} sellingPoints={state.sellingPoints} disabled={isBusy} onChange={updateState} />
    <SalesPlanningSettings state={state} disabled={isBusy} onOpenRules={onOpenRules} onChange={updateState} />
  </div>;
  if (!compact) return form;
  return <div className="space-y-5">
    <section aria-label="当前商品摘要" className="space-y-4">
      <div className="flex items-start gap-3">
        {usable[0] ? <img src={usable[0].url} alt="所选商品图" onError={() => onImageError(usable[0].index)} className="h-16 w-16 shrink-0 rounded-xl border border-slate-100 bg-white object-contain dark:border-white/10" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/5"><Package className="h-5 w-5 text-slate-400" /></span>}
        <div className="min-w-0"><p className="text-[11px] text-slate-500 dark:text-slate-400">当前商品</p><h2 className="mt-1 break-words text-sm font-semibold leading-6">{state.productName || '尚未确认商品'}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{salesCreationRule(state.category).title}</p></div>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-white/[0.035]">{[['商品外观', '以所选图片为准'], ['已选商品图', `${usable.length} / ${state.imageCatalog.length} 张`], ['目标时长', `${state.targetDuration} 秒`], ['画面比例', state.aspectRatio]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
      <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">修改商品、所选图片或创作参数后，已有脚本需要更新；有效素材与历史回执仍保留。</p>
    </section>
    <details className="group border-t border-slate-100 pt-4 dark:border-white/10"><summary className={`flex cursor-pointer list-none items-center justify-between rounded text-xs font-medium text-slate-600 dark:text-slate-300 ${salesFocusClass}`}>展开商品资料与设置<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary><div className="pt-5">{form}</div></details>
  </div>;
}
