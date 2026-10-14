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
import MaterialLibraryView from './MaterialLibraryView';
import AssetLibraryView from './AssetLibraryView';

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
  const { currentView, generationTasks, sessions, setPreviewTask } = useAppStore(
    useShallow((s) => ({
      currentView: s.currentView,
      generationTasks: s.generationTasks,
      sessions: s.sessions,
      setPreviewTask: s.setPreviewTask,
    }))
  );

  // 顶层双标签切换：素材库 | 资产库 (对应参考图结构)
  const [mainTab, setMainTab] = useState<'material' | 'asset'>('material');

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
        mediaCategory: 'image',
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
  } = useAssetActions({
    mergedTasks,
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
      {/* 🌟 顶层一级标签栏：素材库 | 资产库 (对应图1、图2、图3) */}
      <header className="shrink-0 cursor-default bg-transparent px-4 sm:px-6 lg:px-8 pt-4 pb-2 border-b border-slate-200/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-7">
            <button
              type="button"
              onClick={() => setMainTab('material')}
              className={`pb-2.5 text-base font-bold transition-all relative cursor-pointer ${
                mainTab === 'material'
                  ? 'text-slate-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              素材库
            </button>
            <button
              type="button"
              onClick={() => setMainTab('asset')}
              className={`pb-2.5 text-base font-bold transition-all relative cursor-pointer ${
                mainTab === 'asset'
                  ? 'text-slate-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              资产库
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <button
              type="button"
              onClick={() => void refetchAssetTasks()}
              disabled={isBusy || historyQuery.isFetching}
              aria-label="刷新资产记录"
              title="刷新历史记录和任务状态"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
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
        {mainTab === 'material' ? (
          <MaterialLibraryView
            sessions={activeSessions}
            canvasProjects={canvasProjects}
            mergedTasks={mergedTasks}
            setPreviewTask={setPreviewTask}
            onBatchDelete={handleBatchDeleteTasks}
            onBatchDownload={handleBatchDownloadTasks}
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
