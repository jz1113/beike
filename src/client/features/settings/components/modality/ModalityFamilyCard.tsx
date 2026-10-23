import React, { useMemo, useState } from 'react';
import type { GenerationRowItem, VariantItem } from '@shared/domain/models/modelGrouping';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { Check, ChevronDown, ChevronUp, History } from 'lucide-react';

export interface ModalityFamilyCardProps {
  row: GenerationRowItem;
  picked: Set<string>;
  activeModelId?: string;
  onToggle: (modelId: string) => void;
  onToggleGroup?: (modelIds: string[], selectAll: boolean) => void;
}

export function ModalityFamilyCard({
  row,
  picked,
  activeModelId,
  onToggle,
  onToggleGroup,
}: ModalityFamilyCardProps) {
  // 单模型行（无多子变体分支，如单纯的 GPT 6 或 GPT 5.1）
  const isSingleVariantRow = row.variants.length === 1;

  const [isExpanded, setIsExpanded] = useState(false);
  // 快照浮层
  const [expandedSnapshotKey, setExpandedSnapshotKey] = useState<string | null>(null);

  // 统计已选规格数
  const selectedCount = useMemo(
    () => row.allModelIds.filter((id) => picked.has(id)).length,
    [row.allModelIds, picked],
  );
  const isAllSelected = selectedCount === row.allModelIds.length && row.allModelIds.length > 0;

  const pickedVariants = useMemo(
    () => row.variants.filter((variant) => variant.allModelIds.some((id) => picked.has(id))),
    [row.variants, picked],
  );

  // 展开时只留计数，避免和下面的胶囊重复；收起时最多展示两个规格名。
  const displaySummary = useMemo(() => {
    if (isSingleVariantRow) {
      return row.variants[0]?.variantKey !== 'default' ? row.variants[0]?.displayName || '' : '';
    }
    if (isExpanded) {
      return selectedCount > 0 ? `${selectedCount}/${row.allModelIds.length}` : `${row.variants.length} 规格`;
    }
    if (pickedVariants.length === 0) return `${row.variants.length} 规格`;
    if (pickedVariants.length <= 2) return pickedVariants.map((variant) => variant.displayName).join('、');
    return `已选 ${selectedCount} 项`;
  }, [isExpanded, isSingleVariantRow, pickedVariants, row.allModelIds.length, row.variants, selectedCount]);

  const hasPickedSummary = selectedCount > 0 && !isExpanded;

  const toggleIds = (modelIds: string[], selectAll: boolean) => {
    if (onToggleGroup) {
      onToggleGroup(modelIds, selectAll);
      return;
    }
    for (const modelId of modelIds) {
      const selected = picked.has(modelId);
      if (selectAll !== selected) onToggle(modelId);
    }
  };

  // 复选框点击：全选 / 清空当前行下的全部规格，包括历史快照
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleIds(row.allModelIds, !isAllSelected);
  };

  // 行主体点击：单模型行切换该规格的全部 ID，多变体行展开规格舱
  const handleRowClick = () => {
    if (isSingleVariantRow) {
      toggleIds(row.allModelIds, !isAllSelected);
      return;
    }
    setIsExpanded((prev) => !prev);
  };

  return (
    <div
      className={`group flex flex-col rounded-xl transition-colors duration-150 ${
        isExpanded
          ? 'bg-slate-50 dark:bg-white/[0.04]'
          : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
      }`}
    >
      {/* 1. 主代际行（极简紧凑 38px，图 2 像素级还原） */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowClick();
          }
        }}
        className="flex min-h-9 cursor-pointer items-center justify-between gap-2.5 px-2.5 py-1.5 select-none"
      >
        {/* 左侧：复选框 + 品牌图标 + 代际名称 */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCheckboxClick}
            aria-label={isAllSelected ? '取消选择' : '选择'}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
              isAllSelected
                ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950'
                : selectedCount > 0
                ? 'border-slate-900 bg-white text-slate-900 dark:border-white dark:bg-transparent dark:text-white'
                : 'border-slate-300 bg-white hover:border-slate-400 dark:border-white/20 dark:bg-transparent'
            }`}
          >
            {isAllSelected ? (
              <Check className="h-3 w-3 stroke-[2.5]" />
            ) : selectedCount > 0 ? (
              <span className="h-0.5 w-2 rounded-full bg-current" />
            ) : null}
          </button>

          <ModelIcon
            modelId={row.vendorId === 'unknown' ? row.familyId : row.vendorId}
            className="h-4 w-4 shrink-0 object-contain"
          />

          <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
            {row.generationLabel}
          </span>
        </div>

        {/* 右侧：规格状态摘要与指示 */}
        <div className="flex shrink-0 items-center gap-1 text-xs">
          {displaySummary && (
            <span
              className={`max-w-[7.5rem] truncate text-[11px] tabular-nums ${
                hasPickedSummary
                  ? 'font-medium text-slate-700 dark:text-slate-200'
                  : 'text-slate-400 group-hover:text-slate-500 dark:text-slate-500'
              }`}
            >
              {displaySummary}
            </span>
          )}

          {!isSingleVariantRow && (
            <span className="text-slate-400">
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </div>
      </div>

      {/* 2. 展开的内联规格舱（Inline Variant Tray，无多余Logo，高对比度胶囊） */}
      {isExpanded && !isSingleVariantRow && row.variants.length > 0 && (
        <div className="mx-2 mb-2 rounded-xl border border-slate-200/70 bg-slate-100/80 p-1.5 dark:border-white/[0.06] dark:bg-black/25">
          <div className="flex flex-wrap items-center gap-1">
            {row.variants.map((variant: VariantItem) => {
              const isPicked = variant.allModelIds.length > 0 && variant.allModelIds.every((modelId) => picked.has(modelId));
              const isCurrent = variant.allModelIds.includes(activeModelId || '');
              const hasSnapshots = variant.snapshots.length > 0;
              const isSnapshotsExpanded = expandedSnapshotKey === variant.variantKey;

              return (
                <div key={variant.variantKey} className="relative flex flex-col">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleIds(variant.allModelIds, !isPicked)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleIds(variant.allModelIds, !isPicked);
                      }
                    }}
                    className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition select-none ${
                      isPicked
                        ? 'border-slate-300/90 bg-white text-slate-900 shadow-[0_1px_2px_rgba(28,25,23,0.06)] dark:border-white/20 dark:bg-white/[0.14] dark:text-white'
                        : 'border-transparent bg-white/50 text-slate-500 hover:bg-white/90 hover:text-slate-800 dark:bg-white/[0.03] dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-slate-200'
                    }`}
                    title={variant.primaryModelId}
                  >
                    {isPicked && <Check className="h-3 w-3 stroke-[2.5]" />}
                    <span className="truncate">{variant.displayName}</span>

                    {isCurrent && (
                      <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                        当前
                      </span>
                    )}

                    {hasSnapshots && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedSnapshotKey((prev) =>
                            prev === variant.variantKey ? null : variant.variantKey,
                          );
                        }}
                        className="ml-0.5 flex items-center rounded px-0.5 py-0.2 text-[8px] opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                        title={`展开 ${variant.snapshots.length} 个快照`}
                      >
                        <History className="mr-0.5 h-2 w-2" />
                        <span>{variant.snapshots.length}</span>
                      </button>
                    )}
                  </div>

                  {/* 历史快照版本悬浮抽屉 */}
                  {hasSnapshots && isSnapshotsExpanded && (
                    <div className="absolute top-full left-0 z-10 mt-1 flex min-w-[132px] flex-col gap-0.5 rounded-xl border border-slate-200/90 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#1b1b1e]">
                      <span className="px-1.5 py-0.5 text-[10px] text-slate-400">历史快照</span>
                      {variant.snapshots.map((snap) => {
                        const isSnapPicked = picked.has(snap.modelId);
                        return (
                          <button
                            key={snap.modelId}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggle(snap.modelId);
                            }}
                            className={`flex items-center justify-between rounded-lg px-2 py-1 text-[10px] font-mono transition ${
                              isSnapPicked
                                ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-white/10 dark:text-white'
                                : 'text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
                            }`}
                          >
                            <span>{snap.date}</span>
                            {isSnapPicked && <Check className="h-2.5 w-2.5 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
