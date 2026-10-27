import { useState, type ReactNode } from 'react';
import { Check, ImagePlus, Loader2, Search, X } from 'lucide-react';
import type { SalesColorSelection, SalesImageRef } from '@shared/domain/sales';
import { eligibleSalesImages } from '@shared/domain/sales/workflow';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { salesFocusClass } from './salesChrome';

interface Props {
  images: SalesImageRef[];
  usableCount?: number;
  onUploadClick?: () => void;
  isUploading?: boolean;
  emptyContent?: ReactNode;
  metadata: VideoSalesStudioState['variantMetadata'];
  selection: SalesColorSelection;
  disabled: boolean;
  onChange: (selection: SalesColorSelection) => void;
  onImageError: (index: number) => void;
}

export function SalesColorGallery({ images, metadata, selection, disabled, onChange, onImageError, usableCount, onUploadClick, isUploading, emptyContent }: Props) {
  const [group, setGroup] = useState<'all' | 'selected'>('all');
  const [preview, setPreview] = useState<SalesImageRef | null>(null);
  const previewIndex = images.findIndex((image) => image.index === preview?.index);
  const movePreview = (offset: number) => {
    const next = images[previewIndex + offset];
    if (next) setPreview(next);
  };
  const selected = new Set(eligibleSalesImages(images, selection, metadata).map((image) => image.url));
  const grouped = {
    all: images,
    selected: images.filter((image) => selected.has(image.url)),
  };
  const activeGroup = group === 'selected' ? 'selected' : 'all';
  const toggleImage = (url: string) => {
    const wasSelected = selected.has(url);
    onChange({
      ...selection,
      variantId: undefined,
      colorLabel: '',
      confirmedImageUrls: wasSelected ? [...selected].filter((item) => item !== url) : [...selected, url],
      excludedImageUrls: wasSelected ? [...new Set([...selection.excludedImageUrls, url])] : selection.excludedImageUrls.filter((item) => item !== url),
    });
  };
  const clearSelected = () => {
    onChange({
      variantId: undefined,
      colorLabel: '',
      confirmedImageUrls: [],
      excludedImageUrls: images.map((image) => image.url),
    });
  };

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="sales-gallery-header flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 pb-3 pt-4">
        <h3 className="text-xs font-semibold">商品参考图 <span className="ml-1 text-[11px] font-normal text-slate-500 dark:text-slate-400">(共 {images.length} 张 · 已选 {usableCount ?? selected.size} 张)</span></h3>
        <div className="flex items-center gap-2.5">
          <button type="button" role="switch" aria-checked={activeGroup === 'selected'} onClick={() => setGroup(activeGroup === 'selected' ? 'all' : 'selected')} className={`inline-flex items-center gap-1.5 rounded-md text-[11px] text-slate-500 dark:text-slate-400 ${salesFocusClass}`}><span className={`flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors ${activeGroup === 'selected' ? 'bg-slate-600 dark:bg-slate-400' : 'bg-slate-200 dark:bg-white/15'}`} aria-hidden><span className={`h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform ${activeGroup === 'selected' ? 'translate-x-2.5' : ''}`} /></span>只看已选</button>
          {onUploadClick && <button type="button" disabled={disabled} onClick={onUploadClick} className={`inline-flex items-center gap-1 rounded-md text-[11px] text-slate-600 disabled:opacity-40 dark:text-slate-300 ${salesFocusClass}`}>{isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}上传图片</button>}
          {selected.size > 0 && <button type="button" disabled={disabled} onClick={clearSelected} className={`shrink-0 rounded-md text-[11px] text-slate-400 hover:text-slate-700 disabled:opacity-40 dark:hover:text-slate-200 ${salesFocusClass}`}>清空重选</button>}
        </div>
      </div>
      <div className="sales-gallery-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth pr-1">
      {images.length === 0 ? emptyContent : <div className={`sales-reference-grid ${selected.size > 0 ? 'has-selection' : ''} grid grid-cols-3 gap-2.5 p-0.5 @min-[560px]:grid-cols-4`}>
        {grouped[activeGroup].map((image) => {
          const isSelected = selected.has(image.url);
          return <article key={`${image.index}-${image.url}`} className={`sales-reference-tile group relative overflow-hidden rounded-xl border-2 transition-colors ${isSelected ? 'is-selected' : 'border-transparent hover:border-amber-500 dark:hover:border-amber-400'} ${image.unavailable ? 'opacity-50' : ''}`}>
            <button type="button" disabled={disabled || image.unavailable} onClick={() => toggleImage(image.url)} aria-label={`${isSelected ? '取消选择' : '选择'}商品图 ${image.index + 1}`} aria-pressed={isSelected} className={`relative block aspect-square w-full bg-slate-100 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/70 disabled:cursor-not-allowed dark:bg-[#18191c]`}><img src={image.url} alt={`商品图 ${image.index + 1}`} loading="lazy" className="sales-reference-image h-full w-full object-contain" onError={() => onImageError(image.index)} /><span className="absolute left-1 top-1 rounded px-1 py-px text-[9px] bg-black/40 font-medium tabular-nums text-white">#{image.index + 1}</span>{isSelected && <span className="sales-reference-check absolute right-1.5 top-1.5 rounded-full bg-amber-500 p-1.5 text-slate-950 shadow-sm ring-2 ring-white/90"><Check className="h-4 w-4" strokeWidth={3} aria-hidden /></span>}{image.unavailable && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] text-white">图片不可用</span>}</button>
            <button type="button" disabled={image.unavailable} onClick={() => setPreview(image)} aria-label={`查看商品图 ${image.index + 1} 大图`} className={`absolute bottom-1 right-1 rounded-md bg-black/45 p-1 text-white opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 disabled:opacity-40 ${salesFocusClass}`}><Search className="h-2.5 w-2.5" aria-hidden /></button>
          </article>;
        })}
      </div>}
      {images.length > 0 && grouped[activeGroup].length === 0 && <p className="py-4 text-center text-xs text-slate-500">尚未选择商品图，请在全部图片中直接选择。</p>}
      </div>
      {preview && <div role="dialog" aria-modal="true" aria-label="商品图片大图" className="fixed inset-0 z-[100] flex flex-col bg-black/90 p-4" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); setPreview(null); }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); movePreview(event.key === 'ArrowLeft' ? -1 : 1); }
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <button type="button" autoFocus onClick={() => setPreview(null)} className="ml-auto flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white"><X className="h-4 w-4" />关闭大图</button>
        <img src={preview.url} alt={`完整商品图 ${preview.index + 1}`} className="min-h-0 w-full flex-1 object-contain p-4" />
        <div className="flex flex-wrap items-center justify-center gap-3 text-white">
          <button type="button" disabled={previewIndex <= 0} onClick={() => movePreview(-1)} className="rounded-xl px-4 py-2 text-sm disabled:opacity-40">上一张</button>
          <span className="text-xs">{previewIndex + 1} / {images.length}</span>
          <button type="button" disabled={disabled || preview.unavailable} onClick={() => toggleImage(preview.url)} aria-pressed={selected.has(preview.url)} className="rounded-xl bg-white px-4 py-2 text-sm text-slate-900 disabled:opacity-40">{selected.has(preview.url) ? '取消选择此图' : '选择此图用于生成'}</button>
          <button type="button" disabled={previewIndex >= images.length - 1} onClick={() => movePreview(1)} className="rounded-xl px-4 py-2 text-sm disabled:opacity-40">下一张</button>
        </div>
      </div>}
    </div>
  );
}
