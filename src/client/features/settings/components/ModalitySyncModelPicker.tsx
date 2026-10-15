import React from 'react';
import type { ModalityKind } from '../model/modalityModelTypes';
import {
  MODALITY_VENDORS_BY_KIND,
  GLOBAL_ALL_VENDORS,
  inferVendorFromModelId,
  vendorOption,
} from '../model/modalityMeta';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { Check } from 'lucide-react';

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
  onToggle: (modelId: string) => void;
  onToggleGroup?: (modelIds: string[], selectAll: boolean) => void;
}

function itemClass(selected: boolean) {
  return selected
    ? 'border-indigo-400/80 bg-indigo-50/90 text-indigo-950 shadow-2xs dark:border-indigo-500/60 dark:bg-indigo-950/40 dark:text-indigo-100'
    : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06]';
}

export function ModalitySyncModelPicker({
  kind,
  items,
  picked,
  activeModelId,
  onToggle,
  onToggleGroup,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 dark:text-slate-500">
        <p className="text-sm">未找到符合条件的模型</p>
        <p className="mt-1 text-xs text-slate-400/80">可尝试清除搜索关键词或切换到全部标签</p>
      </div>
    );
  }

  // 分组归类
  const groups = new Map<string, SyncPickItem[]>();
  for (const item of items) {
    const key = item.vendorId || 'unknown';
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  // 排序：先当前模态常用厂商，再全局其他厂商，最后未知/自建
  const localOrder = (MODALITY_VENDORS_BY_KIND[kind] || []).map((vendor) => vendor.id);
  const globalOrder = GLOBAL_ALL_VENDORS.map((vendor) => vendor.id);

  const keys = Array.from(groups.keys()).sort((left, right) => {
    if (left === 'unknown') return 1;
    if (right === 'unknown') return -1;
    const leftLocal = localOrder.indexOf(left);
    const rightLocal = localOrder.indexOf(right);
    if (leftLocal >= 0 && rightLocal >= 0) return leftLocal - rightLocal;
    if (leftLocal >= 0) return -1;
    if (rightLocal >= 0) return 1;
    const leftGlobal = globalOrder.indexOf(left);
    const rightGlobal = globalOrder.indexOf(right);
    return (leftGlobal < 0 ? 99 : leftGlobal) - (rightGlobal < 0 ? 99 : rightGlobal);
  });

  return (
    <div className="space-y-4">
      {keys.map((key) => {
        const bucket = groups.get(key) || [];
        const vendorName = bucket[0]?.vendorName || (key === 'unknown' ? '未识别' : key);
        const selectedCount = bucket.filter((item) => picked.has(item.modelId)).length;
        const allGroupSelected = selectedCount === bucket.length;

        const handleGroupToggle = () => {
          if (!onToggleGroup) return;
          const ids = bucket.map((item) => item.modelId);
          onToggleGroup(ids, !allGroupSelected);
        };

        return (
          <div key={key} className="rounded-xl bg-slate-50/50 p-2.5 dark:bg-white/[0.015]">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <ModelIcon
                  modelId={key === 'unknown' ? bucket[0]?.modelId || '' : key}
                  className="h-4 w-4 shrink-0 object-contain"
                />
                <span>{vendorName}</span>
                <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-400">
                  {selectedCount}/{bucket.length}
                </span>
              </div>
              {onToggleGroup && (
                <button
                  type="button"
                  onClick={handleGroupToggle}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  {allGroupSelected ? '取消全选' : '本组全选'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bucket.map((item) => {
                const selected = picked.has(item.modelId);
                const isCurrent = activeModelId === item.modelId;
                return (
                  <button
                    key={item.modelId}
                    type="button"
                    onClick={() => onToggle(item.modelId)}
                    className={`group flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-all ${itemClass(
                      selected,
                    )}`}
                    title={item.modelId}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          selected
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow-2xs dark:border-indigo-500 dark:bg-indigo-500'
                            : 'border-slate-300 bg-white group-hover:border-slate-400 dark:border-white/20 dark:bg-white/5'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" strokeWidth={2.5} />}
                      </span>
                      <span className="truncate font-mono text-[11px] leading-tight" title={item.modelId}>
                        {item.modelId}
                      </span>
                    </div>
                    {isCurrent && (
                      <span className="shrink-0 rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-medium text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                        当前
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
