import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { fetchAssetDetail } from '@client/shared/api/assetLibraryCache';
import { audienceLabel } from '@shared/domain/assets/appearanceAudience';
import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import { workshopAssetBlockReason, type WorkshopAssetCandidate } from '@shared/domain/workshop/workshopPipeline';
import { Check, Copy, ExternalLink, ImageOff, Tags, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAssetPreviewText } from '../utils/assetApply';
import type { GalleryAtomType } from '../utils/assetGalleryLabels';

interface Props {
  item: AssetLibrarySlim;
  type: GalleryAtomType;
  displayLabel: string;
  copiedId: string | null;
  onClose: () => void;
  onCopyPrompt: (text: string, id: string) => void;
  onApplyToWorkshop: (detail: AssetLibrarySlim) => void;
  onOpenTagEdit: (detail: AssetLibrarySlim) => void;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sourceImage(item: AssetLibrarySlim): string {
  const direct = textValue(item.coverUrl) || textValue(item.avatarUrl);
  if (direct) return direct;
  try {
    const images = JSON.parse(textValue(item.sourceImages));
    if (!Array.isArray(images)) return '';
    const index = typeof item.sourceImageIndex === 'number' ? item.sourceImageIndex - 1 : 0;
    return textValue(images[index]);
  } catch {
    return '';
  }
}

function infoRows(detail: AssetLibrarySlim, type: GalleryAtomType): Array<[string, string]> {
  const common: Array<[string, string]> = [
    ['原始名称', textValue(detail.name) || textValue(detail.title)],
    ['所属图集', textValue(detail.albumName)],
    ['来源原图', typeof detail.sourceImageIndex === 'number' ? `第 ${detail.sourceImageIndex} 张` : ''],
  ];
  if (type === 'persona') return ([
    ...common,
    ['适用人群', audienceLabel(detail)],
    ['人物描述', textValue(detail.description)],
  ] as Array<[string, string]>).filter((entry) => entry[1]);
  if (type === 'outfit') return ([
    ...common,
    ['适用人群', audienceLabel(detail, true)],
    ['上装', textValue(detail.top)],
    ['下装', textValue(detail.bottom)],
    ['鞋履', textValue(detail.shoes)],
    ['配色', textValue(detail.colorPalette)],
  ] as Array<[string, string]>).filter((entry) => entry[1]);
  return ([
    ...common,
    ['场景描述', textValue(detail.description)],
    ['光线', textValue(detail.lighting)],
  ] as Array<[string, string]>).filter((entry) => entry[1]);
}

export function AtomicAssetPreview({
  item, type, displayLabel, copiedId, onClose, onCopyPrompt, onApplyToWorkshop, onOpenTagEdit,
}: Props) {
  const [detail, setDetail] = useState<AssetLibrarySlim>(item);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [view, setView] = useState<'prompt' | 'info'>('prompt');
  const [useDirectImage, setUseDirectImage] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const promptScrollRef = useRef<HTMLDivElement>(null);
  const image = sourceImage(detail);
  const directImage = image.startsWith('//') ? `https:${image}` : image;
  const proxiedImage = directImage ? proxyMediaUrl(directImage) : '';
  const imageUrl = useDirectImage ? directImage : proxiedImage;
  const prompt = getAssetPreviewText(detail, type).trim();
  const blockReason = loadState === 'ready'
    ? workshopAssetBlockReason(detail as WorkshopAssetCandidate, type)
    : null;
  const rows = infoRows(detail, type);

  useEffect(() => {
    let cancelled = false;
    void fetchAssetDetail(type, item.id).then((full) => {
      if (cancelled) return;
      if (!full) { setLoadState('error'); return; }
      setDetail({ ...item, ...full });
      setLoadState('ready');
    });
    return () => { cancelled = true; };
  }, [item, type, retryCount]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('[role="tab"]')?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || [])
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => { if (promptScrollRef.current) promptScrollRef.current.scrollTop = 0; }, [view]);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/50 px-3 py-5 backdrop-blur-[8px] sm:px-6 lg:px-8 lg:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget || event.target === dialogRef.current?.parentElement) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${displayLabel}原图与提示词`}
          className="relative flex w-full max-w-[1120px] flex-col items-center justify-center gap-5 text-slate-900 lg:flex-row lg:gap-8"
        >
          <div className="relative aspect-[3/4] w-full max-w-[min(640px,calc((100dvh-5rem)*0.75))] shrink-0 overflow-hidden rounded-[22px] bg-slate-100 shadow-[0_28px_72px_rgba(15,23,42,0.28)] ring-1 ring-white/60 lg:w-[min(50vw,calc((100dvh-5rem)*0.75),640px)]">
            {imageUrl && !imageBroken ? (
              <>
                <img src={imageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-xl" />
                <img
                  src={imageUrl}
                  alt={`${displayLabel}来源原图`}
                  className="relative h-full w-full object-contain"
                  onError={() => {
                    if (!useDirectImage && imageUrl !== directImage) setUseDirectImage(true);
                    else setImageBroken(true);
                  }}
                />
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm hover:text-indigo-600" aria-label="在新标签页查看原图"><ExternalLink className="h-4 w-4" /></a>
              </>
            ) : <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400"><ImageOff className="h-7 w-7" /><span className="text-xs">原图暂不可用</span></div>}
          </div>

          <div className="flex h-[min(68dvh,650px)] min-h-[390px] w-full max-w-[480px] flex-col overflow-hidden rounded-[24px] border border-white/75 bg-white shadow-[0_28px_72px_rgba(15,23,42,0.22)] lg:w-[min(39vw,440px)] lg:max-w-none">
            <div className="shrink-0 px-5 pb-3 pt-5 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tracking-[0.12em] text-slate-400">{type === 'persona' ? '人物资产' : type === 'outfit' ? '穿搭资产' : '场景资产'}</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{displayLabel}</h2>
                  <p className="mt-1 truncate text-[11px] text-slate-500" title={textValue(detail.name) || textValue(detail.title)}>{textValue(detail.name) || textValue(detail.title) || '查看原图与可复用提示词'}</p>
                </div>
                <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭预览"><X className="h-4 w-4" /></button>
              </div>
              <div role="tablist" aria-label="资产内容" className="mt-4 flex gap-5 border-b border-slate-100">
                <button type="button" role="tab" aria-selected={view === 'prompt'} onClick={() => setView('prompt')} className={`border-b-2 pb-2.5 text-xs font-medium transition-colors ${view === 'prompt' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>提示词</button>
                <button type="button" role="tab" aria-selected={view === 'info'} onClick={() => setView('info')} className={`border-b-2 pb-2.5 text-xs font-medium transition-colors ${view === 'info' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>信息</button>
              </div>
              {loadState === 'ready' && blockReason && <p className="mt-2 text-[11px] text-amber-700">暂不可载入：{blockReason}</p>}
            </div>

            <div ref={promptScrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2.5 sm:px-6">
              {loadState === 'loading' ? (
                <div role="status" className="space-y-3 animate-pulse py-2"><span className="text-xs text-slate-500">正在读取资产提示词…</span><div className="h-3 w-full rounded bg-slate-200" /><div className="h-3 w-5/6 rounded bg-slate-200" /></div>
              ) : loadState === 'error' ? (
                <div role="alert" className="rounded-xl bg-rose-50 p-4 text-xs text-rose-700"><p>资产详情读取失败，请重试。</p><button type="button" onClick={() => { setLoadState('loading'); setRetryCount((count) => count + 1); }} className="mt-3 rounded-lg bg-rose-100 px-3 py-1.5 font-medium hover:bg-rose-200">重新加载</button></div>
              ) : view === 'prompt' ? (
                <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.9] text-slate-700 selection:bg-indigo-200">{prompt || <span className="text-slate-500">暂无提示词</span>}</div>
              ) : (
                <div className="divide-y divide-slate-100 text-xs leading-6 text-slate-700">
                  <div className="flex items-center justify-end pb-2"><button type="button" onClick={() => onOpenTagEdit(detail)} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 font-medium text-indigo-700 hover:bg-indigo-50"><Tags className="h-3.5 w-3.5" />修改标签</button></div>
                  {rows.map(([label, value]) => <div key={label} className="py-3"><h3 className="font-semibold text-slate-800">{label}</h3><p className="mt-1 whitespace-pre-wrap text-slate-600">{value}</p></div>)}
                  {textValue(detail.reversePrompt) && <div className="py-3"><h3 className="font-semibold text-slate-800">提取原文</h3><p className="mt-1 whitespace-pre-wrap text-slate-600">{textValue(detail.reversePrompt)}</p></div>}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-5 py-3.5 sm:px-6">
              <button type="button" disabled={loadState !== 'ready' || !prompt} onClick={() => onCopyPrompt(prompt, item.id)} className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
                {copiedId === item.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copiedId === item.id ? '已复制' : '复制提示词'}
              </button>
              <button type="button" disabled={loadState !== 'ready' || Boolean(blockReason)} title={blockReason || undefined} onClick={() => { onApplyToWorkshop(detail); onClose(); }} className="flex min-w-0 flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">应用到工坊</button>
            </div>
          </div>
        </section>
      </div>
    </div>, document.body,
  );
}
