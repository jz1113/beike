import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { memo, useRef, useState, type ReactNode } from 'react';
import { Check, CheckSquare, ChevronDown, RotateCcw, ScanText, Search, X } from 'lucide-react';
import type { SalesColorSelection, SalesImageRef } from '@shared/domain/sales';
import { eligibleSalesImages } from '@shared/domain/sales/imageSelection';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import { galleryImages, selectGalleryImages, type SalesGalleryGroup } from '../model/salesGallery';
import { SALES_IMAGE_DRAG_TYPE, salesImageDragData } from '../model/salesImageDrag';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import { SalesImageThumbnail } from './SalesImageThumbnail';

interface Props {
  ocrImageUrls?: string[];
  ocrDisabled?: boolean;
  onAddOCRImages?: (urls: string[]) => void;
  onImageDragging?: (url: string | null) => void;
  initialGroup?: SalesGalleryGroup;
  onRetryUnavailable?: () => void;
  images: SalesImageRef[];
  emptyContent?: ReactNode;
  metadata: SalesCollectionState['variantMetadata'];
  selection: SalesColorSelection;
  disabled: boolean;
  onChange: (selection: SalesColorSelection) => void;
  onImageError: (index: number) => void;
  onConfirmSelection?: () => boolean | void;
  onRecognizeImages?: (urls: string[]) => void;
}

export const SalesColorGallery = memo(function SalesColorGallery({ images, metadata, selection, disabled, onChange, onImageError, emptyContent, initialGroup = 'all', onRetryUnavailable, ocrImageUrls = [], ocrDisabled = disabled, onAddOCRImages, onImageDragging, onConfirmSelection, onRecognizeImages }: Props) {
  const [group, setGroup] = useState<SalesGalleryGroup>(initialGroup);
  const [retryVersion, setRetryVersion] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const ignoreClickUntil = useRef(0);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => menuRef.current?.removeAttribute('open');
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const closePreview = () => { setPreview(null); requestAnimationFrame(() => previewTrigger.current?.focus()); };
  const [preview, setPreview] = useState<SalesImageRef | null>(null);
  const previewIndex = images.findIndex((image) => image.index === preview?.index);
  const movePreview = (offset: number) => {
    const next = images[previewIndex + offset];
    if (next) setPreview(next);
  };

  const selectedList = eligibleSalesImages(images, selection, metadata);
  const eligible = new Set(selectedList.map((image) => image.url));
  const selected = new Set([...selection.confirmedImageUrls.filter((url) => eligible.has(url)), ...eligible]);
  const selectedOrderMap = new Map([...selected].map((url, idx) => [url, idx + 1]));
  const ocrImages = new Set(ocrImageUrls);
  const groups: [SalesGalleryGroup, string][] = [['all', '全部'], ['main', '主图'], ['detail', '详情'], ['selected', '已选']];
  const activeGroup = group;
  const visible = galleryImages(images, selected, activeGroup);
  const available = visible.filter((image) => !image.unavailable);
  const toggleImage = (url: string) => { if (Date.now() >= ignoreClickUntil.current) { setConfirmed(false); onChange(selectGalleryImages(images, selected, [url], !selected.has(url))); } };
  const clearSelected = () => onChange(selectGalleryImages(images, selected, [...selected], false));

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="sales-gallery-tools">
        <div className="sales-gallery-filter" role="group" aria-label="图片显示范围">
          {groups.map(([value, label]) => <button key={value} type="button" aria-pressed={activeGroup === value} onClick={() => setGroup(value)} className={salesFocusClass}>{label}</button>)}
        </div>
      </div>
      <div className="sales-gallery-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
      {images.length === 0 ? emptyContent : <div className={`sales-reference-grid sales-thumbnail-grid ${selected.size > 0 ? 'has-selection' : ''}`}>
        {visible.map((image) => {
              const isSelected = selected.has(image.url);
              const isOCR = ocrImages.has(image.url);
              const selectionOrder = selectedOrderMap.get(image.url);
              const canDrag = Boolean(onAddOCRImages) && !ocrDisabled && !image.unavailable;
              return <article key={`${image.index}-${image.url}`} className={`sales-reference-tile relative overflow-hidden rounded-[6px] border transition-colors ${isSelected ? 'is-selected' : ''} ${isOCR ? 'is-ocr' : ''}`}>
                <div className="sales-reference-frame relative">
                  <button type="button" disabled={disabled || image.unavailable} draggable={canDrag} onDragStart={(event) => {
                    if (ocrDisabled || image.unavailable) { event.preventDefault(); return; }
                    event.dataTransfer.setData(SALES_IMAGE_DRAG_TYPE, salesImageDragData(image));
                    event.dataTransfer.effectAllowed = 'copy';
                    ignoreClickUntil.current = Infinity;
                    onImageDragging?.(image.url);
                  }} onDragEnd={() => { ignoreClickUntil.current = Date.now() + 200; onImageDragging?.(null); }} onClick={() => toggleImage(image.url)} title={disabled ? '资料处理中，请稍后选择商品图' : ocrDisabled ? '识别进行中，仍可单击选择商品图' : '单击选为视频参考图；拖到右侧加入文字识别'} aria-label={`${isSelected ? '取消选择' : '选择'}商品图 ${image.index + 1}`} aria-pressed={isSelected} className="sales-reference-trigger relative block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-900 dark:focus-visible:ring-zinc-200 disabled:cursor-not-allowed">
                    <SalesImageThumbnail key={retryVersion} url={image.url} index={image.index} alt={`商品图 ${image.index + 1}`} className="sales-reference-image block w-full" onUnavailable={onImageError} />
                    {isSelected && (
                      <span className="sales-reference-check absolute left-1.5 top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-stone-900 px-1 font-mono-nums text-[10px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" aria-hidden>
                        {selectionOrder}
                      </span>
                    )}
                    {isOCR && <span className="sales-reference-ocr" aria-label="已加入文字识别"><ScanText size={11} aria-hidden />OCR</span>}
                  </button>
                  <button type="button" disabled={image.unavailable} onClick={(event) => { event.stopPropagation(); previewTrigger.current = event.currentTarget; setPreview(image); }} title="放大预览" aria-label={`查看商品图 ${image.index + 1} 大图`} className={`sales-image-zoom-btn ${salesFocusClass}`}>
                    <Search className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              </article>;
        })}
      </div>}
      {images.length > 0 && visible.length === 0 && <p className="py-4 text-center text-xs text-slate-500">当前分类没有图片，请切换到「全部」选择。</p>}
      </div>
      <footer className="sales-gallery-confirm">
        <span>已选 {selected.size} 张参考图</span>
        <div className="sales-gallery-footer-actions">
          <details ref={menuRef} className="sales-gallery-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeMenu(); }} onKeyDown={(event) => { if (event.key === 'Escape') { closeMenu(); menuRef.current?.querySelector('summary')?.focus(); } }}>
            <summary title="管理当前分类的图片" className={salesFocusClass}>批量操作<ChevronDown size={12} aria-hidden /></summary>
            <div className="sales-gallery-menu-items">
              <button type="button" disabled={disabled || !available.length} onClick={() => { setConfirmed(false); onChange(selectGalleryImages(images, selected, available.map((image) => image.url), true)); closeMenu(); }} className={salesFocusClass}><CheckSquare size={12} aria-hidden />将当前分类全部选为参考图</button>
              <button type="button" disabled={disabled || !selected.size} onClick={() => { setConfirmed(false); clearSelected(); closeMenu(); }} className={salesFocusClass}>清空参考图选择</button>
              {onAddOCRImages && <button type="button" disabled={ocrDisabled || !available.length} onClick={() => { (onRecognizeImages || onAddOCRImages)(available.map((image) => image.url)); closeMenu(); }} className={salesFocusClass}><ScanText size={12} aria-hidden />识别当前分类文字</button>}
              {onRetryUnavailable && images.some((image) => image.unavailable) && <button type="button" disabled={disabled || ocrDisabled} onClick={() => { onRetryUnavailable(); setRetryVersion((value) => value + 1); closeMenu(); }} className={salesFocusClass}><RotateCcw size={12} aria-hidden />重试失效图片</button>}
            </div>
          </details>
          <button type="button" disabled={disabled || !selected.size} onClick={() => { setConfirmed(onConfirmSelection?.() !== false); }} className={salesGhostButtonClass}><Check size={13} aria-hidden />确认选择</button>
        </div>
        <span className="sr-only" role="status">{confirmed ? '参考图选择已确认' : ''}</span>
      </footer>
      {preview && <div role="dialog" aria-modal="true" aria-label="商品图片大图" className="fixed inset-0 z-[100] flex flex-col bg-black/90 p-4" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); closePreview(); }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); movePreview(event.key === 'ArrowLeft' ? -1 : 1); }
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <button type="button" autoFocus onClick={closePreview} className="ml-auto flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white"><X className="h-4 w-4" />关闭大图</button>
        <img src={proxyMediaUrl(preview.url)} alt={`完整商品图 ${preview.index + 1}`} className="min-h-0 w-full flex-1 object-contain p-4" />
        <div className="flex flex-wrap items-center justify-center gap-3 text-white">
          <button type="button" disabled={previewIndex <= 0} onClick={() => movePreview(-1)} className="rounded-xl px-4 py-2 text-sm disabled:opacity-40">上一张</button>
          <span className="text-xs">{previewIndex + 1} / {images.length}</span>
          <button type="button" disabled={disabled || preview.unavailable} onClick={() => toggleImage(preview.url)} aria-pressed={selected.has(preview.url)} className="rounded-xl bg-white px-4 py-2 text-sm text-slate-900 disabled:opacity-40">{selected.has(preview.url) ? '取消选择此图' : '选择此图'}</button>
          <button type="button" disabled={previewIndex >= images.length - 1} onClick={() => movePreview(1)} className="rounded-xl bg-white px-4 py-2 text-sm text-slate-900 disabled:opacity-40">下一张</button>
        </div>
      </div>}
    </div>
  );
});
