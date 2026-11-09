import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import '@client/store/persist/generation';
import '@shared/domain/media/drawing';
import { pageRoot } from '@client/shared/ui/layoutClasses';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';
import type { AssetHistoryTask } from '@client/shared/api/mapDbTask';
import { agentHistoryTasks, type AssetTaskBatch } from '../model/agentAssetFilter';
import { mergeAssetTasks } from '../model/mergeAssetTasks';
import { useAssetHistoryQuery } from '../hooks/useAssetHistoryQuery';
import { buildCanvasAssets, type AssetCanvasProject } from '../model/canvasAssets';
import { useAssetActions } from '../hooks/useAssetActions';
import MaterialLibraryView from './material/MaterialLibraryView';

export type { AssetTaskBatch };

const EMPTY_ASSET_ITEMS: never[] = [];

export type AssetCenterProps = {
  canvasProjects: AssetCanvasProject[];
  onDeleteCanvasProject: (projectId: string) => Promise<void>;
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
      agentHistoryTasks(mergeAssetTasks({
        serverHistoryComplete,
        dbTasks: activeDbTasks,
        generationTasks: activeGenerationTasks,
        mediaCategory: 'all',
        searchKeyword: '',
        timeFilter: 'all',
        sessions: activeSessions,
        canvasTasks,
        now,
      }), activeSessions),
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

      {/* 🌟 主视图内容区 */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-3">
        {(historyQuery.isFetching || historyQuery.hasNextPage || historyQuery.error || historyQuery.pollError) && (
          <div role="status" aria-live="polite" className="mb-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>{historyQuery.error || historyQuery.pollError ? '部分素材加载失败，请刷新重试' : `正在加载素材，已读取 ${dbTasks.length} 条…`}</span>
            {(historyQuery.error || historyQuery.pollError) && <button type="button" onClick={() => void refetchAssetTasks()} className="font-medium text-blue-600 dark:text-blue-400">重试</button>}
          </div>
        )}
        <MaterialLibraryView
          mergedTasks={mergedTasks}
          setPreviewTask={(task, queue) => setPreviewTask(task as unknown as Parameters<typeof setPreviewTask>[0], queue as unknown as Parameters<typeof setPreviewTask>[1])}
          onBatchDelete={handleBatchDeleteTasks}
          onBatchDownload={handleBatchDownloadTasks}
          isDownloadingZip={isDownloadingZip}
          isDeleting={isDeleting}
        />
      </main>

      {/* 🌟 全局反馈 Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-20 right-4 max-w-[calc(100vw-2rem)] z-50 px-4 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-2xl border border-slate-700/80 animate-fade-in flex items-center gap-2"
        >
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
