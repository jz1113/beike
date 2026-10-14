import { mergeAssetTasks } from '../model/mergeAssetTasks';
import { useAssetHistoryQuery } from '../hooks/useAssetHistoryQuery';
import { buildCanvasAssets, type AssetCanvasProject } from '../model/canvasAssets';
import { getAssetRecreationState } from '../model/recreateAsset';
import { useAssetActions } from '../hooks/useAssetActions';
import { getAssetTime, type AssetTimeFilter } from '@client/shared/utils/assetTaskData';
import type { AssetHistoryTask } from '@client/shared/api/mapDbTask';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Search,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { useAppStore } from '@client/store';
import '@client/store/persist/generation';
import '@shared/domain/media/drawing';
import { groupTasksIntoBatches, type AssetTaskBatch } from '../model/assetBatch';
import AssetGenerationHistory from './AssetGenerationHistory';
import AssetGenerationActions from './AssetGenerationActions';
import AssetFolderOverlay from './AssetFolderOverlay';
import { pageRoot } from '@client/shared/ui/layoutClasses';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';

export type { AssetTaskBatch } from '../model/assetBatch';

const EMPTY_ASSET_ITEMS: never[] = [];

export type AssetCenterProps = {
  canvasProjects: AssetCanvasProject[];
  onDeleteCanvasProject: (projectId: string) => void;
  onDeleteCanvasNode: (projectId: string, nodeId: string) => void;
  onSelectCanvasProject: (projectId: string) => void;
};

export default function AssetCenter({ canvasProjects, onDeleteCanvasProject, onDeleteCanvasNode, onSelectCanvasProject }: AssetCenterProps) {
  const {
    currentView,
    generationTasks,
    sessions,
    setPreviewTask,
    setCurrentView,
    setQuickPrompt,
  } = useAppStore(
    useShallow((s) => ({
      currentView: s.currentView,
      generationTasks: s.generationTasks,
      sessions: s.sessions,
      setPreviewTask: s.setPreviewTask,
      setCurrentView: s.setCurrentView,
      setQuickPrompt: s.setQuickPrompt,
    })),
  );

  // Yield two frames on entry before processing a large archive, preserving navigation feedback.
  const [isGalleryReady, setIsGalleryReady] = useState(false);
  useEffect(() => {
    if (currentView !== 'assets') {
      setIsGalleryReady(false);
      return;
    }
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setIsGalleryReady(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [currentView]);

  // 媒体分类 (图片 | 视频 | 音频 | 画布)
  const [mediaCategory, setMediaCategory] = useState<'image' | 'video' | 'audio' | 'canvas'>('image');

  // 时间范围筛选 (只保留画圈的时间筛选与批量操作)
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchKeyword(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // 批量模式
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedTaskIds] = useState<string[]>([]);

  // React Query owns all pages so polling and manual refresh cannot overwrite pagination.
  const historyQuery = useAssetHistoryQuery(currentView === 'assets' && mediaCategory !== 'canvas');
  const { refetch: refetchAssetTasks, fetchNextPage } = historyQuery;
  const dbTasks = useMemo(() => {
    const map = new Map<string, AssetHistoryTask>();
    for (const page of historyQuery.data?.pages || []) {
      for (const task of page.tasks) {
        if (!map.has(task.id)) map.set(task.id, task);
      }
    }
    return Array.from(map.values());
  }, [historyQuery.data]);
  const tasksHasMore = mediaCategory !== 'canvas' && Boolean(historyQuery.hasNextPage);
  const isLoadingTasks = mediaCategory !== 'canvas' && historyQuery.isPending && historyQuery.isFetching;
  const isLoadingMoreTasks = mediaCategory !== 'canvas' && historyQuery.isFetchingNextPage;
  const queryError = historyQuery.error || historyQuery.pollError;
  const loadError = mediaCategory !== 'canvas' && queryError ? formatUserError(queryError, historyQuery.pollError ? '任务状态更新失败，请重试' : '历史记录加载失败，请重试') : null;
  const isFiltered = Boolean(searchKeyword.trim()) || timeFilter !== 'all';
  const { setSafeTimeout, clearSafeTimeout } = useSafeTimeout();
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [folderBatch, setFolderBatch] = useState<AssetTaskBatch | null>(null);

  const showToast = useCallback((msg: string) => {
    clearSafeTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = setSafeTimeout(() => setToastMsg(null), 3500);
  }, [clearSafeTimeout, setSafeTimeout]);

  const loadMoreDbTasks = useCallback(() => {
    if (historyQuery.isFetching || historyQuery.isError || !tasksHasMore) return;
    void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, historyQuery.isFetching, historyQuery.isError, tasksHasMore]);

  const { canvasTasks, canvasBatches } = useMemo(() => buildCanvasAssets(isGalleryReady ? canvasProjects : []), [canvasProjects, isGalleryReady]);

  // 合并内存中的 generationTasks 与数据库中的任务
  const serverHistoryComplete = Boolean(historyQuery.data && !historyQuery.hasNextPage && !historyQuery.isFetching && !queryError);
  const activeGenerationTasks = isGalleryReady ? generationTasks : EMPTY_ASSET_ITEMS;
  const activeSessions = isGalleryReady ? sessions : EMPTY_ASSET_ITEMS;
  const activeDbTasks = isGalleryReady ? dbTasks : EMPTY_ASSET_ITEMS;
  const mergedTasks = useMemo(() => mergeAssetTasks({ serverHistoryComplete, dbTasks: activeDbTasks, generationTasks: activeGenerationTasks, mediaCategory, searchKeyword, timeFilter, sessions: activeSessions, canvasTasks, now }), [serverHistoryComplete, activeDbTasks, activeGenerationTasks, mediaCategory, searchKeyword, timeFilter, activeSessions, canvasTasks, now]);

  const selectedTaskIds = useMemo(() => {
    const currentIds = new Set(mergedTasks.map((task) => task.id));
    return selectedIds.filter((id) => currentIds.has(id));
  }, [mergedTasks, selectedIds]);
  const areAllSelected = mergedTasks.length > 0 && mergedTasks.every((task) => selectedTaskIds.includes(task.id));
  const failedTasks = mergedTasks.filter((task) => task.status === 'FAILURE');
  const downloadableSelectedCount = mergedTasks.filter((task) => selectedTaskIds.includes(task.id) && task.resultUrl && task.status !== 'FAILURE').length;
  const { isBusy, isDeleting, isDownloadingZip, zipProgressLabel, setIsDownloadingZip, handleDeleteTask, handleBatchDelete, handleBatchDownload, handleClearFailedAndStuck, handleDeleteBatch } = useAssetActions({ mergedTasks, selectedTaskIds, failedTasks, setSelectedTaskIds, setIsBatchMode, showToast, refetchAssetTasks, canvasProjects, onDeleteCanvasProject, onDeleteCanvasNode });

  useEffect(() => {
    setSelectedTaskIds([]);
    setFolderBatch(null);
  }, [mediaCategory, timeFilter, searchKeyword]);

  // Check a bounded number of pages automatically; older archives remain explicitly searchable.
  const [automaticPagesLeft, setAutomaticPagesLeft] = useState(2);
  useEffect(() => setAutomaticPagesLeft(2), [mediaCategory, timeFilter, searchKeyword]);
  const isSearchingHistory = isGalleryReady && tasksHasMore && automaticPagesLeft > 0 && (isFiltered || mergedTasks.length === 0) && !loadError;
  useEffect(() => {
    if (!isSearchingHistory || historyQuery.isFetching || isBusy || searchInput.trim() !== searchKeyword) return;
    const timer = setTimeout(() => {
      setAutomaticPagesLeft(left => Math.max(0, left - 1));
      void fetchNextPage({ cancelRefetch: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [isSearchingHistory, historyQuery.isFetching, isBusy, searchInput, searchKeyword, fetchNextPage]);

  // 分批渲染逻辑 (时间分段分组)
  const allBatches = useMemo(() => {
    if (mediaCategory === 'canvas') {
      if (!searchKeyword.trim() && timeFilter === 'all') {
        return canvasBatches;
      }
      return groupTasksIntoBatches(mergedTasks);
    }
    return groupTasksIntoBatches(mergedTasks);
  }, [mediaCategory, canvasBatches, mergedTasks, searchKeyword, timeFilter]);

  const [renderedBatchCount, setRenderedBatchCount] = useState(15);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFolderBatch((previous) => previous ? allBatches.find((batch) => batch.batchId === previous.batchId) || null : null);
  }, [allBatches]);

  useEffect(() => {
    setRenderedBatchCount(15);
  }, [mediaCategory, timeFilter, searchKeyword]);

  const renderedBatches = useMemo(
    () => allBatches.slice(0, renderedBatchCount),
    [allBatches, renderedBatchCount],
  );
  const hasMore = renderedBatchCount < allBatches.length || tasksHasMore;
  const totalBatches = allBatches.length;

  const handleBatchIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (!entries[0]?.isIntersecting) return;
      if (renderedBatchCount < allBatches.length) {
        setRenderedBatchCount((prev) => Math.min(prev + 12, allBatches.length));
      } else if (tasksHasMore && !isFiltered && !isBusy && automaticPagesLeft > 0 && !historyQuery.isFetching) {
        setAutomaticPagesLeft(left => Math.max(0, left - 1));
        loadMoreDbTasks();
      }
    },
    [allBatches.length, loadMoreDbTasks, renderedBatchCount, tasksHasMore, isFiltered, isBusy, automaticPagesLeft, historyQuery.isFetching],
  );

  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(handleBatchIntersection, { root: galleryRef.current, rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [handleBatchIntersection]);

  const { visibleToday, visibleYesterday, visibleEarlier } = useMemo(() => {
    const today: AssetTaskBatch[] = [];
    const yesterday: AssetTaskBatch[] = [];
    const earlier: AssetTaskBatch[] = [];
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const previousDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStart = previousDay.getTime();

    for (const b of renderedBatches) {
      const t = getAssetTime(b.createdAt);
      if (t >= todayStart) today.push(b);
      else if (t >= yesterdayStart) yesterday.push(b);
      else earlier.push(b);
    }
    return { visibleToday: today, visibleYesterday: yesterday, visibleEarlier: earlier };
  }, [renderedBatches, now]);

  const handleRegenerate = (task: AssetTaskBatch['tasks'][number], e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    const inputs = getAssetRecreationState(task);
    if (!inputs) { showToast('此类型暂无可用的生成入口'); return; }
    useAppStore.setState({ ...inputs, currentView: 'home' });
  };

  // 全选/取消全选
  const handleToggleSelectAll = () => {
    if (areAllSelected) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(mergedTasks.map(t => t.id));
    }
  };

  const historyProps = {
    isPreparing: currentView === 'assets' && !isGalleryReady,
    mediaCategory,
    mergedTasks,
    isLoadingTasks,
    isLoadingMoreTasks,
    loadError,
    isFiltered,
    isBusy,
    isSearchingHistory,
    tasksHasMore,
    onLoadMore: loadMoreDbTasks,
    onRetryLoad: () => historyQuery.isFetchNextPageError ? void fetchNextPage() : void refetchAssetTasks(),
    visibleToday,
    visibleYesterday,
    visibleEarlier,
    hasMore,
    renderedBatches: renderedBatches.length,
    totalBatches,
    loadMoreSentinelRef,
    isBatchMode,
    selectedTaskIds,
    setSelectedTaskIds,
    setCurrentView,
    setPreviewTask,
    showToast,
    onDeleteBatch: handleDeleteBatch,
    onDeleteTask: handleDeleteTask,
    onRegenerate: handleRegenerate,
    onOpenFolderBatch: (b: AssetTaskBatch) => setFolderBatch(b),
  };

  return (
    <div className={`${pageRoot} bg-transparent select-none`}>
      {/* 🌟 1. 现代顶栏 (行 1: 标题 + 时间筛选 + 搜索框; 行 2: 媒体分类胶囊 + 批量操作/清理失败) */}
      <header
        className="shrink-0 cursor-default bg-transparent flex flex-col gap-2 pt-3 pb-2 px-4 sm:px-6 lg:px-8"
      >
        {/* Row 1: 资产中心标题 + 统计 | 时间筛选 + 搜索框 */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 shrink-0">
            <h1 className="text-base font-black text-slate-900 tracking-tight">
              生成资产中心
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-mono font-bold">
              {isFiltered ? '匹配 ' : tasksHasMore ? '已加载 ' : ''}{mergedTasks.length} 条记录
            </span>
            {mediaCategory !== 'canvas' && <button type="button" onClick={() => void refetchAssetTasks()} disabled={isBusy || historyQuery.isFetching} aria-label="刷新资产记录" title="刷新历史记录和任务状态" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${historyQuery.isFetching ? 'animate-spin' : ''}`} /></button>}
          </div>

          {/* Right: 时间下拉筛选 + 搜索框 */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* 时间下拉筛选（只保留画圈的时间筛选） */}
            <div className="relative flex items-center shrink-0">
              <select
                value={timeFilter}
                disabled={isBusy}
                aria-label="资产时间范围"
                onChange={e => setTimeFilter(e.target.value as AssetTimeFilter)}
                className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 hover:bg-slate-200/70 border border-transparent focus:border-indigo-400 text-slate-700 font-medium outline-none cursor-pointer text-xs h-8 md:h-9 transition-colors shadow-2xs"
              >
                <option value="all">时间: 全部</option>
                <option value="today">今天</option>
                <option value="yesterday">昨天</option>
                <option value="7days">近 7 天</option>
                <option value="30days">近 30 天</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
            </div>

            {/* Search Box */}
            <div className="relative flex items-center w-full sm:min-w-[140px] sm:max-w-[200px] sm:flex-none">
              <Search className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-slate-400" />
              <input
                type="text"
                value={searchInput}
                disabled={isBusy}
                onChange={e => setSearchInput(e.target.value)}
                placeholder={mediaCategory === 'canvas' ? '搜索画布名称或内容...' : '搜索提示词、名称或模型...'}
                aria-label="搜索资产"
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-100/80 focus:bg-white border border-transparent focus:border-indigo-400 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all shadow-2xs h-8 md:h-9"
              />
            </div>
          </div>
        </div>

        {/* Row 2: 媒体分类分段胶囊 (图片 | 视频 | 音频 | 画布) | 清理失败 + 批量操作 */}
        <div className="flex flex-wrap items-center justify-between gap-3 w-full pt-1">
          {/* 移动到此行的媒体类型分段胶囊 (图片 | 视频 | 音频 | 画布) */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100/90 border border-slate-200/60 shadow-2xs shrink-0">
            {[
              { id: 'image', label: '图片' },
              { id: 'video', label: '视频' },
              { id: 'audio', label: '音频' },
              { id: 'canvas', label: '画布' }
            ].map(m => {
              const isActive = mediaCategory === m.id;
              return (
                <button
                  key={m.id}
                  aria-pressed={isActive}
                  disabled={isBusy}
                  onClick={() => setMediaCategory(m.id as 'image' | 'video' | 'audio' | 'canvas')}
                  className={`px-3 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 font-medium hover:bg-white/40'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <AssetGenerationActions
            failedCount={failedTasks.length} recordCount={mergedTasks.length} selectedCount={selectedTaskIds.length}
            {...{ downloadableSelectedCount, isBatchMode, isBusy, isDeleting, isDownloadingZip, areAllSelected, tasksHasMore, zipProgressLabel }}
            onClearFailed={handleClearFailedAndStuck} onToggleSelectAll={handleToggleSelectAll}
            onBatchDownload={handleBatchDownload} onBatchDelete={handleBatchDelete}
            onExitBatch={() => { setIsBatchMode(false); setSelectedTaskIds([]); }} onEnterBatch={() => setIsBatchMode(true)}
          />
        </div>
      </header>

      {/* 🌟 2. Main Gallery Area */}
      <div ref={galleryRef} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        <AssetGenerationHistory {...historyProps} />
      </div>

      {folderBatch && (
        <AssetFolderOverlay
          folderBatch={folderBatch}
          isDownloadingZip={isDownloadingZip}
          setIsDownloadingZip={setIsDownloadingZip}
          showToast={showToast}
          setQuickPrompt={setQuickPrompt}
          setPreviewTask={setPreviewTask}
          onClose={() => setFolderBatch(null)}
          onEnterCanvas={(projectId) => {
            setFolderBatch(null);
            onSelectCanvasProject(projectId);
            setCurrentView('canvas');
          }}
        />
      )}

      {/* 🌟 全局反馈 Toast */}
      {toastMsg && (
        <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-2xl border border-slate-700/80 animate-fade-in flex items-center gap-2">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
