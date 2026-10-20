import { useRef, useState, type DragEvent } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import type { SalesColorSelection, SalesImageRef } from '@shared/domain/video-sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { PRODUCT_IMAGE_ACCEPT, imagesFromDataTransfer } from '../model/productImageDrop';
import { SalesColorGallery } from './SalesColorGallery';
import { salesGhostButtonClass, salesGroupClass, salesInputClass, salesLabelClass, salesSectionTitleClass } from './salesSurface';

interface Props {
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
  onRefresh?: () => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onImageError: (index: number) => void;
}

export function SalesProductMedia({ productUrl, images, usableCount, metadata, selection, isBusy, isCollecting, isUploading, onUrlChange, onSelection, onCollect, onRefresh, onUpload, onImageError }: Props) {
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
      <h2 className={salesSectionTitleClass}>商品来源</h2>
      <label className={salesLabelClass} htmlFor="sales-product-url">商品链接
        <div className="mt-1.5 flex gap-2">
          <input id="sales-product-url" value={productUrl} disabled={isBusy} onChange={(event) => onUrlChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !isBusy) onCollect(); }} placeholder="京东、淘宝、天猫、1688 或拼多多" className={`${salesInputClass} mt-0 min-w-0 flex-1`} />
          <button type="button" onClick={onCollect} disabled={isBusy || !productUrl.trim()} className={`h-10 shrink-0 px-3.5 disabled:opacity-40 ${salesGhostButtonClass}`}>{isCollecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}采集</button>
        </div>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>优先使用采集缓存</span>{onRefresh && productUrl.trim() && <button type="button" onClick={onRefresh} disabled={isBusy || !productUrl.trim()} className="underline decoration-dotted underline-offset-4 disabled:opacity-40" title="跳过缓存调用外部接口，可能产生计费">重新采集（可能计费）</button>}</div>
      <input ref={inputRef} type="file" aria-label="上传商品图片" accept={PRODUCT_IMAGE_ACCEPT} multiple className="sr-only" disabled={isBusy} onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) void onUpload(files); }} />
      <div className={`space-y-3 rounded-2xl ${dragging ? 'ring-2 ring-slate-400' : ''}`} onDragEnter={(event) => { if (!hasFiles(event)) return; event.preventDefault(); if (!isBusy) { dragDepth.current += 1; setDragging(true); } }} onDragOver={(event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy'; }} onDragLeave={(event) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }} onDrop={onDrop}>
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">颜色与参考图 · 本次可用 {usableCount}/{images.length}</span><button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1 text-xs disabled:opacity-40">{isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}上传商品图</button></div>
        {images.length > 0 ? <SalesColorGallery images={images} metadata={metadata} selection={selection} disabled={isBusy} onChange={onSelection} onImageError={onImageError} /> : <button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-xs text-slate-500 disabled:opacity-40 dark:border-white/20"><ImagePlus className="mb-2 h-5 w-5" />{isUploading ? '正在上传图片' : dragging ? '松开以添加图片' : '上传商品图片，或拖入图片 / 文件夹'}</button>}
        {dragging && <p role="status" className="text-center text-xs text-slate-500">松开以添加商品图片，原图会保留。</p>}
      </div>
    </section>
  );
}
