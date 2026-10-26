import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { RefreshCw } from 'lucide-react';
import { useAppStore } from '@client/store';
import '@client/store/persist/generation';
import '@shared/domain/media/drawing';
import { pageRoot } from '@client/shared/ui/layoutClasses';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';
import type { AssetHistoryTask } from '@client/shared/api/mapDbTask';
import { mergeAssetTasks } from '../model/mergeAssetTasks';
import { useAssetHistoryQuery } from '../hooks/useAssetHistoryQuery';
import { buildCanvasAssets, type AssetCanvasProject } from '../model/canvasAssets';
import { useAssetActions } from '../hooks/useAssetActions';
import { useI18n } from '@client/shared/i18n';
import MaterialLibraryView from './material/MaterialLibraryView';
import AssetLibraryView from './library/AssetLibraryView';

export type { AssetTaskBatch } from '../model/assetBatch';

const EMPTY_ASSET_ITEMS: never[] = [];

export type AssetCenterProps = {
  canvasProjects: AssetCanvasProject[];
  onDeleteCanvasProject: (projectId: string) => void;
  onDeleteCanvasNode: (projectId: string, nodeId: string) => void;
  onSelectCanvasProject: (projectId: string) => void;
};

export default function AssetCenter({
  canvasProjects,
  onDeleteCanvasProject,
  onDeleteCanvasNode,
}: AssetCenterProps) {
  const { t } = useI18n();
  const { currentView, generationTasks, sessions, setPreviewTask, deleteSession } = useAppStore(
    useShallow((s) => ({
      currentView: s.currentView,
      generationTasks: s.generationTasks,
      sessions: s.sessions,
      setPreviewTask: s.setPreviewTask,
      deleteSession: s.deleteSession,
    }))
  );

  // 顶层双标签切换：素材库 | 资产库 (对应参考图结构)
  const [mainTab, setMainTab] = useState<'material' | 'asset'>('material');
  // 顶层来源切换：AI 生成 | 我上传的 (图2上移)
  const [sourceType, setSourceType] = useState<'ai' | 'uploaded'>('ai');

  // 动画帧缓冲确保页面平滑渲染
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

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { setSafeTimeout, clearSafeTimeout } = useSafeTimeout();
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback(
    (msg: string) => {
      clearSafeTimeout(toastTimerRef.current);
      setToastMsg(msg);
      toastTimerRef.current = setSafeTimeout(() => setToastMsg(null), 3500);
    },
    [clearSafeTimeout, setSafeTimeout]
  );

  // 查询历史数据库任务
  const historyQuery = useAssetHistoryQuery(currentView === 'assets');
  const { refetch: refetchAssetTasks } = historyQuery;

  const dbTasks = useMemo(() => {
    const map = new Map<string, AssetHistoryTask>();
    for (const page of historyQuery.data?.pages || []) {
      for (const task of page.tasks) {
        if (!map.has(task.id)) map.set(task.id, task);
      }
    }
    return Array.from(map.values());
  }, [historyQuery.data]);

  const { canvasTasks } = useMemo(
    () => buildCanvasAssets(isGalleryReady ? canvasProjects : []),
    [canvasProjects, isGalleryReady]
  );

  const serverHistoryComplete = Boolean(
    historyQuery.data && !historyQuery.hasNextPage && !historyQuery.isFetching && !historyQuery.error
  );
  const activeGenerationTasks = isGalleryReady ? generationTasks : EMPTY_ASSET_ITEMS;
  const activeSessions = isGalleryReady ? sessions : EMPTY_ASSET_ITEMS;
  const activeDbTasks = isGalleryReady ? dbTasks : EMPTY_ASSET_ITEMS;

  // 合并生成任务与数据库任务
  const mergedTasks = useMemo(
    () =>
      mergeAssetTasks({
        serverHistoryComplete,
        dbTasks: activeDbTasks,
        generationTasks: activeGenerationTasks,
        mediaCategory: 'all',
        searchKeyword: '',
        timeFilter: 'all',
        sessions: activeSessions,
        canvasTasks,
        now,
      }),
    [
      serverHistoryComplete,
      activeDbTasks,
      activeGenerationTasks,
      activeSessions,
      canvasTasks,
      now,
    ]
  );

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const failedTasks = useMemo(
    () => mergedTasks.filter((task) => task.status === 'FAILURE'),
    [mergedTasks]
  );

  const {
    isBusy,
    isDeleting,
    isDownloadingZip,
    handleBatchDeleteTasks,
    handleBatchDownloadTasks,
    handleBatchDeleteProjects,
  } = useAssetActions({
    mergedTasks,
    serverHistoryComplete,
    deleteSession,
    selectedTaskIds,
    failedTasks,
    setSelectedTaskIds,
    setIsBatchMode: () => {},
    showToast,
    refetchAssetTasks,
    canvasProjects,
    onDeleteCanvasProject,
    onDeleteCanvasNode,
  });

  return (
    <div className={`${pageRoot} bg-transparent select-none`}>
      {/* 🌟 顶层一级标签栏：左侧【AI 生成 | 我上传的】(图2上移)，右侧【素材库 | 资产库】(图1右移) */}
      <header className="shrink-0 cursor-default bg-transparent px-4 sm:px-6 lg:px-8 pt-4 pb-2">
        <div className="flex items-center justify-between gap-4">
          {/* 左侧：图 2 上移的【AI 生成 | 我上传的】 */}
          {mainTab === 'material' ? (
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-slate-100/90 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 shadow-2xs">
              <button
                type="button"
                onClick={() => setSourceType('ai')}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sourceType === 'ai'
                    ? 'bg-white dark:bg-[#20252F] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t('assets.aiGenerated')}
              </button>
              <button
                type="button"
                onClick={() => setSourceType('uploaded')}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sourceType === 'uploaded'
                    ? 'bg-white dark:bg-[#20252F] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t('assets.myUploads')}
              </button>
            </div>
          ) : (
            <div />
          )}

          {/* 右侧：图 1 移到右边的【素材库 | 资产库】 + 刷新按钮 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-slate-100/90 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 shadow-2xs">
              <button
                type="button"
                onClick={() => setMainTab('material')}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mainTab === 'material'
                    ? 'bg-white dark:bg-[#20252F] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t('assets.materialLibrary')}
              </button>
              <button
                type="button"
                onClick={() => setMainTab('asset')}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mainTab === 'asset'
                    ? 'bg-white dark:bg-[#20252F] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t('assets.assetLibrary')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => void refetchAssetTasks()}
              disabled={isBusy || historyQuery.isFetching}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              className="rounded-full p-2 text-slate-400 dark:text-[#8E8E93] hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${historyQuery.isFetching ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* 🌟 主视图内容区 */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-3">
        {mainTab === 'material' && (historyQuery.isFetching || historyQuery.hasNextPage || historyQuery.error || historyQuery.pollError) && (
          <div role="status" aria-live="polite" className="mb-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>{historyQuery.error || historyQuery.pollError ? '部分素材加载失败，请刷新重试' : `正在加载素材，已读取 ${dbTasks.length} 条…`}</span>
            {(historyQuery.error || historyQuery.pollError) && <button type="button" onClick={() => void refetchAssetTasks()} className="font-medium text-blue-600 dark:text-blue-400">重试</button>}
          </div>
        )}
        {mainTab === 'material' ? (
          <MaterialLibraryView
            sessions={activeSessions}
            canvasProjects={canvasProjects}
            mergedTasks={mergedTasks}
            sourceType={sourceType}
            onSourceTypeChange={setSourceType}
            setPreviewTask={(task, queue) => setPreviewTask(task as unknown as Parameters<typeof setPreviewTask>[0], queue as unknown as Parameters<typeof setPreviewTask>[1])}
            onBatchDelete={handleBatchDeleteTasks}
            onBatchDownload={handleBatchDownloadTasks}
            onBatchDeleteProjects={handleBatchDeleteProjects}
            isDownloadingZip={isDownloadingZip}
            isDeleting={isDeleting}
          />
        ) : (
          <AssetLibraryView />
        )}
      </main>

      {/* 🌟 全局反馈 Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-2xl border border-slate-700/80 animate-fade-in flex items-center gap-2"
        >
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
