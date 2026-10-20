import { useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { SalesColorSelection, SalesImageRef } from '@shared/domain/video-sales';
import { eligibleSalesImages } from '@shared/domain/video-sales/workflow';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { salesInputClass, salesLabelClass, salesTabClass, salesTabTrackClass } from './salesSurface';

interface Props {
  images: SalesImageRef[];
  metadata: VideoSalesStudioState['variantMetadata'];
  selection: SalesColorSelection;
  disabled: boolean;
  onChange: (selection: SalesColorSelection) => void;
  onImageError: (index: number) => void;
}

export function SalesColorGallery({ images, metadata, selection, disabled, onChange, onImageError }: Props) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<'current' | 'other' | 'pending'>('current');
  const [preview, setPreview] = useState<SalesImageRef | null>(null);
  const [allImages, setAllImages] = useState(false);
  const [allVariants, setAllVariants] = useState(false);
  const variants = metadata?.variants || [];
  const matches = variants.filter((variant) => `${variant.label} ${variant.color || ''}`.toLowerCase().includes(search.toLowerCase()));
  const eligible = new Set(eligibleSalesImages(images, { ...selection, excludedImageUrls: [] }, metadata).map((image) => image.url));
  const known = new Set(variants.filter((variant) => variant.color).flatMap((variant) => variant.imageUrls).filter((url) => new Set(variants.filter((variant) => variant.imageUrls.includes(url)).map((variant) => variant.color)).size === 1));
  const grouped = {
    current: images.filter((image) => eligible.has(image.url)),
    other: images.filter((image) => !eligible.has(image.url) && known.has(image.url)),
    pending: images.filter((image) => !eligible.has(image.url) && !known.has(image.url)),
  };
  const toggleConfirmed = (url: string) => {
    const confirmed = selection.confirmedImageUrls.includes(url);
    onChange({ ...selection, confirmedImageUrls: confirmed ? selection.confirmedImageUrls.filter((item) => item !== url) : [...selection.confirmedImageUrls, url], excludedImageUrls: selection.excludedImageUrls.filter((item) => item !== url) });
  };
  const toggleExcluded = (url: string) => {
    const excluded = selection.excludedImageUrls.includes(url);
    onChange({ ...selection, excludedImageUrls: excluded ? selection.excludedImageUrls.filter((item) => item !== url) : [...selection.excludedImageUrls, url] });
  };

  return (
    <div className="space-y-3">
      <label className={salesLabelClass}>本次商品颜色<input value={selection.colorLabel} disabled={disabled} onChange={(event) => onChange({ ...selection, variantId: undefined, colorLabel: event.target.value, confirmedImageUrls: [] })} placeholder="无颜色证据时，请填写颜色并确认下方图片" className={salesInputClass} /></label>
      {variants.length > 0 && <>
        <label className="relative block"><Search className="absolute left-3 top-5 h-3.5 w-3.5 text-slate-400" /><input aria-label="搜索商品颜色" className={`${salesInputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索颜色或规格" /></label>
        <div className="flex flex-wrap gap-2" aria-label="商品颜色规格">
          {matches.slice(0, allVariants ? undefined : 4).map((variant) => <button key={variant.id} type="button" disabled={disabled} aria-pressed={selection.variantId === variant.id} onClick={() => onChange({ ...selection, variantId: variant.id, colorLabel: variant.color || '', confirmedImageUrls: [] })} className={`flex w-[calc(50%-4px)] min-w-0 items-center gap-2 rounded-xl border p-2 text-left text-xs disabled:opacity-50 ${selection.variantId === variant.id ? 'border-slate-800 bg-slate-100 dark:border-white/60 dark:bg-white/10' : 'border-black/10 dark:border-white/10'}`}>
            {variant.imageUrls[0] && <img src={variant.imageUrls[0]} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain" />}<span className="min-w-0 break-words">{variant.label}{variant.color && variant.color !== variant.label ? ` · ${variant.color}` : ''}</span>
          </button>)}
          {matches.length === 0 && <p className="text-xs text-slate-500">没有匹配的颜色，可手动填写并确认参考图。</p>}
        </div>
        {matches.length > 4 && <button type="button" aria-expanded={allVariants} onClick={() => setAllVariants((current) => !current)} className="rounded text-xs text-slate-500 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-amber-500">{allVariants ? '收起更多规格' : `查看其余 ${matches.length - 4} 个规格`}</button>}
      </>}
      <div className={`${salesTabTrackClass} flex w-full`} role="tablist" aria-label="商品图片分组">
        {(['current', 'other', 'pending'] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => { setGroup(key); setAllImages(false); }} className={`${salesTabClass(group === key)} flex-1 px-2 text-xs`}>{key === 'current' ? '当前颜色' : key === 'other' ? '其他颜色' : '待确认'} {grouped[key].length}</button>)}
      </div>
      <p className="text-[11px] leading-5 text-slate-500">无颜色证据的图片不会自动纳入。请查看大图后明确确认；“排除本次”保留原图，可随时恢复。</p>
      <div className="grid grid-cols-2 gap-2 p-0.5 min-[420px]:grid-cols-3">
        {grouped[group].slice(0, allImages ? undefined : 6).map((image) => {
          const excluded = selection.excludedImageUrls.includes(image.url);
          const confirmed = selection.confirmedImageUrls.includes(image.url);
          return <article key={`${image.index}-${image.url}`} className={`overflow-hidden rounded-xl border border-black/10 dark:border-white/10 ${excluded ? 'opacity-50' : ''}`}>
            <button type="button" onClick={() => setPreview(image)} className="relative block aspect-square w-full bg-white" aria-label={`查看商品图 ${image.index + 1} 大图`}><img src={image.url} alt={`商品图 ${image.index + 1}`} loading="lazy" className="h-full w-full object-contain" onError={() => onImageError(image.index)} />{image.unavailable && <span className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] text-white">图片不可用</span>}</button>
            <div className="space-y-1 p-1.5 text-[10px]">
              <button type="button" disabled={disabled || image.unavailable || !selection.colorLabel.trim()} onClick={() => toggleConfirmed(image.url)} aria-pressed={confirmed} className="flex w-full items-center justify-center gap-1 rounded bg-black/[0.04] py-1 disabled:opacity-40 dark:bg-white/10">{confirmed && <Check className="h-3 w-3" />}{confirmed ? '已明确确认' : '确认此颜色'}</button>
              <button type="button" disabled={disabled} onClick={() => toggleExcluded(image.url)} className="w-full py-0.5 text-slate-500 disabled:opacity-40">{excluded ? '恢复本次使用' : '排除本次'}</button>
            </div>
          </article>;
        })}
      </div>
      {grouped[group].length > 6 && <button type="button" aria-expanded={allImages} onClick={() => setAllImages((current) => !current)} className="w-full rounded-xl border border-slate-200 py-2.5 text-xs text-slate-600 focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-white/10 dark:text-slate-300">{allImages ? '收起更多商品图' : `展开其余 ${grouped[group].length - 6} 张商品图`}</button>}
      {grouped[group].length === 0 && <p className="py-4 text-center text-xs text-slate-500">{group === 'current' ? '请选择颜色规格，或在其他分组中确认商品图。' : '此分组暂无图片。'}</p>}
      {preview && <div role="dialog" aria-modal="true" aria-label="商品图片大图" className="fixed inset-0 z-[100] flex flex-col bg-black/90 p-4" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); setPreview(null); }
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <button type="button" autoFocus onClick={() => setPreview(null)} className="ml-auto flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white"><X className="h-4 w-4" />关闭大图</button>
        <img src={preview.url} alt={`完整商品图 ${preview.index + 1}`} className="min-h-0 w-full flex-1 object-contain p-4" />
        <div className="flex justify-center gap-3"><button type="button" disabled={disabled || preview.unavailable || !selection.colorLabel.trim()} onClick={() => toggleConfirmed(preview.url)} className="rounded-xl bg-white px-4 py-2 text-sm text-slate-900 disabled:opacity-40">{selection.confirmedImageUrls.includes(preview.url) ? '撤销明确确认' : `确认属于${selection.colorLabel || '当前颜色'}`}</button><button type="button" disabled={disabled} onClick={() => toggleExcluded(preview.url)} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-40">{selection.excludedImageUrls.includes(preview.url) ? '恢复本次使用' : '排除本次'}</button></div>
      </div>}
    </div>
  );
}
