import { useCallback, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Download, Maximize2, Sparkles } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { AtlasFaceItem, AtlasPoseItem } from '@shared/contracts/salesAtlas';
import { POSE_ANGLE_SHORT_LABELS } from '../../model/salesActionViews';
import { ATLAS_GRID_GAP, atlasGridLayout, type AtlasGridDensity } from '../../model/atlasGridLayout';
import { salesFocusClass } from '../salesChrome';

export type { AtlasGridDensity } from '../../model/atlasGridLayout';

const HAIR_LABELS: Record<string, string> = {
  short: '短发',
  medium: '中发',
  semilong: '中长发',
  long: '长发',
};

const SERIES_LABELS: Record<string, string> = {
  full_std: '标准全身',
  upper: '上半身',
  full_sexy: '时尚全身',
  duo: '双人',
};

export function AtlasVirtualGrid({
  tab,
  faces,
  poses,
  density,
  preferredAngle,
  pickerMode = 'import',
  selectedIds,
  importedIds,
  busyId,
  disabled = false,
  onToggleSelect,
  onImportOne,
  onOpenLightbox,
}: {
  tab: 'face' | 'pose';
  faces: readonly AtlasFaceItem[];
  poses: readonly AtlasPoseItem[];
  density: AtlasGridDensity;
  preferredAngle: string;
  pickerMode?: 'import' | 'pick-persona-main';
  selectedIds: ReadonlySet<string>;
  importedIds: ReadonlySet<string>;
  busyId: string;
  disabled?: boolean;
  onToggleSelect: (id: string) => void;
  onImportOne: (id: string, angle?: string) => void;
  onOpenLightbox: (index: number, activeAngle?: string) => void;
}) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [cardAngles, setCardAngles] = useState<Record<string, string>>({});

  const { columns, estimatedRowHeight } = atlasGridLayout(viewportWidth, density);
  const items = tab === 'face' ? faces : poses;
  const totalItems = items.length;
  const rowCount = Math.ceil(totalItems / columns);
  const interactionsDisabled = disabled || Boolean(busyId);
  const getRowKey = useCallback((index: number) => `${tab}:${density}:${columns}:${items[index * columns]?.id || index}`,
    [columns, density, items, tab]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    getItemKey: getRowKey,
    estimateSize: () => estimatedRowHeight,
    overscan: 3,
  });

  useEffect(() => {
    if (!scrollElement) return;
    const measureWidth = () => {
      const style = getComputedStyle(scrollElement);
      setViewportWidth(scrollElement.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0'));
    };
    measureWidth();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureWidth);
    observer?.observe(scrollElement);
    window.addEventListener('resize', measureWidth);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measureWidth); };
  }, [scrollElement]);

  useEffect(() => {
    if (!scrollElement) return;
    rowVirtualizer.scrollToOffset(0);
  }, [items, rowVirtualizer, scrollElement, tab]);

  useEffect(() => {
    rowVirtualizer.measure();
    scrollElement?.querySelectorAll<HTMLElement>('.sales-atlas-row').forEach((row) => rowVirtualizer.measureElement(row));
  }, [columns, density, rowVirtualizer, scrollElement, viewportWidth]);

  return (
    <div ref={setScrollElement} className="sales-atlas-scroll-viewport" aria-label={tab === 'face' ? '人像图鉴网格' : '姿态图鉴网格'}>
      {totalItems === 0 ? <div role="status" className="sales-atlas-grid-empty flex min-h-40 flex-col items-center justify-center px-4 py-6 text-center">
        <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">当前筛选条件下暂无匹配图鉴</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">可尝试切换分类或清空搜索关键词</p>
      </div> : null}
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="sales-atlas-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                columnGap: ATLAS_GRID_GAP,
              }}
            >
              {Array.from({ length: columns }, (_, colOffset) => {
                const itemIndex = startIndex + colOffset;
                if (itemIndex >= totalItems) return null;

                if (tab === 'face') {
                  const face = faces[itemIndex];
                  const selected = selectedIds.has(face.id);
                  const imported = importedIds.has(face.id);
                  const isBusy = busyId === face.id;
                  const hair = HAIR_LABELS[face.hair] || '标准发型';
                  const sec = face.section === 'styling' ? '造型人像' : '纯底正脸';
                  return (
                    <article key={face.id} className={`sales-atlas-card ${selected ? 'is-selected' : ''}`}>
                      <div className="sales-atlas-thumb">
                        {pickerMode === 'import' ? (
                          <button
                            type="button"
                            aria-label={`勾选人像 ${face.id}`}
                            aria-pressed={selected}
                            disabled={interactionsDisabled || imported}
                            onClick={() => onToggleSelect(face.id)}
                            className={`sales-atlas-check ${selected ? 'is-selected' : ''} ${salesFocusClass}`}
                          >
                            {selected ? <Check className="size-3.5" /> : null}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`预览人像 ${face.id} 大图`}
                          onClick={() => onOpenLightbox(itemIndex)}
                          className={`sales-atlas-zoom ${salesFocusClass}`}
                        >
                          <Maximize2 className="size-3.5" />
                        </button>
                        <img
                          src={proxyMediaUrl(face.thumbUrl || face.fullUrl)}
                          alt={`${hair}${sec}`}
                          loading="lazy"
                          onClick={() => onOpenLightbox(itemIndex)}
                          className="cursor-pointer"
                        />
                        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-slate-950/65 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm">
                          {sec} · {hair}
                        </span>
                      </div>
                      <div className="sales-atlas-meta">
                        <div className="sales-atlas-title-row">
                          <span className="sales-atlas-title" title={face.style || `${hair}${sec}`}>
                            {hair} · {sec}
                          </span>
                        </div>
                        <p className="sales-atlas-sub" title={face.style || '正脸锚点参考'}>
                          {face.section === 'styling' ? '造型参考' : '正脸参考'} · #{face.id.slice(0, 6)}
                        </p>
                        <button
                          type="button"
                          disabled={interactionsDisabled || (pickerMode === 'import' && imported)}
                          onClick={() => onImportOne(face.id)}
                          className={`sales-atlas-import-btn ${salesFocusClass}`}
                        >
                          {pickerMode === 'pick-persona-main' ? (
                            <>
                              <Sparkles className="size-3.5" />
                              {isBusy ? '载入主图中…' : '选用为主图'}
                            </>
                          ) : imported ? (
                            <>
                              <Check className="size-3.5" />
                              已入人物库
                            </>
                          ) : (
                            <>
                              <Download className="size-3.5" />
                              {isBusy ? '导入中…' : '导入人物库'}
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                }

                const pose = poses[itemIndex];
                const selected = selectedIds.has(pose.id);
                const imported = importedIds.has(pose.id);
                const isBusy = busyId === pose.id;
                const activeAngle = cardAngles[pose.id] || preferredAngle || 'front';
                const variant = pose.variants.find((v) => v.angle === activeAngle) || pose.variants[0];
                const seriesLabel = SERIES_LABELS[pose.series] || pose.series;
                return (
                  <article key={pose.id} className={`sales-atlas-card ${selected ? 'is-selected' : ''}`}>
                    <div className="sales-atlas-thumb">
                      <button
                        type="button"
                        aria-label={`勾选姿态 ${pose.names.zh || pose.id}`}
                        aria-pressed={selected}
                        disabled={interactionsDisabled || imported}
                        onClick={() => onToggleSelect(pose.id)}
                        className={`sales-atlas-check ${selected ? 'is-selected' : ''} ${salesFocusClass}`}
                      >
                        {selected ? <Check className="size-3.5" /> : null}
                      </button>
                      <button
                        type="button"
                        aria-label={`预览姿态 ${pose.names.zh || pose.id} 大图`}
                        onClick={() => onOpenLightbox(itemIndex, variant?.angle)}
                        className={`sales-atlas-zoom ${salesFocusClass}`}
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                      {variant ? (
                        <img
                          src={proxyMediaUrl(variant.thumbUrl || variant.fullUrl)}
                          alt={pose.names.zh || pose.id}
                          loading="lazy"
                          onClick={() => onOpenLightbox(itemIndex, variant.angle)}
                          className="cursor-pointer"
                        />
                      ) : null}
                      {pose.variants.length > 1 ? (
                        <div className="sales-atlas-angles" role="group" aria-label="切换姿态机位">
                          {pose.variants.map((v) => (
                            <button
                              key={v.angle}
                              type="button"
                              aria-pressed={v.angle === variant?.angle}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCardAngles((prev) => ({ ...prev, [pose.id]: v.angle }));
                              }}
                              className={`sales-atlas-angle-btn ${v.angle === variant?.angle ? 'is-active' : ''}`}
                              title={v.angle}
                            >
                              {POSE_ANGLE_SHORT_LABELS[v.angle] || v.angle.slice(0, 1)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="sales-atlas-meta">
                      <div className="sales-atlas-title-row">
                        <span className="sales-atlas-title" title={pose.names.zh || pose.names.en}>
                          {pose.names.zh || pose.names.en}
                        </span>
                        <span className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                          {pose.variants.length}视角
                        </span>
                      </div>
                      <p className="sales-atlas-sub" title={`${seriesLabel} · ${pose.category} · ${pose.names.en}`}>
                        {seriesLabel} · {pose.category} · #{pose.no}
                      </p>
                      <button
                        type="button"
                        disabled={interactionsDisabled || imported}
                        onClick={() => onImportOne(pose.id, variant?.angle)}
                        className={`sales-atlas-import-btn ${salesFocusClass}`}
                      >
                        {imported ? (
                          <>
                            <Check className="size-3.5" />
                            已入动作库
                          </>
                        ) : (
                          <>
                            <Download className="size-3.5" />
                            {isBusy ? '导入中…' : '导入动作库'}
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

