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
import { confirmAction } from '@client/shared/utils/confirmAction';
import { permanentDeleteGeneration } from '@client/shared/api/permanentDeleteGeneration';
import { useI18n } from '@client/shared/i18n';
import type { ProjectFolderItem } from './MaterialProjectView';
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

  const handleBatchDeleteProjects = useCallback(
    async (projectsToDelete: ProjectFolderItem[]) => {
      if (projectsToDelete.length === 0) return false;
      const totalAssets = projectsToDelete.reduce((sum, p) => sum + p.assetCount, 0);
      const title =
        projectsToDelete.length === 1
          ? `确认删除「${projectsToDelete[0].title}」`
          : `确认删除选中的 ${projectsToDelete.length} 个项目`;
      const description =
        projectsToDelete.length === 1
          ? totalAssets > 0
            ? `此操作无法撤回，删除项目后，内部包含的 ${totalAssets} 个素材也将被清理，确认删除么？`
            : `此操作无法撤回，删除项目后，内部记录将被清理，确认删除么？`
          : totalAssets > 0
          ? `此操作无法撤回，选中的 ${projectsToDelete.length} 个项目及其包含的 ${totalAssets} 个素材将被清理，确认删除么？`
          : `此操作无法撤回，选中的 ${projectsToDelete.length} 个项目将被清理，确认删除么？`;

      const confirmed = await confirmAction({
        title,
        description,
        confirmText: '删除',
        cancelText: '取消',
      });
      if (!confirmed) return false;

      const protectUrls = canvasProjects
        .flatMap((cp) => [
          cp.thumbnail,
          ...cp.nodes.flatMap((node) => [
            node.imageUrl,
            node.videoUrl,
            node.audioUrl,
            node.referenceImageUrl,
            ...(node.drawing?.references || []),
          ]),
        ])
        .filter((url): url is string => Boolean(url));

      for (const p of projectsToDelete) {
        if (p.type === 'canvas') {
          onDeleteCanvasProject(p.id);
        } else {
          const sessionTasks = mergedTasks.filter(
            (t) => t.sessionId === p.id || t.batchId?.includes(p.id)
          );
          if (sessionTasks.length > 0) {
            await permanentDeleteGeneration(sessionTasks, { protectUrls }).catch(() => {});
          }
          deleteSession(p.id);
        }
      }

      showToast(
        projectsToDelete.length === 1
          ? `已删除项目“${projectsToDelete[0].title}”`
          : `已成功删除 ${projectsToDelete.length} 个项目`
      );
      void refetchAssetTasks();
      return true;
    },
    [canvasProjects, deleteSession, mergedTasks, onDeleteCanvasProject, refetchAssetTasks, showToast]
  );

  const handleDeleteProject = useCallback(
    async (project: ProjectFolderItem) => {
      await handleBatchDeleteProjects([project]);
    },
    [handleBatchDeleteProjects]
  );

  return (
    <div className={`${pageRoot} bg-transparent select-none`}>
      {/* 🌟 顶层一级标签栏：左侧【AI 生成 | 我上传的】(图2上移)，右侧【素材库 | 资产库】(图1右移) */}
      <header className="shrink-0 cursor-default bg-transparent px-4 sm:px-6 lg:px-8 pt-4 pb-2">
        <div className="flex items-center justify-between gap-4">
          {/* 左侧：图 2 上移的【AI 生成 | 我上传的】 */}
          {mainTab === 'material' ? (
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-slate-100/90 border border-slate-200/60 shadow-2xs">
              <button
                type="button"
                onClick={() => setSourceType('ai')}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sourceType === 'ai'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t('assets.aiGenerated')}
              </button>
              <button
                type="button"
                onClick={() => setSourceType('uploaded')}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sourceType === 'uploaded'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
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
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-slate-100/90 border border-slate-200/60 shadow-2xs">
              <button
                type="button"
                onClick={() => setMainTab('material')}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mainTab === 'material'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t('assets.materialLibrary')}
              </button>
              <button
                type="button"
                onClick={() => setMainTab('asset')}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  mainTab === 'asset'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
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
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50"
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
            sourceType={sourceType}
            setPreviewTask={(task, queue) => setPreviewTask(task as unknown as Parameters<typeof setPreviewTask>[0], queue as unknown as Parameters<typeof setPreviewTask>[1])}
            onBatchDelete={handleBatchDeleteTasks}
            onBatchDownload={handleBatchDownloadTasks}
            onDeleteProject={handleDeleteProject}
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
