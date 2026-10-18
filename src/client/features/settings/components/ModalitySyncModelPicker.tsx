import React, { useEffect, useMemo } from 'react';
import type { ModalityKind } from '../model/modalityModelTypes';
import {
  inferVendorFromModelId,
  vendorOption,
} from '../model/modalityMeta';
import { groupModelsByGeneration } from '../model/modelGrouping';
import { ModalityFamilyCard } from './ModalityFamilyCard';
import { ModelIcon } from '@client/shared/ui/ModelIcons';

export interface SyncPickItem {
  modelId: string;
  vendorId: string;
  vendorName: string;
}

export function describeSyncModels(kind: ModalityKind, modelIds: string[]): SyncPickItem[] {
  return modelIds.map((modelId) => {
    const vendorId = inferVendorFromModelId(modelId, kind);
    return {
      modelId,
      vendorId: vendorId || 'unknown',
      vendorName: vendorOption(kind, vendorId)?.name || (vendorId ? vendorId : '未识别'),
    };
  });
}

interface Props {
  kind: ModalityKind;
  items: SyncPickItem[];
  picked: Set<string>;
  activeModelId?: string;
  showArchived?: boolean;
  onArchivedCount?: (count: number) => void;
  onToggle: (modelId: string) => void;
  onToggleGroup?: (modelIds: string[], selectAll: boolean) => void;
}

export function ModalitySyncModelPicker({
  kind,
  items,
  picked,
  activeModelId,
  showArchived = false,
  onArchivedCount,
  onToggle,
  onToggleGroup,
}: Props) {
  const modelIds = useMemo(() => items.map((item) => item.modelId), [items]);

  // 1. 代际行结构（图 2 风格）
  const generationSections = useMemo(
    () => groupModelsByGeneration(modelIds, kind),
    [modelIds, kind],
  );

  // 统计已淘汰的早期历史模型总数
  const totalArchivedCount = useMemo(() => {
    let count = 0;
    for (const sec of generationSections) {
      for (const row of sec.rows) {
        if (row.isArchived) count += row.allModelIds.length;
      }
    }
    return count;
  }, [generationSections]);

  useEffect(() => {
    onArchivedCount?.(totalArchivedCount);
  }, [onArchivedCount, totalArchivedCount]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 dark:text-slate-500">
        <p className="text-sm">未找到符合条件的模型</p>
        <p className="mt-1 text-xs text-slate-400/80">可尝试清除搜索关键词或切换到全部标签</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
        {generationSections.map((section) => {
          const visibleRows = section.rows.filter(
            (row) => showArchived || !row.isArchived,
          );

          if (visibleRows.length === 0) return null;

          const allSectionIds = visibleRows.flatMap((r) => r.allModelIds);
          const sectionSelectedCount = allSectionIds.filter((id) => picked.has(id)).length;
          const isAllSectionSelected =
            allSectionIds.length > 0 && sectionSelectedCount === allSectionIds.length;

          const handleToggleSection = () => {
            if (!onToggleGroup) return;
            onToggleGroup(allSectionIds, !isAllSectionSelected);
          };

          return (
            <div
              key={section.vendorId}
              className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#1b1b1e]"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                  <ModelIcon
                    modelId={section.vendorId === 'unknown' ? 'custom' : section.vendorId}
                    className="h-4 w-4 shrink-0 object-contain"
                  />
                  <span className="truncate">{section.vendorName}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500 dark:bg-white/10 dark:text-slate-400">
                    {sectionSelectedCount}/{allSectionIds.length}
                  </span>
                </div>
                {onToggleGroup && (
                  <button
                    type="button"
                    onClick={handleToggleSection}
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    {isAllSectionSelected ? '取消全选' : '全选'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 items-start gap-0.5 px-1.5 pb-1.5 md:grid-cols-2">
                {visibleRows.map((row) => (
                  <ModalityFamilyCard
                    key={row.rowId}
                    row={row}
                    picked={picked}
                    activeModelId={activeModelId}
                    onToggle={onToggle}
                    onToggleGroup={onToggleGroup}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
