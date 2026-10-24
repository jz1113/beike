import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { SalesColorSelection, SalesImageRef } from '@shared/domain/sales';
import { eligibleSalesImages } from '@shared/domain/sales/workflow';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { salesFocusClass, salesTabClass, salesTabTrackClass } from './salesChrome';

interface Props {
  images: SalesImageRef[];
  metadata: VideoSalesStudioState['variantMetadata'];
  selection: SalesColorSelection;
  disabled: boolean;
  onChange: (selection: SalesColorSelection) => void;
  onImageError: (index: number) => void;
}

export function SalesColorGallery({ images, metadata, selection, disabled, onChange, onImageError }: Props) {
  const [group, setGroup] = useState<'all' | 'selected' | 'unselected'>('all');
  const [preview, setPreview] = useState<SalesImageRef | null>(null);
  const [allImages, setAllImages] = useState(false);
  const previewIndex = images.findIndex((image) => image.index === preview?.index);
  const movePreview = (offset: number) => {
    const next = images[previewIndex + offset];
    if (next) setPreview(next);
  };
  const selected = new Set(eligibleSalesImages(images, selection, metadata).map((image) => image.url));
  const grouped = {
    all: images,
    selected: images.filter((image) => selected.has(image.url)),
    unselected: images.filter((image) => !selected.has(image.url)),
  };
  const availableVariants = (metadata?.variants || [])
    .map((variant) => ({ ...variant, matchedUrls: variant.imageUrls.filter((url) => images.some((image) => image.url === url && !image.unavailable)) }))
    .filter((variant) => variant.matchedUrls.length > 0);
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
  const selectVariant = (variantId: string, colorLabel: string, urls: string[]) => {
    onChange({
      variantId,
      colorLabel,
      confirmedImageUrls: [...new Set(urls)],
      excludedImageUrls: images.filter((image) => !urls.includes(image.url)).map((image) => image.url),
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
    <div className="@container space-y-3">
      <div className="flex items-center gap-2">
        <div className={`${salesTabTrackClass} flex min-w-0 flex-1`} role="tablist" aria-label="商品图片分组">
          {(['all', 'selected', 'unselected'] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => { setGroup(key); setAllImages(false); }} className={`${salesTabClass(group === key)} flex-1 px-2 text-xs`}>{key === 'all' ? '全部图片' : key === 'selected' ? '已选' : '未选'} {grouped[key].length}</button>)}
        </div>
        {selected.size > 0 && <button type="button" disabled={disabled} onClick={clearSelected} className={`shrink-0 rounded-lg px-2 py-2 text-[11px] text-slate-500 transition hover:bg-slate-50 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/5 ${salesFocusClass}`}>清空重选</button>}
      </div>
      {availableVariants.length > 1 && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-[11px] dark:bg-white/[0.025]" aria-label="规格图片快捷筛选">
          <span className="block text-slate-500 dark:text-slate-400">按规格选用</span>
          <div className="flex flex-wrap gap-1.5">
          {availableVariants.map((variant) => {
            const active = selection.variantId === variant.id || (variant.matchedUrls.length === selected.size && variant.matchedUrls.every((url) => selected.has(url)));
            return (
              <button key={variant.id} type="button" disabled={disabled} aria-pressed={active} onClick={() => selectVariant(variant.id, variant.color || variant.label, variant.matchedUrls)} className={`max-w-full break-words rounded-lg border px-2.5 py-1.5 text-left transition disabled:opacity-40 ${salesFocusClass} ${active ? 'border-amber-500/60 bg-amber-500/10 font-medium text-amber-800 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-200' : 'border-black/[0.07] text-slate-600 hover:bg-black/5 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/5'}`}>
                {variant.label} ({variant.matchedUrls.length})
              </button>
            );
          })}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 p-0.5 @min-[360px]:grid-cols-3">
        {grouped[group].slice(0, allImages ? undefined : 6).map((image) => {
          const isSelected = selected.has(image.url);
          return <article key={`${image.index}-${image.url}`} className={`overflow-hidden rounded-xl border transition-colors ${isSelected ? 'border-amber-500/70 bg-amber-500/[0.04] dark:border-amber-400/60 dark:bg-amber-400/[0.04]' : 'border-black/[0.07] dark:border-white/[0.08]'} ${image.unavailable ? 'opacity-50' : ''}`}>
            <button type="button" onClick={() => setPreview(image)} className={`relative block aspect-square max-h-44 w-full bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/70`} aria-label={`查看商品图 ${image.index + 1} 大图`}><img src={image.url} alt={`商品图 ${image.index + 1}`} loading="lazy" className="h-full w-full object-contain" onError={() => onImageError(image.index)} /><span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">#{image.index + 1}</span>{isSelected && <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-500 p-1 text-slate-950 shadow-sm ring-2 ring-white/90 dark:bg-amber-400"><Check className="h-3 w-3" /></span>}{image.unavailable && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] text-white">图片不可用</span>}</button>
            <div className="text-[10px]">
              <button type="button" disabled={disabled || image.unavailable} onClick={() => toggleImage(image.url)} aria-label={`${isSelected ? '取消选择' : '选择'}商品图 ${image.index + 1}`} aria-pressed={isSelected} className={`flex min-h-8 w-full items-center justify-center gap-1 px-1 py-2 transition-colors disabled:opacity-40 ${salesFocusClass} ${isSelected ? 'font-medium text-amber-800 hover:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-400/10' : 'text-slate-600 hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/5'}`}>{isSelected && <Check className="h-3 w-3" />}{isSelected ? '已选 · 取消选择' : '选择此图'}</button>
            </div>
          </article>;
        })}
      </div>
      {grouped[group].length > 6 && <button type="button" aria-expanded={allImages} onClick={() => setAllImages((current) => !current)} className="w-full rounded-xl border border-slate-200 py-2.5 text-xs text-slate-600 focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-white/10 dark:text-slate-300">{allImages ? '收起更多商品图' : `展开其余 ${grouped[group].length - 6} 张商品图`}</button>}
      {grouped[group].length === 0 && <p className="py-4 text-center text-xs text-slate-500">{group === 'selected' ? '尚未选择商品图，请在全部图片中直接选择。' : '此分组暂无图片。'}</p>}
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
