import { mergeAssetTasks } from './mergeAssetTasks';
import { fetchAssetTasks } from '@/features/generate/api/generationApi';
import { useAssetTasksQuery } from '@/features/assets/hooks/useAssetTasksQuery';
import { apiFetch } from '@/lib/apiClient';
import { confirmAction } from '@/lib/confirmAction';
import { clearFailedTasksFromServer } from '@/lib/deleteTasks';
import {
  filterDbTasksAfterDelete,
  filterDbTasksFromTombstones,
  permanentDeleteGeneration,
} from '@/lib/permanentDeleteGeneration';
import { saveToDownloadDir } from '@/lib/desktopDownload';
import { formatUserError } from '@beike/shared/upstreamErrors';
import { handleWindowDrag, handleWindowDoubleClick } from '@/lib/windowDrag';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Search,
  Trash2,
  Download,
  CheckSquare,
  Square,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import '@/store/persist/generation';
import '@beike/shared/drawing';
import { useCanvasStore } from '@/features/canvas/store/useCanvasStore';
import { groupTasksIntoBatches, type AssetTaskBatch } from './assetBatchUtils';
import AssetGenerationHistory from './AssetGenerationHistory';
import AssetFolderOverlay from './AssetFolderOverlay';
import { pageRoot, densityPill } from '@/shared/ui/layoutClasses';
import { useSafeTimeout } from '@/lib/useSafeTimeout';

export type { AssetTaskBatch } from './assetBatchUtils';

interface Props {
  onEnterWorkshop?: () => void;
  onOpenSettings?: () => void;
}

export default function AssetCenter(_props: Props = {}) {
  const { data: assetTasksQueryData, refetch: refetchAssetTasks } = useAssetTasksQuery(1, true);

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

  // 画布项目数据
  const canvasProjects = useCanvasStore((s) => s.projects);

  // 媒体分类 (图片 | 视频 | 音频 | 画布)
  const [mediaCategory, setMediaCategory] = useState<'image' | 'video' | 'audio' | 'canvas'>('image');

  // 时间范围筛选 (只保留画圈的时间筛选与批量操作)
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 批量模式
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // 历史任务数据
  const [dbTasks, setDbTasks] = useState<any[]>([]);
  const [tasksPage, setTasksPage] = useState(1);
  const [tasksTotal, setTasksTotal] = useState(0);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isLoadingMoreTasks, setIsLoadingMoreTasks] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const { setSafeTimeout } = useSafeTimeout();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 套组文件夹浮层弹窗
  const [folderBatch, setFolderBatch] = useState<AssetTaskBatch | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setSafeTimeout(() => setToastMsg(null), 2500);
  };

  // 1. 加载生图历史任务（分页）
  const fetchTasks = useCallback(async (page = 1, append = false) => {
    if (append) setIsLoadingMoreTasks(true);
    else setIsLoadingTasks(true);
    try {
      const data = await fetchAssetTasks(page, 40);
      const incoming = filterDbTasksFromTombstones(data.tasks || []);
      setDbTasks((prev) => (append ? [...prev, ...incoming] : incoming));
      setTasksPage(page);
      setTasksTotal(data.total || incoming.length);
    } catch (err) {
      console.warn('加载生图任务历史轻微异常:', err);
      if (!append) showToast('历史记录加载失败，删除/同步可能不可用');
    } finally {
      setIsLoadingTasks(false);
      setIsLoadingMoreTasks(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks(1, false);
  }, [fetchTasks]);

  // 1. 当 React Query 的任务数据拉取到更新时，增量合并至内部 dbTasks
  useEffect(() => {
    if (assetTasksQueryData?.tasks && assetTasksQueryData.tasks.length > 0) {
      const incoming = filterDbTasksFromTombstones(assetTasksQueryData.tasks);
      setDbTasks((prev) => {
        if (tasksPage === 1) return incoming;
        const incomingIds = new Set(incoming.map((t: any) => t.id || t.taskId));
        const kept = prev.filter((p: any) => !incomingIds.has(p.id || p.taskId));
        return [...incoming, ...kept];
      });
      if (typeof assetTasksQueryData.total === 'number') {
        setTasksTotal(assetTasksQueryData.total);
      }
    }
  }, [assetTasksQueryData, tasksPage]);

  // 2. 🌟 切页即时同步：只要用户切换至“资产中心”，立即静默拉取最新数据库任务
  useEffect(() => {
    if (currentView === 'assets') {
      void fetchTasks(1, false);
      void refetchAssetTasks();
    }
  }, [currentView, fetchTasks, refetchAssetTasks]);

  // 3. 🌟 生成完成即时同步：监听全局 azhuo:generation-completed 事件，防抖 200ms 刷新资产列表
  useEffect(() => {
    let timer: any = null;
    const handleCompleted = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void fetchTasks(1, false);
        void refetchAssetTasks();
      }, 200);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('azhuo:generation-completed', handleCompleted);
      return () => {
        if (timer) clearTimeout(timer);
        window.removeEventListener('azhuo:generation-completed', handleCompleted);
      };
    }
  }, [fetchTasks, refetchAssetTasks]);

  const tasksHasMore = dbTasks.length < tasksTotal;

  const loadMoreDbTasks = useCallback(() => {
    if (isLoadingMoreTasks || !tasksHasMore) return;
    void fetchTasks(tasksPage + 1, true);
  }, [fetchTasks, isLoadingMoreTasks, tasksHasMore, tasksPage]);

  // 🌟 画布项目转换为资产任务与文件夹批次
  const { canvasTasks, canvasBatches } = useMemo(() => {
    const tasks: any[] = [];
    const batches: AssetTaskBatch[] = [];

    (canvasProjects || []).forEach((proj) => {
      const mediaNodes = (proj.nodes || []).filter(
        (n) => n.imageUrl || n.videoUrl || n.type === 'image' || n.type === 'video'
      );
      const projectTasks: any[] = [];

      if (mediaNodes.length > 0) {
        mediaNodes.forEach((node) => {
          const t = {
            id: `canvas-${proj.id}-${node.id}`,
            nodeId: node.id,
            canvasProjectId: proj.id,
            canvasProjectTitle: proj.title,
            taskId: node.taskId || node.id,
            batchId: `canvas-project-${proj.id}`,
            batchTitle: proj.title,
            title: node.title || proj.title,
            prompt: node.title || node.content || proj.title || '画布生成图片',
            resultUrl: node.imageUrl || node.videoUrl || proj.thumbnail,
            status: node.status === 'error' ? 'FAILURE' : (node.imageUrl || node.videoUrl || node.status === 'success' || proj.thumbnail) ? 'SUCCESS' : 'IN_PROGRESS',
            createdAt: node.createdAt ? new Date(node.createdAt).toISOString() : new Date(proj.updatedAt || proj.createdAt).toISOString(),
            model: '无限画布',
            aspectRatio: node.aspectRatio || (node.width && node.height ? `${node.width}:${node.height}` : '1:1'),
            mediaType: node.type === 'video' ? 'video' : 'image',
            rawTask: node,
          };
          projectTasks.push(t);
          tasks.push(t);
        });
      } else if (proj.thumbnail) {
        const t = {
          id: `canvas-${proj.id}-cover`,
          nodeId: 'cover',
          canvasProjectId: proj.id,
          canvasProjectTitle: proj.title,
          taskId: `canvas-cover-${proj.id}`,
          batchId: `canvas-project-${proj.id}`,
          batchTitle: proj.title,
          title: proj.title,
          prompt: proj.title || '画布项目封面',
          resultUrl: proj.thumbnail,
          status: 'SUCCESS',
          createdAt: new Date(proj.updatedAt || proj.createdAt).toISOString(),
          model: '无限画布',
          aspectRatio: '1:1',
          mediaType: 'image',
          rawTask: proj,
        };
      } else {
        // 🌟 空画布项目：同样构建文件夹批次，展示默认艺术封面，确保在资产中心随时可见并支持一键直达编辑
        const t = {
          id: `canvas-${proj.id}-init`,
          nodeId: 'init',
          canvasProjectId: proj.id,
          canvasProjectTitle: proj.title,
          taskId: `canvas-init-${proj.id}`,
          batchId: `canvas-project-${proj.id}`,
          batchTitle: proj.title,
          title: proj.title,
          prompt: proj.title || '画布项目',
          resultUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
          status: 'SUCCESS',
          createdAt: new Date(proj.updatedAt || proj.createdAt).toISOString(),
          model: '无限画布',
          aspectRatio: '1:1',
          mediaType: 'image',
          rawTask: proj,
        };
        projectTasks.push(t);
        tasks.push(t);
      }

      if (projectTasks.length > 0) {
        batches.push({
          batchId: `canvas-project-${proj.id}`,
          title: proj.title || '未命名画布',
          prompt: proj.title || '画布项目内容',
          model: '无限画布',
          createdAt: proj.updatedAt || proj.createdAt || Date.now(),
          tasks: projectTasks,
        });
      }
    });

    batches.sort((a, b) => {
      const timeA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime();
      const timeB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    return { canvasTasks: tasks, canvasBatches: batches };
  }, [canvasProjects]);

  // 合并内存中的 generationTasks 与数据库中的任务
  const mergedTasks = useMemo(() => mergeAssetTasks({ dbTasks, generationTasks, mediaCategory, searchKeyword, timeFilter, sessions, canvasTasks }), [dbTasks, generationTasks, mediaCategory, searchKeyword, timeFilter, sessions, canvasTasks]);

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
      } else if (tasksHasMore) {
        loadMoreDbTasks();
      }
    },
    [allBatches.length, loadMoreDbTasks, renderedBatchCount, tasksHasMore],
  );

  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(handleBatchIntersection, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [handleBatchIntersection]);

  const { visibleToday, visibleYesterday, visibleEarlier } = useMemo(() => {
    const today: AssetTaskBatch[] = [];
    const yesterday: AssetTaskBatch[] = [];
    const earlier: AssetTaskBatch[] = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;

    for (const b of renderedBatches) {
      const t = new Date(b.createdAt).getTime();
      if (t >= todayStart) today.push(b);
      else if (t >= yesterdayStart) yesterday.push(b);
      else earlier.push(b);
    }
    return { visibleToday: today, visibleYesterday: yesterday, visibleEarlier: earlier };
  }, [renderedBatches]);

  // 单条删除
  const handleDeleteTask = async (task: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!(await confirmAction('确定彻底删除该生成记录吗？'))) return;

    if (task.canvasProjectId && task.nodeId) {
      if (task.nodeId === 'cover') {
        useCanvasStore.getState().deleteProject(task.canvasProjectId);
      } else {
        useCanvasStore.getState().deleteNode(task.canvasProjectId, task.nodeId);
      }
      showToast('🗑️ 已从画布中删除该节点');
      return;
    }

    try {
      const delRes = await permanentDeleteGeneration(task);
      setDbTasks((prev) => filterDbTasksAfterDelete(prev, delRes.ids, delRes.urls));
      showToast('🗑️ 已删除该记录');
      await fetchTasks(1, false);
      void refetchAssetTasks();
    } catch (err) {
      showToast(`❌ 删除失败: ${formatUserError(err, '请重试')}`);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedTaskIds.length === 0) return;
    if (!(await confirmAction(`确定彻底删除选中的 ${selectedTaskIds.length} 条生成记录吗？`))) return;

    const idsToDelete = [...selectedTaskIds];
    setIsBatchMode(false);
    setSelectedTaskIds([]);

    const targets = mergedTasks.filter(t => idsToDelete.includes(t.id));
    const canvasTargets = targets.filter(t => t.canvasProjectId && t.nodeId);
    const regularTargets = targets.filter(t => !t.canvasProjectId);

    if (canvasTargets.length > 0) {
      canvasTargets.forEach(t => {
        if (t.nodeId === 'cover') {
          useCanvasStore.getState().deleteProject(t.canvasProjectId);
        } else {
          useCanvasStore.getState().deleteNode(t.canvasProjectId, t.nodeId);
        }
      });
    }

    if (regularTargets.length > 0) {
      try {
        const delRes = await permanentDeleteGeneration(regularTargets);
        setDbTasks((prev) => filterDbTasksAfterDelete(prev, delRes.ids, delRes.urls));
        await fetchTasks(1, false);
        void refetchAssetTasks();
      } catch (err) {
        showToast(`❌ 批量删除失败: ${formatUserError(err, '请稍后重试')}`);
        return;
      }
    }
    showToast(`🗑️ 已彻底删除选中的 ${idsToDelete.length} 条记录`);
  };

  // 批量打包下载
  const handleBatchDownload = async () => {
    if (selectedTaskIds.length === 0) return;
    const selectedTasks = mergedTasks.filter(t => selectedTaskIds.includes(t.id) && t.resultUrl);
    if (selectedTasks.length === 0) {
      alert('选中的记录中没有可下载的有效媒体文件');
      return;
    }

    setIsDownloadingZip(true);
    showToast(`📦 正在将 ${selectedTasks.length} 个媒体打包为 ZIP...`);

    try {
      const items = selectedTasks.map((t, idx) => ({
        url: t.resultUrl,
        filename: `${String(idx + 1).padStart(3, '0')}_${(t.prompt || 'image').slice(0, 20).replace(/[/\\?%*:|"<>]/g, '_')}.${t.mediaType === 'video' ? 'mp4' : 'jpg'}`
      }));

      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, zipFilename: `beike_batch_${Date.now()}.zip` })
      });

      if (!res.ok) throw new Error(`服务端打包失败: HTTP ${res.status}`);
      const blob = await res.blob();
      const defaultName = `beike_batch_${new Date().toISOString().slice(0, 10)}.zip`;
      await saveToDownloadDir(defaultName, blob);
      showToast('🎉 ZIP 压缩包已成功下载！');
      setIsBatchMode(false);
      setSelectedTaskIds([]);
    } catch (err: any) {
      showToast(`❌ 打包下载失败: ${err.message || '请稍后重试'}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 清理失败或超时的卡顿记录
  const handleClearFailedAndStuck = async () => {
    const failedTasks = mergedTasks.filter(
      (t) => t.status === 'FAILURE' || (!t.resultUrl && (t.status === 'IN_PROGRESS' || t.status === 'PENDING'))
    );
    if (failedTasks.length === 0) return;
    if (!(await confirmAction(`确定清理全部 ${failedTasks.length} 条失败或卡顿记录吗？`))) return;

    try {
      // 1. 服务端数据库全量清除失败与卡顿记录
      await clearFailedTasksFromServer().catch(() => null);

      // 2. 本地执行全量永久删除（自动写入墓碑黑名单并更新 store/localStorage）
      const delRes = await permanentDeleteGeneration(failedTasks);

      // 3. 收集所有相关 ID（包含任务 id、taskId、rawTask id）与 URL
      const allIds = Array.from(
        new Set([
          ...delRes.ids,
          ...failedTasks.map((t) => t.id),
          ...failedTasks.map((t) => t.taskId),
          ...failedTasks.map((t) => (t as any).rawTask?.id),
          ...failedTasks.map((t) => (t as any).rawTask?.taskId),
          ...failedTasks.map((t) => (t as any).dbId),
        ].filter(Boolean) as string[])
      );
      const allUrls = delRes.urls;

      // 4. 同步清空内存 store 与内部 dbTasks 状态
      useAppStore.getState().deleteGenerationPermanently(allIds, allUrls);
      setDbTasks((prev) => filterDbTasksAfterDelete(prev, allIds, allUrls));

      showToast(`🧹 已彻底清理 ${failedTasks.length} 条异常记录`);

      // 5. 重新拉取服务端数据同步内部 dbTasks，确保彻底清除
      await fetchTasks(1, false);
      void refetchAssetTasks();
    } catch (err) {
      showToast(`❌ 清理失败: ${formatUserError(err, '请重试')}`);
    }
  };

  // 删除分镜套组 / 画布项目
  const handleDeleteBatch = async (batch: AssetTaskBatch, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCanvas = batch.batchId.startsWith('canvas-project-');
    if (!(await confirmAction(isCanvas ? `确定删除画布项目“${batch.title}”及其全部内容吗？` : `确定删除该分镜批次的 ${batch.tasks.length} 条记录吗？`))) return;

    if (isCanvas) {
      const projectId = batch.batchId.replace('canvas-project-', '');
      useCanvasStore.getState().deleteProject(projectId);
      showToast('🗑️ 已删除画布项目');
      return;
    }

    try {
      const delRes = await permanentDeleteGeneration(batch.tasks);
      setDbTasks((prev) => filterDbTasksAfterDelete(prev, delRes.ids, delRes.urls));
      showToast('🗑️ 已删除该分镜批次');
      await fetchTasks(1, false);
      void refetchAssetTasks();
    } catch (err) {
      showToast(`❌ 删除失败: ${formatUserError(err, '请重试')}`);
    }
  };

  // 再做一张
  const handleRegenerate = (task: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickPrompt(task.prompt);
    setCurrentView('home');
  };

  // 全选/取消全选
  const handleToggleSelectAll = () => {
    if (selectedTaskIds.length === mergedTasks.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(mergedTasks.map(t => t.id));
    }
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const historyProps = {
    mediaCategory,
    mergedTasks,
    visibleToday,
    visibleYesterday,
    visibleEarlier,
    hasMore,
    renderedBatches: renderedBatchCount,
    totalBatches,
    loadMoreSentinelRef,
    isBatchMode,
    selectedTaskIds,
    setSelectedTaskIds,
    setIsBatchMode,
    copiedId,
    setCopiedId,
    setCurrentView,
    setPreviewTask,
    setQuickPrompt,
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
        data-tauri-drag-region
        onMouseDown={handleWindowDrag}
        onDoubleClick={handleWindowDoubleClick}
        className="shrink-0 cursor-default bg-transparent flex flex-col gap-2 pt-3 pb-2 px-4 sm:px-6 lg:px-8"
      >
        {/* Row 1: 资产中心标题 + 统计 | 时间筛选 + 搜索框 */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 shrink-0">
            <h1 className="text-base font-black text-slate-900 tracking-tight">
              生成资产中心
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-mono font-bold">
              {mergedTasks.length} 条记录
            </span>
          </div>

          {/* Right: 时间下拉筛选 + 搜索框 */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* 时间下拉筛选（只保留画圈的时间筛选） */}
            <div className="relative flex items-center shrink-0">
              <select
                value={timeFilter}
                onChange={e => setTimeFilter(e.target.value as any)}
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
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                placeholder="搜索生图提示词..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-100/80 focus:bg-white border border-transparent focus:border-indigo-400 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all shadow-2xs h-8 md:h-9"
              />
            </div>
          </div>
        </div>

        {/* Row 2: 媒体分类分段胶囊 (图片 | 视频 | 音频 | 画布) | 清理失败 + 批量操作 */}
        <div className="flex items-center justify-between gap-3 w-full pt-1">
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
                  onClick={() => setMediaCategory(m.id as any)}
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

          {/* Right: 清理失败 + 批量操作 */}
          <div className="flex items-center gap-2.5 shrink-0 ml-auto">
            {/* 一键清理失败/卡顿任务按钮 */}
            {mergedTasks.some(t => t.status === 'FAILURE' || (!t.resultUrl && (t.status === 'IN_PROGRESS' || t.status === 'PENDING'))) && (
              <button
                onClick={handleClearFailedAndStuck}
                className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                title="一键清理所有失败或超时的异常生图记录"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                <span>清理失败</span>
              </button>
            )}

            {/* 批量操作（只保留画圈的批量操作） */}
            {isBatchMode ? (
              <div className="flex items-center gap-2 animate-fade-in flex-wrap shrink-0">
                <button
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {selectedTaskIds.length === mergedTasks.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>{selectedTaskIds.length === mergedTasks.length ? '取消全选' : '全选'}</span>
                </button>

                <button
                  onClick={handleBatchDownload}
                  disabled={selectedTaskIds.length === 0 || isDownloadingZip}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="一键将选中的生图记录打包为 ZIP 压缩包并下载到本地"
                >
                  {isDownloadingZip ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{isDownloadingZip ? '正在打包...' : `批量下载 (${selectedTaskIds.length})`}</span>
                </button>

                <button
                  onClick={handleBatchDelete}
                  disabled={selectedTaskIds.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>批量删除 ({selectedTaskIds.length})</span>
                </button>

                <button
                  onClick={() => { setIsBatchMode(false); setSelectedTaskIds([]); }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
                >
                  退出批量
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsBatchMode(true)}
                className={`${densityPill} rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>批量操作</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 🌟 2. Main Gallery Area */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
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
            useCanvasStore.getState().selectProject(projectId);
            setCurrentView('canvas');
          }}
        />
      )}

      {/* 🌟 全局反馈 Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-2xl border border-slate-700/80 animate-fade-in flex items-center gap-2">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
