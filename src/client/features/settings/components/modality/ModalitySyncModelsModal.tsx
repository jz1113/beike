import React, { useEffect, useMemo, useState } from 'react';
import type { ModalityChannelOption, ModalityKind, ModalityModelItem } from '../../model/modalityModelTypes';
import { MODALITY_TITLES, isModelMatchModality, compareModelVersionsDesc } from '../../model/modalityMeta';
import { groupModelsByGeneration } from '@shared/domain/models/modelGrouping';
import { describeSyncModels, ModalitySyncModelPicker } from './ModalitySyncModelPicker';
import { ModalitySyncChannelPicker } from './ModalitySyncChannelPicker';
import { useSettingsDialogFocus } from '../../hooks/useSettingsDialogFocus';
import { CheckCheck, Eye, EyeOff, RotateCcw, RotateCw, Search, Sparkles, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  kind: ModalityKind;
  baseUrl: string;
  channels: ModalityChannelOption[];
  channelId: string;
  onChannelChange: (channelId: string) => void;
  remoteModels: string[];
  isSyncing: boolean;
  onReSync: () => void;
  activeModel?: ModalityModelItem;
  currentModels?: ModalityModelItem[];
  onBatchSync?: (selectedModelIds: string[], candidateEntries: Array<{ modelId: string; vendor: string }>) => void;
  onBatchImport?: (entries: Array<{ modelId: string; vendor: string }>) => void;
  onResetDefaults?: () => void;
}

export function ModalitySyncModelsModal({
  isOpen,
  onClose,
  kind,
  baseUrl,
  channels,
  channelId,
  onChannelChange,
  remoteModels,
  isSyncing,
  onReSync,
  activeModel,
  currentModels = [],
  onBatchSync,
  onBatchImport,
  onResetDefaults,
}: Props) {
  const [tab, setTab] = useState<'recommended' | 'all'>('recommended');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const dialogRef = useSettingsDialogFocus<HTMLDivElement>(isOpen, onClose);

  const scopedModels = useMemo(
    () => currentModels.filter((model) => (model.channelId || '') === channelId),
    [currentModels, channelId],
  );

  // 本次全量目录，加上本渠道已接入但远端没有的模型。确认同步按这份名单解除，不受当前标签和搜索影响。
  const catalogIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const modelId of remoteModels) {
      const trimmed = modelId.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      ids.push(trimmed);
    }
    for (const model of scopedModels) {
      const trimmed = model.modelId.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      ids.push(trimmed);
    }
    return ids;
  }, [remoteModels, scopedModels]);

  // 1. 模态推荐模型 vs 全站所有模型（预先从新到老排序）
  const matchedModels = useMemo(
    () =>
      catalogIds
        .filter((modelId) => isModelMatchModality(modelId, kind))
        .sort(compareModelVersionsDesc),
    [catalogIds, kind],
  );

  useEffect(() => {
    if (!isOpen) return;
    setTab('recommended');
    setSearch('');
    setIsConfirmingReset(false);
    setShowArchived(false);
    // 回显：将当前已有模型（内置与已同步）全部预选，保持状态真实连贯
    const initialPicked = new Set<string>();
    for (const model of currentModels) {
      if (model.modelId && (model.channelId || '') === channelId) initialPicked.add(model.modelId);
    }
    if (activeModel?.modelId && (activeModel.channelId || '') === channelId) {
      initialPicked.add(activeModel.modelId);
    }
    setPicked(initialPicked);
  }, [isOpen, channelId, activeModel?.modelId, activeModel?.channelId, currentModels]);

  // 2. 当前标签页下的备选池
  const activeCandidates = tab === 'recommended' ? matchedModels : catalogIds;

  // 3. 搜索过滤
  const displayList = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeCandidates;
    return activeCandidates.filter((modelId) => modelId.toLowerCase().includes(query));
  }, [activeCandidates, search]);

  const items = useMemo(() => describeSyncModels(kind, displayList), [kind, displayList]);
  const syncCandidates = useMemo(() => describeSyncModels(kind, catalogIds), [kind, catalogIds]);
  const visibleModelIds = useMemo(() => {
    if (showArchived) return displayList;
    const hidden = new Set<string>();
    for (const section of groupModelsByGeneration(displayList, kind)) {
      for (const row of section.rows) {
        if (!row.isArchived) continue;
        for (const modelId of row.allModelIds) hidden.add(modelId);
      }
    }
    return displayList.filter((modelId) => !hidden.has(modelId));
  }, [displayList, kind, showArchived]);

  // 4. 当前候选池中被勾选的模型
  const syncItems = useMemo(
    () => items.filter((item) => picked.has(item.modelId)),
    [items, picked],
  );

  // 5. 变动统计：新增接入 vs 取消勾选解除同步。解除按全量目录统计，包含官方种子。
  const currentModelIdSet = useMemo(() => new Set(scopedModels.map((model) => model.modelId)), [scopedModels]);
  const hasAnyCustomModel = useMemo(() => currentModels.some((model) => model.isCustom), [currentModels]);
  const catalogIdSet = useMemo(() => new Set(catalogIds), [catalogIds]);

  const addedCount = useMemo(() => {
    return Array.from(picked).filter((id) => !currentModelIdSet.has(id)).length;
  }, [picked, currentModelIdSet]);

  const unlinkedCount = useMemo(() => {
    return scopedModels.filter((model) => catalogIdSet.has(model.modelId) && !picked.has(model.modelId)).length;
  }, [scopedModels, catalogIdSet, picked]);

  if (!isOpen) return null;

  const title = MODALITY_TITLES[kind]?.title || '';

  // 单选/反选单个模型
  const toggleOne = (modelId: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  // 分组一键全选/反选
  const toggleGroup = (modelIds: string[], selectAll: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of modelIds) {
        if (selectAll) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  // 全选 / 取消当前可见模型。隐藏的早期型号不在本页范围内。
  const selectAllVisible = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const modelId of visibleModelIds) next.add(modelId);
      return next;
    });
  };

  const deselectVisible = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const modelId of visibleModelIds) next.delete(modelId);
      return next;
    });
  };

  // 清空选择
  const clearSelection = () => {
    setPicked(new Set());
  };

  // 执行双向同步与解除同步。候选集是全量目录，不是当前搜索或标签页。
  const handleConfirmSync = () => {
    const candidateEntries = syncCandidates.map((item) => ({
      modelId: item.modelId,
      vendor: item.vendorId === 'unknown' ? 'custom' : item.vendorId,
    }));

    if (onBatchSync) {
      onBatchSync(Array.from(picked), candidateEntries);
    } else if (onBatchImport) {
      onBatchImport(
        syncItems.map((item) => ({
          modelId: item.modelId,
          vendor: item.vendorId === 'unknown' ? 'custom' : item.vendorId,
        })),
      );
    }
    onClose();
  };

  const handleResetDefaults = () => {
    if (onResetDefaults) {
      onResetDefaults();
      onClose();
    }
  };

  const isAllVisibleSelected = visibleModelIds.length > 0 && visibleModelIds.every((modelId) => picked.has(modelId));

  let buttonLabel = `保存同步设置 (${syncItems.length} 已选)`;
  if (addedCount > 0 && unlinkedCount > 0) {
    buttonLabel = `确认同步（接入 ${addedCount} 个，解除 ${unlinkedCount} 个）`;
  } else if (addedCount > 0) {
    buttonLabel = `确认同步接入 ${addedCount} 个模型`;
  } else if (unlinkedCount > 0) {
    buttonLabel = `确认解除 ${unlinkedCount} 个模型的同步`;
  }

  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1 font-medium transition ${
      active
        ? 'bg-white font-semibold text-slate-900 shadow-[0_1px_2px_rgba(28,25,23,0.06)] dark:bg-[#2c2c32] dark:text-white'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/25 p-3 backdrop-blur-[2px] animate-in fade-in duration-150 dark:bg-black/60 sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modality-sync-title"
        tabIndex={-1}
        className="settings-sync-modal relative flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-800 shadow-2xl outline-none dark:border-white/[0.08] dark:bg-[#161619] dark:text-slate-200"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-white/[0.08]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="settings-service-icon text-slate-600 dark:text-slate-200">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 id="modality-sync-title" className="truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
                同步模型{title ? ` · ${title}` : ''}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500" title={baseUrl || undefined}>
                仅影响当前渠道
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModalitySyncChannelPicker channels={channels} channelId={channelId} onChange={onChannelChange} />
            <button
              type="button"
              onClick={onReSync}
              disabled={isSyncing}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10"
              title="重新从远端网关拉取最新模型列表"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '拉取中…' : '重新拉取'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-[#fafaf9] px-5 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
          <div className="inline-flex items-center rounded-full bg-[#f0eeeb] p-0.5 text-xs dark:bg-white/[0.06]">
            <button type="button" onClick={() => setTab('recommended')} className={tabClass(tab === 'recommended')}>
              {title ? `${title}推荐` : '模态推荐'}
              <span className="ml-1 text-[11px] tabular-nums opacity-60">{matchedModels.length}</span>
            </button>
            <button type="button" onClick={() => setTab('all')} className={tabClass(tab === 'all')}>
              全站候选
              <span className="ml-1 text-[11px] tabular-nums opacity-60">{catalogIds.length}</span>
            </button>
          </div>

          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={isAllVisibleSelected ? deselectVisible : selectAllVisible}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>{isAllVisibleSelected ? '取消本页' : '全选本页'}</span>
            </button>
            {picked.size > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-full px-2 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                清空
              </button>
            )}
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((value) => !value)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {showArchived ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span>{showArchived ? '隐藏早期' : `早期 ${archivedCount}`}</span>
              </button>
            )}
          </div>

          <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              data-initial-focus
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索模型 ID 或名称"
              aria-label="搜索模型 ID 或名称"
              className="settings-sync-field w-full pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="清除搜索"
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f6f4] px-4 py-3 dark:bg-[#141416] sm:px-5">
          <ModalitySyncModelPicker
            kind={kind}
            items={items}
            picked={picked}
            activeModelId={activeModel?.modelId}
            showArchived={showArchived}
            onArchivedCount={setArchivedCount}
            onToggle={toggleOne}
            onToggleGroup={toggleGroup}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-3 dark:border-white/[0.08] dark:bg-[#161619]">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <div>
              已勾选 <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{syncItems.length}</span> 个模型
              {picked.size > syncItems.length && (
                <span className="ml-1 opacity-70">跨页共 {picked.size} 个</span>
              )}
            </div>

            {onResetDefaults && hasAnyCustomModel && (
              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 dark:border-white/10">
                {isConfirmingReset ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-rose-600 dark:text-rose-400">清除全部渠道的已同步模型？</span>
                    <button
                      type="button"
                      onClick={handleResetDefaults}
                      className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-rose-500"
                    >
                      确认重置
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingReset(false)}
                      className="px-1.5 py-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingReset(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                    title="恢复模态官方初始配置，解除所有渠道从远端同步的自定义模型"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>恢复官方默认</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-full px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmSync}
              className="h-8 rounded-full bg-[#182235] px-4 text-xs font-medium text-white transition hover:bg-[#2c3950] active:scale-[0.98] dark:bg-white dark:text-[#121214] dark:hover:bg-[#e5e5ea]"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
