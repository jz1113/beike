import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { fetchAssetDetail } from '@client/shared/api/assetLibraryCache';
import { workshopAssetBlockReason, type WorkshopAssetCandidate } from '@shared/domain/workshop/workshop-pipeline';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { ArrowLeft, ArrowRight, ExternalLink, ImageOff, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type GroupPreviewItem = Record<string, unknown> & { id: string };

export interface FullPromptGroupPreviewProps {
  item: GroupPreviewItem;
  productCategories: AssetProductCategory[];
  albums: PromptAlbum[];
  listPosition?: number;
  initialIndex?: number;
  copiedId: string | null;
  onClose: () => void;
  onCopyPrompt: (text: string, id: string) => void;
  onApplyToWorkshop: (detail: GroupPreviewItem) => void;
  onOpenTagEdit: (detail: GroupPreviewItem) => void;
  onOpenEdit: (detail: GroupPreviewItem) => void;
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampShotIndex(value: number | undefined): number {
  return Number.isInteger(value) ? Math.min(3, Math.max(0, value as number)) : 0;
}

export function FullPromptGroupPreview({
  item,
  listPosition,
  initialIndex,
  onClose,
  onApplyToWorkshop,
  onOpenEdit,
}: FullPromptGroupPreviewProps) {
  const needsDetail = typeof item.sourceImages !== 'string' || typeof item.shotPromptsJson !== 'string';
  const [detail, setDetail] = useState<GroupPreviewItem>(item);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(needsDetail ? 'loading' : 'ready');
  const [selectedShot, setSelectedShot] = useState(() => clampShotIndex(initialIndex));
  const [view, setView] = useState<'group' | 'shot'>(initialIndex === undefined ? 'group' : 'shot');
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [directImages, setDirectImages] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLElement>(null);

  const sourceImages = useMemo(() => jsonArray(detail.sourceImages).map(stringValue), [detail.sourceImages]);
  const sourceIndices = useMemo(() => jsonArray(detail.sourceImageIndices).slice(0, 4).map(
    (index) => Number.isInteger(index) && Number(index) > 0 ? Number(index) : null,
  ), [detail.sourceImageIndices]);
  const sourceIndex = Number.isInteger(detail.sourceImageIndex) ? Number(detail.sourceImageIndex) : null;
  const coverUrl = stringValue(detail.coverUrl);
  const frames = Array.from({ length: 4 }, (_, position) => {
    const originalIndex = sourceIndices[position]
      ?? (sourceIndices.length === 0 && sourceImages[position] ? position + 1 : null)
      ?? (position === 0 && sourceIndices.length === 0 ? sourceIndex : null);
    const image = originalIndex === null ? '' : sourceImages[originalIndex - 1] || '';
    return {
      originalIndex,
      url: image || (position === 0 && (sourceIndices.length === 0 || originalIndex === sourceIndex) ? coverUrl : ''),
    };
  });

  const title = fullPromptGroupLabel(listPosition ?? detail.displayNumber);
  const productionBlockReason = loadState === 'ready'
    ? workshopAssetBlockReason(detail as unknown as WorkshopAssetCandidate, 'full_prompt')
    : null;

  useEffect(() => {
    if (!needsDetail) return;
    let cancelled = false;
    void fetchAssetDetail('full_prompt', item.id)
      .then((full) => {
        if (cancelled) return;
        if (!full) {
          setLoadState('error');
          return;
        }
        setDetail((previous) => ({ ...previous, ...full }));
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [item.id, needsDetail]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (view === 'shot' && event.key === 'ArrowLeft') {
        event.preventDefault();
        setSelectedShot((prev) => (prev + 3) % 4);
      } else if (view === 'shot' && event.key === 'ArrowRight') {
        event.preventDefault();
        setSelectedShot((prev) => (prev + 1) % 4);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, view]);

  return createPortal(
    <div
      className="fixed inset-0 z-[130] overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-md sm:p-6"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center">
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} 图组预览`}
          className="relative flex w-full max-w-[660px] flex-col gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-2.5 text-white shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold tabular-nums">{title}</h2>
              <div className="flex items-center gap-1 rounded-xl bg-white/[0.08] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setView('group')}
                  className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                    view === 'group' ? 'bg-white text-slate-900 shadow-2xs' : 'text-white/70 hover:text-white'
                  }`}
                >
                  四宫格
                </button>
                {frames.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setSelectedShot(idx); setView('shot'); }}
                    className={`rounded-lg px-2 py-1 font-medium transition-colors cursor-pointer ${
                      view === 'shot' && selectedShot === idx ? 'bg-white text-slate-900 shadow-2xs' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    #{idx + 1}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenEdit(detail)}
                className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/20 cursor-pointer"
              >
                移动分类
              </button>
              <button
                type="button"
                disabled={loadState !== 'ready' || Boolean(productionBlockReason)}
                title={productionBlockReason || undefined}
                onClick={() => onApplyToWorkshop(detail)}
                className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                载入图组
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭图组预览"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative w-full">
            {view === 'group' ? (
              <div className="grid aspect-[3/4] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-[22px] bg-slate-900/90 shadow-2xl ring-1 ring-white/15">
                {frames.map((frame, index) => {
                  const directUrl = frame.url.startsWith('//') ? `https:${frame.url}` : frame.url;
                  const proxiedUrl = directUrl ? proxyMediaUrl(directUrl) : '';
                  const useDirect = directImages.has(frame.url);
                  const imageUrl = useDirect ? directUrl : proxiedUrl;
                  const hasImage = Boolean(imageUrl) && !brokenImages.has(frame.url);
                  return (
                    <div key={index} className="group relative min-h-0 min-w-0">
                      <button
                        type="button"
                        onClick={() => { setSelectedShot(index); setView('shot'); }}
                        aria-label={`查看第 ${index + 1} 镜大图`}
                        className="relative flex h-full w-full items-center justify-center overflow-hidden bg-slate-900 cursor-zoom-in"
                      >
                        {hasImage ? (
                          <img
                            src={imageUrl}
                            alt={`${title} 第 ${index + 1} 镜`}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            onError={() => {
                              if (!useDirect && directUrl && imageUrl !== directUrl) {
                                setDirectImages((previous) => new Set(previous).add(frame.url));
                              } else {
                                setBrokenImages((previous) => new Set(previous).add(frame.url));
                              }
                            }}
                          />
                        ) : loadState === 'loading' ? (
                          <span className="flex h-full w-full animate-pulse items-center justify-center text-xs text-white/40">正在读取画面…</span>
                        ) : (
                          <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-white/40"><ImageOff className="h-6 w-6" />原图暂不可用</span>
                        )}
                      </button>
                      {hasImage && (
                        <a
                          href={imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          title="在新标签页查看原图"
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/70 text-white/90 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-950"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[22px] bg-slate-900/95 shadow-2xl ring-1 ring-white/15">
                {(() => {
                  const frame = frames[selectedShot];
                  const directUrl = frame.url.startsWith('//') ? `https:${frame.url}` : frame.url;
                  const proxiedUrl = directUrl ? proxyMediaUrl(directUrl) : '';
                  const useDirect = directImages.has(frame.url);
                  const imageUrl = useDirect ? directUrl : proxiedUrl;
                  const hasImage = Boolean(imageUrl) && !brokenImages.has(frame.url);
                  return hasImage ? (
                    <img
                      src={imageUrl}
                      alt={`${title} 第 ${selectedShot + 1} 镜`}
                      className="h-full w-full object-contain"
                      onError={() => {
                        if (!useDirect && directUrl && imageUrl !== directUrl) {
                          setDirectImages((previous) => new Set(previous).add(frame.url));
                        } else {
                          setBrokenImages((previous) => new Set(previous).add(frame.url));
                        }
                      }}
                    />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-xs text-white/40"><ImageOff className="h-6 w-6" />原图暂不可用</span>
                  );
                })()}
                <button type="button" aria-label="上一镜" onClick={() => setSelectedShot((selectedShot + 3) % 4)} className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/75 text-white shadow-xl backdrop-blur-sm transition-transform hover:scale-105 hover:bg-slate-950 cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>
                <button type="button" aria-label="下一镜" onClick={() => setSelectedShot((selectedShot + 1) % 4)} className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/75 text-white shadow-xl backdrop-blur-sm transition-transform hover:scale-105 hover:bg-slate-950 cursor-pointer"><ArrowRight className="h-5 w-5" /></button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

export default FullPromptGroupPreview;
