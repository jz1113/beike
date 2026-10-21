import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { SalesColorSelection, SalesImageRef } from '@shared/domain/video-sales';
import { eligibleSalesImages } from '@shared/domain/video-sales/workflow';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { salesTabClass, salesTabTrackClass } from './salesChrome';

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

  return (
    <div className="space-y-3">
      <div className={`${salesTabTrackClass} flex w-full`} role="tablist" aria-label="商品图片分组">
        {(['all', 'selected', 'unselected'] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => { setGroup(key); setAllImages(false); }} className={`${salesTabClass(group === key)} flex-1 px-2 text-xs`}>{key === 'all' ? '全部图片' : key === 'selected' ? '已选' : '未选'} {grouped[key].length}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-2 p-0.5 min-[420px]:grid-cols-3">
        {grouped[group].slice(0, allImages ? undefined : 6).map((image) => {
          const isSelected = selected.has(image.url);
          return <article key={`${image.index}-${image.url}`} className={`overflow-hidden rounded-xl border ${isSelected ? 'border-slate-800 ring-1 ring-slate-800 dark:border-white/60 dark:ring-white/60' : 'border-black/10 dark:border-white/10'} ${image.unavailable ? 'opacity-50' : ''}`}>
            <button type="button" onClick={() => setPreview(image)} className="relative block aspect-square w-full bg-white" aria-label={`查看商品图 ${image.index + 1} 大图`}><img src={image.url} alt={`商品图 ${image.index + 1}`} loading="lazy" className="h-full w-full object-contain" onError={() => onImageError(image.index)} />{isSelected && <span className="absolute right-1.5 top-1.5 rounded-full bg-slate-900 p-1 text-white"><Check className="h-3 w-3" /></span>}{image.unavailable && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] text-white">图片不可用</span>}</button>
            <div className="p-1.5 text-[10px]">
              <button type="button" disabled={disabled || image.unavailable} onClick={() => toggleImage(image.url)} aria-label={`${isSelected ? '取消选择' : '选择'}商品图 ${image.index + 1}`} aria-pressed={isSelected} className="flex w-full items-center justify-center gap-1 rounded bg-black/[0.04] py-1.5 disabled:opacity-40 dark:bg-white/10">{isSelected && <Check className="h-3 w-3" />}{isSelected ? '已选 · 取消选择' : '选择此图'}</button>
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
