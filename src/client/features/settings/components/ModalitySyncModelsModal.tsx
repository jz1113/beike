import React, { useEffect, useMemo, useState } from 'react';
import type { ModalityKind, ModalityModelItem } from '../model/modalityModelTypes';
import { MODALITY_TITLES, isModelMatchModality } from '../model/modalityMeta';
import { describeSyncModels, ModalitySyncModelPicker } from './ModalitySyncModelPicker';
import { CheckCheck, RotateCw, Search, Sparkles, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  kind: ModalityKind;
  baseUrl: string;
  remoteModels: string[];
  isSyncing: boolean;
  onReSync: () => void;
  activeModel?: ModalityModelItem;
  onBatchImport: (entries: Array<{ modelId: string; vendor: string }>) => void;
}

export function ModalitySyncModelsModal({
  isOpen,
  onClose,
  kind,
  baseUrl,
  remoteModels,
  isSyncing,
  onReSync,
  activeModel,
  onBatchImport,
}: Props) {
  const [tab, setTab] = useState<'recommended' | 'all'>('recommended');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  // 1. 模态推荐模型 vs 全站所有模型
  const matchedModels = useMemo(
    () => remoteModels.filter((modelId) => isModelMatchModality(modelId, kind)),
    [remoteModels, kind],
  );

  // 2. 默认勾选当前模态匹配且能识别出厂商的模型
  const defaultPickedKey = useMemo(
    () => matchedModels.join('\n'),
    [matchedModels],
  );

  useEffect(() => {
    if (!isOpen) return;
    setPicked(new Set(defaultPickedKey ? defaultPickedKey.split('\n') : []));
    setSearch('');
  }, [isOpen, defaultPickedKey]);

  // 3. 当前标签页下的备选池
  const activeCandidates = tab === 'recommended' ? matchedModels : remoteModels;

  // 4. 搜索过滤
  const displayList = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeCandidates;
    return activeCandidates.filter((modelId) => modelId.toLowerCase().includes(query));
  }, [activeCandidates, search]);

  const items = useMemo(() => describeSyncModels(kind, displayList), [kind, displayList]);

  // 5. 待同步列表：只要被勾选，即可同步
  const syncItems = useMemo(
    () => items.filter((item) => picked.has(item.modelId)),
    [items, picked],
  );

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

  // 全选当前可见模型
  const selectAllVisible = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        next.add(item.modelId);
      }
      return next;
    });
  };

  // 清空选择
  const clearSelection = () => {
    setPicked(new Set());
  };

  // 导入所选项
  const importCurrent = () => {
    onBatchImport(
      syncItems.map((item) => ({
        modelId: item.modelId,
        vendor: item.vendorId === 'unknown' ? 'custom' : item.vendorId,
      })),
    );
  };

  const isAllVisibleSelected = items.length > 0 && items.every((item) => picked.has(item.modelId));

  const buttonLabel =
    syncItems.length === 0
      ? '请选择要同步的模型'
      : `确认同步所选 ${syncItems.length} 个模型`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-800 shadow-2xl dark:border-white/10 dark:bg-[#1a1c20] dark:text-slate-200">
        {/* 顶部 Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  同步模型 · {title}
                </h3>
                <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
                  {baseUrl || '未配置全局地址'} · 远端发现 {remoteModels.length} 个可用模型
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              title="重新从远端网关拉取最新模型列表"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-indigo-500' : ''}`} />
              <span>{isSyncing ? '拉取中…' : '重新拉取'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 筛选与搜索工具条（移除了列表模式切换） */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-6 py-3 dark:border-white/5 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-xl bg-slate-200/70 p-0.5 text-xs dark:bg-white/5">
              <button
                type="button"
                onClick={() => setTab('recommended')}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  tab === 'recommended'
                    ? 'bg-white font-semibold text-indigo-600 shadow-2xs dark:bg-[#22252a] dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                推荐 <span className="ml-0.5 text-[11px] opacity-75">{matchedModels.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  tab === 'all'
                    ? 'bg-white font-semibold text-indigo-600 shadow-2xs dark:bg-[#22252a] dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                全站 <span className="ml-0.5 text-[11px] opacity-75">{remoteModels.length}</span>
              </button>
            </div>

            {/* 快速全选/清空按钮 */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={isAllVisibleSelected ? clearSelection : selectAllVisible}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/5"
              >
                <CheckCheck className="h-3.5 w-3.5 text-indigo-500" />
                <span>{isAllVisibleSelected ? '取消全部' : '全选本页'}</span>
              </button>
              {picked.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  清空已选
                </button>
              )}
            </div>
          </div>

          {/* 搜索框 */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索模型 ID 或名称…"
              className="h-8.5 w-full rounded-xl border border-slate-200 bg-white pl-8.5 pr-8 text-xs outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-[#202328]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 卡片选择器主体区域 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ModalitySyncModelPicker
            kind={kind}
            items={items}
            picked={picked}
            activeModelId={activeModel?.modelId}
            onToggle={toggleOne}
            onToggleGroup={toggleGroup}
          />
        </div>

        {/* 底部操作 Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-3.5 dark:border-white/5 dark:bg-[#1a1c20]">
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            已勾选 <span className="font-semibold text-indigo-600 dark:text-indigo-400">{syncItems.length}</span> 个模型
            {picked.size > syncItems.length && (
              <span className="ml-1 opacity-70">（跨标签页共选 {picked.size} 个）</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
            >
              取消
            </button>
            <button
              type="button"
              onClick={importCurrent}
              disabled={syncItems.length === 0}
              className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
