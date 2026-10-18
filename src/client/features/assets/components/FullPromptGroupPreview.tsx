import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { fetchAssetDetail } from '@client/shared/api/assetLibraryCache';
import { parseGroupShotSkeleton } from '@shared/domain/workshop/workshop-pipeline/storyboardSlots';
import { workshopAssetBlockReason, type WorkshopAssetCandidate } from '@shared/domain/workshop/workshop-pipeline';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { parseAssetDimensions } from '../model/assetPromptConstants';
import { recognizedPromptGroupSubcategory, promptGroupSubcategoryLabel } from '../model/promptGroupSubcategory';
import { promptGroupCategoryKey, promptGroupCategoryLabel } from '../model/promptGroupCategory';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, ImageOff, Tags, X } from 'lucide-react';
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
  productCategories,
  albums,
  listPosition,
  initialIndex,
  copiedId,
  onClose,
  onCopyPrompt,
  onApplyToWorkshop,
  onOpenTagEdit,
  onOpenEdit,
}: FullPromptGroupPreviewProps) {
  const needsDetail = !stringValue(item.reversePromptZh)
    || typeof item.sourceImages !== 'string'
    || typeof item.shotPromptsJson !== 'string';
  const [detail, setDetail] = useState<GroupPreviewItem>(item);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(needsDetail ? 'loading' : 'ready');
  const [retryCount, setRetryCount] = useState(0);
  const [selectedShot, setSelectedShot] = useState(() => clampShotIndex(initialIndex));
  const [view, setView] = useState<'group' | 'shot' | 'info'>(initialIndex === undefined ? 'group' : 'shot');
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [directImages, setDirectImages] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLElement>(null);
  const promptScrollRef = useRef<HTMLDivElement>(null);

  const sourceImages = useMemo(() => jsonArray(detail.sourceImages).map(stringValue), [detail.sourceImages]);
  const sourceIndices = useMemo(() => jsonArray(detail.sourceImageIndices).slice(0, 4).map(
    (index) => Number.isInteger(index) && Number(index) > 0 ? Number(index) : null,
  ), [detail.sourceImageIndices]);
  const shots = useMemo(() => parseGroupShotSkeleton(detail.shotPromptsJson), [detail.shotPromptsJson]);
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
      shot: shots.find((candidate) => candidate.shot_no === position + 1) || shots[position],
    };
  });

  const groupPrompt = stringValue(detail.reversePromptZh) || stringValue(detail.reversePrompt);
  const activeShot = frames[selectedShot].shot;
  const shotPrompt = stringValue(activeShot?.prompt)
    || [activeShot?.scene, activeShot?.action, activeShot?.angle, activeShot?.lighting_type]
      .filter(Boolean).join('；');
  const promptText = view === 'group' ? groupPrompt : shotPrompt;
  const copyKey = `${item.id}:${view === 'group' ? 'group' : selectedShot + 1}`;
  const title = fullPromptGroupLabel(detail.displayNumber ?? listPosition);
  const majorCategory = promptGroupCategoryKey(detail, productCategories, albums);
  const subcategory = recognizedPromptGroupSubcategory(detail.productSubcategory, productCategories, majorCategory);
  const productionBlockReason = loadState === 'ready'
    ? workshopAssetBlockReason(detail as unknown as WorkshopAssetCandidate, 'full_prompt')
    : null;
  const sourceMother = detail.sourceMother as { displayNumber?: number | null; available?: boolean } | null | undefined;
  const isDerived = detail.provenance === 'workshop_generated' || Boolean(sourceMother);
  const dimensions = parseAssetDimensions(detail.dimensions);
  const infoSections = [
    ['整条内容', stringValue(detail.contentSummary)],
    ['固定图组架构', stringValue(detail.architectureSummary)],
    ['场景', stringValue(detail.sceneSummary)],
    ['人物', stringValue(detail.personaSummary)],
    ['穿搭', stringValue(detail.outfitSummary)],
    ['动作', stringValue(detail.actionSummary)],
  ].filter((entry) => entry[1]);

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
  }, [item.id, needsDetail, retryCount]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('[role="tab"]')?.focus();
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
      } else if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || [])
          .filter((element) => element.getClientRects().length > 0);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, [contenteditable="true"]')) return;
        event.preventDefault();
        setSelectedShot((previous) => (previous + (event.key === 'ArrowRight' ? 1 : 3)) % 4);
        setView('shot');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (promptScrollRef.current) promptScrollRef.current.scrollTop = 0;
  }, [view, selectedShot]);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/50 px-3 py-5 backdrop-blur-[8px] sm:px-6 lg:px-8 lg:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget || event.target === dialogRef.current?.parentElement || event.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${title}母版图片与提示词`}
        className="relative flex w-full max-w-[1270px] flex-col items-center justify-center gap-5 text-slate-900 lg:flex-row lg:gap-8 xl:gap-12 dark:text-slate-100"
      >
        <div className="relative w-full max-w-[min(680px,calc((100dvh-5rem)*0.75))] shrink-0 lg:w-[min(52vw,calc((100dvh-5rem)*0.75),700px)]">
            <div className="grid aspect-[3/4] grid-cols-2 grid-rows-2 overflow-hidden rounded-[22px] bg-slate-100 shadow-[0_28px_72px_rgba(15,23,42,0.28)] ring-1 ring-white/60 dark:bg-white/10">
              {frames.map((frame, index) => {
                const directUrl = frame.url.startsWith('//') ? `https:${frame.url}` : frame.url;
                const proxiedUrl = directUrl ? proxyMediaUrl(directUrl) : '';
                const useDirect = directImages.has(frame.url);
                const imageUrl = useDirect ? directUrl : proxiedUrl;
                const hasImage = Boolean(imageUrl) && !brokenImages.has(frame.url);
                const active = view === 'shot' && selectedShot === index;
                return (
                  <div key={index} className="group relative min-h-0 min-w-0">
                    <button
                      type="button"
                      onClick={() => { setSelectedShot(index); setView('shot'); }}
                      aria-label={`查看第 ${index + 1} 镜${frame.shot?.title ? `：${frame.shot.title}` : ''}的提示词`}
                      aria-pressed={active}
                      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-slate-100 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white dark:bg-white/10 ${active ? 'z-10' : ''}`}
                    >
                      {hasImage ? (
                        <>
                        <img src={imageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-xl" />
                        <img
                          src={imageUrl}
                          alt={`第 ${index + 1} 镜，原图 ${frame.originalIndex ?? '未知'}`}
                          className="relative h-full w-full object-contain transition-[filter] duration-200 group-hover:brightness-[0.96]"
                          onError={() => {
                            if (!useDirect && directUrl && imageUrl !== directUrl) {
                              setDirectImages((previous) => new Set(previous).add(frame.url));
                            } else {
                              setBrokenImages((previous) => new Set(previous).add(frame.url));
                            }
                          }}
                        />
                        </>
                      ) : loadState === 'loading' ? (
                        <span className="flex h-full w-full animate-pulse items-center justify-center bg-slate-50 text-xs text-slate-400 dark:bg-white/5">正在读取画面…</span>
                      ) : (
                        <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-xs text-slate-400 dark:bg-white/5"><ImageOff className="h-6 w-6" />原图暂不可用</span>
                      )}
                      {active && <span aria-hidden="true" className="pointer-events-none absolute inset-0 ring-[3px] ring-inset ring-white/95" />}
                    </button>
                    {hasImage && (
                      <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`在新标签页查看第 ${index + 1} 镜预览图`}
                        title="在新标签页查看预览图"
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm opacity-100 transition-colors hover:bg-white hover:text-indigo-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 dark:text-slate-200 dark:hover:bg-white/10 dark:bg-[#18191c]/95"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            {view === 'shot' && <>
              <button type="button" aria-label="上一镜" onClick={() => setSelectedShot((selectedShot + 3) % 4)} className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/75 text-white shadow-xl backdrop-blur-sm transition-transform hover:scale-105 hover:bg-slate-950 sm:-left-5 xl:-left-12"><ArrowLeft className="h-5 w-5" /></button>
              <button type="button" aria-label="下一镜" onClick={() => setSelectedShot((selectedShot + 1) % 4)} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/75 text-white shadow-xl backdrop-blur-sm transition-transform hover:scale-105 hover:bg-slate-950 sm:-right-5 xl:-right-12"><ArrowRight className="h-5 w-5" /></button>
            </>}
        </div>

          <div className="flex h-[min(68dvh,650px)] min-h-[390px] w-full max-w-[480px] flex-col overflow-hidden rounded-[24px] border border-white/75 bg-white shadow-[0_28px_72px_rgba(15,23,42,0.22)] lg:w-[min(36vw,440px)] lg:max-w-none dark:bg-[#18191c]">
            <div className="shrink-0 px-5 pb-3 pt-5 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tracking-[0.12em] text-slate-400">四镜图组母本</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium ${promptGroupCategoryLabel(detail, productCategories, albums) !== '待分类' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>商品大类：{promptGroupCategoryLabel(detail, productCategories, albums)}</span>
                    {majorCategory !== 'unclassified' && <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium ${subcategory ? 'bg-slate-100 text-slate-600 dark:text-slate-300 dark:bg-white/10' : 'bg-amber-50 text-amber-700'}`}>商品细分：{promptGroupSubcategoryLabel(detail.productSubcategory, productCategories, majorCategory)}</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{view === 'info' ? '来源与可复用规则' : '查看整组结构或逐镜提示词'}</p>
                </div>
                <button type="button" onClick={onClose} aria-label="关闭图组预览" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:hover:text-white dark:text-slate-400 dark:hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div role="tablist" aria-label="提示词范围" className="mt-4 flex gap-4 overflow-x-auto border-b border-slate-100 dark:border-white/10">
                <button type="button" role="tab" aria-label="整组提示词" aria-selected={view === 'group'} onClick={() => setView('group')} className={`shrink-0 border-b-2 pb-2.5 text-xs font-medium transition-colors ${view === 'group' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400'}`}>整组</button>
                {frames.map((_, index) => (
                  <button key={index} type="button" role="tab" aria-selected={view === 'shot' && selectedShot === index} onClick={() => { setSelectedShot(index); setView('shot'); }} className={`shrink-0 border-b-2 pb-2.5 text-xs font-medium transition-colors ${view === 'shot' && selectedShot === index ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400'}`}>镜头 {index + 1}</button>
                ))}
                <button type="button" role="tab" aria-label="母本信息" aria-selected={view === 'info'} onClick={() => setView('info')} className={`shrink-0 border-b-2 pb-2.5 text-xs font-medium transition-colors ${view === 'info' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-400'}`}>信息</button>
              </div>
              {loadState === 'ready' && productionBlockReason && <p className="mt-2 text-[11px] text-amber-700">暂不可载入：{productionBlockReason}</p>}
            </div>

            <div ref={promptScrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2.5 sm:px-6">
              {loadState === 'loading' ? (
                <div role="status" className="space-y-3 animate-pulse py-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">正在读取母版图片与提示词…</span>
                  <div className="h-3 w-full rounded bg-slate-200 dark:bg-white/10" />
                  <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="h-3 w-4/6 rounded bg-slate-200 dark:bg-white/10" />
                </div>
              ) : loadState === 'error' ? (
                <div role="alert" className="rounded-xl bg-rose-50 p-4 text-xs text-rose-700">
                  <p>母版详情读取失败，请重试。</p>
                  <button type="button" onClick={() => { setLoadState('loading'); setRetryCount((count) => count + 1); }} className="mt-3 rounded-lg bg-rose-100 px-3 py-1.5 font-medium hover:bg-rose-200">重新加载</button>
                </div>
              ) : view === 'shot' && (
                <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-indigo-700">镜头 {selectedShot + 1}{activeShot?.title ? ` · ${activeShot.title}` : ''}</h4>
                    <span className="shrink-0 text-[11px] text-slate-400">原图 #{frames[selectedShot].originalIndex ?? '—'}</span>
                  </div>
                  {activeShot?.scene && <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200"><span className="text-slate-400">场景 </span>{activeShot.scene}</p>}
                  {activeShot?.action && <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200"><span className="text-slate-400">动作 </span>{activeShot.action}</p>}
                </div>
              )}
              {loadState === 'ready' && view === 'info' && (
                <div className="space-y-5 text-xs leading-6 text-slate-700 dark:text-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                      <p className="text-slate-500 dark:text-slate-400">{isDerived
                        ? sourceMother?.displayNumber
                          ? `来源母本 ${fullPromptGroupLabel(sourceMother.displayNumber)}${sourceMother.available === false ? ' · 已删除' : ''}`
                          : '衍生母本 · 来源编号未记录'
                        : '原始母本'}{stringValue(detail.albumName) ? ` · 所属图集：${stringValue(detail.albumName)}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => onOpenEdit(detail)} className="rounded-lg bg-indigo-50 px-2.5 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100">校正分类</button>
                      <button type="button" onClick={() => onOpenTagEdit(detail)} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 font-medium text-indigo-700 hover:bg-indigo-50 dark:bg-white/5"><Tags className="h-3.5 w-3.5" />修改标签</button>
                    </div>
                  </div>
                  {infoSections.length > 0 && <div className="divide-y divide-slate-200/70 border-t border-slate-200/70 dark:border-white/10">
                    {infoSections.map(([label, value]) => <div key={label} className="py-3"><h4 className="font-semibold text-slate-800 dark:text-slate-100">{label}</h4><p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{value}</p></div>)}
                  </div>}
                  {dimensions.length > 0 && <div className="border-t border-slate-200/70 pt-4 dark:border-white/10">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-100">视觉分析</h4>
                    <div className="mt-2 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                      {dimensions.map((dimension) => <div key={dimension.key}><span className="font-medium text-slate-700 dark:text-slate-200">{dimension.label}</span><p className="text-slate-500 dark:text-slate-400">{dimension.value}</p></div>)}
                    </div>
                  </div>}
                </div>
              )}
              {loadState === 'ready' && view !== 'info' && (
                <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.9] text-slate-700 selection:bg-indigo-200 dark:text-slate-200">
                  {promptText || <span className="text-slate-500 dark:text-slate-400">暂无{view === 'group' ? '整组' : '此镜头'}提示词</span>}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-5 py-3.5 sm:px-6 dark:border-white/10">
              {view !== 'info' && <button type="button" disabled={!promptText} onClick={() => onCopyPrompt(promptText, copyKey)} className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10">
                {copiedId === copyKey ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copiedId === copyKey ? '已复制' : '复制提示词'}
              </button>}
              <button type="button" disabled={loadState !== 'ready' || Boolean(productionBlockReason)} title={productionBlockReason || undefined} onClick={() => onApplyToWorkshop(detail)} className="flex min-w-0 flex-1 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">载入图组</button>
            </div>
          </div>
      </section>
      </div>
    </div>,
    document.body,
  );
}

export default FullPromptGroupPreview;
